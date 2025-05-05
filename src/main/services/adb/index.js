/**
 * ADB Service module - provides Android Debug Bridge functionality
 */

const deviceManager = require('./deviceManager');
const installer = require('./installer');
const debugTools = require('./debugTools');
const commands = require('./commands');
const network = require('./network');

// Initialize the ADB service
async function initialize() {
  await installer.ensureAdbExists();
  return { initialized: true };
}

module.exports = {
  // Core initialization
  initialize,
  
  // Device management
  getDevices: deviceManager.getDevices,
  getDeviceDetails: deviceManager.getDeviceDetails,
  
  // ADB commands
  execAdbCommand: commands.execAdbCommand,
  executeCommand: commands.executeCommand,
  launchApp: commands.launchApp,
  getInstalledApps: commands.getInstalledApps,
  
  // Network/Wireless functionality
  generateQRCode: network.generateQRCode,
  generateAdbWifiQRCode: network.generateAdbWifiQRCode,
  connectDevice: network.connectDevice,
  disconnectDevice: network.disconnectDevice,
  startPairing: network.startPairing,
  startDeviceDiscovery: network.startDeviceDiscovery,
  stopDeviceDiscovery: network.stopDeviceDiscovery,
  
  // Debugging utilities
  startLogcatCapture: debugTools.startLogcatCapture,
  stopLogcatCapture: debugTools.stopLogcatCapture,
  getAnalyticsLogs: debugTools.getAnalyticsLogs,
  clearAnalyticsLogs: debugTools.clearAnalyticsLogs,
  isLogcatRunning: debugTools.isLogcatRunning,
  startNetworkCapture: debugTools.startNetworkCapture,
  stopNetworkCapture: debugTools.stopNetworkCapture,
  getCurrentBatchData: debugTools.getCurrentBatchData,
  
  // Consts exports for other modules
  PATHS: installer.PATHS,
  
  // Direct module access for setMainWindow
  debugTools
}; 