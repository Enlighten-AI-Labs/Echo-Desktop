import styles from '@/styles/UnifiedAnalyticsDebugger.module.css';
import { useEffect, useState, useRef } from 'react';
import { parseAdobeAnalyticsBeacon } from '@/lib/adobe-analytics-parser';

function parseGA4Beacon(url, queryParams) {
  try {
    const params = new URLSearchParams(queryParams);
    
    // Parse the ep (event parameters) if present
    let eventParams = {};
    try {
      if (params.get('ep')) {
        eventParams = JSON.parse(decodeURIComponent(params.get('ep')));
      }
    } catch (e) {
      console.error('Error parsing event parameters:', e);
    }

    // Parse user properties if present
    let userProps = {};
    try {
      if (params.get('up')) {
        userProps = JSON.parse(decodeURIComponent(params.get('up')));
      }
    } catch (e) {
      console.error('Error parsing user properties:', e);
    }

    return {
      type: 'GA4',
      timestamp: params.get('_t') || params.get('_ts') || new Date().toISOString(),
      eventName: params.get('en') || eventParams._en || 'page_view',
      clientId: params.get('cid') || params.get('_cid') || '',
      sessionId: params.get('sid') || params.get('_sid') || '',
      measurementId: params.get('tid') || params.get('_tid') || '',
      parameters: {
        ...Object.fromEntries(params.entries()),
        ...eventParams
      },
      events: [{
        name: params.get('en') || eventParams._en || 'page_view',
        params: eventParams
      }],
      userProperties: userProps,
      pageLocation: params.get('dl') || eventParams.page_location,
      pageTitle: params.get('dt') || eventParams.page_title,
      url: url
    };
  } catch (error) {
    console.error('Error parsing GA4 beacon:', error);
    return null;
  }
}

