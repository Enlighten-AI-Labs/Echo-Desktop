/**
 * MitmProxy Server module - handles starting and stopping the proxy server
 */
const { spawn } = require('child_process');
const { PATHS } = require('./installer');
const { getLocalIpAddress } = require('../../utils');
const trafficAnalyzer = require('./trafficAnalyzer');

// The MitmProxy process
let mitmProxyProcess = null;

/**
 * Start the MitmProxy server
 * @returns {Object} Status of the operation
 */
function startProxy() {
  if (mitmProxyProcess) {
    console.log('mitmproxy already running');
    return { success: true, message: 'mitmproxy already running' };
  }

  try {
    console.log('Starting mitmdump...');
    
    // Clear previous traffic
    trafficAnalyzer.clearTraffic();
    
    // Determine which mitmdump path to use
    const executablePath = PATHS.fullMitmdumpPath;
    console.log('Using mitmdump at:', executablePath);
    
    // Use mitmdump which is designed for console output without UI
    const mitm = spawn(executablePath, [
      '--listen-port', '8080',  // Set the port to listen on
      '-v',                    // Standard verbosity level
      '--flow-detail', '4',    // Medium level of flow detail
      '--no-http2',            // Disable HTTP/2 for clearer logs
      '--anticache',           // Disable caching to see all requests
      '--set', 'block_global=false', // Don't block any requests
      '--set', 'flow_detail=4',      // Show detailed flow information
      '--set', 'termlog_verbosity=info', // Show info level logs
      '--set', 'console_eventlog=info'   // Show info level logs in console
    ]);

    mitmProxyProcess = mitm;

    mitm.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Parse the output for interesting traffic
      trafficAnalyzer.parseAndStoreTraffic(output);
    });

    mitm.stderr.on('data', (data) => {
      const output = data.toString();
      console.error(`mitmdump stderr: ${output}`);
    });

    mitm.on('close', (code) => {
      console.log(`mitmdump process exited with code ${code}`);
      mitmProxyProcess = null;
    });

    return { success: true, message: 'mitmdump started successfully' };
  } catch (error) {
    console.error('Failed to start mitmdump:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Stop the MitmProxy server
 * @returns {Object} Status of the operation
 */
function stopProxy() {
  if (mitmProxyProcess) {
    console.log('Stopping mitmproxy...');
    mitmProxyProcess.kill();
    mitmProxyProcess = null;
    return { success: true, message: 'mitmproxy stopped successfully' };
  }
  return { success: true, message: 'mitmproxy was not running' };
}

/**
 * Get the status of the MitmProxy server
 * @returns {Object} Status information
 */
function getProxyStatus() {
  return { 
    running: !!mitmProxyProcess,
    port: 8080,
    host: getProxyIp()
  };
}

/**
 * Get the IP address for proxy configuration
 * @returns {string} The IP address to use for proxy configuration
 */
function getProxyIp() {
  return getLocalIpAddress();
}

module.exports = {
  startProxy,
  stopProxy,
  getProxyStatus,
  getProxyIp
}; 