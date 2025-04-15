const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const { app } = require('electron');
const { userDataPath, getLocalIpAddress } = require('./utils');

// MitmProxy paths
const mitmproxyPath = process.platform === 'win32' ? 'mitmproxy.exe' : 'mitmproxy';
const mitmwebPath = process.platform === 'win32' ? 'mitmweb.exe' : 'mitmweb';
const mitmdumpPath = process.platform === 'win32' ? 'mitmdump.exe' : 'mitmdump';

// Path for mitmproxy installation
const mitmproxyBinPath = path.join(userDataPath, 'mitmproxy', 'bin');

// Process and traffic state
let mitmProxyProcess = null;
let mitmProxyTraffic = [];
const MAX_TRAFFIC_ENTRIES = 1000; // Limit to prevent memory issues

// Download and install mitmproxy if not already installed
async function ensureMitmproxyExists() {
  // Check if mitmproxy is already installed in the system
  const systemInstalled = await checkMitmproxyInstalled();
  if (systemInstalled) {
    console.log('mitmproxy already installed in the system');
    return true;
  }
  
  console.log('mitmproxy not found in system, installing...');
  
  try {
    // Use different installation methods based on platform
    if (process.platform === 'darwin') {
      // Check if Homebrew is installed on macOS
      console.log('Checking if Homebrew is installed...');
      try {
        await new Promise((resolve, reject) => {
          exec('which brew', (error) => {
            if (error) {
              console.error('Homebrew is not installed.');
              reject(new Error('Homebrew is not installed. Please install it from https://brew.sh/'));
              return;
            }
            resolve();
          });
        });
        
        // Install mitmproxy using Homebrew
        console.log('Installing mitmproxy using Homebrew...');
        await new Promise((resolve, reject) => {
          exec('brew install mitmproxy', (error, stdout, stderr) => {
            if (error) {
              console.error('Failed to install mitmproxy using Homebrew:', stderr);
              reject(error);
              return;
            }
            console.log('Homebrew install output:', stdout);
            resolve();
          });
        });
        
        // Set paths for macOS Homebrew installation
        global.mitmdumpPath = '/usr/local/bin/mitmdump';
        global.mitmproxyPath = '/usr/local/bin/mitmproxy';
        global.mitmwebPath = '/usr/local/bin/mitmweb';
        
        // Check for Apple Silicon Macs which use a different path
        if (!fs.existsSync(global.mitmdumpPath)) {
          global.mitmdumpPath = '/opt/homebrew/bin/mitmdump';
          global.mitmproxyPath = '/opt/homebrew/bin/mitmproxy';
          global.mitmwebPath = '/opt/homebrew/bin/mitmweb';
        }
        
      } catch (error) {
        console.error('Homebrew installation error:', error);
        throw error;
      }
    } else if (process.platform === 'win32') {
      // Windows installation using pip
      console.log('Installing mitmproxy using pip on Windows...');
      await new Promise((resolve, reject) => {
        exec('pip install mitmproxy', (error, stdout, stderr) => {
          if (error) {
            console.error('Failed to install mitmproxy using pip:', stderr);
            reject(error);
            return;
          }
          console.log('pip install output:', stdout);
          resolve();
        });
      });
      
      // Set paths for Windows
      global.mitmdumpPath = 'mitmdump.exe';
      global.mitmproxyPath = 'mitmproxy.exe';
      global.mitmwebPath = 'mitmweb.exe';
      
    } else {
      // Linux installation using pip
      console.log('Installing mitmproxy using pip on Linux...');
      await new Promise((resolve, reject) => {
        exec('pip3 install --user mitmproxy', (error, stdout, stderr) => {
          if (error) {
            console.error('Failed to install mitmproxy using pip:', stderr);
            reject(error);
            return;
          }
          console.log('pip install output:', stdout);
          resolve();
        });
      });
      
      // Get the path from which command
      const installedPath = await new Promise((resolve, reject) => {
        exec('which mitmdump', (error, stdout) => {
          if (error) {
            // Try to find in ~/.local/bin
            if (fs.existsSync(path.join(os.homedir(), '.local/bin/mitmdump'))) {
              resolve(path.join(os.homedir(), '.local/bin/mitmdump'));
            } else {
              console.error('mitmproxy was not installed correctly.');
              reject(error);
            }
            return;
          }
          resolve(stdout.trim());
        });
      });
      
      // Set paths for Linux
      global.mitmdumpPath = installedPath;
      global.mitmproxyPath = installedPath.replace('mitmdump', 'mitmproxy');
      global.mitmwebPath = installedPath.replace('mitmdump', 'mitmweb');
    }
    
    console.log('mitmproxy installed successfully at:', global.mitmdumpPath);
    return true;
  } catch (error) {
    console.error('Failed to install mitmproxy:', error);
    
    return false;
  }
}

