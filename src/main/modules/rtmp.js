const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { app } = require('electron');
const NodeMediaServer = require('node-media-server');
const { userDataPath, getLocalIpAddress } = require('./utils');
const { EventEmitter } = require('events');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const { WebSocket } = require('ws');
const { PassThrough } = require('stream');

// Screenshot and frame capture configuration
const screenshotConfig = {
  // Frame capture settings
  framerate: 5,               // Frames per second to capture
  fileCheckInterval: 200,     // How often to check for file changes (ms)
  
  // Stability detection settings
  stabilityCheckInterval: 5,  // Check for UI stability every N frames
  maxTimeBetweenFrames: 500,  // Max time between frames for stability detection (ms)
  stableFrameThreshold: 250,  // Time between frames below which UI is considered stable (ms)
  minStabilityDuration: 1000, // Minimum time UI must be stable for (ms)
  
  // Screenshot settings
  useCache: true,             // Use cached screenshot if available
  cacheTime: 60000,           // Cache time in ms (60 seconds)
  stabilityDelay: 1500,       // Wait time for UI stability in ms
  captureDelay: 1000,         // Additional delay before capturing screenshot (ms)
  screenshotTimeout: 10000,    // Maximum time to wait for a stable frame
  quality: 90,                // JPEG quality (0-100)
  
  // Output settings
  imageScale: '720:-1',       // Scale output to 720p width, maintain aspect ratio
  imageQuality: 1             // FFmpeg output quality (lower is better)
};

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

