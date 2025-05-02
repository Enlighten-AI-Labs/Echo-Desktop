import { useEffect, useState, useRef, useCallback } from 'react';
import Head from 'next/head';
import AnalyticsDebugger from '@/components/analytics/AnalyticsDebugger';
import styles from '@/styles/pages/debugger.module.css';
import { AppCrawler } from '@/components/crawler';

// Create a utility function for auto-collapse thresholds
const MIN_PANEL_WIDTH = 20; // Minimum percentage width for a panel before it should auto-collapse

// Rename to DebuggerView and accept navigateTo and params as props
export default function DebuggerView({ navigateTo, params }) {
  // Replace router with params
  const [deviceId, setDeviceId] = useState('');
  const [packageName, setPackageName] = useState('');
  const [splitRatio, setSplitRatio] = useState(0); // Start with 0 since left panel is collapsed
  const [isResizing, setIsResizing] = useState(false);
  const [startX, setStartX] = useState(0);
  const containerRef = useRef(null);
  const dividerRef = useRef(null);
  
  // Panel collapsible state
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(true); // Start with App Crawler collapsed
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [previousSplitRatio, setPreviousSplitRatio] = useState(50); // Save previous split ratio when collapsing
  const [lastResizeTime, setLastResizeTime] = useState(0);
  const currentSplitRatio = useRef(0); // Use ref to track current ratio without re-renders
  
  // Track if we're in an animation transition
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // Get query parameters when the component loads
    if (params) {
      const { deviceId, packageName, tab } = params;
      if (deviceId) setDeviceId(deviceId);
      if (packageName) setPackageName(packageName);
    }
  }, [params]);

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
    navigateTo('dashboard');
  };
  
  const handleViewLogs = () => {
    navigateTo('mitmproxy-logs');
  };
  
  const handleSetupDevice = () => {
    // Build params object for navigation
    const deviceSetupParams = {};
    if (deviceId) deviceSetupParams.deviceId = deviceId;
    if (packageName) deviceSetupParams.packageName = packageName;
    deviceSetupParams.tab = 'unified';
    
    navigateTo('device-setup', deviceSetupParams);
  };

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
              onClick={() => navigateTo('export', { deviceId, packageName })}
            >
              Export Data
            </button>
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
              Network
            </button>
          </div>
        </div>
        
        <div ref={containerRef} className={styles.splitContainer}>
          {/* App Crawler Panel */}
          <AppCrawler 
            deviceId={deviceId} 
            packageName={packageName} 
            splitRatio={splitRatio}
            leftPanelCollapsed={leftPanelCollapsed}
            toggleLeftPanel={toggleLeftPanel}
            rightPanelCollapsed={rightPanelCollapsed}
          />
          
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
            
            <div className={styles.analyticsDebuggerContent}>
                <AnalyticsDebugger
                  deviceId={deviceId}
                  packageName={packageName}
                  show={true}
                />
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
    </>
  );
} 