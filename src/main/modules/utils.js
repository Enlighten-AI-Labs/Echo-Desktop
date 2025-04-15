const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { exec } = require('child_process');
const { app } = require('electron');

// Path to the app's user data directory
const userDataPath = app.getPath('userData');

// Helper function to download a file
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

// Helper function to get local IP address
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

// Helper function to find executables recursively
function findExecutablesRecursively(dir) {
  const results = [];
  const list = fs.readdirSync(dir);
  
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat && stat.isDirectory()) {
      results.push(...findExecutablesRecursively(filePath));
    } else {
      if ((file.includes('mitm') && !file.endsWith('.py')) || 
          (process.platform === 'win32' && file.endsWith('.exe'))) {
        results.push(filePath);
      }
    }
  });
  
  return results;
}

// Create a temporary directory if it doesn't exist
function ensureTmpDir() {
  const tmpDir = path.join(os.tmpdir(), 'echo-desktop');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  return tmpDir;
}

module.exports = {
  userDataPath,
  downloadFile,
  getLocalIpAddress,
  findExecutablesRecursively,
  ensureTmpDir
}; 