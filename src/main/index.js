/**
 * Main entry point for the Electron main process
 */
const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const url = require('url');
const { ensureTmpDir } = require('./utils');
const fs = require('fs');

// Import services
const adbService = require('./services/adb');
const mitmproxyService = require('./services/mitmproxy');
const crawlerService = require('./services/crawler');
const rtmpService = require('./modules/rtmp'); // We'll keep this as is for now

const isDev = process.env.NODE_ENV === 'development';
let mainWindow;
let loadAttempts = 0;
const MAX_LOAD_ATTEMPTS = 10;

// Ensure temp directory exists
ensureTmpDir();

// Register custom protocol for fonts
function registerFontProtocol() {
  console.log('Registering font protocol handler');
  
  protocol.registerFileProtocol('font', (request, callback) => {
    const filePath = request.url.replace('font://', '');
    const fontPath = path.join(app.getAppPath(), 'public/fonts', filePath);
    
    console.log(`Font requested: ${filePath}`);
    console.log(`Looking for font at: ${fontPath}`);
    
    // Check if the file exists
    if (fs.existsSync(fontPath)) {
      console.log(`Font found at: ${fontPath}`);
      callback({ path: fontPath });
    } else {
      console.warn(`Font not found at: ${fontPath}`);
      callback({ error: -6 }); // FILE_NOT_FOUND
    }
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload.js'),
      webSecurity: !isDev,
    },
    show: false,
    backgroundColor: '#262628',
  });
  
  // Make mainWindow globally accessible
  global.mainWindow = mainWindow;
  
  // Set the main window reference for debugTools
  adbService.debugTools.setMainWindow(mainWindow);

  try {
    if (isDev) {
      // Development mode - load from dev server
      await loadWithRetry('http://localhost:3000');
    } else {
      // Production mode - load static files
      const indexPath = path.join(__dirname, '../../out/index.html');
      console.log('Loading production build from:', indexPath);
      
      // Enable debugging in production temporarily
      mainWindow.webContents.openDevTools();
      
      try {
        await mainWindow.loadFile(indexPath);
        console.log('Successfully loaded index.html');
      } catch (loadError) {
        console.error('Failed to load index.html:', loadError);
        throw loadError;
      }
    }

    mainWindow.once('ready-to-show', () => {
      console.log('Window ready to show');
      mainWindow.show();
    });

    // Add error handling for page loads
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Page failed to load:', errorCode, errorDescription);
    });

  } catch (error) {
    console.error('Error loading window:', error);
    // Show error page
    await mainWindow.loadURL(`data:text/html;charset=utf-8,
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
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Error Loading Application</h1>
            <p>There was an error loading the application: ${error.message}</p>
            <p>Check the console for more details.</p>
          </div>
        </body>
      </html>
    `);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    global.mainWindow = null;
  });

  // Open DevTools if in dev mode
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

