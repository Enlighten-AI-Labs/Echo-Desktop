/**
 * App Crawler Core module - contains the core crawling functionality
 */
const { prioritizeElementsByAiPrompt } = require('./elementSelector');
const { addScreen, generateFlowchartData } = require('./visualState');
const { execAdbCommand } = require('../adb/deviceManager');
const crypto = require('crypto');

// Crawler state
let crawlerRunning = false;
let crawlerDeviceId = null;
let crawlerPackageName = null;
let crawlerSettings = null;
let crawlerLogs = [];
let mainWindowRef = null;

/**
 * Add a log entry to the crawler logs
 * @param {string} message The log message
 * @param {string} type The log type (info, warning, error, success)
 */
function addCrawlerLog(message, type = 'info') {
  const logEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    message,
    type
  };
  
  crawlerLogs.push(logEntry);
  
  // Limit log size to prevent memory issues
  if (crawlerLogs.length > 1000) {
    crawlerLogs.shift();
  }
  
  // Log to console
  if (type === 'error') {
    console.error(`[Crawler] ${message}`);
  } else {
    console.log(`[Crawler] ${message}`);
  }
  
  // Send to UI if window reference is available
  if (mainWindowRef && mainWindowRef.webContents) {
    mainWindowRef.webContents.send('crawler:log', logEntry);
  }
}

/**
 * Calculate hash for a string
 * @param {string} str The string to hash
 * @returns {string} The calculated hash
 */
function calculateHash(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * Get the current activity of the device
 * @param {string} deviceId The device ID
 * @returns {Promise<string>} The current activity name
 */
async function getCurrentActivity(deviceId) {
  try {
    const output = await execAdbCommand(`-s ${deviceId} shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'`);
    const matches = output.match(/(\S+\/\S+)/g);
    if (matches && matches.length > 0) {
      return matches[0];
    }
    throw new Error('Could not determine current activity');
  } catch (error) {
    addCrawlerLog(`Error getting current activity: ${error.message}`, 'error');
    // If we can't get the activity, return a fallback
    return 'unknown.activity';
  }
}

/**
 * Capture UI hierarchy from device
 * @param {string} deviceId The device ID
 * @returns {Promise<Object>} The UI hierarchy data
 */
async function captureUIHierarchy(deviceId) {
  try {
    const output = await execAdbCommand(`-s ${deviceId} shell uiautomator dump /sdcard/window_dump.xml`);
    if (!output.includes('UI hierarchy dumped to')) {
      throw new Error('Failed to dump UI hierarchy');
    }
    
    const xmlData = await execAdbCommand(`-s ${deviceId} shell cat /sdcard/window_dump.xml`);
    return xmlData;
  } catch (error) {
    throw new Error(`Failed to capture UI hierarchy: ${error.message}`);
  }
}

/**
 * Capture screenshot from device
 * @param {string} deviceId The device ID
 * @returns {Promise<string>} The screenshot data as base64
 */
async function captureScreenshot(deviceId) {
  try {
    // Capture screenshot to device
    await execAdbCommand(`-s ${deviceId} shell screencap -p /sdcard/screenshot.png`);
    
    // Pull and convert to base64
    const screenshotPath = `/tmp/screenshot_${Date.now()}.png`;
    await execAdbCommand(`-s ${deviceId} pull /sdcard/screenshot.png ${screenshotPath}`);
    
    // Convert to base64 for web display
    const fs = require('fs');
    const imageBuffer = fs.readFileSync(screenshotPath);
    const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;
    
    // Clean up
    fs.unlinkSync(screenshotPath);
    
    return base64Image;
  } catch (error) {
    throw new Error(`Failed to capture screenshot: ${error.message}`);
  }
}

/**
 * Parse UI elements from the XML hierarchy
 * @param {string} xmlData The XML hierarchy data
 * @returns {Array} Parsed UI elements
 */
function parseUIElements(xmlData) {
  try {
    const elements = [];
    // Simple regex-based parser (in a production app you'd use a proper XML parser)
    const nodeRegex = /<node[^>]+bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]+class="([^"]+)"[^>]+text="([^"]*)"[^>]+resource-id="([^"]*)"[^>]+/g;
    
    let match;
    while ((match = nodeRegex.exec(xmlData)) !== null) {
      const [, left, top, right, bottom, className, text, resourceId] = match;
      
      // Calculate a unique hash for this button based on position and properties
      const buttonPropsString = `${left}-${top}-${right}-${bottom}-${className}-${text}-${resourceId}`;
      const buttonHash = calculateHash(buttonPropsString);
      
      elements.push({
        bounds: { left, top, right, bottom },
        class: className,
        text: text,
        resourceId: resourceId,
        buttonHash
      });
    }
    
    return elements;
  } catch (error) {
    throw new Error(`Failed to parse UI elements: ${error.message}`);
  }
}

