const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { userDataPath } = require('./utils');
const { execAdbCommand } = require('./adb');

// Crawler state
let crawlerRunning = false;
let crawlerDeviceId = null;
let crawlerPackageName = null;
let crawlerSettings = null;
let visitedScreens = new Set();
let crawlerScreens = [];
let crawlerLogs = [];
let clickedButtons = new Set(); // Track which buttons we've already clicked
let visitedScreenshots = new Set();
let uniqueScreens = [];
let screenNodes = {};
let screenEdges = {};

// Button click tracking
const buttonClickCounts = {};

// Function to add and send a log message
function addCrawlerLog(message, type = 'info') {
  const logEntry = {
    timestamp: Date.now(),
    message,
    type // 'info', 'error', 'success', etc.
  };
  
  crawlerLogs.push(logEntry);
  
  // Keep logs limited to the most recent 1000
  if (crawlerLogs.length > 1000) {
    crawlerLogs.shift();
  }
  
  // Also log to console
  if (type === 'error') {
    console.error(`[Crawler] ${message}`);
  } else {
    console.log(`[Crawler] ${message}`);
  }
  
  // If we have a main window reference, send the log to the renderer
  if (global.mainWindow) {
    global.mainWindow.webContents.send('crawler:log', logEntry);
  }
  
  return logEntry;
}

// Record button click for tracking
function recordButtonClick(buttonHash) {
  clickedButtons.add(buttonHash);
  buttonClickCounts[buttonHash] = (buttonClickCounts[buttonHash] || 0) + 1;
}

// Get the number of times a button has been clicked
function getButtonClickCount(buttonHash) {
  return buttonClickCounts[buttonHash] || 0;
}

// Reset tracking when starting a new crawl session
function resetButtonTracking() {
  clickedButtons.clear();
  Object.keys(buttonClickCounts).forEach(key => delete buttonClickCounts[key]);
}

// Create a unique hash for a button based on its properties
function createButtonHash(element, screenHash) {
  // Include the screen hash to differentiate same-looking buttons on different screens
  const buttonData = {
    screenHash: screenHash,
    class: element.class,
    left: element.bounds.left,
    top: element.bounds.top,
    right: element.bounds.right,
    bottom: element.bounds.bottom
  };
  
  // Create a hash of the stringified button data
  const crypto = require('crypto');
  return crypto.createHash('md5').update(JSON.stringify(buttonData)).digest('hex');
}

// Create a unique hash of the screen based on XML content
function createScreenHash(xml) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(xml).digest('hex').substring(0, 10);
}

// Create a hash of the screenshot
function createScreenshotHash(screenshotBase64) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(screenshotBase64).digest('hex');
}

// Helper function to shuffle an array (Fisher-Yates shuffle)
function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// Helper function to get current activity
async function getCurrentActivity(deviceId, packageName) {
  try {
    // Get the full window dump and parse it in JS instead of using grep
    
    // Fallback approach - get activities dump and parse in JS
    const activitiesOutput = await execAdbCommand(`-s ${deviceId} shell dumpsys activity activities`);
    var Tasks = activitiesOutput.split("Application tokens in top down Z order:")[1]
    Tasks = Tasks.split("rootHomeTask")[0]
    Tasks = Tasks.split("*")
    var Task = Tasks[2].split(" ")[3]
    return Task
  } catch (error) {
    addCrawlerLog(`Error getting current activity: ${error.message}`, 'error');
    // If we can't get the activity, just return empty string
    // This will make the crawler continue with a fallback
    return '';
  }
}

// Helper function to get UI hierarchy XML
async function getUiAutomatorXml(deviceId) {
  try {
    console.log(`Dumping UI hierarchy for device ${deviceId}...`);
    
    // Create a temporary file on the device
    const dumpResult = await execAdbCommand(`-s ${deviceId} shell uiautomator dump /sdcard/window_dump.xml`);
    console.log('UIAutomator dump result:', dumpResult);
    
    // Check if the dump was successful
    if (dumpResult.includes('ERROR')) {
      throw new Error(`UIAutomator dump failed: ${dumpResult}`);
    }
    
    // Pull the file from the device
    const tempFile = path.join(os.tmpdir(), `window_dump_${Date.now()}.xml`);
    await execAdbCommand(`-s ${deviceId} pull /sdcard/window_dump.xml "${tempFile}"`);
    
    // Check if the file exists and has content
    if (!fs.existsSync(tempFile)) {
      throw new Error('Failed to pull UI dump file from device');
    }
    
    const stats = fs.statSync(tempFile);
    if (stats.size === 0) {
      throw new Error('UI dump file is empty');
    }
    
    // Read the file content
    const content = fs.readFileSync(tempFile, 'utf8');
    
    // Clean up
    fs.unlinkSync(tempFile);
    
    if (!content || content.trim() === '') {
      throw new Error('UI dump content is empty');
    }
    
    return content;
  } catch (error) {
    console.error('Error getting UI hierarchy:', error);
    throw error;
  }
}

