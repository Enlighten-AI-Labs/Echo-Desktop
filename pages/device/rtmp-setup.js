import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import styles from '@/styles/pages/device-setup.module.css';

export default function RtmpSetup({ navigateTo, params }) {
  const { deviceId, packageName } = params || {};
  const [serverStatus, setServerStatus] = useState({ running: false });
  const [localIp, setLocalIp] = useState('Loading...');
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [rtmpPort, setRtmpPort] = useState(1935);
  const [httpPort, setHttpPort] = useState(8000);
  const [streamKey, setStreamKey] = useState('live');
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(false);
  const [checkStreamInterval, setCheckStreamInterval] = useState(null);
  const [lastCheckTime, setLastCheckTime] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [connectedDevices, setConnectedDevices] = useState([]);
  const [isSendingToDevice, setIsSendingToDevice] = useState(false);
  const videoRef = useRef(null);
  const flvPlayer = useRef(null);

  useEffect(() => {
    // Get local IP address
    async function fetchLocalIp() {
      try {
        const ipAddress = await window.api.adb.getLocalIp();
        setLocalIp(ipAddress);
      } catch (error) {
        console.error('Failed to get local IP address:', error);
        setLocalIp('Failed to detect');
      }
    }

    // Check for connected Android devices
    async function checkConnectedDevices() {
      try {
        const devices = await window.api.adb.getDevices();
        setConnectedDevices(devices);
      } catch (error) {
        console.error('Failed to get connected Android devices:', error);
        setConnectedDevices([]);
      }
    }

    // Check RTMP server status
    async function checkRtmpStatus() {
      try {
        const status = await window.api.rtmp.status();
        setServerStatus(status);
        if (status.running) {
          setStatusMessage({ type: 'success', text: 'RTMP server is running' });
          
          // If server is running and we haven't set up stream checking yet
          if (!checkStreamInterval) {
            setupStreamCheck();
          }
        }
      } catch (error) {
        console.error('Failed to check RTMP server status:', error);
        setStatusMessage({ type: 'error', text: 'Failed to check RTMP server status' });
      }
    }

    // Get default configuration
    async function getDefaultConfig() {
      try {
        const config = await window.api.rtmp.getConfig();
        if (config) {
          setRtmpPort(config.rtmp.port);
          setHttpPort(config.http.port);
        }
      } catch (error) {
        console.error('Failed to get RTMP configuration:', error);
      }
    }

    fetchLocalIp();
    checkRtmpStatus();
    getDefaultConfig();
    checkConnectedDevices();

    // Set up interval to periodically check for connected devices
    const deviceCheckInterval = setInterval(checkConnectedDevices, 10000);

    // Clean up on unmount
    return () => {
      if (checkStreamInterval) {
        clearInterval(checkStreamInterval);
      }
      clearInterval(deviceCheckInterval);
      destroyPlayer();
    };
  }, []);

  // Set up stream checking interval
  const setupStreamCheck = () => {
    // Clear any existing interval
    if (checkStreamInterval) {
      clearInterval(checkStreamInterval);
    }

    // Initial check immediately
    checkStreamActive();

    // Check if stream is active every 3 seconds
    const interval = setInterval(() => {
      checkStreamActive();
    }, 3000);

    setCheckStreamInterval(interval);
  };

  // Manual check for stream button handler
  const handleManualCheck = () => {
    setDebugInfo('Manually checking for stream...');
    checkStreamActive(true);
  };

  // Direct play button handler - force player creation
  const handleForcePlay = () => {
    setDebugInfo('Forcing player to start...\nThis will attempt direct connection regardless of detection status.');
    isStreamingRef.current = true;
    setIsStreaming(true);
    
    // Try HLS playback first if available
    const hlsUrl = `http://${localIp}:${httpPort}/live/${streamKey}.m3u8`;
    setDebugInfo(prev => `${prev}\nTrying HLS URL: ${hlsUrl}`);
    
    // Check if HLS.js is supported
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      const video = videoRef.current;
      if (video) {
        const hls = new Hls({
          debug: false, // Disable debug to reduce console noise
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 0,
          liveSyncDuration: 1.0, // Increase for stability
          liveMaxLatencyDuration: 6 // Allow higher latency for stability
        });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
          video.play();
          setDebugInfo(prev => `${prev}\nHLS player initialized and playing`);
          
          // Force live sync periodically but less frequently
          const liveSync = setInterval(() => {
            if (video && !video.paused && hls.liveSyncPosition) {
              // Only jump if we're significantly behind live edge
              if (hls.liveSyncPosition - video.currentTime > 3) {
                video.currentTime = hls.liveSyncPosition - 0.5;
              }
            }
          }, 5000); // Check less frequently
          
          // Clean up on media detaching
          hls.on(Hls.Events.MEDIA_DETACHING, () => {
            clearInterval(liveSync);
          });
        });
        hls.on(Hls.Events.ERROR, function(event, data) {
          setDebugInfo(prev => `${prev}\nHLS error: ${data.type} - ${data.details}`);
          if (data.fatal) {
            setDebugInfo(prev => `${prev}\nFatal HLS error, falling back to flv player`);
            setupPlayer();
          }
        });
        return;
      }
    } else {
      // Fall back to flv player
      setupPlayer();
    }
  };

  // Check if stream is active by multiple methods
  const checkStreamActive = async (isManualCheck = false) => {
    if (!serverStatus.running) return;

    setLastCheckTime(new Date().toLocaleTimeString());
    
    try {
      // First method: HTTP-FLV URL check
      const flvUrl = `http://${localIp}:${httpPort}/live/${streamKey}.flv`;
      
      // Log attempt
      console.log(`Checking stream at ${flvUrl}`);
      if (isManualCheck) {
        setDebugInfo(`Checking FLV URL: ${flvUrl}`);
      }
      
      try {
        const response = await fetch(flvUrl, { 
          method: 'HEAD',
          cache: 'no-cache',
          mode: 'no-cors'
        });
        
        console.log('FLV URL check response:', response);
        if (isManualCheck) {
          setDebugInfo(prev => `${prev}\nFLV response status: ${response.status || 'unknown'}`);
        }
        
        if (response.ok || response.status === 200) {
          console.log('Stream appears to be active via HTTP-FLV check');
          // Update the ref first
          isStreamingRef.current = true;
          // Then update the state only if needed to avoid extra renders
          if (!isStreaming) {
            setIsStreaming(true);
          }
          if (!flvPlayer.current && videoRef.current) {
            setupPlayer();
          }
          return;
        }
      } catch (error) {
        console.log('FLV URL check error:', error);
        if (isManualCheck) {
          setDebugInfo(prev => `${prev}\nFLV check error: ${error.message}`);
        }
        // Continue to next check method
      }
      
      // Second method: Try direct player creation regardless
      // If it's been >15 seconds since starting the server, try the player anyway
      const serverStartTime = sessionStorage.getItem('rtmpServerStartTime');
      const now = Date.now();
      
      if (serverStartTime && (now - parseInt(serverStartTime)) > 15000) {
        if (isManualCheck) {
          setDebugInfo(prev => `${prev}\nServer running > 15s, trying player anyway`);
        }
        
        // If no player exists yet, force try creating it
        if (!flvPlayer.current && !isStreamingRef.current) {
          console.log('Trying player creation as fallback');
          // Update ref first
          isStreamingRef.current = true;
          setIsStreaming(true);
          setupPlayer();
          return;
        }
      }
      
      if (isManualCheck) {
        // If manual check got here, stream is not detected
        setDebugInfo(prev => `${prev}\nNo stream detected after all checks`);
      }
      
      // If the player exists but stream isn't detected, maybe destroy it
      if (!isStreamingRef.current && flvPlayer.current) {
        destroyPlayer();
      }
      
      // Only update state if the value is changing
      if (isStreamingRef.current !== isStreaming) {
        isStreamingRef.current = false;
        setIsStreaming(false);
      }
    } catch (error) {
      console.error('Error checking stream status:', error);
      // Update ref first, then state only if needed
      isStreamingRef.current = false;
      if (isStreaming) {
        setIsStreaming(false);
      }
      if (isManualCheck) {
        setDebugInfo(prev => `${prev}\nCheck error: ${error.message}`);
      }
    }
  };

  // Set up flv.js player
  const setupPlayer = () => {
    if (typeof window === 'undefined' || !videoRef.current) return;
    
    // Destroy existing player if there is one
    destroyPlayer();
    
    console.log('Setting up player');
    setDebugInfo('Setting up video player with ultra-low latency settings...');
    
    // Add detailed console logs to track the process
    console.log('Video element:', videoRef.current);
    console.log('Video element ready state:', videoRef.current.readyState);
    
    // Add event listeners to jump to live edge when video is played
    if (videoRef.current) {
      const jumpToLiveEdge = () => {
        // Small delay to ensure buffer is loaded after pause
        setTimeout(() => {
          // For flv.js player
          if (flvPlayer.current && videoRef.current) {
            // Use video element's buffered property instead of non-existent getBufferRange
            if (videoRef.current.buffered && videoRef.current.buffered.length > 0) {
              const bufferEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
              console.log(`Play event - jumping to live edge: ${bufferEnd}`);
              videoRef.current.currentTime = bufferEnd - 0.5;
            }
          }
          // For HLS player, the interval in handleForcePlay will handle this
        }, 500); // Increase timeout to ensure buffer is loaded
      };
      
      // When play is pressed after being paused, jump to live
      videoRef.current.addEventListener('play', jumpToLiveEdge);
      
      // Add play/pause event listeners to update isPlaying state
      videoRef.current.addEventListener('play', () => setIsPlaying(true));
      videoRef.current.addEventListener('pause', () => setIsPlaying(false));
      
      // Store the function reference so we can properly remove it later
      videoRef.current.jumpToLiveEdge = jumpToLiveEdge;
    }
    
    // Dynamically import flv.js
    import('flv.js').then(({ default: flvjs }) => {
      // Log flv.js version
      setDebugInfo(prev => `${prev}\nFLV.js version: ${flvjs.version}`);
      
      // Check browser support
      if (!flvjs.isSupported()) {
        const errMsg = 'FLV.js is not supported in this browser';
        console.error(errMsg);
        setDebugInfo(prev => `${prev}\n${errMsg}`);
        setStatusMessage({ 
          type: 'error', 
          text: errMsg + '. Please use Chrome, Firefox, or Edge.' 
        });
        return;
      }
      
      // Check MediaSource support
      if (!window.MediaSource) {
        const errMsg = 'MediaSource API is not supported in this browser';
        console.error(errMsg);
        setDebugInfo(prev => `${prev}\n${errMsg}`);
        setStatusMessage({ 
          type: 'error', 
          text: errMsg
        });
        return;
      }
      
      const flvUrl = `http://${localIp}:${httpPort}/live/${streamKey}.flv`;
      console.log('Using FLV URL:', flvUrl);
      setDebugInfo(prev => `${prev}\nCreating player with URL: ${flvUrl}`);
      
      try {
        // First, let's verify if the stream is actually available using XMLHttpRequest
        const xhr = new XMLHttpRequest();
        xhr.open('GET', flvUrl, true);
        xhr.responseType = 'arraybuffer';
        xhr.onreadystatechange = () => {
          if (xhr.readyState >= 2) {
            setDebugInfo(prev => `${prev}\nXHR check: readyState=${xhr.readyState}, status=${xhr.status}`);
          }
        };
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            // If we get a successful response, we've confirmed data is flowing
            setDebugInfo(prev => `${prev}\nStream verified! Got ${xhr.response.byteLength} bytes of data`);
            console.log(`Stream verified! Got ${xhr.response.byteLength} bytes of data`);
          }
        };
        
        xhr.onerror = (e) => {
          setDebugInfo(prev => `${prev}\nXHR error checking stream: ${e.toString()}`);
          console.error('XHR error checking stream:', e);
        };
        
        // Start the request but abort after 1 second - we just want to check availability
        xhr.send();
        setTimeout(() => xhr.abort(), 1000);
        
        // Create a player with ultra-low latency settings
        const player = flvjs.createPlayer({
          type: 'flv',
          url: flvUrl,
          isLive: true,
          hasAudio: true,
          hasVideo: true,
          cors: true,
          withCredentials: false,
          config: {
            enableWorker: true,
            enableStashBuffer: false,       // Disable stash buffer for lowest latency
            stashInitialSize: 32,          // Minimum buffer size for stability
            autoCleanupSourceBuffer: true,  // Enable source buffer auto cleanup
            autoCleanupMaxBackwardDuration: 2,  // Reduced from 5 to minimize buffer
            autoCleanupMinBackwardDuration: 1,  // Reduced from 2 to minimize buffer
            lazyLoad: false,                // Don't use lazy loading
            lazyLoadMaxDuration: 0,
            lazyLoadRecoverDuration: 0,
            deferLoadAfterSourceOpen: false,
            seekType: 'range',              // Use range request for seeking
            fixAudioTimestampGap: false,    // Don't fix timestamp gaps
            accurateSeek: false,            // Don't need accurate seeking for live
            liveBufferLatencyChasing: true, // Chase buffer latency for live stream
            liveBufferLatencyMaxLatency: 1.0, // Reduced from 2.0 for lower latency
            liveBufferLatencyMinRemain: 0.1,  // Reduced from 0.5 for lower latency
            liveSync: true                  // Enable live sync
          }
        });
        
        // Add a function to force stay at live edge
        const forceLiveSync = () => {
          if (videoRef.current && !videoRef.current.paused) {
            // Use video element's buffered property instead of non-existent getBufferRange
            if (videoRef.current.buffered && videoRef.current.buffered.length > 0) {
              const bufferEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
              const currentTime = videoRef.current.currentTime;
              
              // Only jump if we're significantly behind (more than 2 seconds)
              // This prevents constant small adjustments that cause stuttering
              if (bufferEnd - currentTime > 2) {
                console.log(`Forcing live sync: current=${currentTime}, buffer end=${bufferEnd}`);
                videoRef.current.currentTime = bufferEnd - 0.5; // Leave more margin to prevent constant adjustments
              }
            }
          }
        };
        
        // Start a timer to periodically force live sync, but less frequently (every 3 seconds instead of 1)
        const liveSyncInterval = setInterval(forceLiveSync, 3000);
        
        // Log all events from the player for debugging
        const logPlayerEvent = (eventName) => {
          player.on(flvjs.Events[eventName], (...args) => {
            if (eventName === 'STATISTICS_INFO') return; // Skip logging stats events
            setDebugInfo(prev => `${prev}\nEvent: ${eventName}${args.length ? ': ' + JSON.stringify(args) : ''}`);
          });
        };
        
        // Register all event listeners
        Object.keys(flvjs.Events).forEach(eventName => {
          logPlayerEvent(eventName);
        });
        
        // Set up detailed error handling
        player.on(flvjs.Events.ERROR, (errorType, errorDetail) => {
          console.error('flv.js error:', errorType, errorDetail);
          setDebugInfo(prev => `${prev}\nPlayer error: ${errorType}: ${JSON.stringify(errorDetail)}`);
          
          // For some errors, try recovering by reloading
          if (errorType === flvjs.ErrorTypes.NETWORK_ERROR) {
            setDebugInfo(prev => `${prev}\nNetwork error occurred, attempting to reload...`);
            setTimeout(() => {
              try {
                player.unload();
                player.load();
                player.play();
              } catch (e) {
                console.error('Error during reload:', e);
              }
            }, 2000);
          } else if (errorType === flvjs.ErrorTypes.MEDIA_ERROR) {
            // For media errors, often a reload will help
            setDebugInfo(prev => `${prev}\nMedia error occurred, attempting to reload...`);
            setTimeout(() => {
              try {
                player.unload();
                player.load();
                player.play();
              } catch (e) {
                console.error('Error during reload:', e);
              }
            }, 2000);
          }
        });
        
        // Clean up the live sync interval when destroying player
        player.on(flvjs.Events.DESTROY, () => {
          clearInterval(liveSyncInterval);
        });
        
        // Attach the player to the video element
        player.attachMediaElement(videoRef.current);
        
        // Configure video element for minimal latency
        videoRef.current.volume = 0.5;
        videoRef.current.preload = 'auto';
        videoRef.current.autoplay = true;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        
        // Add more media events logging
        ['loadstart', 'progress', 'suspend', 'abort', 'error', 
         'emptied', 'stalled', 'loadedmetadata', 'loadeddata', 
         'canplay', 'canplaythrough', 'playing', 'waiting', 
         'seeking', 'seeked', 'ended', 'durationchange', 
         'timeupdate', 'play', 'pause', 'ratechange',
         'resize', 'volumechange'].forEach(eventName => {
          videoRef.current.addEventListener(eventName, () => {
            if (['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'playing'].includes(eventName)) {
              setDebugInfo(prev => `${prev}\nVideo event: ${eventName}`);
            }
          });
        });
        
        // For some browsers, setting these properties can help
        try {
          videoRef.current.style.webkitTransform = 'translate3d(0,0,0)';
          videoRef.current.style.transform = 'translate3d(0,0,0)';
        } catch (e) {
          console.warn('Failed to set transform style', e);
        }
        
        // Log when loading starts
        setDebugInfo(prev => `${prev}\nLoading media...`);
        
        // Load and play
        player.load();
        
        // Track if we've ever received data
        let hasReceivedData = false;
        let receivedDataBytes = 0;
        
        // Add stats tracking
        player.on(flvjs.Events.STATISTICS_INFO, (stats) => {
          if (stats && stats.totalBytes) {
            receivedDataBytes = stats.totalBytes;
            if (receivedDataBytes > 0) {
              hasReceivedData = true;
            }
          }
        });
        
        // Check if we're receiving data
        const dataCheckInterval = setInterval(() => {
          if (receivedDataBytes > 0) {
            hasReceivedData = true;
            clearInterval(dataCheckInterval);
            setDebugInfo(prev => `${prev}\nConfirmed data flow! ✅`);
          }
        }, 1000);
        
        // Clear the interval after 10 seconds
        setTimeout(() => {
          clearInterval(dataCheckInterval);
          if (!hasReceivedData) {
            setDebugInfo(prev => `${prev}\nWARNING: No data received after 10s ⚠️`);
          }
        }, 10000);
        
        videoRef.current.addEventListener('loadeddata', () => {
          console.log('Video loaded data, playing...');
          setDebugInfo(prev => `${prev}\nVideo loaded, playing`);
          player.play().catch(e => {
            console.error('Error playing after load:', e);
          });
        });
        
        // Play immediately
        player.play().catch(e => {
          console.error('Error playing video initially:', e);
          setDebugInfo(prev => `${prev}\nPlay error: ${e.message}`);
        });
        
        flvPlayer.current = player;
        
        // Safety check - if nothing happens for 5 seconds, try setting up HLS
        setTimeout(() => {
          if (videoRef.current && videoRef.current.readyState === 0) {
            setDebugInfo(prev => `${prev}\nPlayer still not ready after 5s, trying alternative...`);
            tryAlternativePlayback();
          }
        }, 5000);
      } catch (error) {
        console.error('Error creating player:', error);
        setDebugInfo(prev => `${prev}\nPlayer creation error: ${error.message}`);
      }
    }).catch(err => {
      console.error('Failed to load flv.js:', err);
      setDebugInfo(prev => `${prev}\nFailed to load flv.js: ${err.message}`);
    });
  };

  // Add this new function to try different playback approaches
  const tryAlternativePlayback = () => {
    setDebugInfo(prev => `${prev}\n\n------ TRYING ALTERNATIVE PLAYBACK ------`);
    
    // Try direct video element source (for browsers with FLV support)
    try {
      if (videoRef.current) {
        // Destroy existing flv.js player if it exists
        destroyPlayer();
        
        // Try HLS instead
        const hlsUrl = `http://${localIp}:${httpPort}/live/${streamKey}.m3u8`;
        setDebugInfo(prev => `${prev}\nTrying HLS URL: ${hlsUrl}`);
        
        // Check if the browser supports HLS natively
        if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
          // For Safari/iOS which have native HLS support
          videoRef.current.src = hlsUrl;
          videoRef.current.addEventListener('canplay', () => {
            setDebugInfo(prev => `${prev}\nHLS loaded natively`);
          });
          videoRef.current.play();
        } else {
          // Use hls.js for other browsers
          import('hls.js').then(({ default: Hls }) => {
            if (Hls.isSupported()) {
              const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                manifestLoadingTimeOut: 10000,
                fragLoadingTimeOut: 10000,
                enableCEA708Captions: false
              });
              hls.loadSource(hlsUrl);
              hls.attachMedia(videoRef.current);
              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                setDebugInfo(prev => `${prev}\nHLS manifest parsed, playing`);
                videoRef.current.play();
              });
              hls.on(Hls.Events.ERROR, (event, data) => {
                setDebugInfo(prev => `${prev}\nHLS error: ${data.type} - ${data.details}`);
              });
            } else {
              setDebugInfo(prev => `${prev}\nNeither FLV nor HLS are supported in this browser`);
            }
          }).catch(err => {
            setDebugInfo(prev => `${prev}\nFailed to load hls.js: ${err.message}`);
          });
        }
      }
    } catch (e) {
      console.error('Error in alternative playback:', e);
      setDebugInfo(prev => `${prev}\nError trying alternative: ${e.message}`);
    }
  };
  
  // Add this function to manually test different URLs
  const testStreamUrl = () => {
    const flvUrl = `http://${localIp}:${httpPort}/live/${streamKey}.flv`;
    const hlsUrl = `http://${localIp}:${httpPort}/live/${streamKey}.m3u8`;
    
    setDebugInfo(`TESTING STREAM ACCESS:\n`);
    
    // Test FLV URL access
    fetch(flvUrl, { method: 'HEAD' })
      .then(response => {
        setDebugInfo(prev => `${prev}\nFLV URL (${flvUrl}): ${response.status} ${response.statusText}`);
        return response;
      })
      .catch(err => {
        setDebugInfo(prev => `${prev}\nFLV URL error: ${err.message}`);
      });
      
    // Test HLS URL access  
    fetch(hlsUrl, { method: 'HEAD' })
      .then(response => {
        setDebugInfo(prev => `${prev}\nHLS URL (${hlsUrl}): ${response.status} ${response.statusText}`);
        return response;
      })
      .catch(err => {
        setDebugInfo(prev => `${prev}\nHLS URL error: ${err.message}`);
      });
      
    // Test RTMP connectivity (indirect)
    setDebugInfo(prev => `${prev}\nRTMP URL: rtmp://${localIp}:${rtmpPort}/${streamKey} (can't test directly in browser)`);
  };

  // Destroy flv.js player
  const destroyPlayer = () => {
    if (flvPlayer.current) {
      console.log('Destroying player');
      setDebugInfo('Destroying player');
      
      try {
        flvPlayer.current.unload();
        flvPlayer.current.detachMediaElement();
        flvPlayer.current.destroy();
      } catch (e) {
        console.error('Error destroying player:', e);
      }
      
      flvPlayer.current = null;
    }
    
    // Remove event listeners from video element
    if (videoRef.current) {
      // Remove play event listener we added properly using the stored reference
      if (videoRef.current.jumpToLiveEdge) {
        videoRef.current.removeEventListener('play', videoRef.current.jumpToLiveEdge);
        delete videoRef.current.jumpToLiveEdge;
      }
      
      // Remove play/pause state listeners
      videoRef.current.removeEventListener('play', () => setIsPlaying(true));
      videoRef.current.removeEventListener('pause', () => setIsPlaying(false));
    }
  };

  const handleStartServer = async () => {
    setIsStarting(true);
    setStatusMessage(null);
    setDebugInfo('Starting RTMP server...');
    
    try {
      // Prepare custom configuration
      const customConfig = {
        rtmp: {
          port: rtmpPort,
          chunk_size: 60000,
          gop_cache: true,
          ping: 30,
          ping_timeout: 60
        },
        http: {
          port: httpPort,
          allow_origin: '*'
        }
      };
      
      const result = await window.api.rtmp.start(customConfig);
      if (result.success) {
        // Save server start time for later checks
        sessionStorage.setItem('rtmpServerStartTime', Date.now().toString());
        
        setServerStatus({
          running: true,
          rtmpUrl: result.rtmpUrl,
          httpUrl: result.httpUrl,
          config: customConfig
        });
        setStatusMessage({ type: 'success', text: 'RTMP server started successfully' });
        setDebugInfo(prev => `${prev}\nServer started: ${result.rtmpUrl}`);
        
        // Set up stream checking
        setupStreamCheck();
      } else {
        setStatusMessage({ type: 'error', text: `Failed to start RTMP server: ${result.message}` });
        setDebugInfo(prev => `${prev}\nServer start error: ${result.message}`);
      }
    } catch (error) {
      console.error('Error starting RTMP server:', error);
      setStatusMessage({ type: 'error', text: `Error starting RTMP server: ${error.message}` });
      setDebugInfo(prev => `${prev}\nStart error: ${error.message}`);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopServer = async () => {
    setIsStopping(true);
    setStatusMessage(null);
    setDebugInfo('Stopping RTMP server...');
    
    try {
      // Destroy player first
      destroyPlayer();
      
      // Clear interval
      if (checkStreamInterval) {
        clearInterval(checkStreamInterval);
        setCheckStreamInterval(null);
      }
      
      // Remove stored start time
      sessionStorage.removeItem('rtmpServerStartTime');
      
      const result = await window.api.rtmp.stop();
      if (result.success) {
        setServerStatus({ running: false });
        setIsStreaming(false);
        setStatusMessage({ type: 'success', text: 'RTMP server stopped successfully' });
        setDebugInfo(prev => `${prev}\nServer stopped successfully`);
      } else {
        setStatusMessage({ type: 'error', text: `Failed to stop RTMP server: ${result.message}` });
        setDebugInfo(prev => `${prev}\nStop error: ${result.message}`);
      }
    } catch (error) {
      console.error('Error stopping RTMP server:', error);
      setStatusMessage({ type: 'error', text: `Error stopping RTMP server: ${error.message}` });
      setDebugInfo(prev => `${prev}\nStop error: ${error.message}`);
    } finally {
      setIsStopping(false);
    }
  };

  const handleBack = () => {
    // Return to device setup page
    navigateTo('device-setup', { deviceId, packageName });
  };

  // Toggle play/pause since we removed controls
  const togglePlayPause = () => {
    if (!videoRef.current) return;
    
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Function to send the RTMP URL to Android device using ADB shell input text
  const sendRtmpUrlToDevice = async (deviceId) => {
    if (!deviceId) return;
    
    setIsSendingToDevice(true);
    setStatusMessage(null);
    
    const rtmpUrl = `/${localIp}:${rtmpPort}/live/${streamKey}`;
    
    try {
      // Execute ADB command to input text to the device - format must match preload.js
      await window.api.adb.executeCommand(deviceId, `shell input text rtmp://`);
      const result = await window.api.adb.executeCommand(deviceId, `shell input text "${rtmpUrl}"`);
      
      if (result.success) {
        setStatusMessage({
          type: 'success',
          text: `RTMP URL sent to device: ${deviceId}`
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: `Failed to send URL to device: ${result.error || 'Unknown error'}`
        });
      }
    } catch (error) {
      console.error('Error sending URL to device:', error);
      setStatusMessage({
        type: 'error',
        text: `Error: ${error.message}`
      });
    } finally {
      setIsSendingToDevice(false);
    }
  };

  return (
    <>
      <Head>
        <title>RTMP Streaming Setup | Echo Desktop</title>
        <meta name="description" content="RTMP Streaming Setup" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        {/* Add flv.js script */}
        <script async src="https://cdn.jsdelivr.net/npm/flv.js@1.6.2/dist/flv.min.js"></script>
        {/* Add HLS.js for better streaming support */}
        <script async src="https://cdn.jsdelivr.net/npm/hls.js@1.4.12/dist/hls.min.js"></script>
      </Head>
      <div className={styles.container}>
        <div className={styles.header}>
          <button 
            className={styles.backButton}
            onClick={handleBack}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back
          </button>
          <h1 className={styles.pageTitle}>RTMP Streaming Setup</h1>
        </div>

        <div className={styles.content}>
          <div className={styles.instructionsContainer}>
            <h2 className={styles.instructionsTitle}>
              {isStreaming ? 'Live Stream Preview' : 'RTMP Streaming'}
            </h2>

            <div className={styles.flexLayout}>
              {isStreaming && (
                <div className={styles.videoPreviewSection}>
                  <div className={styles.videoPreviewContainer} onClick={togglePlayPause}>
                    <video 
                      ref={videoRef} 
                      className={styles.videoPreview} 
                      autoPlay 
                      muted
                      playsInline
                    />
                    <div className={styles.liveIndicator}>LIVE</div>
                    {!isPlaying && (
                      <div className={styles.playOverlay}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="white">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className={styles.controlsSection}>
                <div className={styles.instructionsStep}>
                  <div className={styles.stepNumber}>1</div>
                  <div className={styles.stepContent}>
                    <h3>RTMP Server Configuration</h3>
                    
                    {!serverStatus.running ? (
                      <>
                        <p>Set up your RTMP server configuration below.</p>

                        <div className={styles.formField}>
                          <label htmlFor="rtmpPort">RTMP Port:</label>
                          <input
                            id="rtmpPort"
                            type="number"
                            value={rtmpPort}
                            onChange={(e) => setRtmpPort(parseInt(e.target.value))}
                            placeholder="1935"
                            className={styles.formInput}
                            disabled={serverStatus.running}
                          />
                        </div>

                        <div className={styles.formField}>
                          <label htmlFor="httpPort">HTTP Port:</label>
                          <input
                            id="httpPort"
                            type="number"
                            value={httpPort}
                            onChange={(e) => setHttpPort(parseInt(e.target.value))}
                            placeholder="8000"
                            className={styles.formInput}
                            disabled={serverStatus.running}
                          />
                        </div>

                        <div className={styles.formField}>
                          <label htmlFor="streamKey">Stream Key:</label>
                          <input
                            id="streamKey"
                            type="text"
                            value={streamKey}
                            onChange={(e) => setStreamKey(e.target.value)}
                            placeholder="live"
                            className={styles.formInput}
                            disabled={serverStatus.running}
                          />
                        </div>
                      </>
                    ) : (
                      <p>Your RTMP server is running. Use the options below to stream or view content.</p>
                    )}

                    {!serverStatus.running ? (
                      <button 
                        className={styles.actionButton}
                        onClick={handleStartServer}
                        disabled={isStarting}
                      >
                        {isStarting ? 'Starting Server...' : 'Start RTMP Server'}
                      </button>
                    ) : (
                      <button 
                        className={`${styles.actionButton} ${styles.stopButton}`}
                        onClick={handleStopServer}
                        disabled={isStopping}
                      >
                        {isStopping ? 'Stopping Server...' : 'Stop RTMP Server'}
                      </button>
                    )}

                    {statusMessage && (
                      <div className={`${styles.statusMessage} ${styles[statusMessage.type]}`}>
                        {statusMessage.text}
                      </div>
                    )}
                  </div>
                </div>

                {serverStatus.running && (
                  <div className={styles.instructionsStep}>
                    <div className={styles.stepNumber}>2</div>
                    <div className={styles.stepContent}>
                      <h3>Stream Options</h3>
                      
                      <div className={styles.streamOptions}>
                        <div className={styles.optionCard}>
                          <h4>Stream From Larix</h4>
                          <p>Use these settings in Larix:</p>

                            <div className={styles.connectionDetail}>
                              <span className={styles.connectionLabel}>RTMP URL:</span>
                              
                          </div>
                          <div>
                          <code className={styles.connectionValue}>
                                {`rtmp://${localIp}:${rtmpPort}/live/${streamKey}`}
                              </code>
                            </div>
                                                      {/* Add the ADB device selector and send button */}
                          {connectedDevices.length > 0 && (
                            <div className={styles.adbDeviceSection}>
                              <h5>Send to Android Device</h5>
                              <p>Select a device to send the RTMP URL via ADB:</p>
                              
                              <div className={styles.deviceSelect}>
                                {connectedDevices.map(device => (
                                  <button
                                    key={device.id}
                                    className={styles.deviceButton}
                                    onClick={() => sendRtmpUrlToDevice(device.id)}
                                    disabled={isSendingToDevice}
                                  >
                                    <span className={styles.deviceName}>
                                      {device.name || device.id}
                                    </span>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                      <path d="M3 20h18L12 4z"/>
                                    </svg>
                                  </button>
                                ))}
                              </div>
                              <p className={styles.deviceTip}>
                                Make sure text input field is focused on your Android device
                              </p>
                            </div>
                          )}

                          

                        </div>
                        
                        <div className={styles.optionCard}>
                          <h4>View Stream</h4>
                          <p>{isStreaming ? 'Stream is active' : 'No active stream detected'}</p>
                          <button 
                            className={styles.playButton}
                            onClick={handleForcePlay}
                          >
                            {isStreaming ? 'Reload Stream' : 'Force Play Stream'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
} 