function loadWithRetry(url) {
  return new Promise((resolve, reject) => {
    const tryLoad = () => {
      mainWindow.loadURL(url).then(resolve).catch(err => {
        loadAttempts++;
        console.log(`Attempt ${loadAttempts} failed. Retrying in 1 second...`);
        
        if (loadAttempts < MAX_LOAD_ATTEMPTS) {
          setTimeout(tryLoad, 1000);
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
            `).then(resolve).catch(reject);
          } else {
            reject(new Error('Window was closed during load attempts'));
          }
        }
      });
    };
    
    tryLoad();
  });
}

app.whenReady().then(async () => {
  // Register font protocol before creating window
  registerFontProtocol();
  
  try {
    // Initialize the ADB service
    await adbService.initialize();
    console.log('ADB service initialized');
    
    // Initialize the MitmProxy service
    const mitmproxyInitialized = await mitmproxyService.initialize();
    console.log('MitmProxy service initialized:', mitmproxyInitialized);
    
    // Auto-start MitmProxy
    if (mitmproxyInitialized) {
      mitmproxyService.startProxy();
    }

    // Auto-start RTMP server
    rtmpService.startRtmpServer();
  } catch (error) {
    console.error('Failed to initialize services:', error);
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

// Clean up before quitting
app.on('will-quit', () => {
  mitmproxyService.stopProxy();
  rtmpService.stopRtmpServer();
});

// Register IPC handlers
// ADB handlers
ipcMain.handle('adb:getDevices', async () => {
  return await adbService.getDevices();
});

ipcMain.handle('adb:generateQRCode', async () => {
  return await adbService.generateQRCode();
});

ipcMain.handle('adb:generateAdbWifiQRCode', async () => {
  return await adbService.generateAdbWifiQRCode();
});

ipcMain.handle('adb:connectDevice', async (event, ipAddress, port, pairingCode) => {
  return await adbService.connectDevice(ipAddress, port, pairingCode);
});

ipcMain.handle('adb:disconnectDevice', async (event, deviceId) => {
  return await adbService.disconnectDevice(deviceId);
});

ipcMain.handle('adb:startPairing', async () => {
  return await adbService.startPairing();
});

ipcMain.handle('adb:getLocalIp', async () => {
  const { getLocalIpAddress } = require('./utils');
  return getLocalIpAddress();
});

ipcMain.handle('adb:getInstalledApps', async (event, deviceId) => {
  return await adbService.getInstalledApps(deviceId);
});

ipcMain.handle('adb:launchApp', async (event, deviceId, packageName) => {
  return await adbService.launchApp(deviceId, packageName);
});

ipcMain.handle('adb:executeCommand', async (event, deviceId, command) => {
  return await adbService.executeCommand(deviceId, command);
});

// New logcat handlers
ipcMain.handle('adb:startLogcatCapture', async (event, deviceId, filter) => {
  return adbService.startLogcatCapture(deviceId, filter);
});

ipcMain.handle('adb:stopLogcatCapture', async () => {
  return adbService.stopLogcatCapture();
});

ipcMain.handle('adb:getAnalyticsLogs', async () => {
  return adbService.getAnalyticsLogs();
});

ipcMain.handle('adb:clearAnalyticsLogs', async () => {
  return adbService.clearAnalyticsLogs();
});

ipcMain.handle('adb:isLogcatRunning', async () => {
  return adbService.isLogcatRunning();
});

// New touch event capture handlers
ipcMain.handle('adb:startTouchEventCapture', async (event, deviceId) => {
  return adbService.startTouchEventCapture(deviceId);
});

ipcMain.handle('adb:stopTouchEventCapture', async () => {
  return adbService.stopTouchEventCapture();
});

// MitmProxy handlers
ipcMain.handle('mitmproxy:status', () => {
  return mitmproxyService.getProxyStatus();
});

ipcMain.handle('mitmproxy:startCapturing', async () => {
  return mitmproxyService.startProxy();
});

ipcMain.handle('mitmproxy:stopCapturing', () => {
  return mitmproxyService.stopProxy();
});

ipcMain.handle('mitmproxy:getProxyIp', () => {
  return mitmproxyService.getProxyIp();
});

ipcMain.handle('mitmproxy:getTraffic', () => {
  return mitmproxyService.getTraffic();
});

ipcMain.handle('mitmproxy:clearTraffic', () => {
  return mitmproxyService.clearTraffic();
});

// RTMP server handlers
ipcMain.handle('rtmp:status', () => {
  return rtmpService.getRtmpServerStatus();
});

ipcMain.handle('rtmp:start', (event, customConfig) => {
  return rtmpService.startRtmpServer(customConfig);
});

ipcMain.handle('rtmp:stop', () => {
  return rtmpService.stopRtmpServer();
});

ipcMain.handle('rtmp:getConfig', () => {
  return rtmpService.getConfig();
});

ipcMain.handle('rtmp:captureScreenshot', async (event, beaconId) => {
  return await rtmpService.captureScreenshot(beaconId);
});

ipcMain.handle('rtmp:getScreenshotDataUrl', async (event, fileName) => {
  return await rtmpService.getScreenshotDataUrl(fileName);
});

// Crawler handlers
ipcMain.handle('crawler:start', async (event, deviceId, packageName, settings) => {
  return await crawlerService.startAppCrawling(deviceId, packageName, settings, mainWindow);
});

ipcMain.handle('crawler:stop', async () => {
  return crawlerService.stopAppCrawling(mainWindow);
});

ipcMain.handle('crawler:status', async () => {
  return crawlerService.getStatus();
});

ipcMain.handle('crawler:getLogs', async () => {
  return crawlerService.getLogs();
});

ipcMain.handle('crawler:getFlowchartData', async () => {
  return crawlerService.getFlowchartData();
}); 