// Helper function to parse UI XML and find clickable elements
function parseUiAutomatorXml(xml) {
  try {
    if (!xml || typeof xml !== 'string') {
      console.error('Invalid XML input:', xml);
      return { elements: [], clickableElements: [] };
    }
    
    const elements = [];
    const clickableElements = [];
    
    // Simple regex-based parsing
    // In a production app, you'd want to use a proper XML parser
    const nodeRegex = /<node[^>]*>/g;
    let match;
    
    while ((match = nodeRegex.exec(xml)) !== null) {
      const node = match[0];
      
      // Extract attributes
      const classMatch = node.match(/class="([^"]+)"/);
      const boundsMatch = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      const clickableMatch = node.match(/clickable="([^"]+)"/);
      
      if (classMatch && boundsMatch) {
        const element = {
          class: classMatch[1],
          bounds: {
            left: parseInt(boundsMatch[1]),
            top: parseInt(boundsMatch[2]),
            right: parseInt(boundsMatch[3]),
            bottom: parseInt(boundsMatch[4])
          },
          clickable: clickableMatch && clickableMatch[1] === 'true'
        };
        
        elements.push(element);
        
        if (element.clickable) {
          clickableElements.push(element);
        }
      }
    }
    
    console.log(`Parsed ${elements.length} elements, ${clickableElements.length} clickable`);
    return { elements, clickableElements };
  } catch (error) {
    console.error('Error parsing UI XML:', error);
    return { elements: [], clickableElements: [] };
  }
}

// Helper function to click on a specific element by bounds
async function clickElementByBounds(deviceId, bounds) {
  const centerX = Math.floor((bounds.left + bounds.right) / 2);
  const centerY = Math.floor((bounds.top + bounds.bottom) / 2);
  
  await execAdbCommand(`-s ${deviceId} shell input tap ${centerX} ${centerY}`);
}

// Helper function to capture a screenshot
async function captureScreenshot(deviceId) {
  const tempScreenshotPath = path.join(os.tmpdir(), `screenshot_${Date.now()}.png`);
  
  try {
    console.log(`Capturing screenshot for device ${deviceId}...`);
    
    // Capture to device storage first
    const captureResult = await execAdbCommand(`-s ${deviceId} shell screencap -p /sdcard/screenshot.png`);
    if (captureResult && captureResult.includes('ERROR')) {
      throw new Error(`Failed to capture screenshot: ${captureResult}`);
    }
    
    // Pull to local temp file
    await execAdbCommand(`-s ${deviceId} pull /sdcard/screenshot.png "${tempScreenshotPath}"`);
    
    // Check if the file was pulled successfully
    if (!fs.existsSync(tempScreenshotPath)) {
      throw new Error('Failed to pull screenshot from device');
    }
    
    const stats = fs.statSync(tempScreenshotPath);
    if (stats.size === 0) {
      throw new Error('Screenshot file is empty');
    }
    
    // Read as base64
    const screenshotData = fs.readFileSync(tempScreenshotPath);
    const base64Data = screenshotData.toString('base64');
    
    // Clean up
    fs.unlinkSync(tempScreenshotPath);
    
    console.log(`Screenshot captured successfully (${base64Data.length} bytes)`);
    return base64Data;
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    
    // Clean up if file exists
    if (fs.existsSync(tempScreenshotPath)) {
      try {
        fs.unlinkSync(tempScreenshotPath);
      } catch (cleanupError) {
        console.error('Error cleaning up screenshot file:', cleanupError);
      }
    }
    
    // Return a placeholder or empty string
    return '';
  }
}

// Function to generate flowchart data
function generateFlowchartData() {
  // Convert screen nodes and edges to a format suitable for rendering
  const nodes = Object.values(screenNodes);
  const edges = Object.values(screenEdges);
  
  // Create a flowchart object
  return {
    nodes,
    edges,
    uniqueScreensCount: uniqueScreens.length
  };
}

