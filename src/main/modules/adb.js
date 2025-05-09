const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const extract = require('extract-zip');
const { app } = require('electron');
const qrcode = require('qrcode');
const mDnsSd = require('node-dns-sd');
const { nanoid } = require('nanoid');
const { userDataPath, downloadFile, getLocalIpAddress, ensureTmpDir } = require('./utils');
const { spawn } = require('child_process');

// ADB paths
const adbPath = path.join(userDataPath, 'platform-tools');
const adbExecutable = process.platform === 'win32' ? 'adb.exe' : 'adb';
const fullAdbPath = path.join(adbPath, adbExecutable);

// Variables for device discovery
let discoveryInProgress = false;
let deviceDiscoveryTimeout = null;
let dnssdInstance = null;

// Variables for logcat capture
let logcatProcess = null;
let analyticsLogs = [];
let currentEvent = null;
let eventBuffer = '';
let eventStarted = false;
const MAX_ANALYTICS_LOGS = 5000;

// Variables for network capture
let networkCaptureProcess = null;

// Download and extract Android platform tools if not already installed
async function ensureAdbExists() {
  // Check if platform-tools directory already exists
  if (fs.existsSync(fullAdbPath)) {
    console.log('ADB already installed at:', fullAdbPath);
    return fullAdbPath;
  }
  
  console.log('ADB not found, installing...');
  
  // Create directories if they don't exist
  if (!fs.existsSync(adbPath)) {
    fs.mkdirSync(adbPath, { recursive: true });
  }
  
  // Determine platform-specific download URL
  let downloadUrl;
  switch (process.platform) {
    case 'win32':
      downloadUrl = 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip';
      break;
    case 'darwin':
      downloadUrl = 'https://dl.google.com/android/repository/platform-tools-latest-darwin.zip';
      break;
    case 'linux':
      downloadUrl = 'https://dl.google.com/android/repository/platform-tools-latest-linux.zip';
      break;
    default:
      throw new Error('Unsupported platform: ' + process.platform);
  }
  
  // Download and extract platform-tools
  const zipPath = path.join(userDataPath, 'platform-tools.zip');
  await downloadFile(downloadUrl, zipPath);
  await extract(zipPath, { dir: userDataPath });
  
  // Make adb executable on Unix systems
  if (process.platform !== 'win32') {
    fs.chmodSync(fullAdbPath, '755');
  }
  
  // Clean up zip file
  fs.unlinkSync(zipPath);
  
  console.log('ADB installed successfully at:', fullAdbPath);
  return fullAdbPath;
}

// Execute an ADB command and return a promise
function execAdbCommand(command) {
  return new Promise((resolve, reject) => {
    const cmd = `"${fullAdbPath}" ${command}`;
    console.log('Executing ADB command:', cmd);
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error('ADB command error:', error);
        reject(error);
        return;
      }
      if (stderr) {
        console.warn('ADB stderr:', stderr);
      }
      resolve(stdout.trim());
    });
  });
}

// Parse ADB devices output into a structured format
function parseDevicesOutput(output) {
  const lines = output.split('\n');
  const devices = [];
  
  // Skip the first line which is just the header "List of devices attached"
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    
    // Parse device info
    const [id, ...rest] = line.split(/\s+/);
    const status = rest[0];
    
    // If the device is in device mode (not unauthorized or offline), get more info
    if (status === 'device') {
      const deviceInfo = {
        id: id,
        status: status,
      };
      devices.push(deviceInfo);
    } else {
      devices.push({
        id: id,
        status: status,
      });
    }
  }
  
  return devices;
}

// Get additional device info for the connected devices
async function getDeviceDetails(devices) {
  const detailedDevices = [];
  
  for (const device of devices) {
    // Only get details for devices in 'device' state
    if (device.status === 'device') {
      try {
        // Get manufacturer
        const manufacturer = await execAdbCommand(`-s ${device.id} shell getprop ro.product.manufacturer`);
        
        // Get model
        const model = await execAdbCommand(`-s ${device.id} shell getprop ro.product.model`);
        
        // Get product name
        const product = await execAdbCommand(`-s ${device.id} shell getprop ro.product.name`);
        
        detailedDevices.push({
          ...device,
          name: `${manufacturer} ${model}`.trim(),
          model: model,
          product: product,
        });
      } catch (error) {
        console.error(`Error getting details for device ${device.id}:`, error);
        detailedDevices.push(device);
      }
    } else {
      detailedDevices.push(device);
    }
  }
  
  return detailedDevices;
}