// Function to check if mitmproxy is installed
async function checkMitmproxyInstalled() {
  // First check if mitmproxy is installed in the system path
  return new Promise((resolve) => {
    const command = process.platform === 'win32' ? 'where mitmdump' : 'which mitmdump';
    exec(command, (error) => {
      if (error) {
        console.log('mitmdump not found in system path:', error.message);
        
        // Check for local installation
        const localMitmdumpPath = path.join(mitmproxyBinPath, process.platform === 'win32' ? 'mitmdump.exe' : 'mitmdump');
        if (fs.existsSync(localMitmdumpPath)) {
          console.log('Found local mitmdump at:', localMitmdumpPath);
          // Set the global paths
          global.mitmdumpPath = localMitmdumpPath;
          global.mitmproxyPath = path.join(mitmproxyBinPath, process.platform === 'win32' ? 'mitmproxy.exe' : 'mitmproxy');
          global.mitmwebPath = path.join(mitmproxyBinPath, process.platform === 'win32' ? 'mitmweb.exe' : 'mitmweb');
          resolve(true);
        } else {
          console.log('mitmdump not found locally either');
          resolve(false);
        }
      } else {
        console.log('mitmdump found in system path');
        resolve(true);
      }
    });
  });
}

// Function to start mitmproxy
function startMitmproxy() {
  if (mitmProxyProcess) {
    console.log('mitmproxy already running');
    return { success: true, message: 'mitmproxy already running' };
  }

  try {
    console.log('Starting mitmdump...');
    
    // Clear previous traffic
    mitmProxyTraffic = [];
    
    // Determine which mitmdump path to use
    const executablePath = global.mitmdumpPath || mitmdumpPath;
    console.log('Using mitmdump at:', executablePath);
    
    // Use mitmdump which is designed for console output without UI
    const mitm = spawn(executablePath, [
      '--listen-port', '8080',  // Set the port to listen on
      '-v',                    // Standard verbosity level
      '--flow-detail', '2',    // Medium level of flow detail
      '--no-http2',            // Disable HTTP/2 for clearer logs
      '--anticache',           // Disable caching to see all requests
      '--set', 'block_global=false', // Don't block any requests
      '--set', 'flow_detail=2',      // Show detailed flow information
      '--set', 'termlog_verbosity=info', // Show info level logs
      '--set', 'console_eventlog=info'   // Show info level logs in console
    ]);

    mitmProxyProcess = mitm;

    mitm.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Parse the output for interesting traffic
      parseAndStoreTraffic(output);
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

// Parse mitmproxy output and store interesting traffic
function parseAndStoreTraffic(output) {
  // Remove [electron-wait] prefix if present
  const cleanOutput = output.replace(/\[electron-wait\] /g, '');
  
  // Request pattern for mitmdump's actual output format 
  // Example: "192.168.0.190:55359: POST https://analytics.google.com/g/collect?v=2&tid=G-2JRDBY3PKD..."
  const requestMatch = cleanOutput.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+):\s+([A-Z]+)\s+(https?:\/\/[^\s]+)/);
  
  // Response pattern for mitmdump's actual output format
  // Example: " << 204 No Content 0b"
  const responseMatch = cleanOutput.match(/<<\s+(\d{3})\s+([^0-9]+)\s+(\d+[kb]?)/);
  
  // Headers pattern
  const headerMatch = cleanOutput.match(/\s{4}([^:]+):\s+(.+)/);
  
  // Capture request
  if (requestMatch) {
    const [, source, method, url] = requestMatch;
    const timestamp = new Date().toISOString();
    
    // Check for duplicate request within the last 5 seconds
    const isDuplicate = mitmProxyTraffic.some(entry => 
      entry.type === 'request' && 
      entry.fullUrl === url && 
      Math.abs(new Date(entry.timestamp) - new Date(timestamp)) < 5000
    );
    
    if (!isDuplicate) {
      // Parse URL to get host and path
      let host = '';
      let path = '';
      let isGA4Request = false;
      let ga4Params = {};
      
      try {
        const urlObj = new URL(url);
        host = urlObj.host;
        path = urlObj.pathname + urlObj.search;
        
        // Check if this is a GA4 request
        if (url.includes('google-analytics.com/g/collect') || 
            url.includes('analytics.google.com/g/collect') ||
            url.includes('app-measurement.com/a') ||
            url.includes('firebase.googleapis.com/firebase/analytics') ||
            url.includes('google-analytics.com/collect') ||
            url.includes('analytics.google.com/collect') ||
            url.includes('google-analytics.com/mp/collect') ||
            url.includes('analytics.google.com/mp/collect') ||
            url.includes('google-analytics.com/debug/mp/collect') ||
            url.includes('analytics.google.com/debug/mp/collect') ||
            url.includes('google-analytics.com/batch') ||
            url.includes('analytics.google.com/batch') ||
            url.includes('google-analytics.com/gtm/post') ||
            url.includes('analytics.google.com/gtm/post')) {
          isGA4Request = true;
          
          // Parse GA4 parameters
          const params = new URLSearchParams(urlObj.search);
          params.forEach((value, key) => {
            ga4Params[key] = value;
          });
        }
      } catch (error) {
        console.error('Error parsing URL:', error);
      }
      
      mitmProxyTraffic.push({
        id: `req_${timestamp}_${Math.random().toString(36).substring(2, 10)}`,
        timestamp,
        type: 'request',
        source,
        destination: host,
        method,
        path,
        details: output,
        fullUrl: url,
        isGA4Request,
        ga4Params: Object.keys(ga4Params).length > 0 ? ga4Params : null
      });
      
      // Limit the array size
      if (mitmProxyTraffic.length > MAX_TRAFFIC_ENTRIES) {
        mitmProxyTraffic.shift();
      }
    }
  }
  
  // Capture response
  if (responseMatch) {
    const [, status, statusText, size] = responseMatch;
    const timestamp = new Date().toISOString();
    
    // Find the most recent request to associate this response with
    const lastRequest = [...mitmProxyTraffic]
      .filter(item => item.type === 'request')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      
    const source = lastRequest?.destination || 'server';
    const destination = lastRequest?.source || 'client';
    
    mitmProxyTraffic.push({
      id: `res_${timestamp}_${Math.random().toString(36).substring(2, 10)}`,
      timestamp,
      type: 'response',
      source,
      destination,
      status,
      content: `${statusText.trim()} (${size})`,
      details: output,
      relatedRequest: lastRequest?.id
    });
    
    // Limit the array size
    if (mitmProxyTraffic.length > MAX_TRAFFIC_ENTRIES) {
      mitmProxyTraffic.shift();
    }
  }
}

// Function to stop mitmproxy
function stopMitmproxy() {
  if (mitmProxyProcess) {
    console.log('Stopping mitmproxy...');
    mitmProxyProcess.kill();
    mitmProxyProcess = null;
    return { success: true, message: 'mitmproxy stopped successfully' };
  }
  return { success: true, message: 'mitmproxy was not running' };
}

// Get the status of mitmproxy
function getStatus() {
  return { running: !!mitmProxyProcess };
}

// Get the proxy IP address
function getProxyIp() {
  return getLocalIpAddress();
}

// Get the captured traffic
function getTraffic() {
  return mitmProxyTraffic;
}

// Clear the captured traffic
function clearTraffic() {
  mitmProxyTraffic = [];
  return { success: true, message: 'Traffic cleared' };
}

module.exports = {
  ensureMitmproxyExists,
  startMitmproxy,
  stopMitmproxy,
  getStatus,
  getProxyIp,
  getTraffic,
  clearTraffic
}; 