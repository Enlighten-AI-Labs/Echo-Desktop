/**
 * MitmProxy Service module - provides network traffic interception and analysis
 */

const installer = require('./installer');
const proxyServer = require('./proxyServer');
const trafficAnalyzer = require('./trafficAnalyzer');

// Initialize the MitmProxy service
async function initialize() {
  await installer.ensureMitmproxyExists();
  return { initialized: true };
}

module.exports = {
  // Core initialization
  initialize,
  
  // MitmProxy server control
  startProxy: proxyServer.startProxy,
  stopProxy: proxyServer.stopProxy,
  getProxyStatus: proxyServer.getProxyStatus,
  
  // Traffic management
  getTraffic: trafficAnalyzer.getTraffic,
  clearTraffic: trafficAnalyzer.clearTraffic,
  
  // Utility functions
  getProxyIp: proxyServer.getProxyIp,
  
  // Export paths and binaries info
  PATHS: installer.PATHS
}; 