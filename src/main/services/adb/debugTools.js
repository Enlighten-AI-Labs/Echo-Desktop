/**
 * ADB Debug Tools module - handles logcat and analytics debugging
 */
const { spawn } = require('child_process');
const { execAdbCommand } = require('./deviceManager');
const { captureUiXml } = require('./commands');
const { PATHS } = require('./installer');
const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');

// Variables for logcat capture
let logcatProcess = null;
let analyticsLogs = [];
let currentEvent = null;
let eventBuffer = '';
let eventStarted = false;
const MAX_ANALYTICS_LOGS = 5000;

// Variables for network capture
let networkCaptureProcess = null;
let currentBatchData = {
  events: [],
  sharedPayload: {}
};

// Variables for touch event capture
let touchEventProcess = null;
let currentTouchEvents = [];
let lastTouchTimestamp = 0;
let currentTouchSequence = [];
let isTrackingTouch = false;

// Store window reference for sending updates
let mainWindow = null;

/**
 * Set the main window to send updates to
 * @param {BrowserWindow} window The main window
 */
function setMainWindow(window) {
  mainWindow = window;
}

/**
 * Notify UI that an event has been updated with XML
 * @param {Object} event The updated event
 */
function notifyXmlUpdate(event) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Log the event being sent to the frontend
    console.log('Sending updated event to frontend:', event.id, event.eventName);
    
    // Send only necessary fields to identify and update the event
    const eventUpdate = {
      id: event.id,
      eventName: event.eventName,
      timestamp: event.timestamp,
      uiXml: event.uiXml,
      source: event.source || 'logcat',
      // Include any other unique identifiers
      message: event.message,
      rawLog: event.rawLog
    };
    
    mainWindow.webContents.send('analytics-event-updated', eventUpdate);
  }
}

/**
 * Start logcat capture for a specific device
 * @param {string} deviceId The device identifier
 * @param {string} filter Optional filter string
 * @returns {Promise<boolean>} Success status
 */
