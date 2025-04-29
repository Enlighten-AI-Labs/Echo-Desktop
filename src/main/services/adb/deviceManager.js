/**
 * Device Manager module - handles listing and querying connected devices
 */
const { exec } = require('child_process');
const { PATHS } = require('./installer');

/**
 * Execute an ADB command and return a promise
 * @param {string} command ADB command to execute
 * @returns {Promise<string>} Command output
 */
function execAdbCommand(command) {
  return new Promise((resolve, reject) => {
    const cmd = `"${PATHS.fullAdbPath}" ${command}`;
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

/**
 * Parse ADB devices output into a structured format
 * @param {string} output Raw output from 'adb devices'
 * @returns {Array} Structured device information
 */
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

/**
 * Get additional device info for the connected devices
 * @param {Array} devices List of devices from parseDevicesOutput
 * @returns {Promise<Array>} Devices with additional details
 */
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

/**
 * Get all connected ADB devices with details
 * @returns {Promise<Array>} List of connected devices with details
 */
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

module.exports = {
  getDevices,
  getDeviceDetails,
  execAdbCommand,
  parseDevicesOutput
}; 