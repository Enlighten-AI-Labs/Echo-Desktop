const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const url = require('url');
const { ensureTmpDir } = require('./modules/utils');
const adb = require('./modules/adb');
const mitmproxy = require('./modules/mitmproxy');
const rtmp = require('./modules/rtmp');
const crawler = require('./modules/crawler');

const isDev = process.env.NODE_ENV === 'development';
let mainWindow;
let loadAttempts = 0;
const MAX_LOAD_ATTEMPTS = 10;

// Ensure temp directory exists
ensureTmpDir();

// Register custom protocol for fonts
function registerFontProtocol() {
  protocol.registerFileProtocol('font', (request, callback) => {
    const filePath = request.url.replace('font://', '');
    callback({
      path: path.join(app.getAppPath(), 'public/fonts', filePath)
    });
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
    // Ensure ADB is installed before creating the window
    await adb.ensureAdbExists();
    
    // Ensure mitmproxy is installed
    const mitmproxyInstalled = await mitmproxy.ensureMitmproxyExists();
    if (mitmproxyInstalled) {
      // Start mitmproxy automatically
      mitmproxy.startMitmproxy();
    } else {
      console.warn('Failed to install mitmproxy. Some features will not work.');
    }

    // Auto-start RTMP server
    rtmp.startRtmpServer();
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

// Make sure to clean up mitmproxy and RTMP server on app quit
app.on('will-quit', () => {
  mitmproxy.stopMitmproxy();
  rtmp.stopRtmpServer();
});

// Register IPC handlers
// ADB handlers
ipcMain.handle('adb:getDevices', async () => {
  return await adb.getDevices();
});

ipcMain.handle('adb:generateQRCode', async () => {
  return await adb.generateQRCode();
});

ipcMain.handle('adb:generateAdbWifiQRCode', async () => {
  return await adb.generateAdbWifiQRCode();
});

ipcMain.handle('adb:connectDevice', async (event, ipAddress, port, pairingCode) => {
  return await adb.connectDevice(ipAddress, port, pairingCode);
});

ipcMain.handle('adb:disconnectDevice', async (event, deviceId) => {
  return await adb.disconnectDevice(deviceId);
});

ipcMain.handle('adb:startPairing', async () => {
  return await adb.startPairing();
});

ipcMain.handle('adb:getLocalIp', async () => {
  const { getLocalIpAddress } = require('./modules/utils');
  return getLocalIpAddress();
});

ipcMain.handle('adb:getInstalledApps', async (event, deviceId) => {
  return await adb.getInstalledApps(deviceId);
});

ipcMain.handle('adb:launchApp', async (event, deviceId, packageName) => {
  return await adb.launchApp(deviceId, packageName);
});

ipcMain.handle('adb:executeCommand', async (event, deviceId, command) => {
  return await adb.executeCommand(deviceId, command);
});

// New logcat handlers
ipcMain.handle('adb:startLogcatCapture', async (event, deviceId, filter) => {
  return adb.startLogcatCapture(deviceId, filter);
});

ipcMain.handle('adb:stopLogcatCapture', async () => {
  return adb.stopLogcatCapture();
});

ipcMain.handle('adb:getAnalyticsLogs', async () => {
  return adb.getAnalyticsLogs();
});

ipcMain.handle('adb:clearAnalyticsLogs', async () => {
  return adb.clearAnalyticsLogs();
});

ipcMain.handle('adb:isLogcatRunning', async () => {
  return adb.isLogcatRunning();
});

// MitmProxy handlers
ipcMain.handle('mitmproxy:status', () => {
  return mitmproxy.getStatus();
});

ipcMain.handle('mitmproxy:startCapturing', async () => {
  return mitmproxy.startMitmproxy();
});

ipcMain.handle('mitmproxy:stopCapturing', () => {
  return mitmproxy.stopMitmproxy();
});

ipcMain.handle('mitmproxy:getProxyIp', () => {
  return mitmproxy.getProxyIp();
});

ipcMain.handle('mitmproxy:getTraffic', () => {
  return mitmproxy.getTraffic();
});

ipcMain.handle('mitmproxy:clearTraffic', () => {
  return mitmproxy.clearTraffic();
});

// RTMP server handlers
ipcMain.handle('rtmp:status', () => {
  return rtmp.getRtmpServerStatus();
});

ipcMain.handle('rtmp:start', (event, customConfig) => {
  return rtmp.startRtmpServer(customConfig);
});

ipcMain.handle('rtmp:stop', () => {
  return rtmp.stopRtmpServer();
});

ipcMain.handle('rtmp:getConfig', () => {
  return rtmp.getConfig();
});

ipcMain.handle('rtmp:captureScreenshot', async (event, beaconId) => {
  return await rtmp.captureScreenshot(beaconId);
});

ipcMain.handle('rtmp:getScreenshotDataUrl', async (event, fileName) => {
  return await rtmp.getScreenshotDataUrl(fileName);
});

// Crawler handlers
ipcMain.handle('crawler:start', async (event, deviceId, packageName, settings) => {
  return await crawler.startAppCrawling(deviceId, packageName, settings, mainWindow);
});

ipcMain.handle('crawler:stop', async () => {
  return crawler.stopAppCrawling(mainWindow);
});

ipcMain.handle('crawler:status', async () => {
  return crawler.getStatus();
});

ipcMain.handle('crawler:getLogs', async () => {
  return crawler.getLogs();
});

ipcMain.handle('crawler:getFlowchartData', async () => {
  return crawler.getFlowchartData();
}); 