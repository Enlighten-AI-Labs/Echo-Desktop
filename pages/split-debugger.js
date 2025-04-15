import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import AnalyticsDebugger from '@/components/AnalyticsDebugger';
import LogcatAnalyticsDebugger from '@/components/LogcatAnalyticsDebugger';
import styles from '@/styles/SplitDebugger.module.css';

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

export default function SplitDebuggerPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [packageName, setPackageName] = useState('');
  const [activeTab, setActiveTab] = useState('network'); // 'network' or 'logcat'
  const [splitRatio, setSplitRatio] = useState(50); // 50% for each side
  const [isResizing, setIsResizing] = useState(false);
  const [startX, setStartX] = useState(0);
  const containerRef = useRef(null);
  const dividerRef = useRef(null);

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
    stayInApp: true
  });
  
  useEffect(() => {
    // Get query parameters when the page loads
    if (router.isReady) {
      const { deviceId, packageName, tab } = router.query;
      if (deviceId) setDeviceId(deviceId);
      if (packageName) setPackageName(packageName);
      if (tab === 'logcat' || tab === 'network') setActiveTab(tab);
    }
  }, [router.isReady, router.query]);

  // Handle resize functionality
  const startResize = (e) => {
    setIsResizing(true);
    setStartX(e.clientX);
  };

  const stopResize = () => {
    setIsResizing(false);
  };

  const resize = (e) => {
    if (isResizing && containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const newSplitRatio = ((e.clientX / containerWidth) * 100);
      
      // Limit the split ratio to ensure both panels remain visible
      if (newSplitRatio >= 20 && newSplitRatio <= 80) {
        setSplitRatio(newSplitRatio);
      }
    }
  };

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
    setCrawlSettings(prev => ({
      ...prev,
      [setting]: value
    }));
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

  return (
    <>
      <Head>
        <title>Split Screen Debugger | Echo Desktop</title>
        <meta name="description" content="Echo Desktop Split Screen Debugger" />
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
            <h1 className={styles.pageTitle}>Split Screen Debugger</h1>
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
          <div className={styles.panel} style={{ width: `${splitRatio}%` }}>
            <div className={styles.panelHeader}>
              <h2>App Crawler</h2>
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
                      onClick={() => setLogs([])}
                    >
                      Clear Logs
                    </button>
                  </div>
                  
                  <div className={styles.logsContainer}>
                    {logs.length > 0 ? (
                      logs.map((log, index) => (
                        <div key={index} className={`${styles.logEntry} ${styles[log.type] || styles.info}`}>
                          <span className={styles.logTime}>{formatTime(log.timestamp)}</span>
                          <span className={styles.logMessage}>{log.message}</span>
                        </div>
                      ))
                    ) : (
                      <div className={styles.emptyLogs}>No logs yet</div>
                    )}
                    <div ref={logsEndRef} />
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
          
          {/* Resizable Divider */}
          <div 
            ref={dividerRef}
            className={styles.divider}
            onMouseDown={startResize}
          >
            <div className={styles.dividerHandle}></div>
          </div>
          
          {/* Analytics Debugger Panel */}
          <div className={styles.panel} style={{ width: `${100 - splitRatio}%` }}>
            <div className={styles.panelHeader}>
              <h2>Analytics Debugger</h2>
              <div className={styles.tabs}>
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
            </div>
            
            <div className={styles.analyticsDebuggerContent}>
              {activeTab === 'network' ? (
                <AnalyticsDebugger
                  deviceId={deviceId}
                  packageName={packageName}
                  show={true}
                />
              ) : (
                <LogcatAnalyticsDebugger
                  deviceId={deviceId}
                  packageName={packageName}
                  show={true}
                />
              )}
            </div>
          </div>
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
    </>
  );
} 