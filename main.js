const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = require('url');
const { exec, spawn } = require('child_process');
const qrcode = require('qrcode');
const os = require('os');
const fs = require('fs');
const https = require('https');
const extract = require('extract-zip');
const isDev = process.env.NODE_ENV === 'development';
const mDnsSd = require('node-dns-sd');
const { nanoid } = require('nanoid');
const NodeMediaServer = require('node-media-server');

let mainWindow;
let loadAttempts = 0;
const MAX_LOAD_ATTEMPTS = 10;
let mitmProxyProcess = null;
let mitmProxyTraffic = [];
const MAX_TRAFFIC_ENTRIES = 1000; // Limit to prevent memory issues
let rtmpServer = null;

// Path to the app's user data directory
const userDataPath = app.getPath('userData');
const adbPath = path.join(userDataPath, 'platform-tools');
const adbExecutable = process.platform === 'win32' ? 'adb.exe' : 'adb';
const fullAdbPath = path.join(adbPath, adbExecutable);

// MitmProxy paths
const mitmproxyPath = process.platform === 'win32' ? 'mitmproxy.exe' : 'mitmproxy';
const mitmwebPath = process.platform === 'win32' ? 'mitmweb.exe' : 'mitmweb';
const mitmdumpPath = process.platform === 'win32' ? 'mitmdump.exe' : 'mitmdump';

// Path for mitmproxy installation
const mitmproxyBinPath = path.join(userDataPath, 'mitmproxy', 'bin');

// Create temporary directory for QR codes if it doesn't exist
const tmpDir = path.join(os.tmpdir(), 'echo-desktop');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

// Create media directory for RTMP server if it doesn't exist
const rtmpMediaPath = path.join(userDataPath, 'media');
if (!fs.existsSync(rtmpMediaPath)) {
  try {
    fs.mkdirSync(rtmpMediaPath, { recursive: true });
    console.log('Created RTMP media directory at:', rtmpMediaPath);
  } catch (error) {
    console.error('Failed to create RTMP media directory:', error);
  }
}

// RTMP server configuration
const rtmpConfig = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: false,  // Disable GOP cache to reduce latency
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    allow_origin: '*',
    mediaroot: rtmpMediaPath // Store media files temporarily
  },
  trans: {
    ffmpeg: process.platform === 'win32' ? 
            path.join(app.getAppPath(), 'bin', 'ffmpeg.exe') : 
            '/opt/homebrew/bin/ffmpeg',  // Path to FFmpeg on macOS
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments+append_list:hls_allow_cache=false]',
        dash: true,
        dashFlags: '[f=dash:window_size=3:extra_window_size=5]'
      }
    ]
  }
};

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
    
    // Show a message to the user about manual installation
    if (mainWindow) {
      let instructions;
      
      if (process.platform === 'darwin') {
        instructions = [
          '1. Install Homebrew from https://brew.sh/',
          '2. Open Terminal',
          '3. Run: brew install mitmproxy',
          '4. Restart this application'
        ];
      } else if (process.platform === 'win32') {
        instructions = [
          '1. Install Python from https://www.python.org/downloads/',
          '2. Open Command Prompt',
          '3. Run: pip install mitmproxy',
          '4. Restart this application'
        ];
      } else {
        instructions = [
          '1. Open Terminal',
          '2. Run: pip3 install --user mitmproxy',
          '3. Restart this application'
        ];
      }
      
      mainWindow.webContents.send('installation-error', {
        title: 'mitmproxy Installation Failed',
        message: 'Please install mitmproxy manually:',
        instructions
      });
    }
    
    return false;
  }
}

// Helper function to find executables recursively
function findExecutablesRecursively(dir) {
  const results = [];
  const list = fs.readdirSync(dir);
  
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat && stat.isDirectory()) {
      results.push(...findExecutablesRecursively(filePath));
    } else {
      if ((file.includes('mitm') && !file.endsWith('.py')) || 
          (process.platform === 'win32' && file.endsWith('.exe'))) {
        results.push(filePath);
      }
    }
  });
  
  return results;
}

