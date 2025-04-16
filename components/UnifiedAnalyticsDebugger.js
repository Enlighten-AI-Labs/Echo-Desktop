import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import styles from '@/styles/UnifiedAnalyticsDebugger.module.css';
import { parseAdobeAnalyticsBeacon } from '@/lib/adobe-analytics-parser';

export default function UnifiedAnalyticsDebugger({ deviceId, packageName, show }) {
  const router = useRouter();
  
  // State for data sources
  const [mitmproxyStatus, setMitmproxyStatus] = useState({ running: false });
  const [logcatStatus, setLogcatStatus] = useState({ running: false });
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  
  // State for analytics data
  const [analyticsEvents, setAnalyticsEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  
  // UI state
  const [filter, setFilter] = useState('');
  const [parameterFilter, setParameterFilter] = useState('');
  const [parameterValueFilter, setParameterValueFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all', 'logcat', 'network'
  const [parameterSearch, setParameterSearch] = useState('');
  const [viewMode, setViewMode] = useState('parsed'); // 'parsed' or 'raw'
  
  // Screenshot state
  const [screenshots, setScreenshots] = useState({});
  const [screenshotStatus, setScreenshotStatus] = useState('idle');
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);
  
  // Refs
  const processedEventIds = useRef(new Set());
  const intervalRef = useRef(null);

  // Parameters to hide by default
  const hiddenParameters = [
    'AQB', 'ndh', 'pd', 't', 'ts', 'aamlh', 'ce', 'c.a.', 
    'CarrierName', 'DeviceName', '.a', '.c', 's', 'c', 'j', 
    'v', 'k', 'bh', 'AQE', 'pf', 'c.', 'a.'
  ];

  // Section expansion state
  const [expandedSections, setExpandedSections] = useState({
    basicInfo: true,
    events: true,
    parameters: true,
    userProperties: true,
    rawData: false
  });

  useEffect(() => {
    // Check status of both data sources and fetch data
    async function checkStatus() {
      try {
        // Check mitmproxy status
        const mitmStatus = await window.api.mitmproxy.status();
        setMitmproxyStatus(mitmStatus);

        // Check logcat status
        const isLogcatRunning = await window.api.adb.isLogcatRunning();
        setLogcatStatus({ running: isLogcatRunning });

        // Fetch and combine data from both sources
        const combinedEvents = await fetchCombinedEvents();
        setAnalyticsEvents(combinedEvents);
      } catch (error) {
        console.error('Failed to check status:', error);
      } finally {
        setIsCheckingStatus(false);
      }
    }

    checkStatus();

    // Set up periodic status check if auto refresh is enabled
    if (autoRefresh) {
      intervalRef.current = setInterval(checkStatus, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh]);

  // Fetch and combine events from both sources
  async function fetchCombinedEvents() {
    const events = [];

    try {
      // Fetch network events if mitmproxy is running
      if (mitmproxyStatus.running) {
        const traffic = await window.api.mitmproxy.getTraffic();
        const networkEvents = parseNetworkEvents(traffic);
        events.push(...networkEvents);
      }

      // Fetch logcat events if logcat capture is running
      if (logcatStatus.running) {
        const logs = await window.api.adb.getAnalyticsLogs();
        const logcatEvents = parseLogcatEvents(logs);
        events.push(...logcatEvents);
      }

      // Sort combined events by timestamp (newest first)
      return events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      console.error('Error fetching events:', error);
      return events;
    }
  }

  // Parse network events
  function parseNetworkEvents(traffic) {
    return traffic
      .filter(entry => 
        entry.type === 'request' && 
        entry.fullUrl && (
          entry.fullUrl.includes('/b/ss/') || // Adobe Analytics
          entry.fullUrl.includes('/collect') || // GA4
          entry.fullUrl.includes('/g/collect') || // GA4 alternative endpoint
          entry.fullUrl.includes('google-analytics.com') || // GA4
          entry.fullUrl.includes('analytics.google.com') || // GA4
          entry.fullUrl.includes('app-measurement.com') || // Firebase Analytics
          entry.fullUrl.includes('firebase.googleapis.com/firebase/analytics') // Firebase Analytics
        )
      )
      .map(entry => {
        const eventId = generateEventId(entry);
        
        // Skip if we've already processed this event
        if (processedEventIds.current.has(eventId)) {
          return null;
        }
        
        processedEventIds.current.add(eventId);
        
        // Parse the event based on its type
        let parsedEvent = null;
        if (entry.fullUrl.includes('/b/ss/')) {
          parsedEvent = parseAdobeAnalyticsBeacon(entry.fullUrl);
        } else {
          parsedEvent = parseGA4Event(entry.fullUrl);
        }
        
        return {
          id: eventId,
          timestamp: entry.timestamp || new Date().toISOString(),
          source: 'network',
          rawData: entry.fullUrl,
          ...parsedEvent
        };
      })
      .filter(Boolean); // Remove null entries
  }

  // Parse logcat events
  function parseLogcatEvents(logs) {
    return logs
      .filter(log => log && log.message) // Only require message to be present
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
        
        // Extract event name and parameters from the log message
        if (log.message && log.message.includes('Logging event:')) {
          try {
            const eventMatch = log.message.match(/name=([^,]+)/);
            if (eventMatch) {
              eventName = eventMatch[1].replace('(_vs)', '').trim();
            }

            if (log.message.includes('params=Bundle[')) {
              const paramsMatch = log.message.match(/params=Bundle\[(.*)\]$/);
              if (paramsMatch && paramsMatch[1]) {
                const paramsStr = paramsMatch[1];
                
                // Split by comma but handle nested structures
                const paramPairs = paramsStr.split(',').map(pair => pair.trim());
                
                paramPairs.forEach(pair => {
                  // Handle both regular pairs and those in curly braces
                  const cleanPair = pair.replace(/^\{|\}$/g, '').trim();
                  const [key, ...valueParts] = cleanPair.split('=');
                  
                  if (key && valueParts.length > 0) {
                    const value = valueParts.join('=').trim();
                    // Remove Firebase Analytics suffixes like (_o), (_et), etc.
                    const cleanKey = key.replace(/\([^)]+\)/g, '').trim();
                    parameters[cleanKey] = value;
                  }
                });
              }
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
      .filter(Boolean); // Remove null entries
  }

  // Generate a unique ID for an event
  function generateEventId(event) {
    const baseStr = `${event.timestamp}-${event.eventName || ''}-${event.message || ''}-${event.rawLog || ''}`;
    return baseStr.split('').reduce((hash, char) => {
      return ((hash << 5) - hash) + char.charCodeAt(0) | 0;
    }, 0).toString(36);
  }

  // Parse GA4 events
  function parseGA4Event(url) {
    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);
      
      // Parse event parameters
      let eventParams = {};
      try {
        if (params.get('ep')) {
          eventParams = JSON.parse(decodeURIComponent(params.get('ep')));
        }
      } catch (e) {
        console.error('Error parsing event parameters:', e);
      }

      return {
        eventName: params.get('en') || eventParams._en || 'page_view',
        eventType: 'ga4',
        parameters: {
          ...Object.fromEntries(params.entries()),
          ...eventParams
        }
      };
    } catch (error) {
      console.error('Error parsing GA4 event:', error);
      return null;
    }
  }

  // Handle starting/stopping data collection
  const handleStartCapture = async () => {
    try {
      // Start mitmproxy if not running
      if (!mitmproxyStatus.running) {
        const result = await window.api.mitmproxy.startCapturing();
        if (result.success) {
          setMitmproxyStatus({ running: true });
        }
      }

      // Start logcat if not running
      if (!logcatStatus.running && deviceId) {
        const result = await window.api.adb.startLogcatCapture(deviceId);
        if (result.success) {
          setLogcatStatus({ running: true });
        }
      }
    } catch (error) {
      console.error('Error starting capture:', error);
      alert('Error starting capture: ' + error.message);
    }
  };

  const handleStopCapture = async () => {
    try {
      // Stop mitmproxy if running
      if (mitmproxyStatus.running) {
        await window.api.mitmproxy.stopCapturing();
        setMitmproxyStatus({ running: false });
      }

      // Stop logcat if running
      if (logcatStatus.running) {
        await window.api.adb.stopLogcatCapture();
        setLogcatStatus({ running: false });
      }
    } catch (error) {
      console.error('Error stopping capture:', error);
      alert('Error stopping capture: ' + error.message);
    }
  };

  // Handle device setup
  const handleConnectDevice = () => {
    const query = {};
    if (deviceId) query.deviceId = deviceId;
    if (packageName) query.packageName = packageName;
    router.push({
      pathname: '/device-setup',
      query
    });
  };

  // Filter events based on current filters
  const filteredEvents = analyticsEvents.filter(event => {
    if (!event) return false;

    // Apply source filter
    if (sourceFilter !== 'all' && event.source !== sourceFilter) {
      return false;
    }

    // Apply text filter
    if (filter) {
      const searchStr = filter.toLowerCase();
      return (
        event.eventName?.toLowerCase().includes(searchStr) ||
        event.eventType?.toLowerCase().includes(searchStr) ||
        JSON.stringify(event.parameters).toLowerCase().includes(searchStr)
      );
    }

    return true;
  });

  // Render loading state
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

  // Render start capture state
  if (!mitmproxyStatus.running && !logcatStatus.running) {
    return (
      <div className={styles.container}>
        <div className={styles.messageContainer}>
          <div className={styles.message}>
            <h3>Start Analytics Capture</h3>
            <p>Start capturing analytics events from network traffic and/or device logs.</p>
            <button 
              className={styles.startButton}
              onClick={handleStartCapture}
            >
              Start Capture
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render waiting for events state
  if (analyticsEvents.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.messageContainer}>
          <div className={styles.message}>
            <h3>Waiting for Events</h3>
            <p>Capture is running but no events have been detected yet.</p>
            <button 
              className={styles.connectButton}
              onClick={handleConnectDevice}
            >
              Setup Device
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render main debugger UI
  return (
    <div className={styles.container}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <button 
            className={`${styles.captureButton} ${styles.stopButton}`}
            onClick={handleStopCapture}
          >
            Stop Capture
          </button>
          <button 
            className={styles.clearButton}
            onClick={() => {
              setAnalyticsEvents([]);
              setSelectedEvent(null);
              processedEventIds.current.clear();
            }}
          >
            Clear Events
          </button>
          <div className={styles.filterContainer}>
            <input
              type="text"
              className={styles.filterInput}
              placeholder="Filter events..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <select
            className={styles.sourceSelect}
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="all">All Sources</option>
            <option value="network">Network</option>
            <option value="logcat">Logcat</option>
          </select>
          <select
            className={styles.viewModeSelect}
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
          >
            <option value="parsed">Parsed View</option>
            <option value="raw">Raw View</option>
          </select>
          <label className={styles.autoRefreshLabel}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto Refresh
          </label>
        </div>
      </div>

      {/* Main content */}
      <div className={styles.content}>
        {/* Events list */}
        <div className={styles.eventsList}>
          <h3 className={styles.columnHeader}>Analytics Events ({filteredEvents.length})</h3>
          {filteredEvents.map((event, index) => (
            <div
              key={event.id}
              className={`${styles.eventItem} ${selectedEvent?.id === event.id ? styles.selected : ''}`}
              onClick={() => setSelectedEvent(event)}
            >
              <div className={styles.eventHeader}>
                <div className={styles.eventInfo}>
                  <span className={styles.eventName}>{event.eventName}</span>
                  <span className={`${styles.sourceBadge} ${styles[event.source]}`}>
                    {event.source.toUpperCase()}
                  </span>
                  {event.eventType && (
                    <span className={`${styles.typeBadge} ${styles[event.eventType]}`}>
                      {event.eventType.toUpperCase()}
                    </span>
                  )}
                </div>
                <div className={styles.eventTimestamp}>
                  {new Date(event.timestamp).toLocaleTimeString()}
                </div>
              </div>
              <div className={styles.eventPreview}>
                {Object.entries(event.parameters || {})
                  .slice(0, 3)
                  .map(([key, value]) => (
                    <span key={key} className={styles.parameterPreview}>
                      {key}: {typeof value === 'string' ? value : JSON.stringify(value)}
                    </span>
                  ))
                }
              </div>
            </div>
          ))}
        </div>

        {/* Event details */}
        <div className={styles.eventDetails}>
          {selectedEvent ? (
            <div className={styles.detailsContent}>
              <div className={styles.detailsHeader}>
                <h3 className={styles.columnHeader}>
                  Event Details: {selectedEvent.eventName}
                </h3>
                <div className={styles.detailsTimestamp}>
                  {new Date(selectedEvent.timestamp).toLocaleString()}
                </div>
              </div>

              {viewMode === 'parsed' ? (
                <>
                  {/* Basic Info Section */}
                  <div className={styles.detailsSection}>
                    <div 
                      className={styles.sectionHeader}
                      onClick={() => setExpandedSections(prev => ({
                        ...prev,
                        basicInfo: !prev.basicInfo
                      }))}
                    >
                      <h4>Basic Information</h4>
                      <span className={styles.expandIcon}>
                        {expandedSections.basicInfo ? '−' : '+'}
                      </span>
                    </div>
                    {expandedSections.basicInfo && (
                      <div className={styles.sectionContent}>
                        <table className={styles.infoTable}>
                          <tbody>
                            <tr>
                              <td>Event Name</td>
                              <td>{selectedEvent.eventName}</td>
                            </tr>
                            <tr>
                              <td>Source</td>
                              <td>{selectedEvent.source}</td>
                            </tr>
                            <tr>
                              <td>Type</td>
                              <td>{selectedEvent.eventType}</td>
                            </tr>
                            <tr>
                              <td>Timestamp</td>
                              <td>{new Date(selectedEvent.timestamp).toLocaleString()}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Parameters Section */}
                  <div className={styles.detailsSection}>
                    <div 
                      className={styles.sectionHeader}
                      onClick={() => setExpandedSections(prev => ({
                        ...prev,
                        parameters: !prev.parameters
                      }))}
                    >
                      <h4>Event Parameters</h4>
                      <span className={styles.expandIcon}>
                        {expandedSections.parameters ? '−' : '+'}
                      </span>
                    </div>
                    {expandedSections.parameters && (
                      <div className={styles.sectionContent}>
                        <div className={styles.parameterSearch}>
                          <input
                            type="text"
                            placeholder="Search parameters..."
                            value={parameterSearch}
                            onChange={(e) => setParameterSearch(e.target.value)}
                            className={styles.searchInput}
                          />
                        </div>
                        <div className={styles.parametersTable}>
                          <table>
                            <thead>
                              <tr>
                                <th>Parameter</th>
                                <th>Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(selectedEvent.parameters || {})
                                .filter(([key]) => !parameterSearch || 
                                  key.toLowerCase().includes(parameterSearch.toLowerCase()))
                                .map(([key, value]) => (
                                  <tr key={key}>
                                    <td className={styles.paramName}>{key}</td>
                                    <td className={styles.paramValue}>
                                      {typeof value === 'object' 
                                        ? JSON.stringify(value, null, 2)
                                        : String(value)
                                      }
                                    </td>
                                  </tr>
                                ))
                              }
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Raw Data Section */}
                  <div className={styles.detailsSection}>
                    <div 
                      className={styles.sectionHeader}
                      onClick={() => setExpandedSections(prev => ({
                        ...prev,
                        rawData: !prev.rawData
                      }))}
                    >
                      <h4>Raw Data</h4>
                      <span className={styles.expandIcon}>
                        {expandedSections.rawData ? '−' : '+'}
                      </span>
                    </div>
                    {expandedSections.rawData && (
                      <div className={styles.sectionContent}>
                        <pre className={styles.rawData}>
                          {selectedEvent.rawData}
                        </pre>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className={styles.rawView}>
                  <pre className={styles.rawData}>
                    {selectedEvent.rawData}
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

        {/* Screenshot column */}
        <div className={styles.screenshotColumn}>
          <h3 className={styles.columnHeader}>Screenshot</h3>
          <div className={styles.screenshotControls}>
            <button 
              className={styles.retakeButton}
              onClick={async () => {
                if (!selectedEvent) return;
                setScreenshotStatus('capturing');
                try {
                  const screenshot = await window.api.screenshot.capture();
                  setScreenshots(prev => ({
                    ...prev,
                    [selectedEvent.id]: screenshot
                  }));
                  setSelectedScreenshot(screenshot);
                  setScreenshotStatus('idle');
                } catch (error) {
                  console.error('Error capturing screenshot:', error);
                  setScreenshotStatus('error');
                }
              }}
              disabled={!selectedEvent || screenshotStatus === 'capturing'}
            >
              {screenshotStatus === 'capturing' ? 'Capturing...' : 'Retake'}
            </button>
            <button 
              className={styles.deleteButton}
              onClick={() => {
                if (!selectedEvent) return;
                setScreenshots(prev => {
                  const newScreenshots = { ...prev };
                  delete newScreenshots[selectedEvent.id];
                  return newScreenshots;
                });
                setSelectedScreenshot(null);
              }}
              disabled={!selectedEvent || !screenshots[selectedEvent?.id]}
            >
              Delete
            </button>
          </div>
          <div className={styles.screenshotContainer}>
            {selectedEvent && screenshots[selectedEvent.id] ? (
              <div className={styles.screenshotWrapper}>
                <img 
                  src={screenshots[selectedEvent.id].dataUrl} 
                  alt="Screenshot" 
                  className={styles.screenshot}
                />
              </div>
            ) : (
              <div className={styles.noScreenshot}>
                <p>No screenshot available</p>
                <p>Select an event to capture a screenshot</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 