// Main recursive crawling function
async function crawlScreen(deviceId, packageName, navigationPath = [], currentDepth = 0, mainWindow = null) {
  if (!crawlerRunning) {
    addCrawlerLog('Crawler stopped');
    return;
  }
  
  // Use provided mainWindow or global.mainWindow
  const windowRef = mainWindow || global.mainWindow;
  
  try {
    // Get current activity
    const currentActivity = await getCurrentActivity(deviceId, packageName);
    
    // Check if we're still in the app package if stayInApp is enabled
    if (crawlerSettings.stayInApp && !currentActivity.includes(packageName)) {
      addCrawlerLog(`Current activity ${currentActivity} is outside app package ${packageName}, returning to app`, 'warning');
      
      // Launch the app again to return to it
      await execAdbCommand(`-s ${deviceId} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
      
      // Wait for app to launch
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get the updated activity after returning to the app
      const newActivity = await getCurrentActivity(deviceId, packageName);
      
      if (!newActivity.includes(packageName)) {
        addCrawlerLog(`Failed to return to app ${packageName}, stopping crawler`, 'error');
        stopAppCrawling(windowRef);
        return;
      }
      
      addCrawlerLog(`Successfully returned to app: ${newActivity}`, 'success');
    } else if (!crawlerSettings.stayInApp && !currentActivity.includes(packageName)) {
      addCrawlerLog(`Current activity ${currentActivity} is not part of package ${packageName}, skipping`, 'info');
      return;
    }
    
    addCrawlerLog(`Current activity: ${currentActivity}`);
    
    // Get the screen XML
    addCrawlerLog('Capturing UI hierarchy');
    const screenXml = await getUiAutomatorXml(deviceId);
    
    // Create a hash based on XML content to identify unique screens
    const screenHash = createScreenHash(screenXml);
    addCrawlerLog(`Screen hash: ${screenHash}`);
    
    // Capture screenshot
    addCrawlerLog('Capturing screenshot');
    const screenshotBase64 = await captureScreenshot(deviceId);
    
    // Create a hash of the screenshot to identify unique visual states
    const screenshotHash = createScreenshotHash(screenshotBase64);
    addCrawlerLog(`Screenshot hash: ${screenshotHash}`);
    
    // Parse XML to find clickable elements
    addCrawlerLog('Analyzing UI elements');
    const { elements, clickableElements } = parseUiAutomatorXml(screenXml);
    
    // We'll now track unique visual states rather than just screens
    const isNewVisualState = !visitedScreenshots.has(screenshotHash);
    
    // Add this screen to our visited set
    visitedScreens.add(screenHash);
    visitedScreenshots.add(screenshotHash);
    
    // Create screen object
    const screen = {
      id: screenHash,
      visualId: screenshotHash,
      activityName: currentActivity,
      screenshot: screenshotBase64,
      xml: screenXml,
      elementCount: elements.length,
      clickableCount: clickableElements.length,
      timestamp: Date.now(),
      isNewVisualState: isNewVisualState,
      depth: currentDepth
    };
    
    // Add to our collection if it's a new visual state
    if (isNewVisualState) {
      uniqueScreens.push(screen);
      
      // Create node for flowchart
      screenNodes[screenshotHash] = {
        id: screenshotHash,
        label: currentActivity.split('/').pop(),
        data: screen
      };
      
      // Send to renderer if we have a windowRef reference
      if (windowRef) {
        windowRef.webContents.send('crawler:newScreen', screen);
        windowRef.webContents.send('crawler:progress', {
          percentage: Math.min(100, Math.round((uniqueScreens.length / crawlerSettings.maxScreens) * 100)),
          screensCount: uniqueScreens.length,
          maxScreens: crawlerSettings.maxScreens
        });
      }
      
      addCrawlerLog(`Found new visual state: ${currentActivity.split('/').pop()}`, 'success');
    } else {
      addCrawlerLog(`Found already visited visual state: ${currentActivity.split('/').pop()}`, 'info');
    }
    
    // Add this screen to our path history
    const screenNode = {
      hash: screenshotHash,
      activity: currentActivity
    };
    
    // Record the navigation path
    const newPath = [...navigationPath, screenNode];
    
    // If we have a previous screen, record the edge between them for the flowchart
    if (navigationPath.length > 0) {
      const prevScreenHash = navigationPath[navigationPath.length - 1].hash;
      const edgeId = `${prevScreenHash}->${screenshotHash}`;
      
      // Add to edges if not already present
      if (!screenEdges[edgeId]) {
        screenEdges[edgeId] = {
          id: edgeId,
          source: prevScreenHash,
          target: screenshotHash,
          count: 1
        };
      } else {
        // Increment count if edge already exists
        screenEdges[edgeId].count++;
      }
    }
    
    // Check if we've reached the maximum number of unique visual states
    if (uniqueScreens.length >= crawlerSettings.maxScreens) {
      addCrawlerLog(`Reached maximum number of unique visual states (${crawlerSettings.maxScreens}), stopping crawler`, 'success');
      
      // Generate and return the flow chart data
      if (windowRef) {
        windowRef.webContents.send('crawler:flowchartData', generateFlowchartData());
      }
      
      stopAppCrawling(windowRef);
      return;
    }
    
    // Limit recursion depth to prevent stack overflow
    if (currentDepth >= crawlerSettings.maxDepth) {
      addCrawlerLog(`Reached maximum recursion depth (${crawlerSettings.maxDepth}), returning to higher level`, 'warning');
      return;
    }
    
    // Filter for unique clickable elements using our hashing system
    const uniqueClickableElements = [];
    const buttonsOnScreen = new Set();
    
    for (const element of clickableElements) {
      // Skip elements we want to ignore
      if (crawlerSettings.ignoreElements.some(type => element.class.includes(type))) {
        continue;
      }
      
      // Create a button hash based on class and position
      const buttonHash = createButtonHash(element, screenHash);
      
      // Check if we've seen this button on this screen
      if (!buttonsOnScreen.has(buttonHash)) {
        buttonsOnScreen.add(buttonHash);
        element.buttonHash = buttonHash;
        uniqueClickableElements.push(element);
      }
    }
    
    // Split elements into clicked and unclicked groups
    const unclickedElements = uniqueClickableElements.filter(el => !clickedButtons.has(el.buttonHash) || getButtonClickCount(el.buttonHash) < 3);
    const clickedElements = uniqueClickableElements.filter(el => clickedButtons.has(el.buttonHash) && getButtonClickCount(el.buttonHash) < 3);
    
    addCrawlerLog(`Found ${unclickedElements.length} unclicked elements and ${clickedElements.length} previously clicked elements`);
    
    // Shuffle both arrays for randomness
    const shuffledUnclicked = shuffleArray([...unclickedElements]);
    const shuffledClicked = shuffleArray([...clickedElements]);
    
    // Select a subset of elements to try (prioritize unclicked)
    const elementsToTry = [];
    
    // Always prefer unclicked elements first, but in random order
    if (shuffledUnclicked.length > 0) {
      // Take all unclicked elements, but in random order
      elementsToTry.push(...shuffledUnclicked);
    }
    
    // Add some previously clicked elements too (but fewer of them)
    if (shuffledClicked.length > 0) {
      // Take up to 3 clicked elements or 30% of them, whichever is greater
      const maxClickedToUse = Math.max(3, Math.floor(shuffledClicked.length * 0.3));
      elementsToTry.push(...shuffledClicked.slice(0, maxClickedToUse));
    }
    
    // Click on selected elements one by one
    for (const element of elementsToTry) {
      if (!crawlerRunning) break;
      
      // Skip if we've clicked this exact button too many times (to prevent infinite loops)
      const clickCount = getButtonClickCount(element.buttonHash);
      if (clickCount >= 3) { // Maximum is 3 clicks per button to avoid infinite loops
        addCrawlerLog(`Skipping button ${element.buttonHash} (clicked ${clickCount} times already)`, 'info');
        continue;
      }
      
      // Click the element
      addCrawlerLog(`Clicking element: ${element.class} (hash: ${element.buttonHash.substring(0, 8)})`);
      await clickElementByBounds(deviceId, element.bounds);
      
      // Record that we've clicked this button
      recordButtonClick(element.buttonHash);
      
      // Wait for the UI to update
      addCrawlerLog(`Waiting for UI to update (${crawlerSettings.screenDelay}ms)`);
      await new Promise(resolve => setTimeout(resolve, crawlerSettings.screenDelay));
      
      // Recursively crawl this new screen, passing the updated path and incremented depth
      addCrawlerLog('Exploring new screen');
      await crawlScreen(deviceId, packageName, newPath, currentDepth + 1, windowRef);
      
      // Go back to the previous screen
      addCrawlerLog('Going back to previous screen');
      await execAdbCommand(`-s ${deviceId} shell input keyevent 4`); // Send BACK key
      await new Promise(resolve => setTimeout(resolve, crawlerSettings.screenDelay));
      
      // Check if we're still in the app after going back
      const activityAfterBack = await getCurrentActivity(deviceId, packageName);
      if (crawlerSettings.stayInApp && !activityAfterBack.includes(packageName)) {
        addCrawlerLog(`Left the app after going back. Current activity: ${activityAfterBack}. Relaunching app...`, 'warning');
        
        // Launch the app again
        await execAdbCommand(`-s ${deviceId} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
        
        // Wait for app to launch
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Verify we're back in the app
        const newActivity = await getCurrentActivity(deviceId, packageName);
        if (newActivity.includes(packageName)) {
          addCrawlerLog(`Successfully returned to app: ${newActivity}`, 'success');
        } else {
          addCrawlerLog(`Failed to return to app ${packageName} after back action`, 'error');
        }
      }
    }
    
    addCrawlerLog(`Finished exploring screen: ${currentActivity.split('/').pop()}`);
    
  } catch (error) {
    addCrawlerLog(`Error during crawling: ${error.message}`, 'error');
    
    // Emit error event
    if (windowRef) {
      windowRef.webContents.send('crawler:error', {
        message: error.message
      });
    }
    
    // Stop crawler on error
    stopAppCrawling(windowRef);
  }
}

