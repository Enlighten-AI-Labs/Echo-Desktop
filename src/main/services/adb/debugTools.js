/**
 * ADB Debug Tools module - handles logcat and analytics debugging
 */
const { spawn } = require('child_process');
const { execAdbCommand } = require('./deviceManager');
const { PATHS } = require('./installer');
const fs = require('fs');
const path = require('path');

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
      
      // Parse logcat output for analytics events
      parseLogcatForAnalytics(output);
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
    
    return { success: true, message: 'Logcat and network capture started' };
  } catch (error) {
    console.error('Error starting logcat capture:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Parse logcat output for analytics events
 * @param {string} output The logcat output to parse
 */
function parseLogcatForAnalytics(output) {
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
      console.log("Logging event: " + line);
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
      const userProperty = line.split("Setting user property:")[1].split(" ")[0];
      const userPropertyValue = line.split("Setting user property:")[1].split(" ")[1];
      console.log("Received update to user property: " + userProperty + " with value: " + userPropertyValue);
      
      if (!currentBatchData.sharedPayload) {
        currentBatchData.sharedPayload = {};
      }
      currentBatchData.sharedPayload[userProperty] = userPropertyValue;
      
      // Log the user property update
      analyticsLogs.push({
        timestamp: new Date().toISOString(),
        type: 'user_property',
        property: userProperty,
        value: userPropertyValue,
        message: `User property updated: ${userProperty} = ${userPropertyValue}`,
        rawLog: line
      });
      
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
      parseNetworkTrafficForAnalytics(output);
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
 * Parse network traffic for analytics events
 * @param {string} output The network traffic output to parse
 */
function parseNetworkTrafficForAnalytics(output) {
  // Split the output into lines
  const lines = output.split('\n');
  
  // Look for HTTP requests
  let currentRequest = '';
  let isCollectingRequest = false;
  
  for (const line of lines) {
    // Check if this is the start of an HTTP request
    if (line.startsWith('GET ') || line.startsWith('POST ')) {
      // If we were collecting a request, process it
      if (isCollectingRequest) {
        processAnalyticsRequest(currentRequest);
      }
      
      // Start collecting a new request
      currentRequest = line;
      isCollectingRequest = true;
      continue;
    }
    
    // If we're collecting a request, add this line
    if (isCollectingRequest) {
      currentRequest += '\n' + line;
      
      // Check if this is the end of the request (empty line)
      if (line.trim() === '') {
        processAnalyticsRequest(currentRequest);
        isCollectingRequest = false;
        currentRequest = '';
      }
    }
  }
  
  // Process any remaining request
  if (isCollectingRequest && currentRequest) {
    processAnalyticsRequest(currentRequest);
  }
}

/**
 * Process an analytics request
 * @param {string} request The request to process
 */
function processAnalyticsRequest(request) {
  // Check if this is a Google Analytics request
  if (isGoogleAnalyticsRequest(request)) {
    const analyticsEvent = parseGoogleAnalyticsRequest(request);
    if (analyticsEvent) {
      analyticsLogs.push(analyticsEvent);
    }
  }
  
  // Check if this is an Adobe Analytics request
  if (isAdobeAnalyticsRequest(request)) {
    const analyticsEvent = parseAdobeAnalyticsRequest(request);
    if (analyticsEvent) {
      analyticsLogs.push(analyticsEvent);
    }
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
    
    return { success: true, message: 'Logcat and network capture stopped' };
  } catch (error) {
    console.error('Error stopping logcat capture:', error);
    return { success: false, message: error.message };
  }
}

module.exports = {
  startLogcatCapture,
  stopLogcatCapture,
  getAnalyticsLogs,
  clearAnalyticsLogs,
  isLogcatRunning,
  startNetworkCapture,
  stopNetworkCapture
}; 