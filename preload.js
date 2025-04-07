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
      const validChannels = ['fromMain', 'logcat-data'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender` 
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    
    // ADB specific methods
    adb: {
      getDevices: () => ipcRenderer.invoke('adb:getDevices'),
      pairDevice: (ipAddress, port) => ipcRenderer.invoke('adb:pairDevice', ipAddress, port),
      connectDevice: (ipAddress, port, pairingCode) => ipcRenderer.invoke('adb:connectDevice', ipAddress, port, pairingCode),
      disconnectDevice: (deviceId) => ipcRenderer.invoke('adb:disconnectDevice', deviceId),
      generateQRCode: () => ipcRenderer.invoke('adb:generateQRCode'),
      startPairing: () => ipcRenderer.invoke('adb:startPairing'),
      getLocalIp: () => ipcRenderer.invoke('adb:getLocalIp'),
      getInstalledApps: (deviceId) => ipcRenderer.invoke('adb:getInstalledApps', deviceId),
      launchApp: (deviceId, packageName) => ipcRenderer.invoke('adb:launchApp', deviceId, packageName),
      enableAnalyticsDebugging: (deviceId, packageName) => ipcRenderer.invoke('adb:enableAnalyticsDebugging', deviceId, packageName),
      startLogcatStream: (deviceId, analyticsType) => ipcRenderer.invoke('adb:startLogcatStream', deviceId, analyticsType),
      stopLogcatStream: (analyticsType) => ipcRenderer.invoke('adb:stopLogcatStream', analyticsType),
      stopAllLogcatStreams: () => ipcRenderer.invoke('adb:stopLogcatStreams'),
      // Keep these for backward compatibility, they now use the streaming implementation
      startLogcat: (deviceId, analyticsType) => ipcRenderer.invoke('adb:startLogcat', deviceId, analyticsType),
      stopLogcat: () => ipcRenderer.invoke('adb:stopLogcat'),
      getLogcatData: (deviceId, analyticsType) => ipcRenderer.invoke('adb:getLogcatData', deviceId, analyticsType),
    }
  }
); 