export default function UnifiedAnalyticsDebugger({ deviceId, packageName, show }) {
  // State for analytics events from all sources
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [filter, setFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all', 'logcat', 'proxy'
  const [analyticsType, setAnalyticsType] = useState('all'); // 'all', 'google', 'adobe', 'firebase'
  const [screenshots, setScreenshots] = useState({});
  const [screenshotStatus, setScreenshotStatus] = useState('idle');
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);
  const [isCapturingLogcat, setIsCapturingLogcat] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [viewMode, setViewMode] = useState('parsed'); // 'parsed' or 'raw'
  const [expandedSections, setExpandedSections] = useState({
    basicInfo: true,
    events: true,
    parameters: true,
    userProperties: true,
    rawData: false
  });
  
  const intervalRef = useRef(null);
  const processedEventIds = useRef(new Set());

  // Function to generate a unique event ID
  const generateEventId = (event) => {
    const generateHash = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash);
    };

    const keyProperties = [
      event.source,
      event.timestamp,
      event.eventName || event.type || '',
      event.pageTitle || event.pageName || '',
      event.url || ''
    ].join('|');

    const hash = generateHash(keyProperties);
    const num = hash % 1000000;
    const num1 = String(Math.floor(num / 10000)).padStart(2, '0');
    const num2 = String(Math.floor((num % 10000) / 100)).padStart(2, '0');
    const num3 = String(num % 100).padStart(2, '0');
    
    return `${num1}.${num2}.${num3}`;
  };

  // Function to capture screenshot
  const captureScreenshot = async (eventId) => {
    if (!eventId || screenshots[eventId]) return;

    try {
      setScreenshotStatus('capturing');
      const result = await window.api.rtmp.captureScreenshot(eventId);
      
      if (result.success) {
        setScreenshots(prev => ({
          ...prev,
          [eventId]: {
            fileName: result.fileName,
            timestamp: new Date(result.timestamp).toISOString(),
            width: result.dimensions?.width || 720,
            height: result.dimensions?.height || null,
            dataUrl: null
          }
        }));
        
        if (selectedEvent && selectedEvent.id === eventId) {
          loadScreenshotData(eventId);
        }
      }
      
      setScreenshotStatus('idle');
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      setScreenshotStatus('error');
    }
  };

  // Function to load screenshot data
  const loadScreenshotData = async (eventId) => {
    if (!screenshots[eventId] || screenshots[eventId].dataUrl) return;
    
    try {
      setScreenshotStatus('loading');
      const result = await window.api.rtmp.getScreenshotDataUrl(screenshots[eventId].fileName);
      
      if (result.success) {
        setScreenshots(prev => ({
          ...prev,
          [eventId]: {
            ...prev[eventId],
            dataUrl: result.dataUrl,
            width: result.dimensions?.width || prev[eventId].width || 720,
            height: result.dimensions?.height || prev[eventId].height || null
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
    if (!selectedEvent) return;
    
    try {
      setScreenshots(prev => {
        const newScreenshots = { ...prev };
        delete newScreenshots[selectedEvent.id];
        return newScreenshots;
      });
      
      setScreenshotStatus('capturing');
      await captureScreenshot(selectedEvent.id);
      
      setTimeout(async () => {
        await loadScreenshotData(selectedEvent.id);
        setSelectedScreenshot(screenshots[selectedEvent.id]);
      }, 500);
    } catch (error) {
      console.error('Error retaking screenshot:', error);
      setScreenshotStatus('error');
    }
  };

  // Function to handle deleting screenshot
  const handleDeleteScreenshot = () => {
    if (!selectedEvent) return;
    
    setScreenshots(prev => {
      const newScreenshots = { ...prev };
      delete newScreenshots[selectedEvent.id];
      return newScreenshots;
    });
    
    setSelectedScreenshot(null);
  };

  // Effect to fetch data from both sources
  useEffect(() => {
    async function fetchData() {
      try {
        // Get logcat status and data if running
        let isRunning = false;
        try {
          isRunning = await window.api.adb.isLogcatRunning();
        } catch (error) {
          console.error('Error checking logcat status:', error);
        }
        
        setIsCapturingLogcat(isRunning);
        
        if (isRunning) {
          const logcatLogs = await window.api.adb.getAnalyticsLogs();
          if (Array.isArray(logcatLogs)) {
            const parsedLogcatEvents = logcatLogs.map(log => ({
              ...log,
              source: 'logcat',
              id: generateEventId({ ...log, source: 'logcat' }),
              timestamp: log.timestamp || new Date().toISOString()
            }));

            const filteredEvents = parsedLogcatEvents.filter(event => {
              return event.message?.includes('Logging event:') || event.message?.includes('FirebaseAnalytics');
            });
            // Process new logcat events
            filteredEvents.forEach(event => {
              if (!processedEventIds.current.has(event.id)) {
                processedEventIds.current.add(event.id);
                captureScreenshot(event.id);
              }
            });
            
            // Merge with existing events
            setEvents(currentEvents => {
              const existingEventsMap = new Map(currentEvents.map(e => [e.id, e]));
              filteredEvents.forEach(e => existingEventsMap.set(e.id, e));
              return Array.from(existingEventsMap.values())
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            });
          }
        }

        // Get proxy data
        const proxyTraffic = await window.api.mitmproxy.getTraffic();
        const analyticsBeacons = proxyTraffic
          .filter(entry => 
            entry.type === 'request' && 
            entry.fullUrl && (
              entry.fullUrl.includes('/b/ss/') || // Adobe Analytics
              entry.fullUrl.includes('/collect') || // GA4
              entry.fullUrl.includes('/g/collect') // GA4 alternative endpoint
            )
          )
          .map(entry => {
            let parsedBeacon = null;
            if (entry.fullUrl.includes('/b/ss/')) {
              parsedBeacon = { 
                ...parseAdobeAnalyticsBeacon(entry.fullUrl),
                source: 'proxy',
                analyticsType: 'adobe',
                timestamp: entry.timestamp || new Date().toISOString(),
                rawRequest: entry.fullUrl
              };
            } else if (entry.fullUrl.includes('/collect') || entry.fullUrl.includes('/g/collect')) {
              const url = new URL(entry.fullUrl);
              parsedBeacon = { 
                ...parseGA4Beacon(entry.fullUrl, url.search),
                source: 'proxy',
                analyticsType: 'ga4',
                timestamp: entry.timestamp || new Date().toISOString(),
                rawRequest: entry.fullUrl
              };
            }
            
            if (parsedBeacon) {
              parsedBeacon.id = generateEventId(parsedBeacon);
              return parsedBeacon;
            }
            
            return null;
          })
          .filter(Boolean);

        // Process new proxy events
        analyticsBeacons.forEach(beacon => {
          if (!processedEventIds.current.has(beacon.id)) {
            processedEventIds.current.add(beacon.id);
            captureScreenshot(beacon.id);
          }
        });

        // Merge with existing events
        setEvents(currentEvents => {
          const existingEventsMap = new Map(currentEvents.map(e => [e.id, e]));
          analyticsBeacons.forEach(e => existingEventsMap.set(e.id, e));
          return Array.from(existingEventsMap.values())
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        });

      } catch (error) {
        console.error('Error fetching analytics data:', error);
      } finally {
        setIsCheckingStatus(false);
      }
    }

    // Initial fetch
    fetchData();

    // Set up polling if autoRefresh is enabled
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchData, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh]);

  // Effect to handle screenshot updates when selected event changes
  useEffect(() => {
    if (selectedEvent) {
      if (screenshots[selectedEvent.id] && !screenshots[selectedEvent.id].dataUrl) {
        loadScreenshotData(selectedEvent.id);
      }
      setSelectedScreenshot(screenshots[selectedEvent.id]);
    } else {
      setSelectedScreenshot(null);
    }
  }, [selectedEvent, screenshots]);

  // Function to start/stop logcat capture
  const handleToggleLogcat = async () => {
    try {
      if (isCapturingLogcat) {
        const result = await window.api.adb.stopLogcatCapture();
        if (result.success) {
          setIsCapturingLogcat(false);
        }
      } else {
        if (!deviceId) {
          alert('Please select a device first.');
          return;
        }
        const result = await window.api.adb.startLogcatCapture(deviceId);
        if (result.success) {
          setIsCapturingLogcat(true);
          await window.api.adb.clearAnalyticsLogs();
        }
      }
    } catch (error) {
      console.error('Error toggling logcat capture:', error);
      alert('Error: ' + error.message);
    }
  };

  // Function to clear all events
  const handleClearEvents = async () => {
    try {
      await window.api.adb.clearAnalyticsLogs();
      setEvents([]);
      setSelectedEvent(null);
    } catch (error) {
      console.error('Error clearing events:', error);
      alert('Error: ' + error.message);
    }
  };

  // Filter events based on user input
  const filteredEvents = events.filter(event => {
    // Filter by source
    if (sourceFilter !== 'all' && event.source !== sourceFilter) return false;

    // Filter by analytics type
    if (analyticsType !== 'all') {
      if (event.source === 'logcat') {
        if (analyticsType === 'adobe' && !event.message?.includes('/b/ss/')) return false;
        if (analyticsType === 'google' && !event.message?.includes('firebase')) return false;
      } else if (event.source === 'proxy') {
        if (analyticsType === 'adobe' && event.analyticsType !== 'adobe') return false;
        if (analyticsType === 'google' && event.analyticsType !== 'ga4') return false;
      }
    }

    // Filter by search text
    if (filter) {
      const searchText = filter.toLowerCase();
      return (
        event.eventName?.toLowerCase().includes(searchText) ||
        event.pageName?.toLowerCase().includes(searchText) ||
        event.message?.toLowerCase().includes(searchText) ||
        event.url?.toLowerCase().includes(searchText)
      );
    }

    return true;
  });

  if (!show) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <button 
            className={`${styles.captureButton} ${isCapturingLogcat ? styles.stopButton : styles.startButton}`}
            onClick={handleToggleLogcat}
          >
            {isCapturingLogcat ? 'Stop Logcat' : 'Start Logcat'}
          </button>
          
          <button 
            className={styles.clearButton}
            onClick={handleClearEvents}
            disabled={events.length === 0}
          >
            Clear Events
          </button>
        </div>

        <div className={styles.toolbarRight}>
          <select 
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className={styles.sourceSelect}
          >
            <option value="all">All Sources</option>
            <option value="logcat">Logcat</option>
            <option value="proxy">Network</option>
          </select>

          <select
            value={analyticsType}
            onChange={(e) => setAnalyticsType(e.target.value)}
            className={styles.typeSelect}
          >
            <option value="all">All Analytics</option>
            <option value="google">Google Analytics</option>
            <option value="adobe">Adobe Analytics</option>
          </select>

          <input
            type="text"
            placeholder="Search events..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={styles.searchInput}
          />

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

      <div className={styles.content}>
        <div className={styles.eventsList}>
          {filteredEvents.map((event, index) => (
            <div
              key={event.id}
              className={`${styles.eventCard} ${selectedEvent?.id === event.id ? styles.selected : ''}`}
              onClick={() => setSelectedEvent(event)}
            >
              <div className={styles.eventHeader}>
                <span className={styles.eventSource}>{event.source}</span>
                <span className={styles.eventType}>
                  {event.source === 'logcat' 
                    ? (event.message?.includes('/b/ss/') ? 'Adobe' : 'Firebase')
                    : event.analyticsType?.toUpperCase()}
                </span>
                <span className={styles.eventTime}>
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className={styles.eventName}>
                {event.source === 'logcat'
                  ? (event.message?.includes('Logging event:') 
                      ? event.message.match(/name=([^,]+)/)?.[1] || 'Unknown Event'
                      : 'Analytics Event')
                  : (event.eventName || event.type || 'Unknown Event')}
              </div>
              <div className={styles.eventPage}>
                {event.pageName || event.pageTitle || event.url || 'Unknown Page'}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.eventDetails}>
          {selectedEvent ? (
            <>
              <div className={styles.detailsHeader}>
                <h2>Event Details</h2>
                <div className={styles.viewControls}>
                  <button
                    className={`${styles.viewButton} ${viewMode === 'parsed' ? styles.active : ''}`}
                    onClick={() => setViewMode('parsed')}
                  >
                    Parsed
                  </button>
                  <button
                    className={`${styles.viewButton} ${viewMode === 'raw' ? styles.active : ''}`}
                    onClick={() => setViewMode('raw')}
                  >
                    Raw
                  </button>
                </div>
              </div>

              {viewMode === 'parsed' ? (
                <>
                  <div className={styles.section}>
                    <div 
                      className={styles.sectionHeader}
                      onClick={() => setExpandedSections(prev => ({
                        ...prev,
                        basicInfo: !prev.basicInfo
                      }))}
                    >
                      <h3>Basic Information</h3>
                      <span>{expandedSections.basicInfo ? '−' : '+'}</span>
                    </div>
                    {expandedSections.basicInfo && (
                      <div className={styles.sectionContent}>
                        <div className={styles.infoRow}>
                          <span className={styles.label}>Source:</span>
                          <span className={styles.value}>{selectedEvent.source}</span>
                        </div>
                        <div className={styles.infoRow}>
                          <span className={styles.label}>Type:</span>
                          <span className={styles.value}>
                            {selectedEvent.source === 'logcat'
                              ? (selectedEvent.message?.includes('/b/ss/') ? 'Adobe' : 'Firebase')
                              : selectedEvent.analyticsType}
                          </span>
                        </div>
                        <div className={styles.infoRow}>
                          <span className={styles.label}>Timestamp:</span>
                          <span className={styles.value}>
                            {new Date(selectedEvent.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {selectedEvent.pageName && (
                          <div className={styles.infoRow}>
                            <span className={styles.label}>Page Name:</span>
                            <span className={styles.value}>{selectedEvent.pageName}</span>
                          </div>
                        )}
                        {selectedEvent.url && (
                          <div className={styles.infoRow}>
                            <span className={styles.label}>URL:</span>
                            <span className={styles.value}>{selectedEvent.url}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedEvent.parameters && Object.keys(selectedEvent.parameters).length > 0 && (
                    <div className={styles.section}>
                      <div 
                        className={styles.sectionHeader}
                        onClick={() => setExpandedSections(prev => ({
                          ...prev,
                          parameters: !prev.parameters
                        }))}
                      >
                        <h3>Parameters</h3>
                        <span>{expandedSections.parameters ? '−' : '+'}</span>
                      </div>
                      {expandedSections.parameters && (
                        <div className={styles.sectionContent}>
                          <div className={styles.parametersTable}>
                            {Object.entries(selectedEvent.parameters).map(([key, value]) => (
                              <div key={key} className={styles.parameterRow}>
                                <span className={styles.paramName}>{key}</span>
                                <span className={styles.paramValue}>
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.section}>
                  <div className={styles.rawData}>
                    <pre>
                      {selectedEvent.source === 'proxy'
                        ? selectedEvent.rawRequest
                        : selectedEvent.message}
                    </pre>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className={styles.noSelection}>
              <p>Select an event to view details</p>
            </div>
          )}
        </div>

        <div className={styles.screenshotPanel}>
          <div className={styles.screenshotControls}>
            <button 
              className={styles.retakeButton}
              onClick={handleRetakeScreenshot}
              disabled={!selectedEvent || screenshotStatus === 'capturing'}
            >
              {screenshotStatus === 'capturing' ? 'Capturing...' : 'Retake Screenshot'}
            </button>
            <button 
              className={styles.deleteButton}
              onClick={handleDeleteScreenshot}
              disabled={!selectedEvent || !selectedScreenshot}
            >
              Delete Screenshot
            </button>
          </div>
          
          <div className={styles.screenshotContainer}>
            {selectedScreenshot ? (
              <>
                {selectedScreenshot.dataUrl ? (
                  <div className={styles.screenshotWrapper}>
                    <img 
                      src={selectedScreenshot.dataUrl} 
                      alt="Event Screenshot"
                      className={styles.screenshot}
                    />
                    <div className={styles.screenshotInfo}>
                      <span>{selectedScreenshot.width} x {selectedScreenshot.height}</span>
                      <span>{new Date(selectedScreenshot.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ) : (
                  <div className={styles.loading}>Loading screenshot...</div>
                )}
              </>
            ) : (
              <div className={styles.noScreenshot}>
                <p>No screenshot available</p>
                <p>Select an event to view or capture a screenshot</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}