// Generate QR code for wireless debugging
async function generateQRCode() {
  try {
    // Start ADB server if not already running
    await execAdbCommand('start-server');
    
    // Get local IP address
    const hostIp = getLocalIpAddress();
    
    // Use a predefined name and password for pairing
    const debugName = "enlighten";
    const pairingCode = "123456";
    
    // Create a pairing port (between 30000-40000, consistent with Android expectations)
    const pairingPort = Math.floor(Math.random() * 10000) + 30000;
    
    // Generate a QR code with the correct Android format
    // Format: WIFI:T:ADB;S:{name};P:{password};;
    const tmpDir = ensureTmpDir();
    const qrCodePath = path.join(tmpDir, 'pairing_qrcode.png');
    const qrCodeContent = `WIFI:T:ADB;S:${debugName};P:${pairingCode};;`;
    
    console.log('Creating QR code with content:', qrCodeContent);
    
    // Generate the QR code image
    await new Promise((resolve, reject) => {
      qrcode.toFile(
        qrCodePath, 
        qrCodeContent,
        { 
          errorCorrectionLevel: 'H',
          width: 300,
          margin: 2
        },
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        }
      );
    });
    
    // For Electron's security model, convert to data URL
    const qrImageBuffer = fs.readFileSync(qrCodePath);
    const qrDataUrl = `data:image/png;base64,${qrImageBuffer.toString('base64')}`;
    
    console.log('Wireless debugging QR code generated');
    console.log('Pairing info:', hostIp, pairingPort, pairingCode);
    
    return {
      qrCodePath: qrDataUrl,
      hostIp,
      pairingPort, 
      pairingCode,
      message: 'Scan the QR code with your Android device to connect wirelessly.'
    };
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
}

// Generate ADB WiFi QR code with device discovery
async function generateAdbWifiQRCode() {
  try {
    // Start ADB server if not already running
    await execAdbCommand('start-server');
    
    // Get local IP address
    const hostIp = getLocalIpAddress();
    
    // Use a simpler pairing code format (6 digits)
    const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Create a pairing port (between 30000-40000, consistent with Android expectations)
    const pairingPort = Math.floor(Math.random() * 10000) + 30000;
    
    // Generate a QR code with the correct Android format
    // Format: WIFI:T:ADB;S:{ip}:{port};P:{code};;
    const qrCodeContent = `WIFI:T:ADB;S:${hostIp}:${pairingPort};P:${pairingCode};;`;
    
    console.log('Creating QR code with content:', qrCodeContent);
    
    // Create QR code image for UI display
    const tmpDir = ensureTmpDir();
    const qrCodePath = path.join(tmpDir, 'adb_pairing_qrcode.png');
    
    // Generate the QR code image
    await new Promise((resolve, reject) => {
      qrcode.toFile(
        qrCodePath, 
        qrCodeContent,
        { 
          errorCorrectionLevel: 'H',
          width: 300,
          margin: 2
        },
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        }
      );
    });
    
    // For Electron's security model, convert to data URL
    const qrImageBuffer = fs.readFileSync(qrCodePath);
    const qrDataUrl = `data:image/png;base64,${qrImageBuffer.toString('base64')}`;
    
    // Also log to console for debugging
    console.log('Android wireless debugging QR code generated');
    console.log('Pairing info:', hostIp, pairingPort, pairingCode);
    
    // Start device discovery in the background
    startDeviceDiscovery(pairingCode);
    
    // Return all information including the QR code image
    return {
      qrCodePath: qrDataUrl,
      hostIp,
      pairingPort,
      pairingCode,
      message: 'Scan the QR code with your Android device to connect wirelessly. Waiting for device to appear...'
    };
  } catch (error) {
    console.error('Error generating QR code:', error);
    
    // If there was an error, still return connection info
    const hostIp = getLocalIpAddress();
    console.log('Returning fallback connection info due to error');
    return {
      usingTerminalQr: false, // We're not using a terminal QR code
      hostIp,
      pairingPort: 5555,
      pairingCode: '123456',
      message: 'Failed to generate QR code. Please try manual connection.'
    };
  }
}

