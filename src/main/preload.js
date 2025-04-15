contextBridge.exposeInMainWorld('api', {
  // ... existing API methods ...
  
  adb: {
    getDevices: () => ipcRenderer.invoke('adb:getDevices'),
    executeCommand: (deviceId, command) => ipcRenderer.invoke('adb:executeCommand', deviceId, command),
    // Add new logcat methods
    startLogcatCapture: (deviceId, filter) => ipcRenderer.invoke('adb:startLogcatCapture', deviceId, filter),
    stopLogcatCapture: () => ipcRenderer.invoke('adb:stopLogcatCapture'),
    getAnalyticsLogs: () => ipcRenderer.invoke('adb:getAnalyticsLogs'),
    clearAnalyticsLogs: () => ipcRenderer.invoke('adb:clearAnalyticsLogs'),
    isLogcatRunning: () => ipcRenderer.invoke('adb:isLogcatRunning')
  },
  
  // ... existing API objects ...
}) 