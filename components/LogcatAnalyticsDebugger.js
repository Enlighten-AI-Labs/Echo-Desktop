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
  const intervalRef = useRef(null);
  
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
    
    const message = log.message;
    
    // Log already has an identified event name - keep it
    if (log.eventName) return true;
    
    // Look for specific Firebase Analytics patterns
    const patterns = [
      /Logging event.*?name=([a-zA-Z0-9_]+)/i,      // Logging event
      /FA[: ].*?event[ =]/i,                         // Firebase Analytics event
      /FA-SVC.*?event/i,                            // Firebase analytics service
      /event \{.*?name:/i,                          // Event definition block
      /params=Bundle\[\{.*?\}\]/i,                  // Event parameters
      /FirebaseAnalytics/i,                         // Direct Firebase mention
      /google\.analytics/i                          // Google analytics references
    ];
    
    // Return true if any pattern matches
    return patterns.some(pattern => pattern.test(message));
  };
  
  // Apply analytics event filter if enabled
  const displayedLogs = showOnlyAnalytics ? filteredLogs.filter(isAnalyticsEvent) : filteredLogs;
  
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
            <p>Waiting for Firebase Analytics events to be captured...</p>
          ) : (
            <p>No Firebase Analytics events captured. Click "Start Capture" to begin monitoring.</p>
          )}
        </div>
      ) : viewMode === 'raw' ? (
        // Raw Logs View
        <div className={styles.rawLogsContainer}>
          <h3>Raw Firebase Analytics Logs ({displayedLogs.length})</h3>
          <div className={styles.rawLogsContent}>
            {displayedLogs.map((log, index) => {
              if (!log) return null;
              try {
                return (
                  <div key={index} className={`${styles.rawLogEntry} ${log.isSystemMessage ? styles.systemMessage : ''}`}>
                    <span className={styles.rawLogTimestamp}>
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'Unknown'}
                    </span>
                    <pre className={styles.rawLogMessage}>{log.message || log.rawLog || 'No content available'}</pre>
                  </div>
                );
              } catch (error) {
                console.error('Error rendering raw log item:', error);
                return null;
              }
            })}
          </div>
        </div>
      ) : (
        // Parsed View
        <div className={styles.twoColumnLayout}>
          <div className={styles.logList}>
            <h3>Firebase Analytics Events ({displayedLogs.length})</h3>
            {displayedLogs.map((log, index) => {
              if (!log) return null;
              try {
                const eventName = parseEventName(log);
                return (
                  <div 
                    key={index}
                    className={`${styles.logItem} ${selectedLog === log ? styles.selected : ''} ${log.isSystemMessage ? styles.systemMessage : ''}`}
                    onClick={() => setSelectedLog(log)}
                  >
                    <div className={styles.logItemHeader}>
                      <div className={styles.eventName}>{log.isSystemMessage ? 'System Message' : eventName}</div>
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
          
          <div className={styles.logDetail}>
            {selectedLog ? (
              <div className={styles.logDetailContent}>
                <div className={styles.logDetailHeader}>
                  <h3>Event Details: {parseEventName(selectedLog)}</h3>
                  <div className={styles.logDetailTimestamp}>
                    {selectedLog.timestamp ? new Date(selectedLog.timestamp).toLocaleString() : 'Unknown time'}
                  </div>
                </div>
                
                <div className={styles.eventParams}>
                  <h4>Event Parameters</h4>
                  {selectedLog.message && selectedLog.message.includes('params=Bundle') ? (
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
                      No structured parameters found in this log
                    </div>
                  )}
                </div>
                
                <div className={styles.rawLog}>
                  <h4>Raw Log</h4>
                  <pre>{selectedLog.message || selectedLog.rawLog || 'No log content available'}</pre>
                </div>
              </div>
            ) : (
              <div className={styles.noSelection}>
                <p>Select an event from the list to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 