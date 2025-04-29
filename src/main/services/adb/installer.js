/**
 * ADB Installer module - handles downloading and installing ADB
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const extract = require('extract-zip');
const { userDataPath, downloadFile } = require('../../utils');

// ADB paths
const adbPath = path.join(userDataPath, 'platform-tools');
const adbExecutable = process.platform === 'win32' ? 'adb.exe' : 'adb';
const fullAdbPath = path.join(adbPath, adbExecutable);

// Export paths for other modules
const PATHS = {
  adbPath,
  adbExecutable,
  fullAdbPath
};

/**
 * Download and extract Android platform tools if not already installed
 * @returns {Promise<string>} Path to the ADB executable
 */
async function ensureAdbExists() {
  // Check if platform-tools directory already exists
  if (fs.existsSync(fullAdbPath)) {
    console.log('ADB already installed at:', fullAdbPath);
    return fullAdbPath;
  }
  
  console.log('ADB not found, installing...');
  
  // Create directories if they don't exist
  if (!fs.existsSync(adbPath)) {
    fs.mkdirSync(adbPath, { recursive: true });
  }
  
  // Determine platform-specific download URL
  let downloadUrl;
  switch (process.platform) {
    case 'win32':
      downloadUrl = 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip';
      break;
    case 'darwin':
      downloadUrl = 'https://dl.google.com/android/repository/platform-tools-latest-darwin.zip';
      break;
    case 'linux':
      downloadUrl = 'https://dl.google.com/android/repository/platform-tools-latest-linux.zip';
      break;
    default:
      throw new Error('Unsupported platform: ' + process.platform);
  }
  
  // Download and extract platform-tools
  const zipPath = path.join(userDataPath, 'platform-tools.zip');
  await downloadFile(downloadUrl, zipPath);
  await extract(zipPath, { dir: userDataPath });
  
  // Make adb executable on Unix systems
  if (process.platform !== 'win32') {
    fs.chmodSync(fullAdbPath, '755');
  }
  
  // Clean up zip file
  fs.unlinkSync(zipPath);
  
  console.log('ADB installed successfully at:', fullAdbPath);
  return fullAdbPath;
}

module.exports = {
  ensureAdbExists,
  PATHS
}; 