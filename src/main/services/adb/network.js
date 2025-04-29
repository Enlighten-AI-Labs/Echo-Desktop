/**
 * ADB Network module - handles wireless connections and debugging
 */
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const mDnsSd = require('node-dns-sd');
const { nanoid } = require('nanoid');
const { execAdbCommand } = require('./deviceManager');
const { userDataPath } = require('../../utils');

// Variables for device discovery
let discoveryInProgress = false;
let deviceDiscoveryTimeout = null;

/**
 * Ensure temporary directory exists
 * @returns {string} Path to the temp directory
 */
function ensureTmpDir() {
  const tmpDir = path.join(userDataPath, 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  return tmpDir;
}

/**
 * Get local IP address
 * @returns {string} The local IP address
 */
function getLocalIpAddress() {
  const interfaces = require('os').networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1'; // Fallback to localhost
}

/**
 * Generate QR code for wireless debugging
 * @returns {Promise<Object>} QR code data and connection info
 */
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

/**
 * Generate ADB WiFi QR code with device discovery
 * @returns {Promise<Object>} QR code data and connection info
 */
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

/**
 * Starts ADB pairing with a specific port
 * @returns {Promise<Object>} Pairing info
 */
async function startPairing() {
  try {
    // Start ADB server if not already running
    await execAdbCommand('start-server');
    
    // Get local IP address
    const hostIp = getLocalIpAddress();
    
    // Generate random port between 30000-40000
    const pairingPort = Math.floor(Math.random() * 10000) + 30000;
    
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

/**
 * Function to stop device discovery
 */
function stopDeviceDiscovery() {
  if (deviceDiscoveryTimeout) {
    clearTimeout(deviceDiscoveryTimeout);
    deviceDiscoveryTimeout = null;
  }
  
  discoveryInProgress = false;
  console.log('Device discovery stopped');
}

/**
 * Function to start discovering ADB devices over the network
 * @param {string} pairingCode The pairing code to use
 */
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

/**
 * Function to discover and connect to a device
 * @param {string} pairingCode The pairing code to use
 * @returns {Promise<Object>} Connection result
 */
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

/**
 * Function to pair with a discovered device
 * @param {string} address Device IP address
 * @param {number} port Device port
 * @param {string} pairingCode Pairing code to use
 * @returns {Promise<boolean>} Success status
 */
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

/**
 * Connect to a device at the given IP and port
 * @param {string} ipAddress Device IP address
 * @param {number} port Device port
 * @param {string} pairingCode Optional pairing code
 * @returns {Promise<Object>} Connection result
 */
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

/**
 * Disconnect a device
 * @param {string} deviceId The device identifier
 * @returns {Promise<Object>} Operation result
 */
async function disconnectDevice(deviceId) {
  try {
    const output = await execAdbCommand(`disconnect ${deviceId}`);
    return { success: true, message: output };
  } catch (error) {
    console.error('Error disconnecting device:', error);
    throw error;
  }
}

module.exports = {
  generateQRCode,
  generateAdbWifiQRCode,
  startPairing,
  connectDevice,
  disconnectDevice,
  startDeviceDiscovery,
  stopDeviceDiscovery,
  getLocalIpAddress,
  ensureTmpDir
}; 