// Create screenshots directory if it doesn't exist
const screenshotsDir = path.join(userDataPath, 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  try {
    fs.mkdirSync(screenshotsDir, { recursive: true });
    console.log('Created screenshots directory at:', screenshotsDir);
  } catch (error) {
    console.error('Failed to create screenshots directory:', error);
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

// Configure ffmpeg path
const ffmpegPath = process.platform === 'win32' ? 
  path.join(app.getAppPath(), 'bin', 'ffmpeg.exe') : 
  '/opt/homebrew/bin/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegPath);

let rtmpServer = null;

// Stream connection manager - handles persistent connections
class StreamConnectionManager extends EventEmitter {
  constructor() {
    super();
    this.connections = {};
    this.frameBuffers = {};
    this.stableFrames = {};
    this.reconnectTimers = {};
    this.connecting = new Set();
    this.screenshotQueue = {};
    this.wsConnections = {};
  }

  /**
   * Connect to a stream for a given beacon
   * @param {string} beaconId - The beacon ID
   * @returns {Promise<boolean>} - Whether the connection was successful
   */
  async connect(beaconId) {
    if (this.connecting.has(beaconId)) {
      // Already trying to connect
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.connecting.has(beaconId)) {
            clearInterval(checkInterval);
            resolve(!!this.connections[beaconId]);
          }
        }, 100);
      });
    }

    this.connecting.add(beaconId);

    try {
      // Clean up any existing connection
      this.disconnect(beaconId);
      
      // Initialize frame buffer for this beacon
      this.frameBuffers[beaconId] = [];
      
      // Set up WebSocket connection to the RTMP server for metadata
      const wsUrl = `ws://${getLocalIpAddress()}:${rtmpConfig.http.port}/api/streams`;
      const ws = new WebSocket(wsUrl);
      
      ws.on('open', () => {
        console.log(`WebSocket connected for beacon ${beaconId}`);
        this.wsConnections[beaconId] = ws;
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          if (message.live && message.publisher && message.publisher.app === 'live') {
            this.emit('stream-data', { beaconId, data: message });
          }
        } catch (err) {
          console.error(`Error parsing WebSocket message for beacon ${beaconId}:`, err);
        }
      });
      
      ws.on('error', (err) => {
        console.error(`WebSocket error for beacon ${beaconId}:`, err);
      });
      
      ws.on('close', () => {
        console.log(`WebSocket closed for beacon ${beaconId}`);
        delete this.wsConnections[beaconId];
      });
      
      // Create a new FFmpeg process that connects to the RTMP stream
      // This will remain running and be used for screenshots on demand
      const rtmpUrl = `rtmp://${getLocalIpAddress()}:${rtmpConfig.rtmp.port}/live/live`;
      
      // Create a stream to receive FFmpeg output
      const outputStream = new PassThrough();
      
      const ffmpegProcess = ffmpeg(rtmpUrl)
        .outputOptions([
          '-f image2',       // Output as individual images
          `-vf fps=${screenshotConfig.framerate}`,      // Limit to configured frames per second
          `-vf scale=${screenshotConfig.imageScale}`,   // Scale as configured
          '-update 1',       // Force updating the same file
          `-q:v ${screenshotConfig.imageQuality}`       // Quality for screenshots from config
        ])
        .output(path.join(screenshotsDir, `temp_${beaconId}.jpg`))
        .on('start', (cmd) => {
          console.log(`Started FFmpeg process for beacon ${beaconId}`);
          console.log(`Command: ${cmd}`);
          
          this.connections[beaconId] = {
            ffmpegProcess,
            connected: true,
            lastActivity: Date.now(),
            frameCount: 0
          };
          
          // No longer connecting
          this.connecting.delete(beaconId);
          
          this.emit('connected', { beaconId });
          
          // Start the watcher for the screenshot file
          this.watchScreenshotFile(beaconId);
        })
        .on('error', (err) => {
          console.error(`FFmpeg error for beacon ${beaconId}:`, err);
          this.connecting.delete(beaconId);
          this.handleDisconnect(beaconId);
        })
        .on('end', () => {
          console.log(`FFmpeg process ended for beacon ${beaconId}`);
          this.handleDisconnect(beaconId);
        });
      
      // Start the FFmpeg process
      ffmpegProcess.run();
      
      return true;
    } catch (error) {
      console.error(`Error connecting to stream for beacon ${beaconId}:`, error);
      this.connecting.delete(beaconId);
      return false;
    }
  }

  /**
   * Disconnect from a stream
   * @param {string} beaconId - The beacon ID
   */
  disconnect(beaconId) {
    if (this.connections[beaconId]) {
      try {
        // Clear the file watcher interval
        if (this.connections[beaconId].watchInterval) {
          clearInterval(this.connections[beaconId].watchInterval);
          delete this.connections[beaconId].watchInterval;
        }
        
        if (this.connections[beaconId].ffmpegProcess) {
          this.connections[beaconId].ffmpegProcess.kill('SIGKILL');
        }
      } catch (err) {
        console.error(`Error killing FFmpeg process for beacon ${beaconId}:`, err);
      }
      
      // Clean up temp file
      try {
        const tempFile = path.join(screenshotsDir, `temp_${beaconId}.jpg`);
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (err) {
        console.error(`Error deleting temp file for beacon ${beaconId}:`, err);
      }
      
      delete this.connections[beaconId];
    }
    
    if (this.wsConnections[beaconId]) {
      try {
        this.wsConnections[beaconId].close();
      } catch (err) {
        console.error(`Error closing WebSocket for beacon ${beaconId}:`, err);
      }
      
      delete this.wsConnections[beaconId];
    }
    
    // Clear any reconnect timer
    if (this.reconnectTimers[beaconId]) {
      clearTimeout(this.reconnectTimers[beaconId]);
      delete this.reconnectTimers[beaconId];
    }
    
    delete this.frameBuffers[beaconId];
    delete this.stableFrames[beaconId];
  }

  /**
   * Handle disconnection and possible reconnection
   * @param {string} beaconId - The beacon ID
   */
  handleDisconnect(beaconId) {
    if (this.connections[beaconId]) {
      this.connections[beaconId].connected = false;
      
      this.emit('disconnected', { beaconId });
      
      // Schedule reconnection
      if (!this.reconnectTimers[beaconId]) {
        this.reconnectTimers[beaconId] = setTimeout(() => {
          console.log(`Attempting to reconnect beacon ${beaconId}...`);
          this.connect(beaconId).then(success => {
            if (success) {
              console.log(`Successfully reconnected beacon ${beaconId}`);
            } else {
              console.error(`Failed to reconnect beacon ${beaconId}`);
            }
            delete this.reconnectTimers[beaconId];
          });
        }, 5000); // 5 second delay before reconnection attempt
      }
    }
  }

  /**
   * Process a video frame and detect UI stability
   * @param {string} beaconId - The beacon ID
   * @param {Buffer} frameData - Raw frame data
   */
  async processFrame(beaconId, frameData) {
    try {
      // Store the frame in the buffer
      this.frameBuffers[beaconId].push({
        data: frameData,
        timestamp: Date.now()
      });
      
      // Keep only the last 30 frames
      if (this.frameBuffers[beaconId].length > 30) {
        this.frameBuffers[beaconId].shift();
      }
      
      // Detect UI stability (only every Nth frame to reduce processing load)
      if (this.connections[beaconId].frameCount % screenshotConfig.stabilityCheckInterval === 0) {
        await this.detectStableUI(beaconId);
      }
    } catch (error) {
      console.error(`Error processing frame for beacon ${beaconId}:`, error);
    }
  }

  /**
   * Detect when the UI has stabilized (not in a loading/transition state)
   * @param {string} beaconId - The beacon ID
   */
  async detectStableUI(beaconId) {
    // Need at least 10 frames to detect stability
    if (!this.frameBuffers[beaconId] || this.frameBuffers[beaconId].length < 10) return;
    
    try {
      // Get the last two frames for comparison
      const frame1 = this.frameBuffers[beaconId][this.frameBuffers[beaconId].length - 2];
      const frame2 = this.frameBuffers[beaconId][this.frameBuffers[beaconId].length - 1];
      
      if (!frame1 || !frame2) return;
      
      // Check time difference between frames - if too large, UI is likely not stable
      const timeDiff = frame2.timestamp - frame1.timestamp;
      if (timeDiff > screenshotConfig.maxTimeBetweenFrames) {
        // If we had stability tracking, reset it
        if (this.connections[beaconId].stableStartTime) {
          delete this.connections[beaconId].stableStartTime;
        }
        return; // Too much time between frames, likely unstable
      }
      
      // Simple time-based heuristic - if frames are coming at regular intervals, 
      // the UI is probably stable
      const isCurrentlyStable = (timeDiff < screenshotConfig.stableFrameThreshold); // Less than threshold between frames
      
      if (!isCurrentlyStable) {
        // Reset stability tracking
        if (this.connections[beaconId].stableStartTime) {
          delete this.connections[beaconId].stableStartTime;
        }
        return;
      }
      
      // The current frame comparison is stable, now check if we've been stable for the minimum duration
      const now = Date.now();
      
      // If this is the first stable frame, start tracking stability time
      if (!this.connections[beaconId].stableStartTime) {
        this.connections[beaconId].stableStartTime = now;
        return; // Not stable for the minimum duration yet
      }
      
      // Check if we've been stable for the minimum duration
      const stableDuration = now - this.connections[beaconId].stableStartTime;
      if (stableDuration < screenshotConfig.minStabilityDuration) {
        return; // Not stable for long enough yet
      }
      
      // If we get here, the UI has been stable for the minimum duration
      // Store the stable frame
      this.stableFrames[beaconId] = {
        data: frame2.data,
        timestamp: frame2.timestamp
      };
      
      this.emit('stable-ui', { 
        beaconId, 
        timestamp: frame2.timestamp
      });
    } catch (error) {
      console.error(`Error detecting UI stability for beacon ${beaconId}:`, error);
    }
  }

  /**
   * Watch the screenshot file for changes and process new frames
   * @param {string} beaconId - The beacon ID
   */
  watchScreenshotFile(beaconId) {
    const filePath = path.join(screenshotsDir, `temp_${beaconId}.jpg`);
    
    // Create an interval to check the file
    const interval = setInterval(() => {
      try {
        if (!this.connections[beaconId] || !this.connections[beaconId].connected) {
          clearInterval(interval);
          return;
        }
        
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          
          // If the file was updated since our last check
          if (!this.connections[beaconId].lastFileTime || 
              stats.mtimeMs > this.connections[beaconId].lastFileTime) {
            
            this.connections[beaconId].lastFileTime = stats.mtimeMs;
            this.connections[beaconId].frameCount++;
            
            // Read the file and process it
            const frameData = fs.readFileSync(filePath);
            this.processFrame(beaconId, frameData);
            
            // Process any pending screenshots
            if (this.screenshotQueue[beaconId] && this.screenshotQueue[beaconId].length > 0) {
              this.processScreenshotQueue(beaconId);
            }
          }
        }
      } catch (error) {
        console.error(`Error watching screenshot file for beacon ${beaconId}:`, error);
      }
    }, screenshotConfig.fileCheckInterval); // Check interval from config
    
    // Store the interval so we can clear it later
    this.connections[beaconId].watchInterval = interval;
  }

  /**
   * Queue a screenshot request
   * @param {string} beaconId - The beacon ID
   * @param {string} outputPath - Path to save the screenshot
   * @param {Object} options - Screenshot options
   * @returns {Promise<Object>} - Screenshot result
   */
  queueScreenshot(beaconId, outputPath, options = {}) {
    return new Promise((resolve, reject) => {
      // Initialize the queue if it doesn't exist
      if (!this.screenshotQueue[beaconId]) {
        this.screenshotQueue[beaconId] = [];
      }
      
      // Add the request to the queue
      this.screenshotQueue[beaconId].push({
        outputPath,
        options,
        resolve,
        reject,
        timestamp: Date.now()
      });
      
      // Process the queue if we have a stable frame or the temp file exists
      const tempFile = path.join(screenshotsDir, `temp_${beaconId}.jpg`);
      if (this.stableFrames[beaconId] || fs.existsSync(tempFile)) {
        // Apply the additional capture delay before processing
        setTimeout(() => {
          this.processScreenshotQueue(beaconId);
        }, options.captureDelay || screenshotConfig.captureDelay);
      } else {
        // If we don't have a stable frame, wait for one (with timeout)
        const timeout = setTimeout(() => {
          // Process anyway after timeout, even without stable frame
          this.processScreenshotQueue(beaconId);
        }, options.timeout || screenshotConfig.screenshotTimeout);
        
        // Save the timeout so we can clear it if we process before timeout
        this.screenshotQueue[beaconId][this.screenshotQueue[beaconId].length - 1].timeout = timeout;
      }
    });
  }

  /**
   * Process the screenshot queue for a beacon
   * @param {string} beaconId - The beacon ID
   */
  async processScreenshotQueue(beaconId) {
    // If no queue or queue is empty, do nothing
    if (!this.screenshotQueue[beaconId] || this.screenshotQueue[beaconId].length === 0) {
      return;
    }
    
    // Get the next request in the queue
    const request = this.screenshotQueue[beaconId].shift();
    
    // Clear any timeout
    if (request.timeout) {
      clearTimeout(request.timeout);
    }
    
    try {
      // Check if we have a temp file
      const tempFile = path.join(screenshotsDir, `temp_${beaconId}.jpg`);
      
      // Use the temp file if it exists, otherwise try to use a stable frame
      if (fs.existsSync(tempFile)) {
        // Copy the temp file directly
        fs.copyFileSync(tempFile, request.outputPath);
      } else {
        // Use the latest stable frame if available, otherwise use the latest frame
        const frameData = this.stableFrames[beaconId]?.data || 
                         (this.frameBuffers[beaconId]?.length > 0 
                          ? this.frameBuffers[beaconId][this.frameBuffers[beaconId].length - 1].data 
                          : null);
        
        if (!frameData) {
          throw new Error('No frames available for screenshot');
        }
        
        // Process the frame data to create a screenshot
        await sharp(frameData)
          .jpeg({ quality: request.options.quality || screenshotConfig.quality })
          .toFile(request.outputPath);
      }
      
      // Generate timestamp and filename from the path
      const timestamp = Date.now();
      const fileName = path.basename(request.outputPath);
      
      // Resolve the promise with the screenshot details
      request.resolve({
        success: true,
        screenshotPath: request.outputPath,
        fileName,
        timestamp,
        url: `file://${request.outputPath}`,
        cached: false,
        fromStableFrame: !!this.stableFrames[beaconId]
      });
    } catch (error) {
      console.error(`Error processing screenshot for beacon ${beaconId}:`, error);
      
      // Reject the promise with the error
      request.reject({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Save a screenshot from frame data
   * @param {Buffer} frameData - Raw frame data
   * @param {string} outputPath - Path to save the screenshot
   * @param {Object} options - Screenshot options
   */
  async saveScreenshot(frameData, outputPath, options = {}) {
    try {
      // Just copy the file directly as it's already a JPEG
      fs.copyFileSync(frameData, outputPath);
      console.log(`Saved screenshot to ${outputPath}`);
    } catch (error) {
      // Fallback to using sharp if direct copy fails
      try {
        await sharp(frameData)
          .jpeg({ quality: options.quality || screenshotConfig.quality })
          .toFile(outputPath);
        console.log(`Saved screenshot to ${outputPath} using sharp`);
      } catch (innerError) {
        console.error('Error saving screenshot:', innerError);
        throw innerError;
      }
    }
  }

  /**
   * Check if a beacon is connected
   * @param {string} beaconId - The beacon ID
   * @returns {boolean} - Whether the beacon is connected
   */
  isConnected(beaconId) {
    return !!(this.connections[beaconId] && this.connections[beaconId].connected);
  }

  /**
   * Force reconnection for a beacon
   * @param {string} beaconId - The beacon ID
   * @returns {Promise<boolean>} - Whether the reconnection was successful
   */
  async forceReconnect(beaconId) {
    this.disconnect(beaconId);
    return this.connect(beaconId);
  }

  /**
   * Close all connections
   */
  closeAll() {
    const beaconIds = Object.keys(this.connections);
    for (const beaconId of beaconIds) {
      this.disconnect(beaconId);
    }
    
    // Clear all queues and buffers
    this.frameBuffers = {};
    this.stableFrames = {};
    this.screenshotQueue = {};
  }

  /**
   * Get connection stats for all beacons
   * @returns {Object} - Connection stats
   */
  getStats() {
    const stats = {
      connections: {},
      totalConnections: 0,
      activeConnections: 0
    };
    
    for (const beaconId in this.connections) {
      const connection = this.connections[beaconId];
      
      stats.connections[beaconId] = {
        connected: connection.connected,
        lastActivity: connection.lastActivity,
        frameCount: connection.frameCount,
        hasStableFrame: !!this.stableFrames[beaconId],
        queuedScreenshots: this.screenshotQueue[beaconId]?.length || 0
      };
      
      stats.totalConnections++;
      if (connection.connected) {
        stats.activeConnections++;
      }
    }
    
    return stats;
  }
}

// Create the connection manager
const connectionManager = new StreamConnectionManager();

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
    
    // Set up event handlers
    rtmpServer.on('preConnect', (id, args) => {
      console.log('[RTMP] Client attempting to connect:', id);
    });
    
    rtmpServer.on('postConnect', (id, args) => {
      console.log('[RTMP] Client connected:', id);
    });
    
    rtmpServer.on('doneConnect', (id, args) => {
      console.log('[RTMP] Client disconnected:', id);
    });
    
    rtmpServer.on('prePublish', (id, StreamPath, args) => {
      console.log('[RTMP] Stream publishing attempt:', StreamPath);
    });
    
    rtmpServer.on('postPublish', (id, StreamPath, args) => {
      console.log('[RTMP] Stream published:', StreamPath);
    });
    
    rtmpServer.on('donePublish', (id, StreamPath, args) => {
      console.log('[RTMP] Stream unpublished:', StreamPath);
    });
    
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
    // Close all persistent connections
    connectionManager.closeAll();
    
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
    httpUrl: rtmpServer ? `http://${getLocalIpAddress()}:${rtmpConfig.http.port}` : null,
    connections: connectionManager.getStats()
  };
}

// Capture screenshot from RTMP stream
async function captureScreenshot(beaconId, options = {}) {
  if (!rtmpServer) {
    return {
      success: false,
      message: 'RTMP server is not running'
    };
  }

  try {
    console.log(`Capturing screenshot for beacon ${beaconId}`);
    
    // Use config for default options
    const defaultOptions = {
      useCache: screenshotConfig.useCache,
      cacheTime: screenshotConfig.cacheTime,
      stabilityDelay: screenshotConfig.stabilityDelay,
      captureDelay: screenshotConfig.captureDelay,
      timeout: screenshotConfig.screenshotTimeout,
      forceCapture: false,
      quality: screenshotConfig.quality
    };
    
    // Merge with user options
    const opts = { ...defaultOptions, ...options };
    
    // Generate screenshot filename
    const timestamp = Date.now();
    const screenshotFileName = `${beaconId}_${timestamp}.jpg`;
    const screenshotPath = path.join(screenshotsDir, screenshotFileName);
    
    // Check for a cached screenshot if allowed
    if (opts.useCache && !opts.forceCapture) {
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
      
      // If we have a recent screenshot within cache time, use it
      if (existingFiles.length > 0 && 
          (Date.now() - existingFiles[0].timestamp < opts.cacheTime)) {
        
        console.log(`Using cached screenshot for beacon ${beaconId}: ${existingFiles[0].name}`);
        
        return {
          success: true,
          screenshotPath: existingFiles[0].path,
          fileName: existingFiles[0].name,
          timestamp: existingFiles[0].timestamp,
          url: `file://${existingFiles[0].path}`,
          cached: true
        };
      }
    }
    
    // Check if we have an active connection for this beacon
    if (!connectionManager.isConnected(beaconId)) {
      // Try to establish a connection
      console.log(`No active connection for beacon ${beaconId}, connecting...`);
      const connected = await connectionManager.connect(beaconId);
      
      if (!connected) {
        console.error(`Failed to connect to beacon ${beaconId}`);
        return { success: false, message: `Failed to connect to beacon ${beaconId}` };
      }
      
      // Wait for the connection to stabilize
      if (opts.stabilityDelay > 0) {
        console.log(`Waiting ${opts.stabilityDelay}ms for connection to stabilize`);
        await new Promise(resolve => setTimeout(resolve, opts.stabilityDelay));
      }
    }
    
    // Queue the screenshot request
    return await connectionManager.queueScreenshot(beaconId, screenshotPath, opts);
    
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    
    // Return failed result
    return {
      success: false,
      message: error.message
    };
  }
}

// Get screenshot as data URL
async function getScreenshotDataUrl(fileName) {
  try {
    const filePath = path.join(screenshotsDir, fileName);
    
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        message: 'Screenshot file not found'
      };
    }
    
    // Get image dimensions using sharp
    let dimensions = { width: 720, height: 720 }; // Default fallback
    
    try {
      const metadata = await sharp(filePath).metadata();
      dimensions = {
        width: metadata.width,
        height: metadata.height
      };
      console.log(`Image dimensions: ${dimensions.width}x${dimensions.height}`);
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

// Get active RTMP connections
function getActiveConnections() {
  return connectionManager.getStats();
}

// Force reconnection for a specific beacon
async function reconnectBeacon(beaconId) {
  try {
    const success = await connectionManager.forceReconnect(beaconId);
    
    return {
      success: success,
      message: success 
        ? `Successfully reconnected beacon ${beaconId}`
        : `Failed to reconnect beacon ${beaconId}`
    };
  } catch (error) {
    console.error(`Error reconnecting beacon ${beaconId}:`, error);
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
  getActiveConnections,
  reconnectBeacon,
  getConfig,
  rtmpConfig,
  connectionManager // Export the connection manager for advanced usage
}; 