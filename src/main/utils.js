/**
 * Common utilities for Electron main process
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const https = require('https');
const os = require('os');

// Path to the app's user data directory
const userDataPath = app.getPath('userData');

/**
 * Ensure a temporary directory exists
 * @param {string} subdir Optional subdirectory in the temp folder
 * @returns {string} Path to the temp directory
 */
function ensureTmpDir(subdir = '') {
  const tmpDirPath = subdir ? path.join(os.tmpdir(), 'echo-desktop', subdir) : path.join(os.tmpdir(), 'echo-desktop');
  
  if (!fs.existsSync(tmpDirPath)) {
    fs.mkdirSync(tmpDirPath, { recursive: true });
  }
  
  return tmpDirPath;
}

/**
 * Download a file from a URL to a local path
 * @param {string} url The URL to download from
 * @param {string} destination The local file path to save to
 * @returns {Promise<void>}
 */
function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(destination, () => {
        reject(err);
      });
    });
  });
}

/**
 * Get local IP address
 * @returns {string} The local IP address
 */
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1'; // Fallback to localhost
}

/**
 * Generate a random ID for tracking and identification
 * @param {number} length The length of the ID to generate
 * @returns {string} A random ID string
 */
function generateRandomId(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Format a timestamp nicely
 * @param {Date|string|number} timestamp The timestamp to format
 * @returns {string} A formatted date string
 */
function formatTimestamp(timestamp) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleString();
}

module.exports = {
  userDataPath,
  ensureTmpDir,
  downloadFile,
  getLocalIpAddress,
  generateRandomId,
  formatTimestamp
}; 