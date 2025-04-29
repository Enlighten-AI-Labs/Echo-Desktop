/**
 * MitmProxy Traffic Analyzer module - handles parsing and storing traffic
 */
const { generateRandomId } = require('../../utils');

// Traffic storage
let mitmProxyTraffic = [];
const MAX_TRAFFIC_ENTRIES = 1000; // Limit to prevent memory issues

/**
 * Parse mitmproxy output and store interesting traffic
 * @param {string} output The output from mitmproxy to parse
 */
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
        id: `req_${timestamp}_${generateRandomId()}`,
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
      id: `res_${timestamp}_${generateRandomId()}`,
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

/**
 * Get the captured traffic
 * @returns {Array} The captured traffic
 */
function getTraffic() {
  return mitmProxyTraffic;
}

/**
 * Clear the captured traffic
 * @returns {Object} Success status
 */
function clearTraffic() {
  mitmProxyTraffic = [];
  return { success: true, message: 'Traffic cleared' };
}

module.exports = {
  parseAndStoreTraffic,
  getTraffic,
  clearTraffic
}; 