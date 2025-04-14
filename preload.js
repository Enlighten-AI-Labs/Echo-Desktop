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
      const validChannels = ['fromMain', 'adb:devicePaired'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender` 
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    
    removeListener: (channel) => {
      const validChannels = ['fromMain', 'adb:devicePaired'];
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
      getInstalledApps: (deviceId) => ipcRenderer.invoke('adb:getInstalledApps', deviceId),
      launchApp: (deviceId, packageName) => ipcRenderer.invoke('adb:launchApp', deviceId, packageName),
      executeCommand: (deviceId, command) => ipcRenderer.invoke('adb:executeCommand', deviceId, command),
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
    }
  }
); 