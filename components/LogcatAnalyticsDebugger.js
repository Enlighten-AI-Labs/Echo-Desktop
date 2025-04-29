import styles from '@/styles/components/logcat-analytics-debugger.module.css';
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
                      console.log('Added new log:', log);
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
    const paramsMatch = log.message.match(/params=Bundle\[(.*)\]$/);
    if (!paramsMatch) return {};
    
    const paramsStr = paramsMatch[1];
    if (!paramsStr) return {};
    
    const params = {};
    
    try {
      // Remove outer braces and split by comma
      const cleanParamsStr = paramsStr.replace(/^\{|\}$/g, '');
      const paramPairs = cleanParamsStr.split(',').map(pair => pair.trim());
      
      paramPairs.forEach(pair => {
        const [key, ...valueParts] = pair.split('=');
        if (key && valueParts.length > 0) {
          // Join value parts in case the value contains equals signs
          const value = valueParts.join('=').trim();
          
          // Clean up the key by removing Firebase Analytics suffixes
          const cleanKey = key.replace(/\([^)]+\)/g, '').trim();
          
          // Clean up the value
          let cleanValue = value;
          // If value is a number, convert it
          if (/^-?\d+$/.test(cleanValue)) {
            cleanValue = parseInt(cleanValue, 10);
          } else if (/^-?\d*\.\d+$/.test(cleanValue)) {
            cleanValue = parseFloat(cleanValue);
          }
          
          params[cleanKey] = cleanValue;
        }
      });
    } catch (error) {
      console.error('Error parsing parameters:', error);
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
        setSelectedScreenshot(screenshots[selectedLog.id]?.dataUrl || null);
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
      setSelectedScreenshot(screenshots[selectedLog.id]?.dataUrl || null);
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
            // Handle double "Logging event:" prefix by taking the last one
            const cleanMessage = log.message.replace('[electron-wait] Logging event: ', '');
            
            // Extract event name
            const eventMatch = cleanMessage.match(/name=([^,]+)/);
            if (eventMatch) {
              eventName = eventMatch[1].replace(/\(_vs\)/, '').trim();
            }

            // Extract parameters
            const paramsMatch = cleanMessage.match(/params=Bundle\[(.*)\]$/);
            if (paramsMatch && paramsMatch[1]) {
              const paramsStr = paramsMatch[1];
              
              // Remove outer braces and split by comma
              const cleanParamsStr = paramsStr.replace(/^\{|\}$/g, '');
              const paramPairs = cleanParamsStr.split(',').map(pair => pair.trim());
              
              paramPairs.forEach(pair => {
                const [key, ...valueParts] = pair.split('=');
                if (key && valueParts.length > 0) {
                  // Join value parts in case the value contains equals signs
                  const value = valueParts.join('=').trim();
                  
                  // Clean up the key by removing Firebase Analytics suffixes
                  const cleanKey = key.replace(/\([^)]+\)/g, '').trim();
                  
                  // Clean up the value
                  let cleanValue = value;
                  // If value is a number, convert it
                  if (/^-?\d+$/.test(cleanValue)) {
                    cleanValue = parseInt(cleanValue, 10);
                  } else if (/^-?\d*\.\d+$/.test(cleanValue)) {
                    cleanValue = parseFloat(cleanValue);
                  }
                  
                  parameters[cleanKey] = cleanValue;
                }
              });
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
    ? analyticsLogs.filter(log => {
        const message = log.rawData || log.message;
        return message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (log.eventName && log.eventName.toLowerCase().includes(searchQuery.toLowerCase()));
      })
    : analyticsLogs;
    
  // Further filter to show only real analytics events
  const isAnalyticsEvent = (log) => {
    if (!log) return false;
    
    // Always show system messages
    if (log.isSystemMessage) return true;
    
    // If log has a source property, it's from network capture
    if (log.source === 'network') return true;
    
    const message = log.rawData || log.message;
    if (!message) return false;
    
    // Check for "Logging event:" pattern first as it's the most common
    if (message.includes('Logging event:')) {
      return true;
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
            className={`${styles.button} ${isCapturing ? styles.stopButton : styles.startButton}`}
            onClick={handleToggleCapture}
          >
            <span className="body-regular">
              {isCapturing ? 'Stop Capture' : 'Start Capture'}
            </span>
          </button>
          <button
            className={`${styles.button} ${styles.clearButton}`}
            onClick={handleClearLogs}
          >
            <span className="body-regular">Clear Events</span>
          </button>
          <div className={styles.filterContainer}>
            <input
              type="text"
              className={`${styles.searchInput} body-light`}
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <select
            className={`${styles.select} body-regular`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All Analytics</option>
            <option value="firebase">Firebase Only</option>
            <option value="adobe">Adobe Only</option>
          </select>
          <button
            className={`${styles.viewModeButton} ${viewMode === 'parsed' ? styles.activeMode : ''}`}
            onClick={() => setViewMode('parsed')}
          >
            <span className="supporting-text">Parsed</span>
          </button>
          <button
            className={`${styles.viewModeButton} ${viewMode === 'raw' ? styles.activeMode : ''}`}
            onClick={() => setViewMode('raw')}
          >
            <span className="supporting-text">Raw</span>
          </button>
          <div className={styles.autoRefreshContainer}>
            <label className="supporting-text">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={handleToggleAutoRefresh}
              />
              Auto Refresh
            </label>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.eventsList}>
          <h2 className={`${styles.columnHeader} header-bold`}>Analytics Events ({analyticsLogs.length})</h2>
          <div className={styles.eventsContainer}>
            {displayedLogs.map((log, index) => (
              <div
                key={index}
                className={`${styles.eventItem} ${selectedLog === log ? styles.selected : ''}`}
                onClick={() => setSelectedLog(log)}
              >
                <div className={styles.eventHeader}>
                  <div className={styles.eventInfo}>
                    <span className={`${styles.eventName} subheader`}>
                      {log.eventName || 'Unknown Event'}
                    </span>
                    <span className={`${styles.eventType} supporting-text`}>
                      {log.eventType || 'Unknown Type'}
                    </span>
                  </div>
                  <span className={`${styles.timestamp} supporting-text`}>
                    {formatTimestamp(log.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.eventDetails}>
          {selectedLog ? (
            <>
              <h2 className={`${styles.columnHeader} header-bold`}>
                Event Details: {selectedLog.eventName}
              </h2>
              <div className={styles.detailsContent}>
                {viewMode === 'parsed' ? (
                  <div className={styles.parsedView}>
                    <div className={styles.section}>
                      <h3 className="subheader">Event Parameters</h3>
                      <div className={styles.parametersTable}>
                        <table>
                          <thead>
                            <tr>
                              <th className="supporting-text">Parameter</th>
                              <th className="supporting-text">Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(parseEventParams(selectedLog)).map(([key, value]) => (
                              <tr key={key}>
                                <td className={`${styles.paramName} body-regular`}>{key}</td>
                                <td className={`${styles.paramValue} body-light`}>
                                  {typeof value === 'object' ? JSON.stringify(value) : value}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={styles.rawView}>
                    <pre className={`${styles.rawLog} body-light`}>
                      {selectedLog.rawData || selectedLog.message}
                    </pre>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={styles.noSelection}>
              <span className="body-light">Select an event to view details</span>
            </div>
          )}
        </div>

        <div className={styles.screenshotColumn}>
          <h2 className={`${styles.columnHeader} header-bold`}>Screenshot</h2>
          <div className={styles.screenshotControls}>
            <button
              className={`${styles.retakeButton} supporting-text`}
              onClick={handleRetakeScreenshot}
              disabled={!selectedLog}
            >
              Retake Screenshot
            </button>
            <button
              className={`${styles.deleteButton} supporting-text`}
              onClick={handleDeleteScreenshot}
              disabled={!selectedScreenshot}
            >
              Delete Screenshot
            </button>
          </div>
          <div className={styles.screenshotContainer}>
            {selectedScreenshot ? (
              <div className={styles.screenshotWrapper}>
                <img
                  src={selectedScreenshot}
                  alt="Event Screenshot"
                  className={styles.screenshot}
                />
              </div>
            ) : (
              <div className={styles.noScreenshot}>
                <p className="body-light">No screenshot available</p>
                <p className="body-light">Select an event to capture a screenshot</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 