// Function to discover and connect to a device
async function discoverAndConnectDevice(pairingCode) {
  if (!discoveryInProgress) return;
  
  try {
    console.log('Searching for ADB pairing devices...');
    
    // Use mDnsSd.discover directly as it's a static method
    const deviceList = await mDnsSd.discover({
      name: '_adb-tls-pairing._tcp.local',
      timeout: 10000 // Add a 10 second timeout
    });
    
    console.log('Device discovery result:', deviceList);
    
    if (!deviceList || deviceList.length === 0) {
      // If no devices found, retry after a short delay
      setTimeout(() => {
        if (discoveryInProgress) {
          discoverAndConnectDevice(pairingCode);
        }
      }, 2000);
      return;
    }
    
    // Get the first discovered device
    const device = deviceList[0];
    
    // Make sure we have the required device information
    if (!device || !device.address || !device.service || !device.service.port) {
      console.error('Invalid device information:', device);
      throw new Error('Invalid device information received');
    }
    
    const address = device.address;
    const port = device.service.port;
    
    console.log(`Device found! Address: ${address}, Port: ${port}`);
    
    // Try to pair with the device
    const pairingSuccess = await pairWithDevice(address, port, pairingCode);
    
    // Connection attempt completed, stop discovery
    stopDeviceDiscovery();
    
    return {
      success: pairingSuccess,
      message: pairingSuccess 
        ? `Successfully paired with device at ${address}:${port}`
        : `Failed to pair with device at ${address}:${port}`
    };
  } catch (error) {
    console.error('Error discovering devices:', error);
    
    // For any errors, retry after delay if discovery is still active
    setTimeout(() => {
      if (discoveryInProgress) {
        discoverAndConnectDevice(pairingCode);
      }
    }, 3000);
  }
}

// Function to stop device discovery
function stopDeviceDiscovery() {
  if (deviceDiscoveryTimeout) {
    clearTimeout(deviceDiscoveryTimeout);
    deviceDiscoveryTimeout = null;
  }
  
  discoveryInProgress = false;
  console.log('Device discovery stopped');
}

// Function to start discovering ADB devices over the network
function startDeviceDiscovery(pairingCode) {
  // First ensure we clean up any existing discovery
  stopDeviceDiscovery();
  
  discoveryInProgress = true;
  console.log('Starting device discovery...');
  
  // Set a timeout to stop discovery after 60 seconds
  deviceDiscoveryTimeout = setTimeout(() => {
    console.log('Device discovery timeout after 60 seconds');
    stopDeviceDiscovery();
  }, 60000);
  
  // Start the discovery process
  discoverAndConnectDevice(pairingCode);
}

