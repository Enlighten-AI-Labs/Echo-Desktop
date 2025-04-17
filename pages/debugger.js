import { useRouter } from 'next/router';
import { useEffect, useState, useRef, useCallback } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import AnalyticsDebugger from '@/components/AnalyticsDebugger';
import LogcatAnalyticsDebugger from '@/components/LogcatAnalyticsDebugger';
import UnifiedAnalyticsDebugger from '@/components/UnifiedAnalyticsDebugger';
import styles from '@/styles/Debugger.module.css';
import LogEntry from '@/components/LogEntry';

// Dynamically import ReactFlow to avoid SSR issues
const ReactFlow = dynamic(
  () => import('@xyflow/react').then((mod) => mod.default),
  { ssr: false, loading: () => <div className={styles.flowLoading}>Loading Flow Chart...</div> }
);

// Also dynamically import the other components
const { MiniMap, Controls, Background, MarkerType } = dynamic(
  () => import('@xyflow/react'),
  { ssr: false }
);

import '@xyflow/react/dist/style.css';

// Helper function to beautify XML (copied from app-crawler.js)
function beautifyXml(xml) {
  if (!xml) return '';
  
  // Replace self-closing tags to make them more readable
  let formatted = xml.replace(/<([a-zA-Z0-9_.-]+)([^>]*)\/>/g, '<$1$2></$1>');
  
  // Create proper indentation
  let indent = '';
  let result = '';
  const lines = formatted.split(/>\s*</);
  
  if (lines.length) {
    // Add back the > and < characters
    result = lines[0];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if this is a closing tag
      if (line.match(/^\/\w/)) {
        indent = indent.substring(2);
      }
      
      result += '>\n' + indent + '<' + line;
      
      // Check if this is not a closing tag and not a self-closing tag
      if (!line.match(/^\//) && !line.match(/\/$/)) {
        indent += '  ';
      }
    }
  }
  
  return result.trim();
}

// Create a utility function for auto-collapse thresholds
const MIN_PANEL_WIDTH = 20; // Minimum percentage width for a panel before it should auto-collapse