// Function to start app crawling
async function startAppCrawling(deviceId, packageName, settings, mainWindow = null) {
  if (crawlerRunning) {
    addCrawlerLog('Crawler already running', 'error');
    return {
      success: false,
      message: 'Crawler already running'
    };
  }
  
  // Use provided mainWindow or global.mainWindow
  const windowRef = mainWindow || global.mainWindow;
  
  // Initialize state
  crawlerRunning = true;
  crawlerDeviceId = deviceId;
  crawlerPackageName = packageName;
  crawlerSettings = settings || {
    maxScreens: 20,
    screenDelay: 1000,
    ignoreElements: ['android.widget.ImageView'],
    stayInApp: true,
    maxDepth: 5
  };
  visitedScreens = new Set();
  crawlerScreens = [];
  crawlerLogs = [];
  resetButtonTracking(); // Reset button tracking
  visitedScreenshots = new Set();
  uniqueScreens = [];
  screenNodes = {};
  screenEdges = {};
  
  try {
    
    // Launch the app
    addCrawlerLog(`Launching app ${packageName}`);
    await execAdbCommand(`-s ${deviceId} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
    
    // Wait for app to launch
    addCrawlerLog('Waiting for app to launch...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start the crawl process
    addCrawlerLog('Beginning app exploration', 'success');
    crawlScreen(deviceId, packageName, [], 0, windowRef);
    
    return {
      success: true,
      message: 'Crawler started successfully'
    };
  } catch (error) {
    addCrawlerLog(`Failed to start app crawling: ${error.message}`, 'error');
    crawlerRunning = false;
    return {
      success: false,
      message: `Failed to start crawler: ${error.message}`
    };
  }
}

// Function to stop app crawling
function stopAppCrawling(mainWindow = null) {
  if (!crawlerRunning) {
    addCrawlerLog('Crawler not running', 'error');
    return {
      success: false,
      message: 'Crawler not running'
    };
  }
  
  // Use provided mainWindow or global.mainWindow
  const windowRef = mainWindow || global.mainWindow;
  
  crawlerRunning = false;
  const log = addCrawlerLog('Stopping crawler', 'success');
  
  // Emit the log and complete events
  if (windowRef) {
    windowRef.webContents.send('crawler:log', log);
    windowRef.webContents.send('crawler:complete');
  }
  
  return {
    success: true,
    message: 'Crawler stopped successfully'
  };
}

// Get crawler status
function getStatus() {
  return {
    running: crawlerRunning,
    deviceId: crawlerDeviceId,
    packageName: crawlerPackageName,
    screensCount: uniqueScreens.length,
    maxScreens: crawlerSettings?.maxScreens || 0
  };
}

// Get crawler logs
function getLogs() {
  return crawlerLogs;
}

// Get flowchart data
function getFlowchartData() {
  return generateFlowchartData();
}

module.exports = {
  startAppCrawling,
  stopAppCrawling,
  getStatus,
  getLogs,
  getFlowchartData
}; 