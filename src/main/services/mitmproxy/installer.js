/**
 * MitmProxy Installer module - handles installation and verification of MitmProxy
 */
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { userDataPath } = require('../../utils');

// MitmProxy paths
const mitmproxyBinPath = path.join(userDataPath, 'mitmproxy', 'bin');

// Executable names based on platform
const mitmproxyPath = process.platform === 'win32' ? 'mitmproxy.exe' : 'mitmproxy';
const mitmwebPath = process.platform === 'win32' ? 'mitmweb.exe' : 'mitmweb';
const mitmdumpPath = process.platform === 'win32' ? 'mitmdump.exe' : 'mitmdump';

// Export paths for other modules
const PATHS = {
  mitmproxyBinPath,
  mitmproxyPath,
  mitmwebPath,
  mitmdumpPath,
  fullMitmdumpPath: null // Will be set after installation check
};

/**
 * Function to check if mitmproxy is installed
 * @returns {Promise<boolean>} True if installed, false otherwise
 */
async function checkMitmproxyInstalled() {
  // First check if mitmproxy is installed in the system path
  return new Promise((resolve) => {
    const command = process.platform === 'win32' ? 'where mitmdump' : 'which mitmdump';
    exec(command, (error, stdout) => {
      if (error) {
        console.log('mitmdump not found in system path:', error.message);
        
        // Check for local installation
        const localMitmdumpPath = path.join(mitmproxyBinPath, process.platform === 'win32' ? 'mitmdump.exe' : 'mitmdump');
        if (fs.existsSync(localMitmdumpPath)) {
          console.log('Found local mitmdump at:', localMitmdumpPath);
          // Set the global paths
          PATHS.fullMitmdumpPath = localMitmdumpPath;
          PATHS.fullMitmproxyPath = path.join(mitmproxyBinPath, process.platform === 'win32' ? 'mitmproxy.exe' : 'mitmproxy');
          PATHS.fullMitmwebPath = path.join(mitmproxyBinPath, process.platform === 'win32' ? 'mitmweb.exe' : 'mitmweb');
          resolve(true);
        } else {
          console.log('mitmdump not found locally either');
          resolve(false);
        }
      } else {
        console.log('mitmdump found in system path at:', stdout.trim());
        PATHS.fullMitmdumpPath = stdout.trim();
        
        // For system installations, assume the other executables are in the same directory
        const basePath = path.dirname(stdout.trim());
        PATHS.fullMitmproxyPath = path.join(basePath, mitmproxyPath);
        PATHS.fullMitmwebPath = path.join(basePath, mitmwebPath);
        
        resolve(true);
      }
    });
  });
}

/**
 * Download and install mitmproxy if not already installed
 * @returns {Promise<boolean>} True if installation successful, false otherwise
 */
async function ensureMitmproxyExists() {
  // Check if mitmproxy is already installed in the system
  const systemInstalled = await checkMitmproxyInstalled();
  if (systemInstalled) {
    console.log('mitmproxy already installed');
    return true;
  }
  
  console.log('mitmproxy not found, installing...');
  
  try {
    // Use different installation methods based on platform
    if (process.platform === 'darwin') {
      // Check if Homebrew is installed on macOS
      console.log('Checking if Homebrew is installed...');
      try {
        await new Promise((resolve, reject) => {
          exec('which brew', (error) => {
            if (error) {
              console.error('Homebrew is not installed.');
              reject(new Error('Homebrew is not installed. Please install it from https://brew.sh/'));
              return;
            }
            resolve();
          });
        });
        
        // Install mitmproxy using Homebrew
        console.log('Installing mitmproxy using Homebrew...');
        await new Promise((resolve, reject) => {
          exec('brew install mitmproxy', (error, stdout, stderr) => {
            if (error) {
              console.error('Failed to install mitmproxy using Homebrew:', stderr);
              reject(error);
              return;
            }
            console.log('Homebrew install output:', stdout);
            resolve();
          });
        });
        
        // Set paths for macOS Homebrew installation
        PATHS.fullMitmdumpPath = '/usr/local/bin/mitmdump';
        PATHS.fullMitmproxyPath = '/usr/local/bin/mitmproxy';
        PATHS.fullMitmwebPath = '/usr/local/bin/mitmweb';
        
        // Check for Apple Silicon Macs which use a different path
        if (!fs.existsSync(PATHS.fullMitmdumpPath)) {
          PATHS.fullMitmdumpPath = '/opt/homebrew/bin/mitmdump';
          PATHS.fullMitmproxyPath = '/opt/homebrew/bin/mitmproxy';
          PATHS.fullMitmwebPath = '/opt/homebrew/bin/mitmweb';
        }
        
      } catch (error) {
        console.error('Homebrew installation error:', error);
        throw error;
      }
    } else if (process.platform === 'win32') {
      // Windows installation using pip
      console.log('Installing mitmproxy using pip on Windows...');
      await new Promise((resolve, reject) => {
        exec('pip install mitmproxy', (error, stdout, stderr) => {
          if (error) {
            console.error('Failed to install mitmproxy using pip:', stderr);
            reject(error);
            return;
          }
          console.log('pip install output:', stdout);
          resolve();
        });
      });
      
      // Now find where pip installed the executables
      await new Promise((resolve, reject) => {
        exec('where mitmdump', (error, stdout) => {
          if (error) {
            console.error('Failed to locate mitmdump after installation:', error);
            reject(error);
            return;
          }
          const installedPath = stdout.trim().split('\r\n')[0]; // Take the first path if multiple are found
          console.log('Found mitmdump at:', installedPath);
          
          PATHS.fullMitmdumpPath = installedPath;
          PATHS.fullMitmproxyPath = installedPath.replace('mitmdump.exe', 'mitmproxy.exe');
          PATHS.fullMitmwebPath = installedPath.replace('mitmdump.exe', 'mitmweb.exe');
          
          resolve();
        });
      });
      
    } else {
      // Linux installation using pip
      console.log('Installing mitmproxy using pip on Linux...');
      await new Promise((resolve, reject) => {
        exec('pip3 install --user mitmproxy', (error, stdout, stderr) => {
          if (error) {
            console.error('Failed to install mitmproxy using pip:', stderr);
            reject(error);
            return;
          }
          console.log('pip install output:', stdout);
          resolve();
        });
      });
      
      // Get the path from which command
      const installedPath = await new Promise((resolve, reject) => {
        exec('which mitmdump', (error, stdout) => {
          if (error) {
            // Try to find in ~/.local/bin
            if (fs.existsSync(path.join(require('os').homedir(), '.local/bin/mitmdump'))) {
              resolve(path.join(require('os').homedir(), '.local/bin/mitmdump'));
            } else {
              console.error('mitmproxy was not installed correctly.');
              reject(error);
            }
            return;
          }
          resolve(stdout.trim());
        });
      });
      
      // Set paths for Linux
      PATHS.fullMitmdumpPath = installedPath;
      PATHS.fullMitmproxyPath = installedPath.replace('mitmdump', 'mitmproxy');
      PATHS.fullMitmwebPath = installedPath.replace('mitmdump', 'mitmweb');
    }
    
    console.log('mitmproxy installed successfully at:', PATHS.fullMitmdumpPath);
    return true;
  } catch (error) {
    console.error('Failed to install mitmproxy:', error);
    return false;
  }
}

module.exports = {
  ensureMitmproxyExists,
  checkMitmproxyInstalled,
  PATHS
}; 