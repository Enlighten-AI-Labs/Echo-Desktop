import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import styles from '@/styles/AppCrawler.module.css';
import dynamic from 'next/dynamic';

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

// Helper function to beautify XML
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

export default function AppCrawlerPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [packageName, setPackageName] = useState('');
  const [crawlStatus, setCrawlStatus] = useState('idle'); // idle, running, completed, error
  const [crawlProgress, setCrawlProgress] = useState(0);
  const [screens, setScreens] = useState([]);
  const [currentScreen, setCurrentScreen] = useState(null);
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);
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
    stayInApp: true // New setting to ensure crawler stays within the app
  });
  
  useEffect(() => {
    // Get query parameters when the page loads
    if (router.isReady) {
      const { deviceId, packageName } = router.query;
      if (deviceId) setDeviceId(deviceId);
      if (packageName) setPackageName(packageName);
    }
  }, [router.isReady, router.query]);
  
  // Scroll to bottom of logs when new logs are added
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);
  
  // Auto-collapse settings when crawl starts
  useEffect(() => {
    if (crawlStatus === 'running') {
      setShowConfig(false);
    }
  }, [crawlStatus]);
  
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
  
  const handleBack = () => {
    router.push('/analytics-debugger');
  };
  
  const handleDeviceSetup = () => {
    const query = {};
    if (deviceId) query.deviceId = deviceId;
    if (packageName) query.packageName = packageName;
    router.push({
      pathname: '/device-setup',
      query
    });
  };

  const handleSplitScreenView = () => {
    const query = {};
    if (deviceId) query.deviceId = deviceId;
    if (packageName) query.packageName = packageName;
    router.push({
      pathname: '/debugger',
      query
    });
  };

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
      setLogs([]);
      setFlowNodes([]);
      setFlowEdges([]);
      setFlowReady(false);
      
      // Call the API to start crawling
      await window.api.crawler.startCrawling(deviceId, packageName, crawlSettings);
      
      // The actual crawling will be handled by the main process
      // which will emit progress events that we'll listen for
    } catch (error) {
      console.error('Failed to start crawling:', error);
      setCrawlStatus('error');
    }
  };
  
  const stopCrawl = async () => {
    try {
      await window.api.crawler.stopCrawling();
      setCrawlStatus('completed');
    } catch (error) {
      console.error('Failed to stop crawling:', error);
    }
  };
  
  // Format timestamp to human-readable time
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  
  // Set up event listeners for crawl progress
  useEffect(() => {
    if (!window.api?.crawler) return;
    
    const handleProgress = (progress) => {
      setCrawlProgress(progress.percentage);
    };
    
    const handleNewScreen = (screen) => {
      setScreens(prev => [...prev, screen]);
      setCurrentScreen(screen);
    };
    
    const handleCrawlComplete = () => {
      setCrawlStatus('completed');
      setCrawlProgress(100);
    };
    
    const handleCrawlError = (error) => {
      console.error('Crawl error:', error);
      setCrawlStatus('error');
    };
    
    const handleLog = (logEntry) => {
      setLogs(prev => [...prev, logEntry]);
    };
    
    // Subscribe to events
    window.api.crawler.onProgress(handleProgress);
    window.api.crawler.onNewScreen(handleNewScreen);
    window.api.crawler.onComplete(handleCrawlComplete);
    window.api.crawler.onError(handleCrawlError);
    window.api.crawler.onLog(handleLog);
    
    // Load any existing logs when component mounts
    const loadExistingLogs = async () => {
      try {
        const existingLogs = await window.api.crawler.getLogs();
        if (existingLogs && existingLogs.length > 0) {
          setLogs(existingLogs);
        }
      } catch (error) {
        console.error('Error loading existing logs:', error);
      }
    };
    
    loadExistingLogs();
    
    // Cleanup
    return () => {
      window.api.crawler.removeAllListeners();
    };
  }, []);

  // Custom node component for React Flow
  const CustomNode = ({ data }) => {
    return (
      <div className={styles.flowNode}>
        <div className={styles.flowNodeHeader}>{data.label}</div>
        <div className={styles.flowNodeActivity}>{data.activity}</div>
        {data.imageUrl && (
          <div className={styles.flowNodeImage}>
            <img src={data.imageUrl} alt={data.label} width="150" />
          </div>
        )}
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
        <title>App Crawler | Echo Desktop</title>
        <meta name="description" content="Echo Desktop App Crawler" />
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
              Back to Analytics Debugger
            </button>
            <h1 className={styles.pageTitle}>App Crawler</h1>
          </div>
          <div className={styles.headerButtons}>
            <button 
              className={styles.setupButton}
              onClick={handleSplitScreenView}
            >
              Split Screen View
            </button>
            <button 
              className={styles.setupButton}
              onClick={handleDeviceSetup}
            >
              Setup Device
            </button>
          </div>
        </div>
        
        <div className={styles.mainContent}>
          <div className={`${styles.leftPanel} ${crawlStatus !== 'idle' ? styles.leftPanelNarrow : ''}`}>
            {(crawlStatus !== 'idle' || showConfig) && (
              <div className={`${styles.settingsPanel} ${crawlStatus !== 'idle' ? styles.settingsPanelCollapsed : ''}`}>
                <div className={styles.settingsHeader}>
                  <h2>Crawl Settings</h2>
                  {crawlStatus !== 'idle' && (
                    <button 
                      onClick={toggleConfig} 
                      className={styles.toggleButton}
                    >
                      {showConfig ? 'Hide' : 'Show'}
                    </button>
                  )}
                </div>
                
                {showConfig && (
                  <>
                    <div className={styles.settingItem}>
                      <label htmlFor="maxScreens">Maximum Screens</label>
                      <input 
                        type="number" 
                        id="maxScreens"
                        value={crawlSettings.maxScreens}
                        onChange={(e) => handleSettingsChange('maxScreens', parseInt(e.target.value))}
                        disabled={crawlStatus === 'running'}
                        min="1"
                        max="100"
                      />
                    </div>
                    
                    <div className={styles.settingItem}>
                      <label htmlFor="screenDelay">Delay Between Actions (ms)</label>
                      <input 
                        type="number" 
                        id="screenDelay"
                        value={crawlSettings.screenDelay}
                        onChange={(e) => handleSettingsChange('screenDelay', parseInt(e.target.value))}
                        disabled={crawlStatus === 'running'}
                        min="500"
                        max="5000"
                        step="100"
                      />
                    </div>
                    
                    <div className={styles.settingItem}>
                      <label className={styles.checkboxLabel}>
                        <input 
                          type="checkbox"
                          checked={crawlSettings.stayInApp}
                          onChange={(e) => handleSettingsChange('stayInApp', e.target.checked)}
                          disabled={crawlStatus === 'running'}
                        />
                        Stay within app package
                      </label>
                    </div>
                    
                    {deviceId && packageName ? (
                      <div className={styles.deviceInfo}>
                        <p><strong>Device ID:</strong> {deviceId}</p>
                        <p><strong>Package Name:</strong> {packageName}</p>
                      </div>
                    ) : (
                      <div className={styles.warning}>
                        <p>Please select a device and app first</p>
                        <button onClick={handleDeviceSetup}>Setup Device</button>
                      </div>
                    )}
                  </>
                )}
                
                <div className={styles.actionButtons}>
                  {crawlStatus !== 'running' ? (
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
            )}
            
            {crawlStatus !== 'idle' && (
              <div className={styles.logsPanel}>
                <div className={styles.logsHeader}>
                  <h2>Crawler Logs</h2>
                  {logs.length > 0 && (
                    <button
                      onClick={() => setLogs([])}
                      className={styles.clearLogsButton}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className={styles.logsContainer}>
                  {logs.length > 0 ? (
                    logs.map((log, index) => (
                      <div 
                        key={index} 
                        className={`${styles.logEntry} ${styles[log.type]}`}
                      >
                        <span className={styles.logTime}>{formatTime(log.timestamp)}</span>
                        <span className={styles.logMessage}>{log.message}</span>
                      </div>
                    ))
                  ) : (
                    <div className={styles.emptyLogs}>
                      No logs yet. Start crawling to see logs.
                    </div>
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>
            )}
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
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                  List
                </button>
              </div>
            )}
            
            <div className={styles.screensContainer}>
              {screens.length > 0 ? (
                <>
                  {viewType === 'flow' ? (
                    <div className={styles.flowView}>
                      {showFlow && flowReady ? (
                        <div style={{ width: '100%', height: '600px' }}>
                          {typeof ReactFlow !== 'undefined' && (
                            <ReactFlow
                              nodes={flowNodes}
                              edges={flowEdges}
                              nodeTypes={getNodeTypes()}
                              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                              style={{ background: '#1a1a1a' }}
                              fitView
                            >
                              <div>
                                {typeof Background !== 'undefined' && <Background color="#333" gap={16} size={1} />}
                                {typeof Controls !== 'undefined' && <Controls style={{ bottom: 10, right: 10 }} />}
                                {typeof MiniMap !== 'undefined' && (
                                  <MiniMap 
                                    nodeStrokeWidth={3}
                                    nodeColor="#666" 
                                    nodeBorderRadius={2}
                                    style={{ background: '#262626', border: '1px solid #333' }}
                                  />
                                )}
                              </div>
                            </ReactFlow>
                          )}
                        </div>
                      ) : (
                        <div className={styles.flowLoading}>
                          <p>Preparing flow chart visualization...</p>
                        </div>
                      )}
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
                    <>
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
                    </>
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