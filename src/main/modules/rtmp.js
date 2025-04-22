const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { app } = require('electron');
const NodeMediaServer = require('node-media-server');
const { userDataPath, getLocalIpAddress } = require('./utils');

// Create media directory for RTMP server if it doesn't exist
const rtmpMediaPath = path.join(userDataPath, 'media');
if (!fs.existsSync(rtmpMediaPath)) {
  try {
    fs.mkdirSync(rtmpMediaPath, { recursive: true });
    console.log('Created RTMP media directory at:', rtmpMediaPath);
  } catch (error) {
    console.error('Failed to create RTMP media directory:', error);
  }
}

// RTMP server configuration
const rtmpConfig = {
  rtmp: {
    port: 1935,
    chunk_size: 4096,  // Reduced from 60000 to minimize buffering
    gop_cache: false,  // Disable GOP cache to reduce latency
    ping: 10,         // Reduced from 30 to detect disconnections faster
    ping_timeout: 20  // Reduced from 60 to match ping reduction
  },
  http: {
    port: 8000,
    allow_origin: '*',
    mediaroot: rtmpMediaPath // Store media files temporarily
  },
  trans: {
    ffmpeg: process.platform === 'win32' ? 
            path.join(app.getAppPath(), 'bin', 'ffmpeg.exe') : 
            '/opt/homebrew/bin/ffmpeg',  // Path to FFmpeg on macOS
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=1:hls_list_size=2:hls_flags=delete_segments+append_list+discont_start:hls_allow_cache=false]',
        dash: true,
        dashFlags: '[f=dash:window_size=2:extra_window_size=1]'
      }
    ]
  }
};

let rtmpServer = null;

// Function to start RTMP server
function startRtmpServer(customConfig = {}) {
  if (rtmpServer) {
    console.log('RTMP server already running');
    return { success: true, message: 'RTMP server already running' };
  }

  try {
    // Merge default config with any custom config
    const config = { ...rtmpConfig, ...customConfig };
    console.log('Starting RTMP server with config:', config);
    
    rtmpServer = new NodeMediaServer(config);
    rtmpServer.run();
    
    console.log('RTMP server started successfully');
    return { 
      success: true, 
      message: 'RTMP server started successfully',
      rtmpUrl: `rtmp://${getLocalIpAddress()}:${config.rtmp.port}`,
      httpUrl: `http://${getLocalIpAddress()}:${config.http.port}`
    };
  } catch (error) {
    console.error('Failed to start RTMP server:', error);
    return { success: false, message: error.message };
  }
}

// Function to stop RTMP server
function stopRtmpServer() {
  if (!rtmpServer) {
    console.log('RTMP server not running');
    return { success: true, message: 'RTMP server not running' };
  }

  try {
    rtmpServer.stop();
    rtmpServer = null;
    console.log('RTMP server stopped successfully');
    return { success: true, message: 'RTMP server stopped successfully' };
  } catch (error) {
    console.error('Failed to stop RTMP server:', error);
    return { success: false, message: error.message };
  }
}

// Function to get RTMP server status
function getRtmpServerStatus() {
  return { 
    running: !!rtmpServer,
    config: rtmpServer ? rtmpConfig : null,
    rtmpUrl: rtmpServer ? `rtmp://${getLocalIpAddress()}:${rtmpConfig.rtmp.port}` : null,
    httpUrl: rtmpServer ? `http://${getLocalIpAddress()}:${rtmpConfig.http.port}` : null
  };
}