// Function to pair with a discovered device
async function pairWithDevice(address, port, pairingCode) {
  try {
    console.log(`Attempting to pair with device at ${address}:${port} using code: ${pairingCode}`);
    
    // First ensure ADB server is running
    await execAdbCommand('start-server');
    
    // Kill any existing ADB server to ensure clean state
    await execAdbCommand('kill-server');
    await execAdbCommand('start-server');
    
    // Wait a moment for ADB to restart
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Pair with the device using ADB
    const pairOutput = await execAdbCommand(`pair "${address}:${port}" "${pairingCode}"`);
    console.log('Pairing output:', pairOutput);
    
    if (pairOutput.includes('Successfully paired')) {
      console.log('Pairing successful, attempting to connect...');
      
      // Extract the GUID if available
      const guid = pairOutput.match(/\[guid=([^\]]+)\]/)?.[1];
      console.log('Device GUID:', guid);
      
      // First try connecting using the original pairing port
      console.log(`Trying to connect using pairing port first: ${address}:${port}`);
      let connectOutput = await execAdbCommand(`connect ${address}:${port}`);
      console.log('Initial connect output:', connectOutput);
      
      // If that works, great! If not, try port 5555
      if (!connectOutput.includes('connected to') && !connectOutput.includes('already connected')) {
        console.log('Initial connection failed, trying standard port 5555...');
        
        // Multiple connection attempts with delays
        for (let i = 0; i < 3; i++) {
          try {
            // Try to enable wireless debugging via shell command if possible
            try {
              await execAdbCommand(`shell setprop service.adb.tcp.port 5555`);
              await execAdbCommand(`shell stop adbd`);
              await execAdbCommand(`shell start adbd`);
            } catch (error) {
              console.log('Could not enable TCP port via shell, continuing anyway:', error);
            }
            
            connectOutput = await execAdbCommand(`connect ${address}:5555`);
            console.log(`Connection attempt ${i + 1} output:`, connectOutput);
            
            if (connectOutput.includes('connected to') || connectOutput.includes('already connected')) {
              // Verify connection with devices command
              const devicesOutput = await execAdbCommand('devices');
              if (devicesOutput.includes(address)) {
                console.log('Device successfully connected and verified');
                return true;
              }
            }
            
            // If not successful, wait before next attempt
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (connectError) {
            console.error(`Connection attempt ${i + 1} failed:`, connectError);
            // Wait longer before retry
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      } else {
        // Initial connection with pairing port was successful
        return true;
      }
      
      console.error('All connection attempts failed');
      return false;
    } else {
      console.error('Pairing failed:', pairOutput);
      return false;
    }
  } catch (error) {
    console.error('Error pairing with device:', error);
    return false;
  }
}

// Connect to a device at the given IP and port
async function connectDevice(ipAddress, port = 5555, pairingCode) {
  try {
    // Start ADB server if not already running
    await execAdbCommand('start-server');
    
    console.log(`Attempting to connect to device at ${ipAddress}:${port} with code ${pairingCode || 'not provided'}`);
    
    // If the pairing code is provided, pair first
    if (pairingCode) {
      console.log(`Pairing with device using code: ${pairingCode}`);
      try {
        const pairOutput = await execAdbCommand(`pair ${ipAddress}:${port} ${pairingCode}`);
        console.log('Pairing output:', pairOutput);
        
        // Check if pairing was successful
        if (pairOutput.includes('Successfully paired')) {
          console.log('Pairing successful, now connecting...');
        } else if (pairOutput.includes('error')) {
          return { success: false, message: `Pairing failed: ${pairOutput}` };
        }
      } catch (pairError) {
        console.error('Pairing error:', pairError);
        return { success: false, message: `Pairing failed: ${pairError.message}` };
      }
    }
    
    // Try to connect to the device
    const output = await execAdbCommand(`connect ${ipAddress}:${port}`);
    console.log('ADB connect output:', output);
    
    if (output.includes('connected to') || output.includes('already connected')) {
      return { success: true, message: output };
    } else {
      return { success: false, message: output };
    }
  } catch (error) {
    console.error('Error connecting device:', error);
    return { success: false, message: error.message };
  }
}

// Disconnect a device
async function disconnectDevice(deviceId) {
  try {
    const output = await execAdbCommand(`disconnect ${deviceId}`);
    return { success: true, message: output };
  } catch (error) {
    console.error('Error disconnecting device:', error);
    throw error;
  }
}

// Start ADB pairing with a specific port
async function startPairing() {
  try {
    // Start ADB server if not already running
    await execAdbCommand('start-server');
    
    // Get local IP address
    const hostIp = getLocalIpAddress();
    
    // Generate random port between 30000-40000
    const pairingPort = Math.floor(Math.random() * 10000) + 30000;
    
    // Start ADB pairing server runs in the background
    
    // Return immediately with connection info
    return {
      hostIp,
      pairingPort,
      message: 'Pairing server started. Enter the pairing code displayed here on your device.'
    };
  } catch (error) {
    console.error('Error starting pairing server:', error);
    throw error;
  }
}

// Get installed apps on a specific device
async function getInstalledApps(deviceId) {
  try {
    console.log(`Getting installed apps for device: ${deviceId}`);
    
    // First ensure the ADB server is running
    await execAdbCommand('start-server');
    
    // Get package list using the pm list packages command
    const output = await execAdbCommand(`-s ${deviceId} shell pm list packages -3`);
    
    // Process the output to get a list of package names
    // The output format is "package:com.example.app"
    const packageNames = output
      .split('\n')
      .filter(line => line.trim().startsWith('package:'))
      .map(line => line.trim().substring(8));
    
    // Get app names for each package
    const apps = [];
    for (const packageName of packageNames) {
      apps.push({
        packageName,
        appName: packageName // Fallback to package name
      });
    }
    
    console.log(`Found ${apps.length} installed apps`);
    return apps;
  } catch (error) {
    console.error('Error getting installed apps:', error);
    throw error;
  }
}

// Launch an app on a specific device
async function launchApp(deviceId, packageName) {
  try {
    console.log(`Launching app ${packageName} on device ${deviceId}`);
    
    // First ensure the ADB server is running
    await execAdbCommand('start-server');
    
    let activity = null;
    
    // Use platform-specific commands
    if (process.platform === 'win32') {
      // Windows: Use JavaScript parsing
      const activityOutput = await execAdbCommand(`-s ${deviceId} shell dumpsys package ${packageName}`);
      
      // Parse the output in JavaScript
      const lines = activityOutput.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('android.intent.action.MAIN')) {
          // Look at the next line for the activity
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim();
            if (nextLine && !nextLine.includes('android.intent.action.MAIN') && !nextLine.includes('--')) {
              const match = nextLine.match(/([a-zA-Z0-9\.]+\/[a-zA-Z0-9\.]+)/);
              if (match && match[1]) {
                activity = match[1].trim();
                break;
              }
            }
          }
        }
      }
    } else {
      // Linux/Mac: Use grep command
      const activityCmd = `-s ${deviceId} shell dumpsys package ${packageName} | grep -A 1 "android.intent.action.MAIN" | grep -v "android.intent.action.MAIN" | grep -v "^--$" | head -1`;
      const activityOutput = await execAdbCommand(activityCmd);
      
      // Extract activity from grep output
      const match = activityOutput.match(/([a-zA-Z0-9\.]+\/[a-zA-Z0-9\.]+)/);
      if (match && match[1]) {
        activity = match[1].trim();
      }
    }
    
    let launchCommand;
    if (activity) {
      launchCommand = `-s ${deviceId} shell am start -n ${activity}`;
    } else {
      // Fallback to monkey command if we can't find the activity
      launchCommand = `-s ${deviceId} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`;
    }
    
    // Launch the app
    const output = await execAdbCommand(launchCommand);
    console.log('Launch app output:', output);
    
    return { success: true, message: `App ${packageName} launched successfully` };
  } catch (error) {
    console.error(`Error launching app ${packageName}:`, error);
    return { success: false, message: error.message };
  }
}

