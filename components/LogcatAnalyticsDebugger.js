import styles from '@/styles/LogcatAnalyticsDebugger.module.css';
import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';

export default function LogcatAnalyticsDebugger({ deviceId, packageName, show }) {
  const router = useRouter();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [analyticsLogs, setAnalyticsLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState('FA FA-SVC');
  const [viewMode, setViewMode] = useState('parsed'); // 'parsed' or 'raw'
  const [showOnlyAnalytics, setShowOnlyAnalytics] = useState(true); // Default to only showing analytics events
  const [analyticsType, setAnalyticsType] = useState('all'); // 'all', 'google', 'adobe', 'firebase'
  const [screenshots, setScreenshots] = useState({});
  const [screenshotStatus, setScreenshotStatus] = useState('idle');
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);
  const intervalRef = useRef(null);
  const processedEventIds = useRef(new Set());
  
  // Check if logcat is running and get analytics logs
  useEffect(() => {
    async function checkStatus() {
      try {
        let isRunning = false;
        try {
          isRunning = await window.api.adb.isLogcatRunning();
        } catch (apiError) {
          console.error('Error calling isLogcatRunning:', apiError);
          isRunning = false;
        }
        
        setIsCapturing(isRunning);
        
        if (isRunning) {
          try {
            const logs = await window.api.adb.getAnalyticsLogs();
            if (Array.isArray(logs)) {
              // Use a function to update state that merges new logs with existing ones
              setAnalyticsLogs(currentLogs => {
                // Create a map of existing logs by a unique key (timestamp + message)
                const existingLogsMap = new Map();
                currentLogs.forEach(log => {
                  const uniqueKey = `${log.timestamp}-${log.message?.substring(0, 50) || log.rawLog?.substring(0, 50) || ''}`;
                  existingLogsMap.set(uniqueKey, log);
                });
                
                // Add new logs that don't already exist
                logs.forEach(log => {
                  const uniqueKey = `${log.timestamp}-${log.message?.substring(0, 50) || log.rawLog?.substring(0, 50) || ''}`;
                  if (!existingLogsMap.has(uniqueKey)) {
                    existingLogsMap.set(uniqueKey, log);
                  }
                });
                
                // Convert back to array and sort by timestamp (newest first)
                return Array.from(existingLogsMap.values())
                  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
              });
            } else {
              console.error('getAnalyticsLogs did not return an array:', logs);
            }
          } catch (logsError) {
            console.error('Error getting analytics logs:', logsError);
          }
        }
      } catch (error) {
        console.error('Failed to check logcat status:', error);
      } finally {
        setIsCheckingStatus(false);
      }
    }
    
    checkStatus();

    // Set up periodic status check if auto refresh is enabled
    if (autoRefresh) {
      intervalRef.current = setInterval(async () => {
        try {
          let isRunning = false;
          try {
            isRunning = await window.api.adb.isLogcatRunning();
          } catch (error) {
            console.error('Error in auto-refresh isLogcatRunning:', error);
            isRunning = false;
          }
          
          if (isRunning) {
            try {
              const logs = await window.api.adb.getAnalyticsLogs();
              if (Array.isArray(logs)) {
                // Use the same merging logic for the auto-refresh
                setAnalyticsLogs(currentLogs => {
                  // Create a map of existing logs by a unique key
                  const existingLogsMap = new Map();
                  currentLogs.forEach(log => {
                    const uniqueKey = `${log.timestamp}-${log.message?.substring(0, 50) || log.rawLog?.substring(0, 50) || ''}`;
                    existingLogsMap.set(uniqueKey, log);
                  });
                  
                  // Add new logs that don't already exist
                  logs.forEach(log => {
                    const uniqueKey = `${log.timestamp}-${log.message?.substring(0, 50) || log.rawLog?.substring(0, 50) || ''}`;
                    if (!existingLogsMap.has(uniqueKey)) {
                      existingLogsMap.set(uniqueKey, log);
                    }
                  });
                  
                  // Convert back to array and sort by timestamp (newest first)
                  return Array.from(existingLogsMap.values())
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                });
              }
            } catch (error) {
              console.error('Error in auto-refresh getAnalyticsLogs:', error);
            }
          }
        } catch (error) {
          console.error('Auto-refresh error:', error);
        }
      }, 1000);
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh]);
  
  // Start/stop logcat capture
  const handleToggleCapture = async () => {
    try {
      if (isCapturing) {
        const result = await window.api.adb.stopLogcatCapture();
        if (result.success) {
          setIsCapturing(false);
        } else {
          alert('Failed to stop logcat capture: ' + result.message);
        }
      } else {
        if (!deviceId) {
          alert('Please select a device first.');
          handleConnectDevice();
          return;
        }
        const result = await window.api.adb.startLogcatCapture(deviceId, filter);
        if (result.success) {
          setIsCapturing(true);
          // Clear previous logs
          await window.api.adb.clearAnalyticsLogs();
          setAnalyticsLogs([]);
        } else {
          alert('Failed to start logcat capture: ' + result.message);
        }
      }
    } catch (error) {
      console.error('Error toggling logcat capture:', error);
      alert('Error: ' + error.message);
    }
  };
  
  // Clear analytics logs
  const handleClearLogs = async () => {
    try {
      await window.api.adb.clearAnalyticsLogs();
      setAnalyticsLogs([]);
      setSelectedLog(null);
      
      // If we're capturing, briefly show a "clearing" message
      if (isCapturing) {
        const tempClearingMessage = {
          timestamp: new Date().toISOString(),
          message: "Logs cleared. Waiting for new events...",
          isSystemMessage: true
        };
        setAnalyticsLogs([tempClearingMessage]);
      }
    } catch (error) {
      console.error('Error clearing logs:', error);
      alert('Error: ' + error.message);
    }
  };
  
  // Navigate to device setup
  const handleConnectDevice = () => {
    console.log('Redirecting to device setup...');
    const query = {};
    if (deviceId) query.deviceId = deviceId;
    if (packageName) query.packageName = packageName;
    router.push({
      pathname: '/device-setup',
      query
    });
  };

  // Toggle auto refresh
  const handleToggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };
  
  // Update filter
  const handleFilterChange = (e) => {
    setFilter(e.target.value);
  };
  
  // Apply filter
  const handleApplyFilter = async () => {
    if (!deviceId) {
      alert('Please select a device first.');
      handleConnectDevice();
      return;
    }
    
    // Stop current capture if running
    if (isCapturing) {
      await window.api.adb.stopLogcatCapture();
    }
    
    // Start with new filter
    const result = await window.api.adb.startLogcatCapture(deviceId, filter);
    if (result.success) {
      setIsCapturing(true);
      // Clear previous logs
      await window.api.adb.clearAnalyticsLogs();
      setAnalyticsLogs([]);
    } else {
      alert('Failed to apply filter: ' + result.message);
    }
  };

  // Toggle view mode between parsed and raw
  const toggleViewMode = () => {
    setViewMode(viewMode === 'parsed' ? 'raw' : 'parsed');
  };

  // Toggle between showing all logs and only analytics logs
  const handleToggleOnlyAnalytics = () => {
    setShowOnlyAnalytics(!showOnlyAnalytics);
  };

  // Change analytics type filter
  const handleAnalyticsTypeChange = (e) => {
    setAnalyticsType(e.target.value);
  };

  // Parse the event name from a log message
  const parseEventName = (log) => {
    if (!log) return "Unknown Event";
    if (log.eventName) return log.eventName;
    
    // Check that message exists before trying to match
    if (!log.message) return "Unknown Event";
    
    // Look for "name=event_name" pattern
    const nameMatch = log.message.match(/name=([a-zA-Z_]+)/);
    if (nameMatch) return nameMatch[1];

    // Look for "Logging event: origin=app,name=event_name" pattern
    const loggingMatch = log.message.match(/Logging event:.*name=([a-zA-Z_]+)/);
    if (loggingMatch) return loggingMatch[1];
    
    return "Unknown Event";
  };

  // Extract parameters from log message
  const parseEventParams = (log) => {
    // If log already has parsed params, use those
    if (log.params && Object.keys(log.params).length > 0) {
      return log.params;
    }
    
    if (!log || !log.message) return {};
    
    // Look for params=Bundle[{...}] pattern
    const paramsMatch = log.message.match(/params=Bundle\[\{(.*)\}\]/);
    if (!paramsMatch) return {};
    
    const paramsStr = paramsMatch[1];
    if (!paramsStr) return {};
    
    const params = {};
    
    // Extract key-value pairs
    const keyValueRegex = /([a-zA-Z_]+)=([^,]+),?\s*/g;
    let match;
    while ((match = keyValueRegex.exec(paramsStr)) !== null) {
      if (match[1] && match[2]) {
        params[match[1]] = match[2];
      }
    }
    
    return params;
  };
  
  // Function to capture screenshot
  const captureScreenshot = async (logId) => {
    if (!deviceId) return;
    
    try {
      setScreenshotStatus('capturing');
      const result = await window.api.rtmp.captureScreenshot(logId);
      
      if (result.success) {
        setScreenshots(prev => ({
          ...prev,
          [logId]: {
            fileName: result.fileName,
            timestamp: result.timestamp,
            width: result.dimensions?.width || 720,
            height: result.dimensions?.height || null
          }
        }));
        
        // Load the screenshot data
        await loadScreenshotData(logId);
      } else {
        console.error('Failed to capture screenshot:', result.message);
      }
      
      setScreenshotStatus('idle');
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      setScreenshotStatus('error');
    }
  };

  // Function to load screenshot data
  const loadScreenshotData = async (logId) => {
    if (!screenshots[logId] || screenshots[logId].dataUrl) return;
    
    try {
      setScreenshotStatus('loading');
      const result = await window.api.rtmp.getScreenshotDataUrl(screenshots[logId].fileName);
      
      if (result.success) {
        setScreenshots(prev => ({
          ...prev,
          [logId]: {
            ...prev[logId],
            dataUrl: result.dataUrl,
            width: result.dimensions?.width || prev[logId].width || 720,
            height: result.dimensions?.height || prev[logId].height || null
          }
        }));
      }
      
      setScreenshotStatus('idle');
    } catch (error) {
      console.error('Error loading screenshot data:', error);
      setScreenshotStatus('error');
    }
  };

  // Function to handle retaking screenshot
  const handleRetakeScreenshot = async () => {
    if (!selectedLog) return;
    
    try {
      setScreenshots(prev => {
        const newScreenshots = { ...prev };
        delete newScreenshots[selectedLog.id];
        return newScreenshots;
      });
      
      setScreenshotStatus('capturing');
      await captureScreenshot(selectedLog.id);
      
      setTimeout(async () => {
        await loadScreenshotData(selectedLog.id);
        setSelectedScreenshot(screenshots[selectedLog.id]);
      }, 500);
    } catch (error) {
      console.error('Error retaking screenshot:', error);
      setScreenshotStatus('error');
    }
  };

  // Function to handle deleting screenshot
  const handleDeleteScreenshot = () => {
    if (!selectedLog) return;
    
    setScreenshots(prev => {
      const newScreenshots = { ...prev };
      delete newScreenshots[selectedLog.id];
      return newScreenshots;
    });
    
    setSelectedScreenshot(null);
  };

  // Update selected screenshot when a log is selected
  useEffect(() => {
    if (selectedLog) {
      if (screenshots[selectedLog.id] && !screenshots[selectedLog.id].dataUrl) {
        loadScreenshotData(selectedLog.id);
      }
      setSelectedScreenshot(screenshots[selectedLog.id]);
    } else {
      setSelectedScreenshot(null);
    }
  }, [selectedLog, screenshots]);

  // Parse logcat events
  function parseLogcatEvents(logs) {
    return logs
      .filter(log => log && log.message)
      .map(log => {
        const eventId = generateEventId(log);
        
        // Skip if we've already processed this event
        if (processedEventIds.current.has(eventId)) {
          return null;
        }
        
        processedEventIds.current.add(eventId);

        // Parse Firebase Analytics parameters from raw log
        let parameters = {};
        let eventName = 'Unknown Event';
        
        if (log.message && log.message.includes('Logging event:')) {
          try {
            // Extract event name
            const eventMatch = log.message.match(/name=([^,]+)/);
            if (eventMatch) {
              eventName = eventMatch[1].replace(/\(_vs\)/, '').trim();
            }

            // Extract parameters
            const paramsMatch = log.message.match(/params=Bundle\[(.*)\]$/);
            if (paramsMatch && paramsMatch[1]) {
              const paramsStr = paramsMatch[1];
              
              // Function to parse a Bundle string
              const parseBundle = (bundleStr) => {
                const params = {};
                let depth = 0;
                let currentKey = '';
                let currentValue = '';
                let isInKey = true;
                
                // Remove outer braces
                bundleStr = bundleStr.replace(/^\{|\}$/g, '').trim();
                
                for (let i = 0; i < bundleStr.length; i++) {
                  const char = bundleStr[i];
                  
                  if (char === '[' || char === '{') {
                    depth++;
                    if (depth === 1) {
                      // Start of a nested structure
                      currentValue = char;
                    } else {
                      currentValue += char;
                    }
                  } else if (char === ']' || char === '}') {
                    depth--;
                    currentValue += char;
                    if (depth === 0) {
                      // End of nested structure
                      if (currentKey) {
                        const cleanKey = currentKey.replace(/\([^)]+\)/g, '').trim();
                        params[cleanKey] = currentValue;
                        currentKey = '';
                        currentValue = '';
                        isInKey = true;
                      }
                    }
                  } else if (char === '=' && depth === 0 && isInKey) {
                    // End of key
                    currentKey = currentValue;
                    currentValue = '';
                    isInKey = false;
                  } else if (char === ',' && depth === 0) {
                    // End of value
                    if (currentKey) {
                      const cleanKey = currentKey.replace(/\([^)]+\)/g, '').trim();
                      params[cleanKey] = currentValue.trim();
                      currentKey = '';
                      currentValue = '';
                      isInKey = true;
                    }
                  } else {
                    currentValue += char;
                  }
                }
                
                // Handle last pair
                if (currentKey && currentValue) {
                  const cleanKey = currentKey.replace(/\([^)]+\)/g, '').trim();
                  params[cleanKey] = currentValue.trim();
                }
                
                return params;
              };
              
              parameters = parseBundle(paramsStr);
            }
          } catch (error) {
            console.error('Error parsing Firebase Analytics log:', error);
          }
        }
        
        return {
          id: eventId,
          timestamp: log.timestamp || new Date().toISOString(),
          source: 'logcat',
          eventName: eventName,
          eventType: 'firebase',
          parameters: parameters,
          rawData: log.message
        };
      })
      .filter(Boolean);
  }

  if (!show) {
    return null;
  }
  
  // Show loading state while checking status
  if (isCheckingStatus) {
    return (
      <div className={styles.container}>
        <div className={styles.messageContainer}>
          <div className={styles.message}>
            <h3>Checking Status...</h3>
          </div>
        </div>
      </div>
    );
  }
  
  // Filter logs based on search query
  const filteredLogs = searchQuery
    ? analyticsLogs.filter(log => 
        log.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.eventName && log.eventName.toLowerCase().includes(searchQuery.toLowerCase())))
    : analyticsLogs;
    
  // Further filter to show only real analytics events
  const isAnalyticsEvent = (log) => {
    if (!log || !log.message) return false;
    
    // Always show system messages
    if (log.isSystemMessage) return true;
    
    // If log has a source property, it's from network capture
    if (log.source === 'network') return true;
    
    const message = log.message;
    
    // Check for "Logging event:" pattern first as it's the most common
    if (message.includes('Logging event:')) {
      // Extract the event name
      const eventMatch = message.match(/name=([^,]+)/);
      if (eventMatch) {
        const eventName = eventMatch[1].replace(/\(_vs\)/, '').trim();
        // Valid event names we want to capture
        const validEvents = [
          'screen_view',
          'view_item',
          'view_item_list',
          'select_item',
          'add_to_cart',
          'remove_from_cart',
          'begin_checkout',
          'purchase'
        ];
        return validEvents.some(event => eventName.includes(event));
      }
      return true; // If we can't extract the name but it has "Logging event:", show it anyway
    }
    
    // Fallback patterns for other analytics events
    const patterns = [
      /FA[: ].*?event[ =]/i,                         // Firebase Analytics event
      /FA-SVC.*?event/i,                            // Firebase analytics service
      /event \{.*?name:/i,                          // Event definition block
      /params=Bundle\[\{.*?\}\]/i,                  // Event parameters
      /FirebaseAnalytics/i,                         // Direct Firebase mention
      /google\.analytics/i,                         // Google analytics references
      /b\/ss/i                                      // Adobe Analytics
    ];
    
    // Return true if any pattern matches
    return patterns.some(pattern => pattern.test(message));
  };
  
  // Apply analytics event filter if enabled
  let displayedLogs = showOnlyAnalytics ? filteredLogs.filter(isAnalyticsEvent) : filteredLogs;
  
  // Apply analytics type filter
  if (analyticsType !== 'all') {
    displayedLogs = displayedLogs.filter(log => {
      if (log.isSystemMessage) return true;
      
      // Check eventType property for network captures
      if (log.eventType) {
        if (analyticsType === 'google') {
          return log.eventType === 'ga';
        } else if (analyticsType === 'firebase') {
          return log.eventType === 'firebase';
        } else if (analyticsType === 'adobe') {
          return log.eventType === 'adobe';
        }
      }
      
      // For logcat captures, check message content
      if (log.message) {
        if (analyticsType === 'google') {
          return /google-analytics|analytics\.google\.com|ga\.js|gtag/i.test(log.message);
        } else if (analyticsType === 'firebase') {
          return /firebase|FA-SVC|FA:/i.test(log.message);
        } else if (analyticsType === 'adobe') {
          return /b\/ss/i.test(log.message);
        }
      }
      
      return false;
    });
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <button 
            className={`${styles.captureButton} ${isCapturing ? styles.stopButton : styles.startButton}`}
            onClick={handleToggleCapture}
          >
            {isCapturing ? 'Stop Capture' : 'Start Capture'}
          </button>
          
          <button 
            className={styles.clearButton}
            onClick={handleClearLogs}
            disabled={analyticsLogs.length === 0}
          >
            Clear Logs
          </button>
          
          <div className={styles.filterContainer}>
            <input
              type="text"
              placeholder="Logcat Filter (e.g. FA FA-SVC)"
              value={filter}
              onChange={handleFilterChange}
              className={styles.filterInput}
            />
            <button 
              className={styles.applyButton}
              onClick={handleApplyFilter}
            >
              Apply
            </button>
          </div>

          <button 
            className={styles.viewModeButton}
            onClick={toggleViewMode}
          >
            {viewMode === 'parsed' ? 'Switch to Raw View' : 'Switch to Parsed View'}
          </button>
        </div>
        <div className={styles.toolbarRight}>
          <div className={styles.searchContainer}>
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          
          <div className={styles.analyticsTypeContainer}>
            <select 
              value={analyticsType}
              onChange={handleAnalyticsTypeChange}
              className={styles.analyticsTypeSelect}
            >
              <option value="all">All Analytics</option>
              <option value="google">Google Analytics</option>
              <option value="firebase">Firebase Analytics</option>
              <option value="adobe">Adobe Analytics</option>
            </select>
          </div>
          
          <label className={styles.autoRefreshLabel}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={handleToggleAutoRefresh}
            />
            Auto Refresh
          </label>
          
          <label className={styles.autoRefreshLabel}>
            <input
              type="checkbox"
              checked={showOnlyAnalytics}
              onChange={handleToggleOnlyAnalytics}
            />
            Only Analytics Events
          </label>
          
          <button 
            className={styles.deviceButton}
            onClick={handleConnectDevice}
          >
            {deviceId ? 'Change Device' : 'Select Device'}
          </button>
        </div>
      </div>
      
      {displayedLogs.length === 0 ? (
        <div className={styles.emptyState}>
          {isCapturing ? (
            <p>Waiting for analytics events to be captured...</p>
          ) : (
            <p>No analytics events captured. Click "Start Capture" to begin monitoring.</p>
          )}
        </div>
      ) : (
        <div className={styles.threeColumnLayout}>
          {/* Events Column */}
          <div className={styles.logList}>
            <h3 className={styles.columnHeader}>Analytics Events ({displayedLogs.length})</h3>
            {displayedLogs.map((log, index) => {
              if (!log) return null;
              try {
                const eventName = parseEventName(log);
                const eventType = log.eventType || (log.message?.includes('b/ss') ? 'adobe' : 
                  (log.message?.includes('firebase') || log.message?.includes('FA-SVC') ? 'firebase' : 
                  (log.message?.includes('google-analytics') ? 'ga' : 'unknown')));
                
                return (
                  <div 
                    key={index}
                    className={`${styles.logItem} ${selectedLog === log ? styles.selected : ''} ${log.isSystemMessage ? styles.systemMessage : ''} ${log.source === 'network' ? styles.networkLog : ''}`}
                    onClick={() => setSelectedLog(log)}
                  >
                    <div className={styles.logItemHeader}>
                      <div className={styles.eventName}>
                        {log.isSystemMessage ? 'System Message' : eventName}
                        {eventType && <span className={styles.eventType}>[{eventType.toUpperCase()}]</span>}
                      </div>
                      <div className={styles.logTimestamp}>
                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'Unknown time'}
                      </div>
                    </div>
                    <div className={styles.logPreview}>
                      {log.message?.substring(0, 100) || ''}{log.message?.length > 100 ? '...' : ''}
                    </div>
                  </div>
                );
              } catch (error) {
                console.error('Error rendering log item:', error);
                return null;
              }
            })}
          </div>

          {/* Parameters Column */}
          <div className={styles.logDetail}>
            {selectedLog ? (
              <div className={styles.logDetailContent}>
                <div className={styles.logDetailHeader}>
                  <h3 className={styles.columnHeader}>Event Details: {parseEventName(selectedLog)}</h3>
                  <div className={styles.logDetailTimestamp}>
                    {selectedLog.timestamp ? new Date(selectedLog.timestamp).toLocaleString() : 'Unknown time'}
                  </div>
                </div>
                
                {viewMode === 'parsed' ? (
                  <div className={styles.eventParams}>
                    <h4 className={styles.sectionHeader}>Event Parameters</h4>
                    {Object.keys(parseEventParams(selectedLog)).length > 0 ? (
                      <div className={styles.paramsTable}>
                        <table>
                          <thead>
                            <tr>
                              <th>Parameter</th>
                              <th>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(parseEventParams(selectedLog) || {}).map(([key, value], idx) => (
                              <tr key={idx}>
                                <td className={styles.paramName}>{key}</td>
                                <td className={styles.paramValue}>
                                  {typeof value === 'string' && value.startsWith('[') ? (
                                    <div className={styles.arrayValue}>
                                      {value}
                                    </div>
                                  ) : (
                                    value
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className={styles.noParams}>
                        No parameters available for this event
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={styles.rawView}>
                    <h4 className={styles.sectionHeader}>Raw Log</h4>
                    <pre className={styles.rawLog}>
                      {selectedLog.rawLog || selectedLog.message || 'No raw log available'}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.noSelection}>
                <p>Select an event from the list to view details</p>
              </div>
            )}
          </div>

          {/* Screenshot Column */}
          <div className={styles.screenshotColumn}>
            <h3 className={styles.columnHeader}>Screenshot</h3>
            <div className={styles.screenshotControls}>
              <button 
                className={styles.retakeButton}
                onClick={handleRetakeScreenshot}
                disabled={!selectedLog || screenshotStatus === 'capturing'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                {screenshotStatus === 'capturing' ? 'Capturing...' : 'Retake'}
              </button>
              <button 
                className={styles.deleteButton}
                onClick={handleDeleteScreenshot}
                disabled={!selectedLog || !selectedScreenshot}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Delete
              </button>
            </div>
            <div className={styles.screenshotContainer}>
              {selectedScreenshot ? (
                <>
                  {selectedScreenshot.dataUrl ? (
                    <>
                      <div className={styles.screenshotWrapper}>
                        <img 
                          src={selectedScreenshot.dataUrl} 
                          alt="Screenshot for selected event"
                          className={styles.screenshot}
                        />
                      </div>
                      <div className={styles.screenshotInfo}>
                        <span className={styles.dimensions}>
                          {selectedScreenshot.width} x {selectedScreenshot.height}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className={styles.screenshotLoading}>
                      Loading screenshot...
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.noScreenshot}>
                  <p>No screenshot available</p>
                  <p>Select an event to capture a screenshot</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 