function startLogcatCapture(deviceId, filter = 'FA FA-SVC') {
  // Stop any existing logcat process
  stopLogcatCapture();
  
  try {
    console.log(`Starting logcat capture for device ${deviceId} with filter "${filter}"`);
    
    // Clear existing logs
    analyticsLogs = [];
    
    // Clear the logcat buffer first
    execAdbCommand(`-s ${deviceId} logcat -c`);
    
    // Start logcat process with the specified filter
    // Using the raw format for better analytics data capture
    const args = [
      '-s', deviceId,
      'logcat',
      '-v', 'raw',
      '-s', filter
    ];
    
    console.log(`Executing logcat: ${PATHS.fullAdbPath} ${args.join(' ')}`);
    
    // Spawn the logcat process
    logcatProcess = spawn(PATHS.fullAdbPath, args);
    
    // Handle stdout data
    logcatProcess.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Parse logcat output for analytics events - handle the async function properly
      parseLogcatForAnalytics(output, deviceId).catch(error => {
        console.error('Error processing logcat output:', error);
      });
    });
    
    // Handle stderr data
    logcatProcess.stderr.on('data', (data) => {
      console.error(`Logcat stderr: ${data}`);
    });
    
    // Handle process exit
    logcatProcess.on('close', (code) => {
      console.log(`Logcat process exited with code ${code}`);
      logcatProcess = null;
    });
    
    // Start capturing network traffic for analytics requests
    startNetworkCapture(deviceId);
    
    // Start capturing touch events
    startTouchEventCapture(deviceId);
    
    return { success: true, message: 'Logcat, network, and touch event capture started' };
  } catch (error) {
    console.error('Error starting logcat capture:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Parse logcat output for analytics events
 * @param {string} output The logcat output to parse
 * @param {string} deviceId The device identifier for UI XML capture
 */
async function parseLogcatForAnalytics(output, deviceId) {
  // Process each line from the logcat output
  const lines = output.split('\n');
  for (const line of lines) {
    if (line.trim() === '') continue;
    
    // Always store as raw log
    const rawLogEntry = {
      timestamp: new Date().toISOString(),
      rawLog: line
    };
    
    // Add the raw log to our array
    analyticsLogs.push(rawLogEntry);
    
    // Check if this is the start of a new event with "Logging event:"
    if (line.includes('Logging event:')) {
      console.log("New Event: " + line);
      // Extract event name and potential parameters
      const nameMatch = line.match(/name=([a-zA-Z_]+)/);
      const eventName = nameMatch ? nameMatch[1] : 'Unknown Event';
      
      // Create new event object
      const logEvent = {
        timestamp: new Date().toISOString(),
        eventName: eventName,
        message: line,
        rawLog: line,
        params: {}
      };
      
      // If there are params, extract them
      const paramsMatch = line.match(/params=Bundle\[\{(.*)\}\]/);
      if (paramsMatch) {
        const paramsStr = paramsMatch[1];
        // Extract key-value pairs
        const keyValueRegex = /([a-zA-Z_]+)=([^,]+),?\s*/g;
        let match;
        while ((match = keyValueRegex.exec(paramsStr)) !== null) {
          logEvent.params[match[1]] = match[2];
        }
      }
      
      // Capture UI XML for every event (with retries for reliability)
      if (deviceId) {
        // Add a unique ID to the event for tracking
        logEvent.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Instead of synchronously waiting, add event first and capture XML asynchronously
        // Add this event to the analytics logs immediately
        analyticsLogs.push(logEvent);
        
        // Now capture XML asynchronously using our dedicated function
        captureXmlAsynchronously(logEvent, deviceId);
        
        continue;
      }
      
      // Add this event to the analytics logs
      analyticsLogs.push(logEvent);
      continue;
    }
    
    // Look for "event {" which starts a detailed event definition in proto format
    if (line.includes("event {")) {
      eventBuffer = line;
      eventStarted = true;
      continue;
    }
    
    // If we're in an event, keep adding lines until we reach the end
    if (eventStarted) {
      eventBuffer += line;
      
      // Check if this is the end of the event
      if (line.includes("}") && !line.includes("{")) {
        // Parse the complete event
        const event = parseFirebaseEvent(eventBuffer);
        if (event) {
          analyticsLogs.push(event);
        }
        
        // Reset for next event
        eventBuffer = '';
        eventStarted = false;
      }
      continue;
    }
    
    // Look for user property updates
    if(line.includes("Setting user property:")) {
      const userProperty = line.split("Setting user property:")[1].split(", ")[0];
      const userPropertyValue = line.split("Setting user property:")[1].split(", ")[1];
      console.log("Received update to user property: " + userProperty + " with value: " + userPropertyValue);
      
      if (!currentBatchData.sharedPayload) {
        currentBatchData.sharedPayload = {};
      }
      currentBatchData.sharedPayload[userProperty] = userPropertyValue;
      console.log("Current batch data: " + JSON.stringify(currentBatchData));
      continue;
    }
    
    // If we get here, it's a regular analytics log line that's not part of a special format
    // Only add it if it wasn't handled by the previous conditions
    const regularLogEntry = {
      timestamp: new Date().toISOString(),
      message: line,
      rawLog: line
    };
    analyticsLogs.push(regularLogEntry);
    
    // Keep array size under control
    while (analyticsLogs.length > MAX_ANALYTICS_LOGS) {
      analyticsLogs.shift();
    }
  }
}

/**
 * Parse a Firebase event from a complete event string
 * @param {string} eventStr The event string to parse
 * @returns {Object|null} The parsed event or null if parsing failed
 */
function parseFirebaseEvent(eventStr) {
  try {
    // Extract event name
    const nameMatch = eventStr.match(/name:\s*([a-zA-Z_()]+)/);
    const eventName = nameMatch ? nameMatch[1] : 'Unknown Event';
    
    // Extract timestamp
    const timeMatch = eventStr.match(/timestamp_millis:\s*(\d+)/);
    const timestamp = timeMatch ? new Date(parseInt(timeMatch[1])).toISOString() : new Date().toISOString();
    
    // Create event object
    const event = {
      timestamp,
      eventName,
      message: eventStr,
      rawLog: eventStr,
      params: {}
    };
    
    // Extract all parameters
    const paramRegex = /param\s*\{\s*name:\s*([a-zA-Z_()]+)\s*(string_value|int_value):\s*([^\n]+)/g;
    let match;
    while ((match = paramRegex.exec(eventStr)) !== null) {
      const paramName = match[1];
      const paramValue = match[3].trim();
      event.params[paramName] = paramValue;
    }
    
    return event;
  } catch (error) {
    console.error('Error parsing Firebase event:', error);
    return null;
  }
}

/**
 * Start capturing network traffic for analytics requests
 * @param {string} deviceId The device ID
 * @returns {Object} Status of the operation
 */
function startNetworkCapture(deviceId) {
  if (networkCaptureProcess) {
    console.log('Network capture already running, stopping previous capture');
    stopNetworkCapture();
  }

  console.log(`Starting network capture for device ${deviceId}`);
  
  try {
    // Use tcpdump to capture HTTP/HTTPS traffic
    // Filter for Google Analytics and Adobe Analytics requests
    const args = [
      '-s', deviceId,
      'shell',
      'tcpdump',
      '-i', 'any',
      '-A',  // ASCII output
      '-s', '0',  // Capture full packets
      'port 80 or port 443'  // HTTP/HTTPS traffic
    ];
    
    console.log(`Executing network capture: ${PATHS.fullAdbPath} ${args.join(' ')}`);
    
    networkCaptureProcess = spawn(PATHS.fullAdbPath, args);
    
    // Process the output
    networkCaptureProcess.stdout.on('data', (data) => {
      const output = data.toString();
      parseNetworkTrafficForAnalytics(output, deviceId);
    });
    
    networkCaptureProcess.stderr.on('data', (data) => {
      console.error(`Network capture error: ${data}`);
    });
    
    networkCaptureProcess.on('close', (code) => {
      console.log(`Network capture process exited with code ${code}`);
      networkCaptureProcess = null;
    });
    
    return { success: true, message: 'Network capture started' };
  } catch (error) {
    console.error('Error starting network capture:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Stop capturing network traffic
 * @returns {Object} Status of the operation
 */
function stopNetworkCapture() {
  if (!networkCaptureProcess) {
    return { success: true, message: 'Network capture was not running' };
  }
  
  try {
    networkCaptureProcess.kill();
    networkCaptureProcess = null;
    console.log('Network capture stopped');
    return { success: true, message: 'Network capture stopped' };
  } catch (error) {
    console.error('Error stopping network capture:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Parse network traffic for analytics requests
 * @param {string} output The network traffic output to parse
 * @param {string} deviceId The device identifier for UI XML capture
 */
function parseNetworkTrafficForAnalytics(output, deviceId) {
  try {
    // Look for HTTP requests in the output
    if (output.includes('GET /collect') || 
        output.includes('POST /collect') || 
        output.includes('GET /g/collect') ||
        output.includes('POST /g/collect') ||
        output.includes('GET /r/collect') ||
        output.includes('POST /r/collect') ||
        output.includes('GET /mp/collect') ||
        output.includes('POST /mp/collect') ||
        output.includes('/b/ss/')) {
      
      // Process the analytics request and get the event immediately
      let event = null;
      
      try {
        // Check if this is a Google Analytics request
        if (isGoogleAnalyticsRequest(output)) {
          event = parseGoogleAnalyticsRequest(output);
        }
        // Check if this is an Adobe Analytics request
        else if (isAdobeAnalyticsRequest(output)) {
          event = parseAdobeAnalyticsRequest(output);
        }
        
        if (event) {
          // Add a unique ID to the event for tracking
          event.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          // Add the event to the analytics logs immediately
          analyticsLogs.push(event);
          
          // If we have a valid event, capture UI XML asynchronously
          if (deviceId) {
            captureXmlAsynchronously(event, deviceId);
          }
        }
      } catch (error) {
        console.error('Error processing network analytics event:', error);
      }
    }
  } catch (error) {
    console.error('Error parsing network traffic:', error);
  }
}

/**
 * Capture XML data asynchronously for an event
 * @param {Object} event The event to capture XML for
 * @param {string} deviceId The device identifier
 */
async function captureXmlAsynchronously(event, deviceId) {
  try {
    let uiXml = null;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts && (!uiXml || uiXml.startsWith('Error') || uiXml.startsWith('UI XML capture failed'))) {
      attempts++;
      try {
        console.log(`Attempt ${attempts} to capture UI XML for event ${event.eventName}`);
        uiXml = await captureUiXml(deviceId);
        
        // Small delay between retries
        if (attempts < maxAttempts && (!uiXml || uiXml.startsWith('Error') || uiXml.startsWith('UI XML capture failed'))) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (retryError) {
        console.warn(`XML capture retry ${attempts} failed:`, retryError.message);
      }
    }
    
    if (uiXml && !uiXml.startsWith('Error') && !uiXml.startsWith('UI XML capture failed')) {
      // Keep a reference to the original event to ensure we update the right one
      const originalEvent = event;
      
      // Find the event in the logs by ID and update it
      const eventIndex = analyticsLogs.findIndex(e => e.id === event.id);
      if (eventIndex !== -1) {
        analyticsLogs[eventIndex].uiXml = uiXml;
        console.log(`Successfully captured UI XML for event ${event.eventName} after ${attempts} attempt(s)`);
        
        // Make sure we notify UI with the same ID as the original event
        const eventToNotify = {
          ...analyticsLogs[eventIndex],
          id: originalEvent.id
        };
        
        // Notify UI about the updated event
        notifyXmlUpdate(eventToNotify);
      } else {
        console.warn(`Event not found in logs for ID: ${event.id}`);
      }
    } else {
      console.warn(`Failed to capture UI XML after ${attempts} attempts for event ${event.eventName}`);
    }
  } catch (error) {
    console.error('Error in XML capture process:', error);
  }
}

/**
 * Check if a request is a Google Analytics request
 * @param {string} request The request to check
 * @returns {boolean} True if it's a Google Analytics request
 */
function isGoogleAnalyticsRequest(request) {
  // Check for various Google Analytics patterns
  const patterns = [
    /google-analytics\.com/i,
    /analytics\.google\.com/i,
    /firebase\.google\.com/i,
    /collect\?/i,
    /google\.com\/analytics/i,
    /gtag\/js/i,
    /ga\.js/i
  ];
  
  return patterns.some(pattern => pattern.test(request));
}

/**
 * Check if a request is an Adobe Analytics request
 * @param {string} request The request to check
 * @returns {boolean} True if it's an Adobe Analytics request
 */
function isAdobeAnalyticsRequest(request) {
  // Adobe Analytics requests contain b/ss
  return /b\/ss/i.test(request);
}

/**
 * Parse a Google Analytics request
 * @param {string} request The request to parse
 * @returns {Object|null} The parsed event or null if parsing failed
 */
function parseGoogleAnalyticsRequest(request) {
  try {
    // Extract the URL from the request
    const urlMatch = request.match(/^(GET|POST) (.*?) HTTP/);
    if (!urlMatch) return null;
    
    const url = urlMatch[2];
    
    // Extract query parameters
    const queryParams = {};
    const queryString = url.split('?')[1];
    if (queryString) {
      const params = queryString.split('&');
      for (const param of params) {
        const [key, value] = param.split('=');
        if (key && value) {
          queryParams[decodeURIComponent(key)] = decodeURIComponent(value);
        }
      }
    }
    
    // Determine the event type based on parameters
    let eventName = 'Unknown Event';
    let eventType = 'unknown';
    
    // Check for Firebase Analytics
    if (url.includes('firebase.google.com') || url.includes('google-analytics.com/collect')) {
      eventType = 'firebase';
      
      // Try to extract event name from various parameters
      if (queryParams['en']) {
        eventName = queryParams['en'];
      } else if (queryParams['ec']) {
        eventName = queryParams['ec'];
      } else if (queryParams['ea']) {
        eventName = queryParams['ea'];
      }
    }
    // Check for standard Google Analytics
    else if (url.includes('google-analytics.com')) {
      eventType = 'ga';
      
      // Try to extract event name
      if (queryParams['ec']) {
        eventName = queryParams['ec'];
      } else if (queryParams['ea']) {
        eventName = queryParams['ea'];
      } else if (queryParams['t']) {
        eventName = queryParams['t'];
      }
    }
    
    // Create the event object
    const event = {
      timestamp: new Date().toISOString(),
      eventName: eventName,
      eventType: eventType,
      message: `Network Request: ${url.substring(0, 100)}${url.length > 100 ? '...' : ''}`,
      rawLog: request,
      params: queryParams,
      source: 'network'
    };
    
    return event;
  } catch (error) {
    console.error('Error parsing Google Analytics request:', error);
    return null;
  }
}

/**
 * Parse an Adobe Analytics request
 * @param {string} request The request to parse
 * @returns {Object|null} The parsed event or null if parsing failed
 */
function parseAdobeAnalyticsRequest(request) {
  try {
    // Extract the URL from the request
    const urlMatch = request.match(/^(GET|POST) (.*?) HTTP/);
    if (!urlMatch) return null;
    
    const url = urlMatch[2];
    
    // Extract query parameters
    const queryParams = {};
    const queryString = url.split('?')[1];
    if (queryString) {
      const params = queryString.split('&');
      for (const param of params) {
        const [key, value] = param.split('=');
        if (key && value) {
          queryParams[decodeURIComponent(key)] = decodeURIComponent(value);
        }
      }
    }
    
    // Try to extract event name
    let eventName = 'Adobe Analytics Event';
    if (queryParams['events']) {
      eventName = queryParams['events'];
    } else if (queryParams['pe']) {
      eventName = queryParams['pe'];
    }
    
    // Create the event object
    const event = {
      timestamp: new Date().toISOString(),
      eventName: eventName,
      eventType: 'adobe',
      message: `Adobe Analytics Request: ${url.substring(0, 100)}${url.length > 100 ? '...' : ''}`,
      rawLog: request,
      params: queryParams,
      source: 'network'
    };
    
    return event;
  } catch (error) {
    console.error('Error parsing Adobe Analytics request:', error);
    return null;
  }
}

/**
 * Get captured analytics logs
 * @returns {Array} The captured analytics logs
 */
function getAnalyticsLogs() {
  return analyticsLogs;
}

/**
 * Clear captured analytics logs
 * @returns {Object} Success status
 */
function clearAnalyticsLogs() {
  analyticsLogs = [];
  return { success: true, message: 'Analytics logs cleared' };
}

/**
 * Check if logcat capture is running
 * @returns {boolean} True if running, false otherwise
 */
function isLogcatRunning() {
  return logcatProcess !== null;
}

/**
 * Stop logcat capture
 * @returns {Object} Success status
 */
function stopLogcatCapture() {
  if (!logcatProcess) {
    return { success: true, message: 'Logcat capture was not running' };
  }
  
  try {
    logcatProcess.kill();
    logcatProcess = null;
    console.log('Logcat capture stopped');
    
    // Also stop network capture
    stopNetworkCapture();
    
    // Also stop touch event capture
    stopTouchEventCapture();
    
    return { success: true, message: 'Logcat, network, and touch event capture stopped' };
  } catch (error) {
    console.error('Error stopping logcat capture:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Process an analytics request
 * @param {string} request The request to process
 * @param {string} deviceId The device identifier for UI XML capture
 * @returns {Promise<Object|null>} The processed event or null if processing failed
 */
async function processAnalyticsRequest(request, deviceId) {
  try {
    let event = null;
    
    // Check if this is a Google Analytics request
    if (isGoogleAnalyticsRequest(request)) {
      event = parseGoogleAnalyticsRequest(request);
    }
    // Check if this is an Adobe Analytics request
    else if (isAdobeAnalyticsRequest(request)) {
      event = parseAdobeAnalyticsRequest(request);
    }
    
    if (!event) {
      return null;
    }
    
    // Add a unique ID to the event for tracking
    event.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Add the event to the analytics logs immediately
    analyticsLogs.push(event);
    
    // If we have a valid event, capture UI XML asynchronously
    if (deviceId) {
      captureXmlAsynchronously(event, deviceId);
    }
    
    return event;
  } catch (error) {
    console.error('Error processing analytics request:', error);
    return null;
  }
}

/**
 * Start capturing touch events from the device
 * @param {string} deviceId The device identifier
 * @returns {Object} Status of the operation
 */
function startTouchEventCapture(deviceId) {
  if (touchEventProcess) {
    console.log('Touch event capture already running, stopping previous capture');
    stopTouchEventCapture();
  }

  console.log(`Starting touch event capture for device ${deviceId}`);
  
  try {
    // Use getevent to capture all touch input events
    const args = [
      '-s', deviceId,
      'shell',
      'getevent', '-l'
    ];
    
    console.log(`Executing touch event capture: ${PATHS.fullAdbPath} ${args.join(' ')}`);
    
    touchEventProcess = spawn(PATHS.fullAdbPath, args);
    
    // Process the output
    touchEventProcess.stdout.on('data', (data) => {
      const output = data.toString();
      parseTouchEvents(output);
    });
    
    touchEventProcess.stderr.on('data', (data) => {
      console.error(`Touch event capture error: ${data}`);
    });
    
    touchEventProcess.on('close', (code) => {
      console.log(`Touch event capture process exited with code ${code}`);
      touchEventProcess = null;
    });
    
    return { success: true, message: 'Touch event capture started' };
  } catch (error) {
    console.error('Error starting touch event capture:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Stop capturing touch events
 * @returns {Object} Status of the operation
 */
function stopTouchEventCapture() {
  if (!touchEventProcess) {
    return { success: true, message: 'Touch event capture was not running' };
  }
  
  try {
    touchEventProcess.kill();
    touchEventProcess = null;
    console.log('Touch event capture stopped');
    return { success: true, message: 'Touch event capture stopped' };
  } catch (error) {
    console.error('Error stopping touch event capture:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Parse touch events from getevent output
 * @param {string} output The getevent output to parse
 */
function parseTouchEvents(output) {
  try {
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Parse the event line
      // Format: /dev/input/eventX: EV_TYPE EVENT_CODE VALUE
      const match = line.match(/\/dev\/input\/event(\d+):\s+(\w+)\s+(\w+)\s+(\w+)/);
      if (!match) continue;
      
      const [_, eventDevice, eventType, eventCode, eventValue] = match;
      
      // Create event object
      const touchEvent = {
        timestamp: Date.now(),
        device: eventDevice,
        type: eventType,
        code: eventCode,
        value: eventValue
      };
      
      // Add to current touch events
      currentTouchEvents.push(touchEvent);
      
      // Handle touch sequence tracking
      if (eventType === 'EV_KEY' && eventCode === 'BTN_TOUCH') {
        if (eventValue === 'DOWN') {
          // Start a new touch sequence
          isTrackingTouch = true;
          currentTouchSequence = [{
            type: 'touchstart',
            timestamp: Date.now(),
            x: null,
            y: null,
            details: []
          }];
        } else if (eventValue === 'UP' && isTrackingTouch) {
          // End current touch sequence
          isTrackingTouch = false;
          currentTouchSequence.push({
            type: 'touchend',
            timestamp: Date.now(),
            details: []
          });
          
          // Process the completed sequence
          processCompletedTouchSequence();
        }
      }
      
      // Track touch positions
      if (isTrackingTouch && eventType === 'EV_ABS') {
        const currentTouch = currentTouchSequence[currentTouchSequence.length - 1];
        
        // Add all details to the touch event
        currentTouch.details.push({
          code: eventCode,
          value: eventValue
        });
        
        // Update X position
        if (eventCode === 'ABS_MT_POSITION_X') {
          currentTouch.x = parseInt(eventValue, 16);
        }
        
        // Update Y position
        if (eventCode === 'ABS_MT_POSITION_Y') {
          currentTouch.y = parseInt(eventValue, 16);
        }
        
        // On sync report, if we have both X and Y, add a touch move event
        if (eventType === 'EV_SYN' && eventCode === 'SYN_REPORT' && 
            currentTouch.x !== null && currentTouch.y !== null &&
            currentTouch.type !== 'touchmove') {
          currentTouchSequence.push({
            type: 'touchmove',
            timestamp: Date.now(),
            x: currentTouch.x,
            y: currentTouch.y,
            details: []
          });
        }
      }
    }
  } catch (error) {
    console.error('Error parsing touch events:', error);
  }
}

/**
 * Process a completed touch sequence and add it to the latest analytics event
 */
function processCompletedTouchSequence() {
  if (currentTouchSequence.length === 0) return;
  
  try {
    // Determine the type of interaction based on the sequence
    let interactionType = 'Unknown';
    let startX = null;
    let startY = null;
    let endX = null;
    let endY = null;
    let distance = 0;
    
    // Find the first touchstart with coordinates
    for (const event of currentTouchSequence) {
      if (event.type === 'touchstart' || event.type === 'touchmove') {
        if (event.x !== null && event.y !== null) {
          startX = event.x;
          startY = event.y;
          break;
        }
      }
    }
    
    // Find the last touchmove or touchend with coordinates
    for (let i = currentTouchSequence.length - 1; i >= 0; i--) {
      const event = currentTouchSequence[i];
      if ((event.type === 'touchmove' || event.type === 'touchend') && event.x !== null && event.y !== null) {
        endX = event.x;
        endY = event.y;
        break;
      }
    }
    
    // Calculate distance if we have both start and end coordinates
    if (startX !== null && startY !== null && endX !== null && endY !== null) {
      distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    }
    
    // Determine interaction type
    if (distance < 20) {
      interactionType = 'Tap';
    } else if (distance >= 20 && distance < 100) {
      interactionType = 'Short Swipe';
    } else {
      interactionType = 'Long Swipe';
    }
    
    // Create interaction event
    const interaction = {
      timestamp: new Date().toISOString(),
      type: interactionType,
      startX,
      startY,
      endX,
      endY,
      distance,
      duration: currentTouchSequence[currentTouchSequence.length - 1].timestamp - currentTouchSequence[0].timestamp,
      events: currentTouchSequence
    };
    
    // Add to the most recent analytics event
    if (analyticsLogs.length > 0) {
      // Find the most recent non-raw event
      const recentEvents = [...analyticsLogs].reverse();
      let targetEvent = null;
      
      for (const event of recentEvents) {
        if (event.eventName && event.eventName !== 'Unknown Event') {
          targetEvent = event;
          break;
        }
      }
      
      if (targetEvent) {
        // Initialize the interactions array if it doesn't exist
        if (!targetEvent.interactions) {
          targetEvent.interactions = [];
        }
        
        // Add the interaction
        targetEvent.interactions.push(interaction);
        
        console.log(`Added ${interactionType} interaction to event ${targetEvent.eventName}`);
        
        // Notify UI of the update if we have a valid UI reference
        if (mainWindow && !mainWindow.isDestroyed()) {
          notifyEventUpdate(targetEvent);
        }
      }
    }
    
    // Clear the current sequence
    currentTouchSequence = [];
  } catch (error) {
    console.error('Error processing touch sequence:', error);
  }
}

/**
 * Notify the UI that an event has been updated
 * @param {Object} event The updated event
 */
function notifyEventUpdate(event) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log(`Notifying UI of updated event: ${event.eventName}`);
    const eventToSend = {
      id: event.id,
      eventName: event.eventName,
      timestamp: event.timestamp,
      interactions: event.interactions
    };
    mainWindow.webContents.send('analytics-event-interactions', eventToSend);
  }
}

/**
 * Gets the current batch data including shared payload
 * @returns {Object} The current batch data
 */
function getCurrentBatchData() {
  return { ...currentBatchData };
}

module.exports = {
  startLogcatCapture,
  stopLogcatCapture,
  getAnalyticsLogs,
  clearAnalyticsLogs,
  isLogcatRunning,
  startNetworkCapture,
  stopNetworkCapture,
  startTouchEventCapture,
  stopTouchEventCapture,
  setMainWindow,
  getCurrentBatchData
}; 