// Execute an arbitrary ADB command for a specific device
async function executeCommand(deviceId, command) {
  try {
    // Make sure ADB server is running
    await execAdbCommand('start-server');
    
    // If command doesn't include a specific device, add the device ID
    let fullCommand = command;
    if (deviceId && !command.includes('-s') && command.startsWith('shell')) {
      fullCommand = `-s ${deviceId} ${command}`;
    }
    
    console.log(`Executing custom ADB command: ${fullCommand}`);
    const output = await execAdbCommand(fullCommand);
    
    return {
      success: true,
      output: output
    };
  } catch (error) {
    console.error('Error executing ADB command:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Get devices
async function getDevices() {
  try {
    console.log('Getting devices...');
    // Make sure ADB server is started
    await execAdbCommand('start-server');
    const output = await execAdbCommand('devices');
    const devices = parseDevicesOutput(output);
    
    // Get additional details for devices
    const detailedDevices = await getDeviceDetails(devices);
    console.log('Devices:', detailedDevices);
    
    return detailedDevices;
  } catch (error) {
    console.error('Error getting devices:', error);
    throw new Error('Failed to connect to ADB. Make sure your Android device is connected and USB debugging is enabled.');
  }
}

// Start capturing logcat output and network traffic
function startLogcatCapture(deviceId, filter = 'FA FA-SVC') {
  if (logcatProcess) {
    console.log('Logcat capture already running, stopping previous capture');
    stopLogcatCapture();
  }

  console.log(`Starting logcat capture for device ${deviceId} with filter "${filter}"`);
  
  try {
    // Clear the logcat buffer first
    execAdbCommand(`-s ${deviceId} logcat -c`);
    
    // Start logcat with specified filter
    // Using the raw format as specified by the user
    const logcatCmd = process.platform === 'win32' ? 
      `"${fullAdbPath}"` : fullAdbPath;
    
    const args = [
      '-s', deviceId,
      'logcat',
      '-v', 'raw',
      '-s', filter
    ];
    
    console.log(`Executing: ${logcatCmd} ${args.join(' ')}`);
    
    logcatProcess = spawn(logcatCmd, args);
    
    // Clear analytics logs array
    analyticsLogs = [];
    
    // Process the output
    logcatProcess.stdout.on('data', (data) => {
      const output = data.toString();
      parseLogcatForAnalytics(output);
    });
    
    logcatProcess.stderr.on('data', (data) => {
      console.error(`Logcat error: ${data}`);
    });
    
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

// Parse logcat output for Google Analytics events
function parseLogcatForAnalytics(output) {
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
    
    // Look for "event {" which starts a detailed event definition
    if(line.includes("Setting user proeprty:")) {
      const userProperty = line.split("Setting user proeprty:")[1].split(" ")[0];
      const userPropertyValue = line.split("Setting user proeprty:")[1].split(" ")[1];
      console.log("Recieved update to user property: " + userProperty + " with value: " + userPropertyValue);
      currentBatchData.sharedPayload[userProperty] = userPropertyValue;
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

// Parse a Firebase event from a complete event string
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

// Get captured analytics logs
function getAnalyticsLogs() {
  return analyticsLogs;
}

// Clear captured analytics logs
function clearAnalyticsLogs() {
  analyticsLogs = [];
  return { success: true, message: 'Analytics logs cleared' };
}

// Check if logcat capture is running
function isLogcatRunning() {
  return !!logcatProcess;
}

// Start capturing network traffic for analytics requests
function startNetworkCapture(deviceId) {
  if (networkCaptureProcess) {
    console.log('Network capture already running, stopping previous capture');
    stopNetworkCapture();
  }

  console.log(`Starting network capture for device ${deviceId}`);
  
  try {
    // Use tcpdump to capture HTTP/HTTPS traffic
    // Filter for Google Analytics and Adobe Analytics requests
    const tcpdumpCmd = process.platform === 'win32' ? 
      `"${fullAdbPath}"` : fullAdbPath;
    
    const args = [
      '-s', deviceId,
      'shell',
      'tcpdump',
      '-i', 'any',
      '-A',  // ASCII output
      '-s', '0',  // Capture full packets
      'port 80 or port 443'  // HTTP/HTTPS traffic
    ];
    
    console.log(`Executing network capture: ${tcpdumpCmd} ${args.join(' ')}`);
    
    networkCaptureProcess = spawn(tcpdumpCmd, args);
    
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

// Stop capturing network traffic
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

// Parse network traffic for analytics events
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

// Process an analytics request
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

// Check if a request is a Google Analytics request
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

// Check if a request is an Adobe Analytics request
function isAdobeAnalyticsRequest(request) {
  // Adobe Analytics requests contain b/ss
  return /b\/ss/i.test(request);
}

// Parse a Google Analytics request
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

// Parse an Adobe Analytics request
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

// Stop capturing logcat output
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
  ensureAdbExists,
  fullAdbPath,
  getDevices,
  generateQRCode,
  generateAdbWifiQRCode,
  pairWithDevice,
  connectDevice,
  disconnectDevice,
  startPairing,
  getInstalledApps,
  launchApp,
  executeCommand,
  execAdbCommand,
  // Logcat functionality
  startLogcatCapture,
  stopLogcatCapture,
  getAnalyticsLogs,
  clearAnalyticsLogs,
  isLogcatRunning,
  // Network capture functionality
  startNetworkCapture,
  stopNetworkCapture
}; 