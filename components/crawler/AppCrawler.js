import { useEffect, useState, useRef, useCallback } from 'react';
import styles from '@/styles/pages/debugger.module.css';
import LogEntry from '@/components/common/LogEntry';
import { AiPromptModal } from '@/components/crawler';
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

// Add a new AIProgressPanel component
const AIProgressPanel = ({ aiAnalysis }) => {
  if (!aiAnalysis || !aiAnalysis.timestamp) {
    return (
      <div className={styles.aiProgressPanel}>
        <div className={styles.aiProgressHeader}>
          <h3>AI Analysis</h3>
        </div>
        <div className={styles.aiProgressEmpty}>
          Waiting for AI analysis...
        </div>
      </div>
    );
  }
  
  const { progressSummary, nextSteps, topElements } = aiAnalysis;
  
  return (
    <div className={styles.aiProgressPanel}>
      <div className={styles.aiProgressHeader}>
        <h3>AI Analysis</h3>
        <span className={styles.aiTimestamp}>
          {new Date(aiAnalysis.timestamp).toLocaleTimeString()}
        </span>
      </div>
      
      {progressSummary && (
        <div className={styles.progressSection}>
          <h4>Progress: {progressSummary.type}</h4>
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill}
              style={{ width: `${progressSummary.progressPercent}%` }}
            />
            <span>
              Step {progressSummary.currentStep} of {progressSummary.totalSteps} 
              ({progressSummary.progressPercent}%)
            </span>
          </div>
        </div>
      )}
      
      {nextSteps && nextSteps.length > 0 && (
        <div className={styles.nextStepsSection}>
          <h4>Next Steps</h4>
          <ol className={styles.nextStepsList}>
            {nextSteps.map((step, index) => (
              <li key={index} className={index === 0 ? styles.currentStep : ''}>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
      
      {topElements && topElements.length > 0 && (
        <div className={styles.topElementsSection}>
          <h4>Recommended Elements to Click</h4>
          <ol className={styles.elementList}>
            {topElements.map((element, index) => (
              <li key={index} className={styles.elementItem}>
                <div className={styles.elementHeader}>
                  <span className={styles.elementScore}>{element.score}</span>
                  <span className={styles.elementClass}>{element.class}</span>
                </div>
                {element.text && (
                  <div className={styles.elementText}>"{element.text}"</div>
                )}
                <div className={styles.elementReasoning}>{element.reasoning}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};

export default function AppCrawler({ deviceId, packageName, splitRatio, leftPanelCollapsed, toggleLeftPanel, rightPanelCollapsed }) {
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
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false); // State for advanced settings
  const [flowNodes, setFlowNodes] = useState([]);
  const [flowEdges, setFlowEdges] = useState([]);
  const [flowReady, setFlowReady] = useState(false);
  const [showFlow, setShowFlow] = useState(false);
  const [showXmlPopup, setShowXmlPopup] = useState(false);
  
  const [crawlSettings, setCrawlSettings] = useState({
    maxScreens: 20,
    screenDelay: 1000, // ms between actions
    backDelay: 2000, // ms to wait after pressing back button
    ignoreElements: ['android.widget.ImageView'], // Element types to ignore for interaction
    stayInApp: true,
    mode: 'random', // 'random', 'orderly', or 'ai'
    aiPrompt: '' // Prompt for AI-powered crawling
  });
  
  // New state for AI prompt modal
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  
  // New state for AI analysis
  const [aiAnalysis, setAiAnalysis] = useState(null);

  // Functions
  const toggleConfig = () => {
    setShowConfig(prev => !prev);
  };

  // Function to toggle advanced settings
  const toggleAdvancedSettings = () => {
    setShowAdvancedSettings(prev => !prev);
  };
  
  const handleSettingsChange = (setting, value) => {
    setCrawlSettings(prev => {
      const newSettings = {
        ...prev,
        [setting]: value
      };
      
      // If mode is changed to AI, show the prompt modal if no prompt is set yet
      if (setting === 'mode' && value === 'ai' && !prev.aiPrompt.trim()) {
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
    // If canceling from the modal with no prompt, revert to random mode
    if (showAiPrompt && !crawlSettings.aiPrompt.trim()) {
      setCrawlSettings(prev => ({
        ...prev,
        mode: 'random'
      }));
    }
    setShowAiPrompt(false);
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
  
  // Set up event listeners for crawler progress, etc.
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
    
    const handleAIAnalysis = (analysis) => {
      setAiAnalysis(analysis);
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
      
      if (typeof window.api.crawler.onAIAnalysis === 'function')
        window.api.crawler.onAIAnalysis(handleAIAnalysis);
        
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
              message: 'App Crawler initialized. Ready to start crawling.'
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
          message: 'App Crawler initialized. Ready to start crawling.'
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

  // Scroll to bottom of logs when new logs are added
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Auto-collapse settings when crawl starts
  useEffect(() => {
    if (crawlStatus === 'running') {
      setShowConfig(true);
    }
  }, [crawlStatus]);

  return (
    <>
      <div 
        className={`${styles.panel} ${styles.appCrawlerPanel}`} 
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
                    <label>Mode</label>
                    <div className={styles.segmentedButton}>
                      {['random', 'orderly', 'ai'].map((mode) => (
                        <button 
                          key={mode}
                          className={`${styles.segmentOption} ${crawlSettings.mode === mode ? styles.activeSegment : ''}`}
                          onClick={() => handleSettingsChange('mode', mode)}
                        >
                          {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {crawlSettings.mode === 'ai' && (
                    <div className={styles.settingItem}>
                      <label>AI Prompt</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input 
                          type="text" 
                          value={crawlSettings.aiPrompt}
                          onChange={(e) => handleSettingsChange('aiPrompt', e.target.value)}
                          placeholder="Enter instructions for the AI crawler..."
                          style={{ flex: 1 }}
                        />
                        <button 
                          className={styles.toggleButton}
                          onClick={() => setShowAiPrompt(true)}
                          title="Edit in larger window"
                          style={{ flexShrink: 0 }}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )}
                  
                  <div className={styles.advancedSettingsToggle}>
                    <button 
                      className={styles.toggleButton}
                      onClick={toggleAdvancedSettings}
                    >
                      {showAdvancedSettings ? 'Hide' : 'Show'} Advanced Settings
                    </button>
                  </div>
                  
                  {showAdvancedSettings && (
                    <div className={styles.advancedSettings}>
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
                        <label>Back Button Delay (ms)</label>
                        <input 
                          type="number" 
                          value={crawlSettings.backDelay}
                          onChange={(e) => handleSettingsChange('backDelay', parseInt(e.target.value))}
                          min="1000"
                          max="10000"
                          step="100"
                        />
                      </div>
                      
                      <div className={styles.deviceInfo}>
                        <p><strong>Device ID:</strong> {deviceId || 'Not selected'}</p>
                        <p><strong>Package Name:</strong> {packageName || 'Not selected'}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            
            {/* Add AI Progress panel when in AI mode */}
            {crawlSettings.mode === 'ai' && (
              <AIProgressPanel aiAnalysis={aiAnalysis} />
            )}
            
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
      <AiPromptModal
        isOpen={showAiPrompt}
        onClose={handleAiPromptCancel}
        onSave={handleAiPromptSave}
        initialPrompt={crawlSettings.aiPrompt}
      />
    </>
  );
} 