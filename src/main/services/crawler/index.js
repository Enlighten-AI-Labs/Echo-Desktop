/**
 * App Crawler Service module - provides automated app exploration functionality
 */

const appCrawler = require('./appCrawler');
const visualState = require('../mitmproxy/visualState');
const elementSelector = require('./elementSelector');

module.exports = {
  // Core crawling functionality
  startAppCrawling: appCrawler.startAppCrawling,
  stopAppCrawling: appCrawler.stopAppCrawling,
  getStatus: appCrawler.getStatus,
  getLogs: appCrawler.getLogs,
  
  // Visual state management
  getFlowchartData: visualState.getFlowchartData,
  getScreens: visualState.getScreens,
  
  // Event handlers
  onProgress: appCrawler.onProgress,
  onNewScreen: appCrawler.onNewScreen,
  onComplete: appCrawler.onComplete,
  onError: appCrawler.onError,
  onLog: appCrawler.onLog,
  
  // Element analysis
  prioritizeElementsByAiPrompt: elementSelector.prioritizeElementsByAiPrompt
}; 