// Capture screenshot from RTMP stream
async function captureScreenshot(beaconId) {
  if (!rtmpServer) {
    return {
      success: false,
      message: 'RTMP server is not running'
    };
  }

  try {
    console.log(`Capturing screenshot for beacon ${beaconId}`);
    
    // Create screenshots directory if it doesn't exist
    const screenshotsDir = path.join(userDataPath, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    // Generate screenshot filename
    const timestamp = Date.now();
    const screenshotFileName = `${beaconId}_${timestamp}.jpg`;
    const screenshotPath = path.join(screenshotsDir, screenshotFileName);
    
    // Check if we already have a recent screenshot for this beacon (within last 60 seconds)
    // to avoid unnecessary captures during UI refreshes
    const existingFiles = fs.readdirSync(screenshotsDir)
      .filter(file => file.startsWith(`${beaconId}_`))
      .map(file => {
        const filePath = path.join(screenshotsDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          path: filePath,
          timestamp: parseInt(file.split('_')[1].replace('.jpg', '')),
          mtime: stats.mtime
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp); // Most recent first
    
    // If we have a recent screenshot (last 60 seconds), use it instead of capturing a new one
    if (existingFiles.length > 0 && 
        (Date.now() - existingFiles[0].timestamp < 60000) && 
        !screenshotFileName.includes(existingFiles[0].name)) {
      
      console.log(`Using existing screenshot for beacon ${beaconId}: ${existingFiles[0].name}`);
      
      return {
        success: true,
        screenshotPath: existingFiles[0].path,
        fileName: existingFiles[0].name,
        timestamp: existingFiles[0].timestamp,
        url: `file://${existingFiles[0].path}`,
        cached: true
      };
    }
    
    // Use ffmpeg to capture a frame from the RTMP stream with auto-cropping
    const rtmpUrl = `rtmp://${getLocalIpAddress()}:${rtmpConfig.rtmp.port}/live/live`;
    const ffmpegPath = process.platform === 'win32' ? 
            path.join(app.getAppPath(), 'bin', 'ffmpeg.exe') : 
            '/opt/homebrew/bin/ffmpeg';
    
    // Two-pass approach to detect and crop black borders
    // First pass: detect crop dimensions
    const cropDetectPath = path.join(screenshotsDir, `temp_${timestamp}.jpg`);
    await new Promise((resolve, reject) => {
      // First we capture a frame for crop detection
      exec(`"${ffmpegPath}" -y -i "${rtmpUrl}" -vframes 1 "${cropDetectPath}"`, async (error) => {
        if (error) {
          console.error('Error capturing frame for crop detection:', error);
          // If crop detection fails, try a regular capture without cropping
          try {
            await execSimpleCapture(ffmpegPath, rtmpUrl, screenshotPath);
            resolve();
            return;
          } catch (e) {
            reject(error);
            return;
          }
        }
        
        // Now detect crop values using cropdetect filter with very aggressive settings
        // Using threshold=12 (very low = more aggressive cropping), round to 8 (more precise), and skip 0 pixels from edges
        exec(`"${ffmpegPath}" -i "${cropDetectPath}" -vf "cropdetect=12:8:0" -f null -`, async (err, stdout, stderr) => {
          try {
            // Clean up temp file
            if (fs.existsSync(cropDetectPath)) {
              fs.unlinkSync(cropDetectPath);
            }
            
            if (err) {
              console.error('Error detecting crop:', err);
              // If crop detection fails, try without cropping
              await execSimpleCapture(ffmpegPath, rtmpUrl, screenshotPath);
              resolve();
              return;
            }
            
            // Parse the crop parameters from stderr
            let cropParams = 'crop=in_w:in_h';
            const cropRegex = /crop=([0-9]+):([0-9]+):([0-9]+):([0-9]+)/g;
            const matches = stderr.matchAll(cropRegex);
            let lastMatch = null;
            
            // Get the last (most accurate) crop detection
            for (const match of matches) {
              lastMatch = match;
            }
            
            if (lastMatch) {
              cropParams = lastMatch[0];
              console.log(`Detected crop parameters: ${cropParams}`);
              
              // Extract dimensions from the crop parameters
              const dimensions = cropParams.match(/crop=([0-9]+):([0-9]+):([0-9]+):([0-9]+)/);
              if (dimensions && dimensions.length === 5) {
                const [_, width, height, x, y] = dimensions;
                
                // Apply a very aggressive crop - add additional padding to crop more from each side
                const newWidth = parseInt(width) - 48;
                const newHeight = parseInt(height) - 48;
                const newX = parseInt(x) + 24;
                const newY = parseInt(y) + 24;
                
                // Ensure dimensions are positive
                if (newWidth > 0 && newHeight > 0) {
                  cropParams = `crop=${newWidth}:${newHeight}:${newX}:${newY}`;
                  console.log(`Adjusted crop parameters: ${cropParams}`);
                }
              }
            }
            
            // Second pass: capture with cropping and apply a better scaling filter
            // This ensures we don't have any black borders and fixes aspect ratio
            const filterComplex = `${cropParams},scale=720:-1`;
            exec(`"${ffmpegPath}" -y -i "${rtmpUrl}" -vf "${filterComplex}" -vframes 1 "${screenshotPath}"`, (error) => {
              if (error) {
                console.error('Error capturing cropped screenshot:', error);
                // If cropped capture fails, try without cropping
                execSimpleCapture(ffmpegPath, rtmpUrl, screenshotPath)
                  .then(resolve)
                  .catch(reject);
                return;
              }
              resolve();
            });
          } catch (e) {
            reject(e);
          }
        });
      });
    });
    
    // Double-check that the file was created successfully
    if (!fs.existsSync(screenshotPath) || fs.statSync(screenshotPath).size === 0) {
      throw new Error('Screenshot file was not created properly');
    }
    
    // Return the path and metadata
    return {
      success: true,
      screenshotPath: screenshotPath,
      fileName: screenshotFileName,
      timestamp: timestamp,
      url: `file://${screenshotPath}`,
      cached: false
    };
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    
    // Return failed result
    return {
      success: false,
      message: error.message
    };
  }
}

// Helper function for simple capture without cropping
async function execSimpleCapture(ffmpegPath, rtmpUrl, outputPath) {
  return new Promise((resolve, reject) => {
    exec(`"${ffmpegPath}" -y -i "${rtmpUrl}" -vframes 1 "${outputPath}"`, (error) => {
      if (error) {
        console.error('Error in simple capture:', error);
        reject(error);
        return;
      }
      resolve();
    });
  });
}

// Get screenshot as data URL
async function getScreenshotDataUrl(fileName) {
  try {
    const screenshotsDir = path.join(userDataPath, 'screenshots');
    const filePath = path.join(screenshotsDir, fileName);
    
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        message: 'Screenshot file not found'
      };
    }
    
    // Get image dimensions using ffmpeg
    const ffmpegPath = process.platform === 'win32' ? 
            path.join(app.getAppPath(), 'bin', 'ffmpeg.exe') : 
            '/opt/homebrew/bin/ffmpeg';
    
    // Use ffprobe to get image dimensions
    let dimensions = { width: 720, height: 720 }; // Default fallback
    
    try {
      const { stdout, stderr } = await require('util').promisify(exec)(
        `"${ffmpegPath}" -i "${filePath}" -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0`
      );
      
      if (stdout) {
        const parts = stdout.trim().split(',');
        if (parts.length === 2) {
          dimensions = {
            width: parseInt(parts[0]),
            height: parseInt(parts[1])
          };
          console.log(`Image dimensions: ${dimensions.width}x${dimensions.height}`);
        }
      }
    } catch (e) {
      console.error('Error getting image dimensions:', e);
    }
    
    // Read the file and convert to data URL
    const data = fs.readFileSync(filePath);
    const base64Data = data.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64Data}`;
    
    return {
      success: true,
      dataUrl: dataUrl,
      dimensions: dimensions
    };
  } catch (error) {
    console.error('Error getting screenshot data URL:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

// Get the RTMP config
function getConfig() {
  return rtmpConfig;
}

module.exports = {
  startRtmpServer,
  stopRtmpServer,
  getRtmpServerStatus,
  captureScreenshot,
  getScreenshotDataUrl,
  getConfig,
  rtmpConfig
}; 