// Helper function to download a file
function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(destination, () => {
        reject(err);
      });
    });
  });
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
    backgroundColor: '#262628',
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : url.format({
      pathname: path.join(__dirname, 'out/index.html'),
      protocol: 'file:',
      slashes: true
    });
  
  // Load the URL with retry logic for development mode
  if (isDev) {
    loadWithRetry(startUrl);
  } else {
    mainWindow.loadURL(startUrl);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools if in dev mode
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

function loadWithRetry(url) {
  mainWindow.loadURL(url).catch(err => {
    loadAttempts++;
    console.log(`Attempt ${loadAttempts} failed. Retrying in 1 second...`);
    
    if (loadAttempts < MAX_LOAD_ATTEMPTS) {
      setTimeout(() => {
        loadWithRetry(url);
      }, 1000);
    } else {
      console.error('Failed to load after maximum attempts. Please ensure Next.js is running.');
      if (mainWindow) {
        mainWindow.webContents.loadURL(`data:text/html;charset=utf-8,
          <html>
            <head>
              <title>Error</title>
              <style>
                body {
                  font-family: system-ui, -apple-system, sans-serif;
                  background: #262628;
                  color: white;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  height: 100vh;
                  margin: 0;
                  text-align: center;
                }
                .container {
                  max-width: 500px;
                  padding: 2rem;
                }
                h1 {
                  font-weight: bold;
                  margin-bottom: 1rem;
                }
                p {
                  line-height: 1.5;
                  margin-bottom: 1.5rem;
                }
                button {
                  background: #3C76A9;
                  color: white;
                  border: none;
                  padding: 0.75rem 1.5rem;
                  border-radius: 4px;
                  font-weight: bold;
                  cursor: pointer;
                }
                button:hover {
                  opacity: 0.9;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Connection Error</h1>
                <p>Unable to connect to the Next.js development server at http://localhost:3000.</p>
                <p>Please ensure the Next.js server is running by executing <code>npm run dev:next</code> in a terminal window.</p>
                <button onclick="window.location.reload()">Retry Connection</button>
              </div>
            </body>
          </html>
        `);
      }
    }
  });
}

app.whenReady().then(async () => {
  try {
    // Ensure ADB is installed before creating the window
    await ensureAdbExists();
    
    // Ensure mitmproxy is installed
    const mitmproxyInstalled = await ensureMitmproxyExists();
    if (mitmproxyInstalled) {
      // Start mitmproxy automatically
      startMitmproxy();
    } else {
      console.warn('Failed to install mitmproxy. Some features will not work.');
    }

    // Auto-start RTMP server
    startRtmpServer();
  } catch (error) {
    console.error('Failed to set up dependencies:', error);
  }
  
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle ADB commands
ipcMain.handle('adb:getDevices', async () => {
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
});

// Add handler for stopping device discovery
ipcMain.handle('adb:stopDeviceDiscovery', async () => {
  try {
    stopDeviceDiscovery();
    return { success: true, message: 'Device discovery stopped' };
  } catch (error) {
    console.error('Error stopping device discovery:', error);
    return { success: false, message: error.message };
  }
});

// Generate QR code for wireless debugging
ipcMain.handle('adb:generateQRCode', async () => {
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
});

// Add a custom implementation for QR codes in the UI with device discovery
ipcMain.handle('adb:generateAdbWifiQRCode', async () => {
  try {
    // Start ADB server if not already running
    await execAdbCommand('start-server');
    
    // Get local IP address
    const hostIp = getLocalIpAddress();
    
    // Use a random name and password for pairing
    const debugName = "echo_debug_" + nanoid(6);
    const pairingCode = nanoid(8); // Random string for pairing code
    
    // Create a pairing port (between 30000-40000, consistent with Android expectations)
    const pairingPort = Math.floor(Math.random() * 10000) + 30000;
    
    // Generate a QR code with the correct Android format
    // Format: WIFI:T:ADB;S:{name};P:{password};;
    const qrCodeContent = `WIFI:T:ADB;S:${debugName};P:${pairingCode};;`;
    
    console.log('Creating QR code with content:', qrCodeContent);
    
    // Create QR code image for UI display
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
});

// Add device discovery functionality
let discoveryInProgress = false;
let deviceDiscoveryTimeout = null;

// Function to start discovering ADB devices over the network
function startDeviceDiscovery(pairingCode) {
  if (discoveryInProgress) {
    console.log('Device discovery already in progress, restarting...');
    stopDeviceDiscovery();
  }
  
  discoveryInProgress = true;
  console.log('Starting device discovery...');
  
  // Start the discovery process
  discoverAndConnectDevice(pairingCode);
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

// Function to discover and connect to a device
async function discoverAndConnectDevice(pairingCode) {
  if (!discoveryInProgress) return;
  
  try {
    console.log('Searching for ADB pairing devices...');
    
    // Use mDnsSd to discover devices
    const deviceList = await mDnsSd.discover({
      name: '_adb-tls-pairing._tcp.local'
    });
    
    console.log('Device discovery result:', deviceList);
    
    if (deviceList.length === 0) {
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
    const address = device.address;
    
    // Make sure we get the port correctly from the discovered service
    const port = device.service.port;
    
    console.log(`Device found! Address: ${address}, Port: ${port}`);
    
    // Try to pair with the device
    const pairingSuccess = await pairWithDevice(address, port, pairingCode);
    
    // Connection attempt completed, stop discovery
    stopDeviceDiscovery();
    
    // Notify the UI that a device has been paired
    if (mainWindow) {
      mainWindow.webContents.send('adb:devicePaired', {
        success: pairingSuccess,
        message: pairingSuccess 
          ? `Successfully paired with device at ${address}:${port}`
          : `Failed to pair with device at ${address}:${port}`
      });
    }
    
  } catch (error) {
    console.error('Error discovering devices:', error);
    
    // Retry after delay if discovery is still active
    setTimeout(() => {
      if (discoveryInProgress) {
        discoverAndConnectDevice(pairingCode);
      }
    }, 3000);
  }
}

// Function to pair with a discovered device
async function pairWithDevice(address, port, pairingCode) {
  try {
    console.log(`Attempting to pair with device at ${address}:${port} using code: ${pairingCode}`);
    
    // Pair with the device using ADB
    const pairOutput = await execAdbCommand(`pair ${address}:${port} ${pairingCode}`);
    console.log('Pairing output:', pairOutput);
    let guid = pairOutput.match(/\[guid=([^\]]+)\]/)?.[1];
    if (pairOutput.includes('Successfully paired')) {
      console.log('Pairing successful, now connecting...');
      
      // The pairing output might include a GUID in the format:
      // Successfully paired to 192.168.0.X:XXXXX [guid=adb-XXXX-XXXX]
      let connectAddress = address;
      let connectPort = port;
      
      // First try connecting to the same port used for pairing
      console.log(`Trying to connect using pairing port: ${address}:${port}`);
      let connectOutput = await execAdbCommand(`connect ${address}:${port}`);
      console.log('Connect output:', connectOutput);
      
      if (connectOutput.includes('connected to') || connectOutput.includes('already connected')) {
        return true;
      }
      let getDevicesOutput = await execAdbCommand(`devices -l`);
      console.log('Devices output:', getDevicesOutput);
      if (getDevicesOutput.includes(guid)) {
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
ipcMain.handle('adb:connectDevice', async (event, ipAddress, port = 5555, pairingCode) => {
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
});

ipcMain.handle('adb:disconnectDevice', async (event, deviceId) => {
  try {
    const output = await execAdbCommand(`disconnect ${deviceId}`);
    return { success: true, message: output };
  } catch (error) {
    console.error('Error disconnecting device:', error);
    throw error;
  }
});

// Start ADB pairing with a specific port
ipcMain.handle('adb:startPairing', async () => {
  try {
    // Start ADB server if not already running
    await execAdbCommand('start-server');
    
    // Get local IP address
    const hostIp = getLocalIpAddress();
    
    // Generate random port between 30000-40000
    const pairingPort = Math.floor(Math.random() * 10000) + 30000;
    
    // Start ADB pairing server
    const pairingProcess = spawn(fullAdbPath, ['pair', `${hostIp}:${pairingPort}`], {
      detached: true
    });
    
    let pairingCode = null;
    
    // Return immediately with connection info
    // The pairing server will run in the background
    return {
      hostIp,
      pairingPort,
      message: 'Pairing server started. Enter the pairing code displayed here on your device.'
    };
  } catch (error) {
    console.error('Error starting pairing server:', error);
    throw error;
  }
});

// Helper function to get local IP address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
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

// Helper function to connect to a device at a specific IP and port
async function connectToDevice(ip, port = 5555) {
  try {
    console.log(`Attempting to connect to device at ${ip}:${port}`);
    
    // First ensure the ADB server is running
    await execAdbCommand('start-server');
    
    // Try the connection
    const result = await execAdbCommand(`connect ${ip}:${port}`);
    
    console.log('Connection result:', result);
    
    // Check if the connection was successful
    if (result.includes('connected to') || result.includes('already connected')) {
      return { success: true, message: result };
    } else {
      return { success: false, message: result };
    }
  } catch (error) {
    console.error('Failed to connect to device:', error);
    return { success: false, message: error.message };
  }
}

// Expose the getLocalIpAddress function to the renderer
ipcMain.handle('adb:getLocalIp', async () => {
  return getLocalIpAddress();
});

// Get installed apps on a specific device
ipcMain.handle('adb:getInstalledApps', async (event, deviceId) => {
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
});

// Launch an app on a specific device
ipcMain.handle('adb:launchApp', async (event, deviceId, packageName) => {
  try {
    console.log(`Launching app ${packageName} on device ${deviceId}`);
    
    // First ensure the ADB server is running
    await execAdbCommand('start-server');
    
    // Get the main activity of the package
    const activityCmd = `-s ${deviceId} shell dumpsys package ${packageName} | grep -A 1 "android.intent.action.MAIN" | grep -v "android.intent.action.MAIN" | grep -v "^--$" | head -1`;
    const activityOutput = await execAdbCommand(activityCmd);
    
    let launchCommand;
    if (activityOutput && activityOutput.includes('/')) {
      // Extract the activity name
      const activityMatch = activityOutput.match(/([a-zA-Z0-9\.]+\/[a-zA-Z0-9\.]+)/);
      if (activityMatch && activityMatch[1]) {
        const activity = activityMatch[1].trim();
        launchCommand = `-s ${deviceId} shell am start -n ${activity}`;
      } else {
        // Fallback to monkey command if we can't extract the activity
        launchCommand = `-s ${deviceId} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`;
      }
    } else {
      // Fallback to monkey command
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
});

// Enable analytics debugging for a specific package
ipcMain.handle('adb:enableAnalyticsDebugging', async (event, deviceId, packageName) => {
  try {
    console.log(`Analytics debugging feature has been removed.`);
    return { 
      success: true, 
      message: `Analytics debugging feature has been removed.` 
    };
  } catch (error) {
    console.error(`Error:`, error);
    return { 
      success: false, 
      message: error.message
    };
  }
});

// Start a logcat stream for the specified analytics type
ipcMain.handle('adb:startLogcatStream', async (event, deviceId, analyticsType, filters) => {
  try {
    console.log('Logcat streaming feature has been removed.');
    return { 
      success: false, 
      message: 'Logcat streaming feature has been removed.'
    };
  } catch (error) {
    console.error('Error:', error);
    return { 
      success: false, 
      message: error.message
    };
  }
});

// Handle stopping a specific logcat stream
ipcMain.handle('adb:stopLogcatStream', async (event, analyticsType) => {
  return { success: true, message: 'Logcat streaming feature has been removed.' };
});

// Handle stopping all logcat streams
ipcMain.handle('adb:stopLogcatStreams', async (event) => {
  return { success: true, message: 'Logcat streaming feature has been removed.' };
});

// Handle the original logcat command (for backward compatibility)
ipcMain.handle('adb:getLogcat', async (event, deviceId, analyticsType, numLines = 200) => {
  return { success: true, logs: [], message: 'Logcat feature has been removed.' };
});

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

// Check the MitmProxy status
ipcMain.handle('mitmproxy:status', () => {
  return { running: !!mitmProxyProcess };
});

// MitmProxy: Start capturing
ipcMain.handle('mitmproxy:startCapturing', async () => {
  return startMitmproxy();
});

// MitmProxy: Stop capturing
ipcMain.handle('mitmproxy:stopCapturing', () => {
  return stopMitmproxy();
});

// Get proxy IP address for configuration
ipcMain.handle('mitmproxy:getProxyIp', () => {
  return getLocalIpAddress();
});

// Get the captured traffic
ipcMain.handle('mitmproxy:getTraffic', () => {
  return mitmProxyTraffic;
});

// Clear the captured traffic
ipcMain.handle('mitmproxy:clearTraffic', () => {
  mitmProxyTraffic = [];
  return { success: true, message: 'Traffic cleared' };
});

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

// Make sure to clean up mitmproxy on app quit
app.on('will-quit', () => {
  stopMitmproxy();
  stopRtmpServer();
});

// Execute an arbitrary ADB command for a specific device
ipcMain.handle('adb:executeCommand', async (event, deviceId, command) => {
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
});

// Function to start RTMP server
function startRtmpServer(customConfig = {}) {
  if (rtmpServer) {
    console.log('RTMP server already running');
    return { success: true, message: 'RTMP server already running' };
  }

  try {
    // Merge default config with any custom config
    const config = { ...rtmpConfig, ...customConfig };
    console.log('Starting RTMP server with config:', config);
    
    rtmpServer = new NodeMediaServer(config);
    rtmpServer.run();
    
    console.log('RTMP server started successfully');
    return { 
      success: true, 
      message: 'RTMP server started successfully',
      rtmpUrl: `rtmp://${getLocalIpAddress()}:${config.rtmp.port}`,
      httpUrl: `http://${getLocalIpAddress()}:${config.http.port}`
    };
  } catch (error) {
    console.error('Failed to start RTMP server:', error);
    return { success: false, message: error.message };
  }
}

// Function to stop RTMP server
function stopRtmpServer() {
  if (!rtmpServer) {
    console.log('RTMP server not running');
    return { success: true, message: 'RTMP server not running' };
  }

  try {
    rtmpServer.stop();
    rtmpServer = null;
    console.log('RTMP server stopped successfully');
    return { success: true, message: 'RTMP server stopped successfully' };
  } catch (error) {
    console.error('Failed to stop RTMP server:', error);
    return { success: false, message: error.message };
  }
}

// Function to get RTMP server status
function getRtmpServerStatus() {
  return { 
    running: !!rtmpServer,
    config: rtmpServer ? rtmpConfig : null,
    rtmpUrl: rtmpServer ? `rtmp://${getLocalIpAddress()}:${rtmpConfig.rtmp.port}` : null,
    httpUrl: rtmpServer ? `http://${getLocalIpAddress()}:${rtmpConfig.http.port}` : null
  };
}

// RTMP server handlers
ipcMain.handle('rtmp:status', () => {
  return getRtmpServerStatus();
});

ipcMain.handle('rtmp:start', (event, customConfig) => {
  return startRtmpServer(customConfig);
});

ipcMain.handle('rtmp:stop', () => {
  return stopRtmpServer();
});

ipcMain.handle('rtmp:getConfig', () => {
  return rtmpConfig;
});

// New function to capture screenshots from RTMP stream
ipcMain.handle('rtmp:captureScreenshot', async (event, beaconId) => {
  if (!rtmpServer) {
    return {
      success: false,
      message: 'RTMP server is not running'
    };
  }

  try {
    console.log(`Capturing screenshot for beacon ${beaconId}`);
    
    // Create screenshots directory if it doesn't exist
    const screenshotsDir = path.join(userDataPath, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    // Generate screenshot filename
    const timestamp = Date.now();
    const screenshotFileName = `${beaconId}_${timestamp}.jpg`;
    const screenshotPath = path.join(screenshotsDir, screenshotFileName);
    
    // Check if we already have a recent screenshot for this beacon (within last 60 seconds)
    // to avoid unnecessary captures during UI refreshes
    const existingFiles = fs.readdirSync(screenshotsDir)
      .filter(file => file.startsWith(`${beaconId}_`))
      .map(file => {
        const filePath = path.join(screenshotsDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          path: filePath,
          timestamp: parseInt(file.split('_')[1].replace('.jpg', '')),
          mtime: stats.mtime
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp); // Most recent first
    
    // If we have a recent screenshot (last 60 seconds), use it instead of capturing a new one
    if (existingFiles.length > 0 && 
        (Date.now() - existingFiles[0].timestamp < 60000) && 
        !screenshotFileName.includes(existingFiles[0].name)) {
      
      console.log(`Using existing screenshot for beacon ${beaconId}: ${existingFiles[0].name}`);
      
      return {
        success: true,
        screenshotPath: existingFiles[0].path,
        fileName: existingFiles[0].name,
        timestamp: existingFiles[0].timestamp,
        url: `file://${existingFiles[0].path}`,
        cached: true
      };
    }
    
    // Use ffmpeg to capture a frame from the RTMP stream with auto-cropping
    const rtmpUrl = `rtmp://${getLocalIpAddress()}:${rtmpConfig.rtmp.port}/live/live`;
    const ffmpegPath = process.platform === 'win32' ? 
            path.join(app.getAppPath(), 'bin', 'ffmpeg.exe') : 
            '/opt/homebrew/bin/ffmpeg';
    
    // Two-pass approach to detect and crop black borders
    // First pass: detect crop dimensions
    const cropDetectPath = path.join(screenshotsDir, `temp_${timestamp}.jpg`);
    await new Promise((resolve, reject) => {
      // First we capture a frame for crop detection
      exec(`"${ffmpegPath}" -y -i "${rtmpUrl}" -vframes 1 "${cropDetectPath}"`, async (error) => {
        if (error) {
          console.error('Error capturing frame for crop detection:', error);
          // If crop detection fails, try a regular capture without cropping
          try {
            await execSimpleCapture(ffmpegPath, rtmpUrl, screenshotPath);
            resolve();
            return;
          } catch (e) {
            reject(error);
            return;
          }
        }
        
        // Now detect crop values using cropdetect filter with very aggressive settings
        // Using threshold=24 (very low = more aggressive cropping), round to 16 (even numbers), and skip 0 pixels from edges
        exec(`"${ffmpegPath}" -i "${cropDetectPath}" -vf "cropdetect=24:16:0" -f null -`, async (err, stdout, stderr) => {
          try {
            // Clean up temp file
            if (fs.existsSync(cropDetectPath)) {
              fs.unlinkSync(cropDetectPath);
            }
            
            if (err) {
              console.error('Error detecting crop:', err);
              // If crop detection fails, try without cropping
              await execSimpleCapture(ffmpegPath, rtmpUrl, screenshotPath);
              resolve();
              return;
            }
            
            // Parse the crop parameters from stderr
            let cropParams = 'crop=in_w:in_h';
            const cropRegex = /crop=([0-9]+):([0-9]+):([0-9]+):([0-9]+)/g;
            const matches = stderr.matchAll(cropRegex);
            let lastMatch = null;
            
            // Get the last (most accurate) crop detection
            for (const match of matches) {
              lastMatch = match;
            }
            
            if (lastMatch) {
              cropParams = lastMatch[0];
              console.log(`Detected crop parameters: ${cropParams}`);
              
              // Extract dimensions from the crop parameters
              const dimensions = cropParams.match(/crop=([0-9]+):([0-9]+):([0-9]+):([0-9]+)/);
              if (dimensions && dimensions.length === 5) {
                const [_, width, height, x, y] = dimensions;
                
                // Apply a very aggressive crop - add additional padding to crop more from each side
                const newWidth = parseInt(width) - 32;
                const newHeight = parseInt(height) - 32;
                const newX = parseInt(x) + 16;
                const newY = parseInt(y) + 16;
                
                // Ensure dimensions are positive
                if (newWidth > 0 && newHeight > 0) {
                  cropParams = `crop=${newWidth}:${newHeight}:${newX}:${newY}`;
                  console.log(`Adjusted crop parameters: ${cropParams}`);
                }
              }
            }
            
            // Second pass: capture with cropping and apply a better scaling filter
            // This ensures we don't have any black borders and fixes aspect ratio
            const filterComplex = `${cropParams},scale=720:-1`;
            exec(`"${ffmpegPath}" -y -i "${rtmpUrl}" -vf "${filterComplex}" -vframes 1 "${screenshotPath}"`, (error) => {
              if (error) {
                console.error('Error capturing cropped screenshot:', error);
                // If cropped capture fails, try without cropping
                execSimpleCapture(ffmpegPath, rtmpUrl, screenshotPath)
                  .then(resolve)
                  .catch(reject);
                return;
              }
              resolve();
            });
          } catch (e) {
            reject(e);
          }
        });
      });
    });
    
    // Double-check that the file was created successfully
    if (!fs.existsSync(screenshotPath) || fs.statSync(screenshotPath).size === 0) {
      throw new Error('Screenshot file was not created properly');
    }
    
    // Return the path and metadata
    return {
      success: true,
      screenshotPath: screenshotPath,
      fileName: screenshotFileName,
      timestamp: timestamp,
      url: `file://${screenshotPath}`,
      cached: false
    };
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    
    // Return failed result
    return {
      success: false,
      message: error.message
    };
  }
});

// Helper function for simple capture without cropping
async function execSimpleCapture(ffmpegPath, rtmpUrl, outputPath) {
  return new Promise((resolve, reject) => {
    exec(`"${ffmpegPath}" -y -i "${rtmpUrl}" -vframes 1 "${outputPath}"`, (error) => {
      if (error) {
        console.error('Error in simple capture:', error);
        reject(error);
        return;
      }
      resolve();
    });
  });
}

// Add a new handler to get screenshot as data URL
ipcMain.handle('rtmp:getScreenshotDataUrl', async (event, fileName) => {
  try {
    const screenshotsDir = path.join(userDataPath, 'screenshots');
    const filePath = path.join(screenshotsDir, fileName);
    
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        message: 'Screenshot file not found'
      };
    }
    
    // Get image dimensions using ffmpeg
    const ffmpegPath = process.platform === 'win32' ? 
            path.join(app.getAppPath(), 'bin', 'ffmpeg.exe') : 
            '/opt/homebrew/bin/ffmpeg';
    
    // Use ffprobe to get image dimensions
    let dimensions = { width: 720, height: 720 }; // Default fallback
    
    try {
      const { stdout, stderr } = await require('util').promisify(exec)(
        `"${ffmpegPath}" -i "${filePath}" -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0`
      );
      
      if (stdout) {
        const parts = stdout.trim().split(',');
        if (parts.length === 2) {
          dimensions = {
            width: parseInt(parts[0]),
            height: parseInt(parts[1])
          };
          console.log(`Image dimensions: ${dimensions.width}x${dimensions.height}`);
        }
      }
    } catch (e) {
      console.error('Error getting image dimensions:', e);
    }
    
    // Read the file and convert to data URL
    const data = fs.readFileSync(filePath);
    const base64Data = data.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64Data}`;
    
    return {
      success: true,
      dataUrl: dataUrl,
      dimensions: dimensions
    };
  } catch (error) {
    console.error('Error getting screenshot data URL:', error);
    return {
      success: false,
      message: error.message
    };
  }
});

// CRAWLER FUNCTIONALITY


// Function to add and send a log message


// Main recursive crawling function


// Button click tracking





// Create a unique hash for a button based on its properties


// Reset tracking when starting a new crawl session


// Function to start app crawling

// Function to stop app crawling


// Helper function to get current activity


// Helper function to get UI hierarchy XML


// Helper function to create a hash of the screen based on XML content


// Helper function to parse UI XML and find clickable elements


// Helper function to click on a specific element by bounds


// Register IPC handlers