export default function DebuggerPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [packageName, setPackageName] = useState('');
  const [activeTab, setActiveTab] = useState('unified'); // 'network' or 'logcat' or 'unified'
  const [splitRatio, setSplitRatio] = useState(0); // Start with 0 since left panel is collapsed
  const [isResizing, setIsResizing] = useState(false);
  const [startX, setStartX] = useState(0);
  const containerRef = useRef(null);
  const dividerRef = useRef(null);
  
  // New state variables for collapsible panels
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(true); // Start with App Crawler collapsed
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [previousSplitRatio, setPreviousSplitRatio] = useState(50); // Save previous split ratio when collapsing
  const [lastResizeTime, setLastResizeTime] = useState(0);
  const currentSplitRatio = useRef(0); // Use ref to track current ratio without re-renders
  
  // Track if we're in an animation transition
  const [isAnimating, setIsAnimating] = useState(false);

  // App Crawler State
  const [crawlStatus, setCrawlStatus] = useState('idle'); // idle, running, completed, error
  const [crawlProgress, setCrawlProgress] = useState(0);
  const [screens, setScreens] = useState([]);
  const [currentScreen, setCurrentScreen] = useState(null);
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);
  const logsRef = useRef([]); // Reference to maintain logs across renders
  const [showConfig, setShowConfig] = useState(true);
  const [viewType, setViewType] = useState('grid'); // 'grid', 'list', 'flow'
  const [flowNodes, setFlowNodes] = useState([]);
  const [flowEdges, setFlowEdges] = useState([]);
  const [flowReady, setFlowReady] = useState(false);
  const [showFlow, setShowFlow] = useState(false);
  const [showXmlPopup, setShowXmlPopup] = useState(false);
  
  const [crawlSettings, setCrawlSettings] = useState({
    maxScreens: 20,
    screenDelay: 1000, // ms between actions
    ignoreElements: ['android.widget.ImageView'], // Element types to ignore for interaction
    stayInApp: true,
    mode: 'random', // 'random', 'orderly', or 'ai'
    aiPrompt: '' // Prompt for AI-powered crawling
  });
  
  // New state variables for vertical split
  const [verticalSplitRatio, setVerticalSplitRatio] = useState(40); // Start with 40% for settings
  const [isVerticalResizing, setIsVerticalResizing] = useState(false);
  const [startY, setStartY] = useState(0);
  const leftPanelRef = useRef(null);
  
  // New state for AI prompt modal
  const [showAiPrompt, setShowAiPrompt] = useState(false);

  useEffect(() => {
    // Get query parameters when the page loads
    if (router.isReady) {
      const { deviceId, packageName, tab } = router.query;
      if (deviceId) setDeviceId(deviceId);
      if (packageName) setPackageName(packageName);
      if (tab === 'logcat' || tab === 'network' || tab === 'unified') setActiveTab(tab);
    }
  }, [router.isReady, router.query]);

  // Handle resize functionality
  const startResize = (e) => {
    setIsAnimating(false); // Turn off animations during manual resize
    setIsResizing(true);
    setStartX(e.clientX);
    // Initialize the current ratio
    currentSplitRatio.current = splitRatio;
  };

  const stopResize = () => {
    setIsResizing(false);
    
    // Update state with final value from ref
    setSplitRatio(currentSplitRatio.current);
    
    // Check if we should auto-collapse panels after resizing
    if (currentSplitRatio.current < MIN_PANEL_WIDTH) {
      // Left panel is too small, auto-collapse it
      setIsAnimating(true); // Enable animations for auto-collapse
      setPreviousSplitRatio(MIN_PANEL_WIDTH);
      setSplitRatio(0);
      setTimeout(() => {
        setLeftPanelCollapsed(true);
        setIsAnimating(false); // Disable animations after transition
      }, 50);
    } else if (currentSplitRatio.current > (100 - MIN_PANEL_WIDTH)) {
      // Right panel is too small, auto-collapse it
      setIsAnimating(true); // Enable animations for auto-collapse
      setPreviousSplitRatio(100 - MIN_PANEL_WIDTH);
      setSplitRatio(100);
      setTimeout(() => {
        setRightPanelCollapsed(true);
        setIsAnimating(false); // Disable animations after transition
      }, 50);
    }
  };

  // Throttled resize function - animations disabled during resize
  const resize = useCallback((e) => {
    if (isResizing && containerRef.current) {
      const now = Date.now();
      // Store value in ref for smoother tracking
      const containerWidth = containerRef.current.offsetWidth;
      currentSplitRatio.current = ((e.clientX / containerWidth) * 100);
      
      // Only update state every 16ms (approx 60fps) for smoother performance
      if (now - lastResizeTime > 16) {
        setSplitRatio(currentSplitRatio.current);
        setLastResizeTime(now);
      }
      
      // Make sure panels are expanded when resizing
      if (leftPanelCollapsed) {
        setLeftPanelCollapsed(false);
      }
      if (rightPanelCollapsed) {
        setRightPanelCollapsed(false);
      }
    }
  }, [isResizing, lastResizeTime, leftPanelCollapsed, rightPanelCollapsed]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResize);
    }
    
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResize);
    };
  }, [isResizing, resize, stopResize]);

  const handleBack = () => {
    router.push('/dashboard');
  };
  
  const handleViewLogs = () => {
    router.push('/mitmproxy-logs');
  };
  
  const handleSetupDevice = () => {
    const query = {};
    if (deviceId) query.deviceId = deviceId;
    if (packageName) query.packageName = packageName;
    query.tab = activeTab;
    router.push({
      pathname: '/device-setup',
      query
    });
  };

  const changeTab = (tab) => {
    setActiveTab(tab);
    
    // Update the URL to include the active tab
    const query = { ...router.query, tab };
    router.push({
      pathname: router.pathname,
      query
    }, undefined, { shallow: true });
  };

  // App Crawler Functions
  const handleSettingsChange = (setting, value) => {
    setCrawlSettings(prev => {
      const newSettings = {
        ...prev,
        [setting]: value
      };
      
      // If mode is changed to AI, show the prompt modal
      if (setting === 'mode' && value === 'ai') {
        setShowAiPrompt(true);
      }
      
      return newSettings;
    });
  };
  
  const handleAiPromptSave = (prompt) => {
    setCrawlSettings(prev => ({
      ...prev,
      aiPrompt: prompt
    }));
    setShowAiPrompt(false);
  };
  
  const handleAiPromptCancel = () => {
    // If no prompt is set, revert to random mode
    if (!crawlSettings.aiPrompt) {
      setCrawlSettings(prev => ({
        ...prev,
        mode: 'random'
      }));
    }
    setShowAiPrompt(false);
  };
  
  const toggleConfig = () => {
    setShowConfig(prev => !prev);
  };
  
  const startCrawl = async () => {
    if (!deviceId || !packageName) {
      alert('Please select a device and app first');
      return;
    }
    
    try {
      setCrawlStatus('running');
      setCrawlProgress(0);
      setScreens([]);
      setCurrentScreen(null);
      
      // Clear previous logs and add a starting log
      const startLog = {
        type: 'info',
        timestamp: Date.now(),
        message: `Starting crawler for ${packageName} on device ${deviceId}...`
      };
      logsRef.current = [startLog];
      setLogs([startLog]);
      
      setFlowNodes([]);
      setFlowEdges([]);
      setFlowReady(false);
      
      // Call the API to start crawling
      await window.api.crawler.startCrawling(deviceId, packageName, crawlSettings);
      
      // Add another log after crawling is initiated
      const initiatedLog = {
        type: 'info',
        timestamp: Date.now(),
        message: 'Crawler initiated. Waiting for first screen...'
      };
      logsRef.current = [...logsRef.current, initiatedLog];
      setLogs([...logsRef.current]);
    } catch (error) {
      console.error('Failed to start crawling:', error);
      setCrawlStatus('error');
      
      // Add error log
      const errorLog = {
        type: 'error',
        timestamp: Date.now(),
        message: `Failed to start crawling: ${error.message || 'Unknown error'}`
      };
      logsRef.current = [...logsRef.current, errorLog];
      setLogs([...logsRef.current]);
    }
  };
  
  const stopCrawl = async () => {
    try {
      // Add stopping log
      const stoppingLog = {
        type: 'warning',
        timestamp: Date.now(),
        message: 'Stopping crawler...'
      };
      logsRef.current = [...logsRef.current, stoppingLog];
      setLogs([...logsRef.current]);
      
      await window.api.crawler.stopCrawling();
      setCrawlStatus('completed');
      
      // Add stopped log
      const stoppedLog = {
        type: 'info',
        timestamp: Date.now(),
        message: 'Crawler stopped.'
      };
      logsRef.current = [...logsRef.current, stoppedLog];
      setLogs([...logsRef.current]);
    } catch (error) {
      console.error('Failed to stop crawling:', error);
      
      // Add error log
      const errorLog = {
        type: 'error',
        timestamp: Date.now(),
        message: `Failed to stop crawling: ${error.message || 'Unknown error'}`
      };
      logsRef.current = [...logsRef.current, errorLog];
      setLogs([...logsRef.current]);
    }
  };
  
  // Format timestamp to human-readable time
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Effect to update flow data whenever screens change
  useEffect(() => {
    if (screens.length > 0) {
      try {
        // Create nodes based on screens
        const nodes = screens.map((screen, index) => ({
          id: `screen-${index}`,
          data: { 
            label: `Screen ${index + 1}`,
            activity: screen.activityName.split('.').pop(),
            imageUrl: `data:image/png;base64,${screen.screenshot}`
          },
          position: { 
            x: 250 * (index % 3), 
            y: 200 * Math.floor(index / 3) 
          }
        }));
        
        // Create edges connecting sequential screens
        const edges = [];
        for (let i = 0; i < screens.length - 1; i++) {
          edges.push({
            id: `edge-${i}`,
            source: `screen-${i}`,
            target: `screen-${i + 1}`,
            style: { stroke: '#aaa' },
            type: 'smoothstep',
            label: `→`,
            animated: true
          });
        }
        
        setFlowNodes(nodes);
        setFlowEdges(edges);
        setFlowReady(true);
      } catch (error) {
        console.error('Error creating flow data:', error);
      }
    }
  }, [screens]);
  
  // Set up event listeners for crawl progress
  useEffect(() => {
    // Safe check for API availability
    if (typeof window === 'undefined' || !window.api || !window.api.crawler) {
      console.warn('Crawler API not available');
      return;
    }
    
    const handleProgress = (progress) => {
      setCrawlProgress(progress.percentage);
    };
    
    const handleNewScreen = (screen) => {
      setScreens(prev => [...prev, screen]);
      setCurrentScreen(screen);
      
      // Add a log entry when a new screen is captured
      const logEntry = {
        type: 'success',
        timestamp: Date.now(),
        message: `Captured screen: ${screen.activityName}`
      };
      logsRef.current = [...logsRef.current, logEntry];
      setLogs([...logsRef.current]);
    };
    
    const handleCrawlComplete = () => {
      setCrawlStatus('completed');
      setCrawlProgress(100);
      
      // Add a log entry when crawling completes
      const logEntry = {
        type: 'success',
        timestamp: Date.now(),
        message: 'Crawling completed.'
      };
      logsRef.current = [...logsRef.current, logEntry];
      setLogs([...logsRef.current]);
    };
    
    const handleCrawlError = (error) => {
      console.error('Crawl error:', error);
      setCrawlStatus('error');
      
      // Add a log entry when an error occurs
      const logEntry = {
        type: 'error',
        timestamp: Date.now(),
        message: `Error: ${error.message || 'Unknown error occurred'}`
      };
      logsRef.current = [...logsRef.current, logEntry];
      setLogs([...logsRef.current]);
    };
    
    const handleLog = (logEntry) => {
      // Ensure we're adding to the reference first, then updating the state
      logsRef.current = [...logsRef.current, logEntry];
      setLogs([...logsRef.current]);
    };
    
    // Safely subscribe to events with try/catch
    try {
      if (typeof window.api.crawler.onProgress === 'function')
        window.api.crawler.onProgress(handleProgress);
      
      if (typeof window.api.crawler.onNewScreen === 'function')
        window.api.crawler.onNewScreen(handleNewScreen);
      
      if (typeof window.api.crawler.onComplete === 'function')
        window.api.crawler.onComplete(handleCrawlComplete);
      
      if (typeof window.api.crawler.onError === 'function')
        window.api.crawler.onError(handleCrawlError);
      
      if (typeof window.api.crawler.onLog === 'function')
        window.api.crawler.onLog(handleLog);
    } catch (error) {
      console.error('Error setting up crawler event listeners:', error);
    }
    
    // Load any existing logs when component mounts
    const loadExistingLogs = async () => {
      try {
        if (typeof window.api.crawler.getLogs === 'function') {
          const existingLogs = await window.api.crawler.getLogs();
          if (existingLogs && existingLogs.length > 0) {
            logsRef.current = existingLogs;
            setLogs(existingLogs);
          } else {
            // Add an initial log entry
            const initialLog = {
              type: 'info',
              timestamp: Date.now(),
              message: 'Split Screen Debugger initialized. Ready to start crawling.'
            };
            logsRef.current = [initialLog];
            setLogs([initialLog]);
          }
        }
      } catch (error) {
        console.error('Failed to load existing logs:', error);
        // Still add an initial log even if loading fails
        const initialLog = {
          type: 'info',
          timestamp: Date.now(),
          message: 'Split Screen Debugger initialized. Ready to start crawling.'
        };
        logsRef.current = [initialLog];
        setLogs([initialLog]);
      }
    };
    
    loadExistingLogs();
    
    return () => {
      // Safely unsubscribe when component unmounts
      try {
        if (typeof window.api.crawler.removeAllListeners === 'function') {
          window.api.crawler.removeAllListeners();
        }
      } catch (error) {
        console.error('Error removing crawler event listeners:', error);
      }
    };
  }, []);
  
  // Custom node for ReactFlow
  const CustomNode = ({ data }) => {
    return (
      <div className={styles.flowNode}>
        <div className={styles.flowNodeHeader}>
          <div className={styles.flowNodeActivity}>{data.activity}</div>
          {data.label}
        </div>
        <div className={styles.flowNodeImage}>
          <img src={data.imageUrl} alt={data.activity} />
        </div>
      </div>
    );
  };
  
  // Prepare the nodeTypes object only when the Flow is about to be rendered
  const getNodeTypes = () => {
    return {
      default: CustomNode
    };
  };
  
  // Initialize ReactFlow when the Flow tab is selected
  useEffect(() => {
    if (viewType === 'flow') {
      setShowFlow(true);
    }
  }, [viewType]);
  
  // Toggle XML popup
  const toggleXmlPopup = () => {
    setShowXmlPopup(!showXmlPopup);
  };
  
  // Close popup if Escape key is pressed
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape' && showXmlPopup) {
        setShowXmlPopup(false);
      }
    };
    
    window.addEventListener('keydown', handleEscKey);
    return () => {
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [showXmlPopup]);
  
  // Prevent scrolling when popup is open
  useEffect(() => {
    if (showXmlPopup) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showXmlPopup]);

  // New functions to handle panel collapse/expand with better performance
  const toggleLeftPanel = () => {
    // Enable animation for collapse/expand operations
    setIsAnimating(true);
    
    if (leftPanelCollapsed) {
      // Expanding left panel - first show the panel
      setLeftPanelCollapsed(false);
      // Then set width in the next frame for animation
      requestAnimationFrame(() => {
        setSplitRatio(previousSplitRatio);
        
        // Disable animations after transition completes
        setTimeout(() => {
          setIsAnimating(false);
        }, 250); // slightly longer than the CSS transition
      });
      setRightPanelCollapsed(false);
    } else {
      // Collapsing left panel - first set width to 0
      setPreviousSplitRatio(splitRatio);
      setSplitRatio(0);
      // Use requestAnimationFrame instead of setTimeout for better performance
      requestAnimationFrame(() => {
        // Add a small delay to let animation finish 
        setTimeout(() => {
          setLeftPanelCollapsed(true);
          setIsAnimating(false); // Disable animations after transition
        }, 200);
      });
      setRightPanelCollapsed(false);
    }
  };

  const toggleRightPanel = () => {
    // Enable animation for collapse/expand operations
    setIsAnimating(true);
    
    if (rightPanelCollapsed) {
      // Expanding right panel - first show the panel
      setRightPanelCollapsed(false);
      // Then set width in the next frame for animation
      requestAnimationFrame(() => {
        setSplitRatio(previousSplitRatio);
        
        // Disable animations after transition completes
        setTimeout(() => {
          setIsAnimating(false);
        }, 250); // slightly longer than the CSS transition
      });
      setLeftPanelCollapsed(false);
    } else {
      // Collapsing right panel - first set width to 100
      setPreviousSplitRatio(splitRatio);
      setSplitRatio(100);
      // Use requestAnimationFrame instead of setTimeout for better performance
      requestAnimationFrame(() => {
        // Add a small delay to let animation finish
        setTimeout(() => {
          setRightPanelCollapsed(true);
          setIsAnimating(false); // Disable animations after transition
        }, 200);
      });
      setLeftPanelCollapsed(false);
    }
  };

  // Scroll to bottom of logs when new logs are added
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Auto-collapse settings when crawl starts
  useEffect(() => {
    if (crawlStatus === 'running') {
      setLeftPanelCollapsed(false);
      setRightPanelCollapsed(false);
      setSplitRatio(50);
    }
  }, [crawlStatus]);

  // Add vertical resize handlers
  const startVerticalResize = (e) => {
    setIsVerticalResizing(true);
    setStartY(e.clientY);
  };

  const stopVerticalResize = () => {
    setIsVerticalResizing(false);
  };

  const verticalResize = useCallback((e) => {
    if (isVerticalResizing && leftPanelRef.current) {
      const containerHeight = leftPanelRef.current.offsetHeight;
      const newRatio = ((e.clientY / containerHeight) * 100);
      setVerticalSplitRatio(Math.min(Math.max(newRatio, 20), 80)); // Keep ratio between 20% and 80%
    }
  }, [isVerticalResizing]);

  // Add vertical resize effect
  useEffect(() => {
    if (isVerticalResizing) {
      window.addEventListener('mousemove', verticalResize);
      window.addEventListener('mouseup', stopVerticalResize);
    }
    
    return () => {
      window.removeEventListener('mousemove', verticalResize);
      window.removeEventListener('mouseup', stopVerticalResize);
    };
  }, [isVerticalResizing, verticalResize]);

  return (
    <>
      <Head>
        <title>Debugger | Echo Desktop</title>
        <meta name="description" content="Echo Desktop Debugger" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button 
              className={styles.backButton}
              onClick={handleBack}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Back to Dashboard
            </button>
            <h1 className={styles.pageTitle}>App Debugger & Crawler</h1>
          </div>
          <div className={styles.headerButtons}>
            <button 
              className={styles.viewLogsButton}
              onClick={handleSetupDevice}
            >
              Setup Device
            </button>
            <button 
              className={styles.viewLogsButton}
              onClick={handleViewLogs}
            >
              View Logs
            </button>
          </div>
        </div>
        
        <div ref={containerRef} className={styles.splitContainer}>
          {/* App Crawler Panel */}
          <div 
            className={`${styles.panel} ${isAnimating ? styles.animatedPanel : ''}`} 
            style={{ 
              width: `${splitRatio}%`,
              display: leftPanelCollapsed ? 'none' : 'flex',
              opacity: leftPanelCollapsed ? 0 : 1,
              marginRight: rightPanelCollapsed ? '20px' : '0px'
            }}>
            <div className={styles.panelHeader}>
              <h2>App Crawler</h2>
              <div className={styles.headerControls}>
                <div className={styles.crawlControls}>
                  {crawlStatus === 'idle' || crawlStatus === 'completed' || crawlStatus === 'error' ? (
                    <button 
                      className={styles.startButton}
                      onClick={startCrawl}
                      disabled={!deviceId || !packageName}
                    >
                      Start Crawling
                    </button>
                  ) : (
                    <button 
                      className={styles.stopButton}
                      onClick={stopCrawl}
                    >
                      Stop Crawling
                    </button>
                  )}
                </div>
                <button
                  className={styles.collapseButton}
                  onClick={toggleLeftPanel}
                  title={leftPanelCollapsed ? "Expand panel" : "Collapse panel"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d={leftPanelCollapsed ? "M13 5l7 7-7 7M5 5l7 7-7 7" : "M11 5l-7 7 7 7M19 5l-7 7 7 7"} />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className={styles.appCrawlerContent}>
              <div className={styles.leftPanel}>
                <div className={`${styles.settingsPanel} ${showConfig ? '' : styles.settingsPanelCollapsed}`}>
                  <div className={styles.settingsHeader}>
                    <h2>Crawler Settings</h2>
                    <button 
                      className={styles.toggleButton}
                      onClick={toggleConfig}
                    >
                      {showConfig ? 'Hide' : 'Show'} Settings
                    </button>
                  </div>
                  
                  {showConfig && (
                    <>
                      <div className={styles.settingItem}>
                        <label>Max Screens to Capture</label>
                        <input 
                          type="number" 
                          value={crawlSettings.maxScreens}
                          onChange={(e) => handleSettingsChange('maxScreens', parseInt(e.target.value))}
                          min="1"
                          max="100"
                        />
                      </div>
                      
                      <div className={styles.settingItem}>
                        <label>Delay Between Actions (ms)</label>
                        <input 
                          type="number" 
                          value={crawlSettings.screenDelay}
                          onChange={(e) => handleSettingsChange('screenDelay', parseInt(e.target.value))}
                          min="500"
                          max="5000"
                          step="100"
                        />
                      </div>
                      
                      <div className={styles.settingItem}>
                        <label>
                          <input 
                            type="checkbox" 
                            checked={crawlSettings.stayInApp}
                            onChange={(e) => handleSettingsChange('stayInApp', e.target.checked)}
                          />
                          Stay within app (ignore system UI)
                        </label>
                      </div>
                      
                      <div className={styles.settingItem}>
                        <label>Mode</label>
                        <select
                          value={crawlSettings.mode}
                          onChange={(e) => handleSettingsChange('mode', e.target.value)}
                        >
                          <option value="random">Random</option>
                          <option value="orderly">Orderly</option>
                          <option value="ai">AI</option>
                        </select>
                      </div>
                      
                      <div className={styles.settingItem}>
                        <label>AI Prompt</label>
                        <input 
                          type="text" 
                          value={crawlSettings.aiPrompt}
                          onChange={(e) => handleSettingsChange('aiPrompt', e.target.value)}
                        />
                      </div>
                      
                      <div className={styles.deviceInfo}>
                        <p><strong>Device ID:</strong> {deviceId || 'Not selected'}</p>
                        <p><strong>Package Name:</strong> {packageName || 'Not selected'}</p>
                      </div>
                    </>
                  )}
                </div>
                
                <div className={styles.logsPanel}>
                  <div className={styles.logsHeader}>
                    <h2>Crawler Logs</h2>
                    <button 
                      className={styles.clearLogsButton}
                      onClick={() => {
                        setLogs([]);
                        logsRef.current = [];
                      }}
                    >
                      Clear Logs
                    </button>
                  </div>
                  
                  <div className={styles.logsContainer}>
                    {logs.length > 0 ? (
                      <>
                        {logs.map((log, index) => (
                          <LogEntry key={`${log.timestamp}-${index}`} log={log} />
                        ))}
                        <div ref={logsEndRef} className={styles.logsEndRef} />
                      </>
                    ) : (
                      <div className={styles.emptyLogs}>No logs yet</div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className={styles.rightPanel}>
                {crawlStatus === 'running' && (
                  <div className={styles.progressBar}>
                    <div 
                      className={styles.progressFill}
                      style={{ width: `${crawlProgress}%` }}
                    />
                    <span>{crawlProgress}% complete</span>
                  </div>
                )}
                
                {screens.length > 0 && (
                  <div className={styles.viewToggle}>
                    <button
                      className={`${styles.viewToggleButton} ${viewType === 'flow' ? styles.activeView : ''}`}
                      onClick={() => setViewType('flow')}
                      title="Flow Chart View"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <path d="M10 7h4M17 8v8M7 17h7" />
                      </svg>
                      Flow
                    </button>
                    <button
                      className={`${styles.viewToggleButton} ${viewType === 'grid' ? styles.activeView : ''}`}
                      onClick={() => setViewType('grid')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                      </svg>
                      Grid
                    </button>
                    <button
                      className={`${styles.viewToggleButton} ${viewType === 'list' ? styles.activeView : ''}`}
                      onClick={() => setViewType('list')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" />
                        <line x1="3" y1="12" x2="3.01" y2="12" />
                        <line x1="3" y1="18" x2="3.01" y2="18" />
                      </svg>
                      List
                    </button>
                  </div>
                )}
                
                {screens.length > 0 ? (
                  <>
                    {viewType === 'flow' && showFlow && flowReady ? (
                      <div className={styles.flowView}>
                        <ReactFlow
                          nodes={flowNodes}
                          edges={flowEdges}
                          nodeTypes={getNodeTypes()}
                          fitView
                        >
                          <Controls />
                          <Background color="#aaa" gap={16} />
                        </ReactFlow>
                      </div>
                    ) : viewType === 'grid' ? (
                      <div className={styles.gridView}>
                        {screens.map((screen, index) => (
                          <div 
                            key={index}
                            className={`${styles.gridItem} ${currentScreen === screen ? styles.activeGridItem : ''}`}
                            onClick={() => setCurrentScreen(screen)}
                          >
                            <div className={styles.gridImage}>
                              <img 
                                src={`data:image/png;base64,${screen.screenshot}`}
                                alt={`Screenshot of ${screen.activityName}`}
                              />
                            </div>
                            <div className={styles.gridInfo}>
                              <span>Screen {index + 1}</span>
                              <span>{screen.activityName.split('.').pop()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.listContainer}>
                        <div className={styles.screenList}>
                          {screens.map((screen, index) => (
                            <div 
                              key={index}
                              className={`${styles.screenItem} ${currentScreen === screen ? styles.activeScreen : ''}`}
                              onClick={() => setCurrentScreen(screen)}
                            >
                              <span>Screen {index + 1}</span>
                              <span>{screen.activityName.split('.').pop()}</span>
                            </div>
                          ))}
                        </div>
                        
                        <div className={styles.screenPreview}>
                          {currentScreen && (
                            <>
                              <div className={styles.screenImage}>
                                <img 
                                  src={`data:image/png;base64,${currentScreen.screenshot}`}
                                  alt={`Screenshot of ${currentScreen.activityName}`}
                                />
                              </div>
                              
                              <div className={styles.screenDetails}>
                                <h3>Screen Details</h3>
                                <p><strong>Activity:</strong> {currentScreen.activityName}</p>
                                <p><strong>Elements:</strong> {currentScreen.elementCount}</p>
                                <p><strong>Clickable:</strong> {currentScreen.clickableCount}</p>
                                
                                {currentScreen.xml && (
                                  <div className={styles.xmlViewer}>
                                    <h4>
                                      UI Structure (XML)
                                      <button 
                                        className={styles.expandButton}
                                        onClick={toggleXmlPopup}
                                        title="Expand XML View"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                                        </svg>
                                      </button>
                                    </h4>
                                    <div className={styles.xmlContent}>
                                      <pre>{beautifyXml(currentScreen.xml).substring(0, 2000)}...</pre>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    {crawlStatus === 'idle' && (
                      <p>Configure settings and click 'Start Crawling' to begin</p>
                    )}
                    {crawlStatus === 'running' && (
                      <p>Crawling in progress... waiting for first screen</p>
                    )}
                    {crawlStatus === 'error' && (
                      <p>An error occurred during crawling. Please check console for details.</p>
                    )}
                    {crawlStatus === 'completed' && screens.length === 0 && (
                      <p>Crawl completed but no screens were captured.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Resizable Divider - Only show when neither panel is collapsed */}
          {!leftPanelCollapsed && !rightPanelCollapsed && (
            <div 
              ref={dividerRef}
              className={styles.divider}
              onMouseDown={startResize}
            >
              <div className={styles.dividerHandle}></div>
            </div>
          )}
          
          {/* Analytics Debugger Panel */}
          <div 
            className={`${styles.panel} ${isAnimating ? styles.animatedPanel : ''}`} 
            style={{ 
              width: `${rightPanelCollapsed ? 0 : (leftPanelCollapsed ? 100 : 100 - splitRatio)}%`,
              display: rightPanelCollapsed ? 'none' : 'flex',
              opacity: rightPanelCollapsed ? 0 : 1,
              marginLeft: leftPanelCollapsed ? '20px' : '0px'
            }}>
            <div className={styles.panelHeader}>
              <h2>Analytics Debugger</h2>
              <div className={styles.headerControls}>
                <div className={styles.tabs}>
                  <button 
                    className={`${styles.tabButton} ${activeTab === 'unified' ? styles.activeTab : ''}`}
                    onClick={() => changeTab('unified')}
                  >
                    Unified Debugger
                  </button>
                  <button 
                    className={`${styles.tabButton} ${activeTab === 'network' ? styles.activeTab : ''}`}
                    onClick={() => changeTab('network')}
                  >
                    Network Capture
                  </button>
                  <button 
                    className={`${styles.tabButton} ${activeTab === 'logcat' ? styles.activeTab : ''}`}
                    onClick={() => changeTab('logcat')}
                  >
                    Logcat Capture
                  </button>
                  
                </div>
                <button
                  className={styles.collapseButton}
                  onClick={toggleRightPanel}
                  title={rightPanelCollapsed ? "Expand panel" : "Collapse panel"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d={rightPanelCollapsed ? "M5 5l7 7-7 7M13 5l7 7-7 7" : "M19 5l-7 7 7 7M11 5l-7 7 7 7"} />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className={styles.analyticsDebuggerContent}>
              {activeTab === 'network' ? (
                <AnalyticsDebugger
                  deviceId={deviceId}
                  packageName={packageName}
                  show={true}
                />
              ) : activeTab === 'logcat' ? (
                <LogcatAnalyticsDebugger
                  deviceId={deviceId}
                  packageName={packageName}
                  show={true}
                />
              ) : (
                <UnifiedAnalyticsDebugger
                  deviceId={deviceId}
                  packageName={packageName}
                  show={true}
                />
              )}
            </div>
          </div>
          
          {/* Panel expand buttons that appear when panels are collapsed */}
          {leftPanelCollapsed && (
            <div className={styles.leftExpandButtonContainer} onClick={toggleLeftPanel}>
              <button className={styles.expandPanelButton} title="Expand App Crawler panel">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 5l7 7-7 7M13 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
          
          {rightPanelCollapsed && (
            <div className={styles.rightExpandButtonContainer} onClick={toggleRightPanel}>
              <button className={styles.expandPanelButton} title="Expand Analytics Debugger panel">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 5l-7 7 7 7M19 5l-7 7 7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* XML Popup */}
      {showXmlPopup && currentScreen && currentScreen.xml && (
        <div className={styles.xmlPopupOverlay} onClick={toggleXmlPopup}>
          <div className={styles.xmlPopup} onClick={e => e.stopPropagation()}>
            <div className={styles.xmlPopupHeader}>
              <h3>UI Structure XML</h3>
              <span className={styles.xmlPopupInfo}>
                {currentScreen.activityName}
              </span>
              <button 
                className={styles.xmlPopupClose}
                onClick={toggleXmlPopup}
                title="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className={styles.xmlPopupContent}>
              <pre>{beautifyXml(currentScreen.xml)}</pre>
            </div>
          </div>
        </div>
      )}
      
      {/* AI Prompt Modal */}
      {showAiPrompt && (
        <div className={styles.aiPromptModal} onClick={() => handleAiPromptCancel()}>
          <div className={styles.aiPromptContent} onClick={e => e.stopPropagation()}>
            <div className={styles.aiPromptHeader}>
              <h3>AI-Powered Crawling</h3>
              <button 
                className={styles.aiPromptClose}
                onClick={() => handleAiPromptCancel()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <p>Enter a prompt to guide the AI in exploring your app. For example:</p>
            <ul>
              <li>"Focus on testing the checkout flow"</li>
              <li>"Explore user authentication features"</li>
              <li>"Test all CRUD operations in the app"</li>
            </ul>
            <textarea
              className={styles.aiPromptTextarea}
              value={crawlSettings.aiPrompt}
              onChange={(e) => handleSettingsChange('aiPrompt', e.target.value)}
              placeholder="Enter your instructions for the AI..."
            />
            <div className={styles.aiPromptButtons}>
              <button 
                className={`${styles.aiPromptButton} ${styles.cancel}`}
                onClick={() => handleAiPromptCancel()}
              >
                Cancel
              </button>
              <button 
                className={`${styles.aiPromptButton} ${styles.save}`}
                onClick={() => handleAiPromptSave(crawlSettings.aiPrompt)}
                disabled={!crawlSettings.aiPrompt.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 