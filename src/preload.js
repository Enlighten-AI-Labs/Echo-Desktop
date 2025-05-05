const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // General IPC methods
    send: (channel, data) => {
      // Whitelist channels
      const validChannels = ['toMain'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    receive: (channel, func) => {
      const validChannels = ['fromMain', 'adb:devicePaired', 'analytics-event-updated', 'analytics-event-interactions'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender` 
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    
    removeListener: (channel) => {
      const validChannels = ['fromMain', 'adb:devicePaired', 'analytics-event-updated', 'analytics-event-interactions'];
      if (validChannels.includes(channel)) {
        ipcRenderer.removeAllListeners(channel);
      }
    },
    
    // ADB specific methods
    adb: {
      getDevices: () => ipcRenderer.invoke('adb:getDevices'),
      pairDevice: (ipAddress, port) => ipcRenderer.invoke('adb:pairDevice', ipAddress, port),
      connectDevice: (ipAddress, port, pairingCode) => ipcRenderer.invoke('adb:connectDevice', ipAddress, port, pairingCode),
      disconnectDevice: (deviceId) => ipcRenderer.invoke('adb:disconnectDevice', deviceId),
      generateQRCode: () => ipcRenderer.invoke('adb:generateQRCode'),
      generateAdbWifiQRCode: () => ipcRenderer.invoke('adb:generateAdbWifiQRCode'),
      startPairing: () => ipcRenderer.invoke('adb:startPairing'),
      getLocalIp: () => ipcRenderer.invoke('adb:getLocalIp'),
      stopDeviceDiscovery: () => ipcRenderer.invoke('adb:stopDeviceDiscovery'),
      getInstalledApps: (deviceId) => ipcRenderer.invoke('adb:getInstalledApps', deviceId),
      launchApp: (deviceId, packageName) => ipcRenderer.invoke('adb:launchApp', deviceId, packageName),
      executeCommand: (deviceId, command) => ipcRenderer.invoke('adb:executeCommand', deviceId, command),
      // New logcat methods
      startLogcatCapture: (deviceId, filter) => ipcRenderer.invoke('adb:startLogcatCapture', deviceId, filter),
      stopLogcatCapture: () => ipcRenderer.invoke('adb:stopLogcatCapture'),
      getAnalyticsLogs: () => ipcRenderer.invoke('adb:getAnalyticsLogs'),
      clearAnalyticsLogs: () => ipcRenderer.invoke('adb:clearAnalyticsLogs'),
      isLogcatRunning: () => ipcRenderer.invoke('adb:isLogcatRunning'),
      // Batch data method
      getBatchData: () => ipcRenderer.invoke('adb:getBatchData'),
      // Touch event capture methods
      startTouchEventCapture: (deviceId) => ipcRenderer.invoke('adb:startTouchEventCapture', deviceId),
      stopTouchEventCapture: () => ipcRenderer.invoke('adb:stopTouchEventCapture'),
      // Analytics events listeners
      onAnalyticsEventUpdated: (callback) => {
        ipcRenderer.on('analytics-event-updated', (event, data) => callback(data));
      },
      onAnalyticsEventInteractions: (callback) => {
        ipcRenderer.on('analytics-event-interactions', (event, data) => callback(data));
      },
      removeAnalyticsEventListeners: () => {
        ipcRenderer.removeAllListeners('analytics-event-updated');
        ipcRenderer.removeAllListeners('analytics-event-interactions');
      }
    },
    
    // MitmProxy specific methods
    mitmproxy: {
      status: () => ipcRenderer.invoke('mitmproxy:status'),
      startCapturing: () => ipcRenderer.invoke('mitmproxy:startCapturing'),
      stopCapturing: () => ipcRenderer.invoke('mitmproxy:stopCapturing'),
      getProxyIp: () => ipcRenderer.invoke('mitmproxy:getProxyIp'),
      getTraffic: () => ipcRenderer.invoke('mitmproxy:getTraffic'),
      clearTraffic: () => ipcRenderer.invoke('mitmproxy:clearTraffic'),
    },
    
    // RTMP server specific methods
    rtmp: {
      status: () => ipcRenderer.invoke('rtmp:status'),
      start: (config) => ipcRenderer.invoke('rtmp:start', config),
      stop: () => ipcRenderer.invoke('rtmp:stop'),
      getConfig: () => ipcRenderer.invoke('rtmp:getConfig'),
      captureScreenshot: (beaconId) => ipcRenderer.invoke('rtmp:captureScreenshot', beaconId),
      getScreenshotDataUrl: (fileName) => ipcRenderer.invoke('rtmp:getScreenshotDataUrl', fileName),
    },
    
    // Crawler specific methods
    crawler: {
      startCrawling: (deviceId, packageName, settings) => 
        ipcRenderer.invoke('crawler:start', deviceId, packageName, settings),
      stopCrawling: () => ipcRenderer.invoke('crawler:stop'),
      getStatus: () => ipcRenderer.invoke('crawler:status'),
      getLogs: () => ipcRenderer.invoke('crawler:getLogs'),
      getFlowchartData: () => ipcRenderer.invoke('crawler:getFlowchartData'),
      getAIAnalysis: () => ipcRenderer.invoke('crawler:getAIAnalysis'),
      
      // Event listeners
      onProgress: (callback) => {
        ipcRenderer.on('crawler:progress', (event, data) => callback(data));
      },
      onNewScreen: (callback) => {
        ipcRenderer.on('crawler:newScreen', (event, data) => callback(data));
      },
      onComplete: (callback) => {
        ipcRenderer.on('crawler:complete', () => callback());
      },
      onError: (callback) => {
        ipcRenderer.on('crawler:error', (event, data) => callback(data));
      },
      onLog: (callback) => {
        ipcRenderer.on('crawler:log', (event, data) => callback(data));
      },
      onAIAnalysis: (callback) => {
        ipcRenderer.on('crawler:aiAnalysis', (event, data) => callback(data));
      },
      removeAllListeners: () => {
        ipcRenderer.removeAllListeners('crawler:progress');
        ipcRenderer.removeAllListeners('crawler:newScreen');
        ipcRenderer.removeAllListeners('crawler:complete');
        ipcRenderer.removeAllListeners('crawler:error');
        ipcRenderer.removeAllListeners('crawler:log');
        ipcRenderer.removeAllListeners('crawler:aiAnalysis');
      }
    }
  }
); 