/**
 * Start app crawling on the specified device
 * @param {string} deviceId The device ID
 * @param {string} packageName The package name of the app to crawl
 * @param {Object} settings Crawling settings
 * @param {Object} windowRef Reference to the main window
 * @returns {Promise<Object>} Status object
 */
async function startAppCrawling(deviceId, packageName, settings, windowRef) {
  if (crawlerRunning) {
    return { success: false, message: 'Crawler is already running' };
  }
  
  try {
    // Save references and settings
    crawlerRunning = true;
    crawlerDeviceId = deviceId;
    crawlerPackageName = packageName;
    crawlerSettings = {
      maxScreens: settings.maxScreens || 20,
      maxDepth: settings.maxDepth || 10,
      mode: settings.mode || 'breadthFirst',
      screenDelay: settings.screenDelay || 1000,
      stayInApp: settings.stayInApp !== false,
      ignoreElements: settings.ignoreElements || ['android.widget.ImageView'],
      maxClicksPerButton: settings.maxClicksPerButton || 3,
      aiPrompt: settings.aiPrompt || ''
    };
    mainWindowRef = windowRef;
    
    // Clear logs
    crawlerLogs = [];
    
    // Clear screens
    require('./visualState').resetScreens();
    
    addCrawlerLog(`Starting app crawler for ${packageName} on device ${deviceId}`);
    
    // Launch the app
    addCrawlerLog(`Launching app ${packageName}`);
    await execAdbCommand(`-s ${deviceId} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
    
    // Wait for app to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start the crawling process
    addCrawlerLog('App launched, starting crawler');
    
    // Begin exploration
    await exploreScreen(deviceId, packageName, [], 0);
    
    // Crawling finished
    addCrawlerLog('Crawling completed successfully', 'success');
    crawlerRunning = false;
    
    // Notify UI
    if (windowRef && windowRef.webContents) {
      windowRef.webContents.send('crawler:complete');
    }
    
    return { success: true, message: 'Crawling completed successfully' };
  } catch (error) {
    addCrawlerLog(`Failed to start crawler: ${error.message}`, 'error');
    crawlerRunning = false;
    
    // Notify UI of error
    if (windowRef && windowRef.webContents) {
      windowRef.webContents.send('crawler:error', { message: error.message });
    }
    
    return { success: false, message: error.message };
  }
}

/**
 * Explore a screen by analyzing UI and interacting with elements
 * @param {string} deviceId The device ID
 * @param {string} packageName The package name
 * @param {Array} visitedScreens Screens already visited
 * @param {number} currentDepth Current recursion depth
 */
async function exploreScreen(deviceId, packageName, visitedScreens = [], currentDepth = 0) {
  if (!crawlerRunning) {
    addCrawlerLog('Crawler stopped');
    return;
  }
  
  try {
    // Get the current activity
    let currentActivity = await getCurrentActivity(deviceId);
    
    // Check if we're still in the app (if configured to stay in app)
    if (crawlerSettings.stayInApp && !currentActivity.includes(packageName)) {
      addCrawlerLog(`Current activity ${currentActivity} is outside app package ${packageName}, returning to app`, 'warning');
      
      try {
        // Try to return to the app
        await execAdbCommand(`-s ${deviceId} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
        
        // Wait for app to start again
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if we're back in the app
        const newActivity = await getCurrentActivity(deviceId);
        if (!newActivity.includes(packageName)) {
          addCrawlerLog(`Failed to return to app ${packageName}, stopping crawler`, 'error');
          return;
        }
        
        addCrawlerLog(`Successfully returned to app: ${newActivity}`, 'success');
        currentActivity = newActivity;
      } catch (error) {
        addCrawlerLog(`Error returning to app: ${error.message}`, 'error');
        return;
      }
    } else if (!crawlerSettings.stayInApp && !currentActivity.includes(packageName)) {
      addCrawlerLog(`Current activity ${currentActivity} is not part of package ${packageName}, skipping`, 'info');
    }
    
    // Log the current activity
    addCrawlerLog(`Current activity: ${currentActivity}`);
    
    // Capture UI hierarchy
    addCrawlerLog('Capturing UI hierarchy');
    const uiHierarchy = await captureUIHierarchy(deviceId);
    const screenHash = calculateHash(uiHierarchy);
    addCrawlerLog(`Screen hash: ${screenHash}`);
    
    // Capture screenshot
    addCrawlerLog('Capturing screenshot');
    const screenshot = await captureScreenshot(deviceId);
    const screenshotHash = calculateHash(screenshot);
    addCrawlerLog(`Screenshot hash: ${screenshotHash}`);
    
    // Analyze UI elements
    addCrawlerLog('Analyzing UI elements');
    const elements = parseUIElements(uiHierarchy);
    
    // Check if we've already visited this screen
    const { screens, uniqueScreens } = require('./visualState');
    const existingScreen = uniqueScreens.find(s => s.screenHash === screenHash);
    
    if (!existingScreen) {
      // New screen found
      const screen = {
        id: screens.length + 1,
        timestamp: new Date().toISOString(),
        activity: currentActivity,
        screenHash,
        screenshotHash,
        screenshot,
        elements,
        parentScreenId: visitedScreens.length > 0 ? visitedScreens[visitedScreens.length - 1] : null
      };
      
      // Add to visited screens tracking
      const screenId = addScreen(screen);
      visitedScreens = [...visitedScreens, screenId];
      
      // Notify UI of new screen with progress
      if (mainWindowRef && mainWindowRef.webContents) {
        mainWindowRef.webContents.send('crawler:newScreen', screen);
        mainWindowRef.webContents.send('crawler:progress', {
          percentage: Math.min(100, Math.round((uniqueScreens.length / crawlerSettings.maxScreens) * 100)),
          currentScreens: uniqueScreens.length,
          maxScreens: crawlerSettings.maxScreens
        });
      }
      
      addCrawlerLog(`Found new visual state: ${currentActivity.split('/').pop()}`, 'success');
    } else {
      addCrawlerLog(`Found already visited visual state: ${currentActivity.split('/').pop()}`, 'info');
      return; // Skip this screen since we've seen it before
    }
    
    // Check if we've reached the maximum number of screens
    if (uniqueScreens.length >= crawlerSettings.maxScreens) {
      addCrawlerLog(`Reached maximum number of unique visual states (${crawlerSettings.maxScreens}), stopping crawler`, 'success');
      
      // Generate and send the flowchart data before stopping
      if (mainWindowRef && mainWindowRef.webContents) {
        mainWindowRef.webContents.send('crawler:flowchartData', generateFlowchartData());
      }
      
      return;
    }
    
    // Check depth limit
    if (currentDepth >= crawlerSettings.maxDepth) {
      addCrawlerLog(`Reached maximum recursion depth (${crawlerSettings.maxDepth}), returning to higher level`, 'warning');
      return;
    }
    
    // Divide elements into clickable vs non-clickable
    const clickedElements = [];
    const unclickedElements = [];
    
    // First filter out elements we want to ignore
    const interactableElements = elements.filter(element => {
      // Skip elements in the ignore list
      if (crawlerSettings.ignoreElements.some(type => element.class.includes(type))) {
        return false;
      }
      
      // Filter for elements that are likely interactive
      return element.class.includes('Button') || 
             element.class.includes('EditText') || 
             element.class.includes('CheckBox') || 
             element.class.includes('Switch') || 
             element.class.includes('Spinner') ||
             element.class.includes('View') && element.resourceId.includes('btn');
    });
    
    addCrawlerLog(`Found ${unclickedElements.length} unclicked elements and ${clickedElements.length} previously clicked elements`);
    
    // Determine which elements to try based on crawler mode
    let elementsToTry = [];
    
    switch (crawlerSettings.mode) {
      case 'breadthFirst':
        // Try all unclicked elements first, then clicked elements
        elementsToTry = [...interactableElements];
        break;
        
      case 'depthFirst':
        // Try elements in reverse order (depth-first)
        elementsToTry = [...interactableElements].reverse();
        break;
        
      case 'aiAssisted':
        // Use AI prompt to prioritize elements
        elementsToTry = prioritizeElementsByAiPrompt([...interactableElements], crawlerSettings.aiPrompt);
        break;
        
      default:
        // Default to breadth-first
        elementsToTry = [...interactableElements];
    }
    
    // Click each element and explore resulting screens
    for (const element of elementsToTry) {
      if (!crawlerRunning) break;
      
      // Get click count for this element from previous interactions
      const clickCount = clickedElements.filter(e => e.buttonHash === element.buttonHash).length;
      
      // Skip if we've already clicked this button too many times
      if (clickCount >= crawlerSettings.maxClicksPerButton) {
        addCrawlerLog(`Skipping button ${element.buttonHash} (clicked ${clickCount} times already)`, 'info');
        continue;
      }
      
      try {
        // Click the element
        addCrawlerLog(`Clicking element: ${element.class} (hash: ${element.buttonHash.substring(0, 8)})`);
        const { left, top, right, bottom } = element.bounds;
        const centerX = Math.floor((parseInt(left) + parseInt(right)) / 2);
        const centerY = Math.floor((parseInt(top) + parseInt(bottom)) / 2);
        
        await execAdbCommand(`-s ${deviceId} shell input tap ${centerX} ${centerY}`);
        
        // Add to clicked elements
        clickedElements.push(element);
        
        // Wait for UI to update
        addCrawlerLog(`Waiting for UI to update (${crawlerSettings.screenDelay}ms)`);
        await new Promise(resolve => setTimeout(resolve, crawlerSettings.screenDelay));
        
        // Recursively explore the new screen
        addCrawlerLog('Exploring new screen');
        await exploreScreen(deviceId, packageName, visitedScreens, currentDepth + 1);
        
        // Go back to previous screen
        addCrawlerLog('Going back to previous screen');
        await execAdbCommand(`-s ${deviceId} shell input keyevent 4`);  // KEYCODE_BACK
        await new Promise(resolve => setTimeout(resolve, crawlerSettings.screenDelay));
        
        // Verify we're still in the app after going back
        const activityAfterBack = await getCurrentActivity(deviceId);
        if (crawlerSettings.stayInApp && !activityAfterBack.includes(packageName)) {
          addCrawlerLog(`Left the app after going back. Current activity: ${activityAfterBack}. Relaunching app...`, 'warning');
          
          try {
            // Try to return to the app
            await execAdbCommand(`-s ${deviceId} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
            
            // Wait for app to start again
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check if we're back in the app
            const newActivity = await getCurrentActivity(deviceId);
            if (newActivity.includes(packageName)) {
              addCrawlerLog(`Successfully returned to app: ${newActivity}`, 'success');
            } else {
              addCrawlerLog(`Failed to return to app ${packageName} after back action`, 'error');
              return;
            }
          } catch (error) {
            addCrawlerLog(`Error returning to app: ${error.message}`, 'error');
            return;
          }
        }
      } catch (elementError) {
        addCrawlerLog(`Error clicking element: ${elementError.message}`, 'error');
        continue; // Try the next element
      }
    }
    
    addCrawlerLog(`Finished exploring screen: ${currentActivity.split('/').pop()}`);
  } catch (error) {
    addCrawlerLog(`Error during crawling: ${error.message}`, 'error');
    
    // Notify UI of error
    if (mainWindowRef && mainWindowRef.webContents) {
      mainWindowRef.webContents.send('crawler:error', {
        message: error.message
      });
    }
    
    // Stop crawler on error
    crawlerRunning = false;
  }
}

/**
 * Stop app crawling
 * @param {Object} windowRef Reference to the main window
 * @returns {Object} Status object
 */
function stopAppCrawling(windowRef) {
  if (crawlerRunning) {
    crawlerRunning = false;
    addCrawlerLog('Crawler stopped manually', 'info');
    
    // Notify UI
    if (windowRef && windowRef.webContents) {
      windowRef.webContents.send('crawler:complete');
    }
    
    return { success: true, message: 'Crawler stopped' };
  }
  
  return { success: true, message: 'Crawler was not running' };
}

/**
 * Get the current status of the crawler
 * @returns {Object} Status object
 */
function getStatus() {
  return {
    running: crawlerRunning,
    deviceId: crawlerDeviceId,
    packageName: crawlerPackageName,
    settings: crawlerSettings
  };
}

/**
 * Get the crawler logs
 * @returns {Array} Crawler logs
 */
function getLogs() {
  return crawlerLogs;
}

// Event handlers
function onProgress(callback) {
  if (mainWindowRef && mainWindowRef.webContents) {
    mainWindowRef.webContents.on('crawler:progress', (event, data) => callback(data));
  }
}

function onNewScreen(callback) {
  if (mainWindowRef && mainWindowRef.webContents) {
    mainWindowRef.webContents.on('crawler:newScreen', (event, data) => callback(data));
  }
}

function onComplete(callback) {
  if (mainWindowRef && mainWindowRef.webContents) {
    mainWindowRef.webContents.on('crawler:complete', () => callback());
  }
}

function onError(callback) {
  if (mainWindowRef && mainWindowRef.webContents) {
    mainWindowRef.webContents.on('crawler:error', (event, data) => callback(data));
  }
}

function onLog(callback) {
  if (mainWindowRef && mainWindowRef.webContents) {
    mainWindowRef.webContents.on('crawler:log', (event, data) => callback(data));
  }
}

module.exports = {
  startAppCrawling,
  stopAppCrawling,
  getStatus,
  getLogs,
  addCrawlerLog,
  onProgress,
  onNewScreen,
  onComplete,
  onError,
  onLog
}; 