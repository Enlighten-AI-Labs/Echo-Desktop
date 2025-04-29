import { useState, useEffect, useRef } from 'react';
import styles from '@/styles/components/adobe-analytics-debugger.module.css';
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

    // Parse session parameters if present
    let sessionParams = {};
    try {
      if (params.get('sp')) {
        sessionParams = JSON.parse(decodeURIComponent(params.get('sp')));
      }
    } catch (e) {
      console.error('Error parsing session parameters:', e);
    }

    // Parse user data if present
    let userData = {};
    try {
      if (params.get('ud')) {
        userData = JSON.parse(decodeURIComponent(params.get('ud')));
      }
    } catch (e) {
      console.error('Error parsing user data:', e);
    }

    // Get the event name, defaulting to page_view if not present
    const eventName = params.get('en') || eventParams._en || 'page_view';
    
    // Get the measurement ID (tid)
    const measurementId = params.get('tid') || params.get('_tid') || '';
    
    // Get the client ID
    const clientId = params.get('cid') || params.get('_cid') || '';
    
    // Get the session ID
    const sessionId = params.get('sid') || params.get('_sid') || '';
    
    // Get the timestamp
    const timestamp = params.get('_t') || params.get('_ts') || new Date().toISOString();

    return {
      type: 'GA4',
      timestamp: timestamp,
      eventName: eventName,
      clientId: clientId,
      sessionId: sessionId,
      measurementId: measurementId,
      parameters: {
        ...Object.fromEntries(params.entries()),
        ...eventParams
      },
      events: [{
        name: eventName,
        params: eventParams
      }],
      userProperties: userProps,
      sessionProperties: sessionParams,
      userData: userData,
      pageLocation: params.get('dl') || eventParams.page_location,
      pageTitle: params.get('dt') || eventParams.page_title,
      screenResolution: params.get('sr'),
      language: params.get('ul'),
      url: url
    };
  } catch (error) {
    console.error('Error parsing GA4 beacon:', error);
    return null;
  }
}

export default function AnalyticsDebugger() {
  const [beacons, setBeacons] = useState([]);
  const [selectedBeacon, setSelectedBeacon] = useState(null);
  const [filter, setFilter] = useState('');
  const [parameterFilter, setParameterFilter] = useState('');
  const [parameterValueFilter, setParameterValueFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all', 'Adobe', or 'GA4'
  const [parameterSearch, setParameterSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    basicInfo: false,
    events: true,
    parameters: true,
    userProperties: true,
    rawData: false
  });
  const [showFullData, setShowFullData] = useState(false);
  // New state for screenshots
  const [screenshots, setScreenshots] = useState({});
  const [screenshotStatus, setScreenshotStatus] = useState('idle'); // idle, capturing, success, error
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);

  // Add array of parameters to hide by default
  const hiddenParameters = [
    'AQB', 'ndh', 'pd', 't', 'ts', 'aamlh', 'ce', 'c.a.', 
    'CarrierName', 'DeviceName', '.a', '.c', 's', 'c', 'j', 
    'v', 'k', 'bh', 'AQE', 'pf', 'c.', 'a.'
  ];

  // Add a ref to track which beacons have been processed
  const processedBeaconIds = useRef(new Set());
  // Add a timestamp map to track when beacons were processed
  const beaconTimestamps = useRef(new Map());
  // Add a cleanup interval reference
  const cleanupIntervalRef = useRef(null);

  // Add copy to clipboard function
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // Add a cleanup effect for old beacons
  useEffect(() => {
    // Function to clean up old beacon IDs (older than 1 hour)
    const cleanupOldBeacons = () => {
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);
      
      beaconTimestamps.current.forEach((timestamp, beaconId) => {
        if (timestamp < oneHourAgo) {
          processedBeaconIds.current.delete(beaconId);
          beaconTimestamps.current.delete(beaconId);
        }
      });
    };
    
    // Set up a cleanup interval (every 5 minutes)
    cleanupIntervalRef.current = setInterval(cleanupOldBeacons, 5 * 60 * 1000);
    
    // Clean up on unmount
    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Function to fetch and parse traffic
    const fetchTraffic = async () => {
      try {
        const traffic = await window.api.mitmproxy.getTraffic();
        
        // Filter for Analytics requests and parse them
        const analyticsBeacons = traffic
          .filter(entry => 
            entry.type === 'request' && 
            entry.fullUrl && (
              entry.fullUrl.includes('/b/ss/') || // Adobe Analytics
              entry.fullUrl.includes('/collect') || // GA4
              entry.fullUrl.includes('/g/collect') // GA4 alternative endpoint
            )
          )
          .reduce((acc, entry) => {
            // Check for duplicates within the last 5 seconds
            const isDuplicate = acc.some(beacon => 
              beacon.rawRequest === entry.fullUrl && 
              Math.abs(new Date(beacon.timestamp) - new Date(entry.timestamp)) < 5000
            );
            
            if (!isDuplicate) {
              let parsedBeacon = null;
              if (entry.fullUrl.includes('/b/ss/')) {
                parsedBeacon = { 
                  ...parseAdobeAnalyticsBeacon(entry.fullUrl), 
                  source: 'Adobe',
                  rawRequest: entry.fullUrl,
                  timestamp: entry.timestamp || new Date().toISOString()
                };
              } else if (entry.fullUrl.includes('/collect') || entry.fullUrl.includes('/g/collect')) {
                const url = new URL(entry.fullUrl);
                parsedBeacon = { 
                  ...parseGA4Beacon(entry.fullUrl, url.search), 
                  source: 'GA4',
                  rawRequest: entry.fullUrl,
                  timestamp: entry.timestamp || new Date().toISOString()
                };
              }
              
              if (parsedBeacon) {
                // Use existing beaconId if available, otherwise generate a new one
                if (!parsedBeacon.beaconId) {
                  const beaconId = generateBeaconId(parsedBeacon);
                  parsedBeacon.id = beaconId;
                } else {
                  parsedBeacon.id = parsedBeacon.beaconId;
                }
                
                // Skip already processed beacons
                if (processedBeaconIds.current.has(parsedBeacon.id)) {
                  return acc;
                }
                
                // Only capture screenshot for new beacons that haven't been processed yet
                processedBeaconIds.current.add(parsedBeacon.id);
                // Track when this beacon was processed
                beaconTimestamps.current.set(parsedBeacon.id, Date.now());
                
                // Don't capture for the currently displayed beacon to avoid refreshing during viewing
                if (!selectedBeacon || selectedBeacon.id !== parsedBeacon.id) {
                  captureScreenshot(parsedBeacon.id);
                }
                
                acc.push(parsedBeacon);
              }
            }
            return acc;
          }, []);

        setBeacons(prevBeacons => {
          // Create a map of existing beacons for faster lookup
          const existingBeaconsMap = new Map(prevBeacons.map(b => [b.id, b]));
          
          // Add new beacons to the map, preserving existing ones
          analyticsBeacons.forEach(b => {
            if (!existingBeaconsMap.has(b.id)) {
              existingBeaconsMap.set(b.id, b);
            } else {
              // Update existing beacons with any new properties
              const existingBeacon = existingBeaconsMap.get(b.id);
              existingBeaconsMap.set(b.id, { ...existingBeacon, ...b });
            }
          });
          
          // Convert map back to array and sort by timestamp
          const updatedBeacons = Array.from(existingBeaconsMap.values())
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          
          // Optional: Limit the number of beacons to prevent memory issues
          const maxBeaconsToKeep = 200;
          return updatedBeacons.slice(0, maxBeaconsToKeep);
        });
      } catch (error) {
        console.error('Error fetching traffic:', error);
      }
    };

    // Initial fetch
    fetchTraffic();

    // Set up polling if autoRefresh is enabled
    let intervalId;
    if (autoRefresh) {
      intervalId = setInterval(fetchTraffic, 1000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [autoRefresh, selectedBeacon]);

  // Function to generate a consistent beacon ID
  const generateBeaconId = (beacon) => {
    const generateHash = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return Math.abs(hash);
    };

    if (beacon.source === 'Adobe') {
      // Create a unique string based on key Adobe beacon properties
      const keyProperties = [
        beacon.type, // 's.t' or 's.tl'
        beacon.pageName || '',
        beacon.linkName || '',
        beacon.linkType || '',
        beacon.rsid || '',
        beacon.timestamp || ''
      ].join('|');

      const hash = generateHash(keyProperties);
      
      // Format as XX.YY.ZZ
      const num = hash % 1000000; // Keep it within 6 digits
      const num1 = String(Math.floor(num / 10000)).padStart(2, '0');
      const num2 = String(Math.floor((num % 10000) / 100)).padStart(2, '0');
      const num3 = String(num % 100).padStart(2, '0');
      
      return `${num1}.${num2}.${num3}`;
    } else if (beacon.source === 'GA4') {
      // Create a unique string based on key GA4 beacon properties
      const keyProperties = [
        beacon.eventName || '',
        beacon.pageTitle || beacon.parameters?.page_title || '',
        beacon.pageLocation || beacon.parameters?.page_location || '',
        beacon.timestamp || ''
      ].join('|');

      const hash = generateHash(keyProperties);
      
      // Format as XX.YY.ZZ
      const num = hash % 1000000; // Keep it within 6 digits
      const num1 = String(Math.floor(num / 10000)).padStart(2, '0');
      const num2 = String(Math.floor((num % 10000) / 100)).padStart(2, '0');
      const num3 = String(num % 100).padStart(2, '0');
      
      return `${num1}.${num2}.${num3}`;
    }
    
    return `beacon_${Date.now()}`;
  };

  // Function to capture screenshot from RTMP stream
  const captureScreenshot = async (beaconId) => {
    // Skip if we already have a screenshot for this beacon
    if (screenshots[beaconId]) return;

    try {
      // Check if RTMP server is running
      const rtmpStatus = await window.api.rtmp.status();
      if (!rtmpStatus.running) return;

      setScreenshotStatus('capturing');
      
      // Call our screenshot capture API
      const result = await window.api.rtmp.captureScreenshot(beaconId);
      
      if (result.success) {
        // Store the screenshot metadata in state, but not the image data yet
        setScreenshots(prev => ({
          ...prev,
          [beaconId]: {
            fileName: result.fileName,
            path: result.screenshotPath,
            timestamp: new Date(result.timestamp).toISOString(),
            width: 720,
            height: null, // Height will be calculated based on aspect ratio
            dataUrl: null, // We'll load this when the beacon is selected
            cached: result.cached || false
          }
        }));
        
        // If this screenshot is for the currently selected beacon, load its data
        if (selectedBeacon && selectedBeacon.id === beaconId) {
          loadScreenshotData(beaconId);
        }
        
        setScreenshotStatus('success');
      } else {
        console.error('Failed to capture screenshot:', result.message);
        setScreenshotStatus('error');
      }
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      setScreenshotStatus('error');
    }
  };

  // Function to load screenshot data when a beacon is selected
  const loadScreenshotData = async (beaconId) => {
    if (!screenshots[beaconId] || screenshots[beaconId].dataUrl) return;
    
    try {
      setScreenshotStatus('loading');
      
      // Get the data URL for the screenshot
      const result = await window.api.rtmp.getScreenshotDataUrl(screenshots[beaconId].fileName);
      
      if (result.success) {
        // Update the screenshot with the data URL and dimensions from backend
        setScreenshots(prev => ({
          ...prev,
          [beaconId]: {
            ...prev[beaconId],
            dataUrl: result.dataUrl,
            width: result.dimensions?.width || prev[beaconId].width || 720,
            height: result.dimensions?.height || prev[beaconId].height || null
          }
        }));
      } else {
        console.error('Failed to load screenshot data:', result.message);
      }
      
      setScreenshotStatus('idle');
    } catch (error) {
      console.error('Error loading screenshot data:', error);
      setScreenshotStatus('error');
    }
  };

  // Function to retake a screenshot
  const handleRetakeScreenshot = async () => {
    if (!selectedBeacon) return;
    
    try {
      // First remove the old screenshot
      setScreenshots(prev => {
        const newScreenshots = { ...prev };
        delete newScreenshots[selectedBeacon.id];
        return newScreenshots;
      });
      
      // Then capture a new one
      setScreenshotStatus('capturing');
      await captureScreenshot(selectedBeacon.id);
      
      // Wait a moment to ensure the screenshot is saved
      setTimeout(async () => {
        await loadScreenshotData(selectedBeacon.id);
        setSelectedScreenshot(screenshots[selectedBeacon.id]);
      }, 500);
    } catch (error) {
      console.error('Error retaking screenshot:', error);
      setScreenshotStatus('error');
    }
  };

  // Function to delete a screenshot
  const handleDeleteScreenshot = () => {
    if (!selectedBeacon) return;
    
    setScreenshots(prev => {
      const newScreenshots = { ...prev };
      delete newScreenshots[selectedBeacon.id];
      return newScreenshots;
    });
    
    setSelectedScreenshot(null);
  };

  // Update selected screenshot when a beacon is selected
  useEffect(() => {
    if (selectedBeacon) {
      // If we have metadata for this screenshot but no data URL yet, load it
      if (screenshots[selectedBeacon.id] && !screenshots[selectedBeacon.id].dataUrl) {
        loadScreenshotData(selectedBeacon.id);
      }
      setSelectedScreenshot(screenshots[selectedBeacon.id]);
    } else {
      setSelectedScreenshot(null);
    }
  }, [selectedBeacon, screenshots]);

  // Filter beacons based on user input
  const filteredBeacons = beacons.filter(beacon => {
    // First filter by source type
    const matchesSource = sourceFilter === 'all' || beacon.source === sourceFilter;
    
    const matchesFilter = !filter || 
      beacon.source.toLowerCase().includes(filter.toLowerCase()) ||
      (beacon.source === 'Adobe' ? (
        (beacon.pageName || '').toLowerCase().includes(filter.toLowerCase()) ||
        beacon.url.toLowerCase().includes(filter.toLowerCase())
      ) : (
        (beacon.eventName || '').toLowerCase().includes(filter.toLowerCase()) ||
        beacon.url.toLowerCase().includes(filter.toLowerCase())
      ));

    const matchesParamFilter = !parameterFilter ||
      Object.keys(beacon.parameters).some(key => 
        key.toLowerCase().includes(parameterFilter.toLowerCase())
      );

    const matchesParamValue = !parameterValueFilter ||
      Object.values(beacon.parameters).some(value => 
        String(value).toLowerCase().includes(parameterValueFilter.toLowerCase())
      );

    return matchesSource && matchesFilter && matchesParamFilter && matchesParamValue;
  });

  const renderBeaconContent = (beacon) => {
    if (beacon.source === 'Adobe') {
      return (
        <>
          <div className={styles.beaconType}>
            <span className={styles.sourceTag}>Adobe</span>
            {beacon.type === 's.tl' ? 'custom' : 'page_view'}
          </div>
          <div className={styles.beaconTime}>
            {beacon.timestamp ? new Date(beacon.timestamp).toLocaleTimeString() : 'Unknown Time'}
          </div>
          <div className={styles.beaconPage}>{beacon.pageName || beacon.linkName || 'Unknown Page'}</div>
        </>
      );
    } else {
      return (
        <>
          <div className={styles.beaconType}>
            <span className={styles.sourceTag}>GA4</span>
            {beacon.eventName}
          </div>
          <div className={styles.beaconTime}>
            {beacon.timestamp ? new Date(beacon.timestamp).toLocaleTimeString() : 'Unknown Time'}
          </div>
          <div className={styles.beaconPage}>
            {beacon.pageTitle || beacon.parameters.page_title || beacon.pageLocation || beacon.parameters.page_location || 'Unknown Page'}
          </div>
        </>
      );
    }
  };

  const renderBeaconDetails = (beacon) => {
    if (beacon.source === 'Adobe') {
      return (
        <>
          <h2 className={styles.beaconTitle}>
            {beacon.type === 's.tl' ? 'Custom Event' : 'Page View'} (Adobe Analytics)
          </h2>

          <div className={styles.beaconSection}>
            <div 
              className={styles.accordionHeader}
              onClick={() => setExpandedSections(prev => ({
                ...prev,
                basicInfo: !prev.basicInfo
              }))}
            >
              <h3>Basic Information</h3>
              <span className={`${styles.accordionIcon} ${expandedSections.basicInfo ? styles.expanded : ''}`}>
                {expandedSections.basicInfo ? '−' : '+'}
              </span>
            </div>
            {expandedSections.basicInfo && (
              <div className={styles.beaconInfo}>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Report Suite:</span>
                  <span className={styles.value}>{beacon.rsid}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Page Name:</span>
                  <span className={styles.value}>{beacon.pageName}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.label}>URL:</span>
                  <span className={styles.value}>{beacon.url}</span>
                </div>
                {beacon.type === 's.tl' && (
                  <>
                    <div className={styles.infoRow}>
                      <span className={styles.label}>Link Type:</span>
                      <span className={styles.value}>{beacon.linkType}</span>
                    </div>
                    <div className={styles.infoRow}>
                      <span className={styles.label}>Link Name:</span>
                      <span className={styles.value}>{beacon.linkName}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Events Section */}
          {beacon.events && beacon.events.length > 0 && (
            <div className={styles.beaconSection}>
              <div 
                className={styles.accordionHeader}
                onClick={() => setExpandedSections(prev => ({
                  ...prev,
                  events: !prev.events
                }))}
              >
                <h3>Events</h3>
                <span className={`${styles.accordionIcon} ${expandedSections.events ? styles.expanded : ''}`}>
                  {expandedSections.events ? '−' : '+'}
                </span>
              </div>
              {expandedSections.events && (
                <div className={styles.beaconInfo}>
                  <div className={styles.eventsList}>
                    {beacon.events.map((event, index) => (
                      <div key={index} className={styles.eventItem}>
                        <span className={styles.eventName}>{event.name}</span>
                        {event.value && (
                          <span className={styles.eventValue}>{event.value}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      );
    } else {
      return (
        <>
          <h2 className={styles.beaconTitle}>
            {beacon.eventName} (GA4)
          </h2>

          <div className={styles.beaconSection}>
            <div 
              className={styles.accordionHeader}
              onClick={() => setExpandedSections(prev => ({
                ...prev,
                basicInfo: !prev.basicInfo
              }))}
            >
              <h3>Basic Information</h3>
              <span className={`${styles.accordionIcon} ${expandedSections.basicInfo ? styles.expanded : ''}`}>
                {expandedSections.basicInfo ? '−' : '+'}
              </span>
            </div>
            {expandedSections.basicInfo && (
              <div className={styles.beaconInfo}>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Event Name:</span>
                  <span className={styles.value}>{beacon.eventName}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Client ID:</span>
                  <span className={styles.value}>{beacon.clientId}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Page Location:</span>
                  <span className={styles.value}>{beacon.pageLocation}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Page Title:</span>
                  <span className={styles.value}>{beacon.pageTitle}</span>
                </div>
              </div>
            )}
          </div>

          {beacon.events && beacon.events.length > 0 && (
            <div className={styles.beaconSection}>
              <div 
                className={styles.accordionHeader}
                onClick={() => setExpandedSections(prev => ({
                  ...prev,
                  events: !prev.events
                }))}
              >
                <h3>Event Parameters</h3>
                <span className={`${styles.accordionIcon} ${expandedSections.events ? styles.expanded : ''}`}>
                  {expandedSections.events ? '−' : '+'}
                </span>
              </div>
              {expandedSections.events && (
                <div className={styles.beaconInfo}>
                  <div className={styles.parametersList}>
                    {beacon.events.map((event, index) => (
                      <div key={index} className={styles.eventParameters}>
                        <h4>{event.name}</h4>
                        {Object.entries(event.params || {}).map(([key, value]) => (
                          <div key={key} className={styles.parameterRow}>
                            <span className={styles.parameterName}>{key}</span>
                            <span className={styles.parameterValue}>
                              {typeof value === 'object' ? JSON.stringify(value) : value}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {Object.keys(beacon.userProperties || {}).length > 0 && (
            <div className={styles.beaconSection}>
              <div 
                className={styles.accordionHeader}
                onClick={() => setExpandedSections(prev => ({
                  ...prev,
                  userProperties: !prev.userProperties
                }))}
              >
                <h3>User Properties</h3>
                <span className={`${styles.accordionIcon} ${expandedSections.userProperties ? styles.expanded : ''}`}>
                  {expandedSections.userProperties ? '−' : '+'}
                </span>
              </div>
              {expandedSections.userProperties && (
                <div className={styles.beaconInfo}>
                  <div className={styles.parametersList}>
                    {Object.entries(beacon.userProperties).map(([key, value]) => (
                      <div key={key} className={styles.parameterRow}>
                        <span className={styles.parameterName}>{key}</span>
                        <span className={styles.parameterValue}>
                          {typeof value === 'object' ? JSON.stringify(value) : value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      );
    }
  };

  // Filter parameters based on search input and hidden status
  const filterParameters = (parameters) => {
    const entries = Object.entries(parameters);
    
    // First filter out hidden parameters if showFullData is false
    let filteredEntries = showFullData 
      ? entries 
      : entries.filter(([key]) => !hiddenParameters.includes(key));

    // Then apply search filter if there is one
    if (parameterSearch) {
      const searchLower = parameterSearch.toLowerCase();
      filteredEntries = filteredEntries.filter(([key, value]) => {
        return (
          key.toLowerCase().includes(searchLower) || 
          String(value).toLowerCase().includes(searchLower)
        );
      });
    }

    return filteredEntries;
  };

  const BeaconCard = ({ beacon, index }) => {
    const getPlatformBadgeClass = (platform) => {
      switch (platform.toLowerCase()) {
        case 'adobe': return styles.adobe;
        case 'ga4': return styles.ga4;
        case 'mixpanel': return styles.mixpanel;
        default: return '';
      }
    };

    const getPageName = (beacon) => {
      if (beacon.source === 'Adobe') {
        return beacon.pageName || beacon.linkName || 'Unknown Page';
      }
      return beacon.pageTitle || beacon.parameters?.page_title || beacon.pageLocation || beacon.parameters?.page_location || 'Unknown Page';
    };

    const getBeaconId = (beacon) => {
      const generateHash = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
      };

      if (beacon.source === 'Adobe') {
        // Create a unique string based on key Adobe beacon properties
        const keyProperties = [
          beacon.type, // 's.t' or 's.tl'
          beacon.pageName || '',
          beacon.linkName || '',
          beacon.linkType || '',
          beacon.rsid || ''
        ].join('|');

        const hash = generateHash(keyProperties);
        
        // Format as XX.YY.ZZ
        const num = hash % 1000000; // Keep it within 6 digits
        const num1 = String(Math.floor(num / 10000)).padStart(2, '0');
        const num2 = String(Math.floor((num % 10000) / 100)).padStart(2, '0');
        const num3 = String(num % 100).padStart(2, '0');
        
        return `${num1}.${num2}.${num3}`;
      } else if (beacon.source === 'GA4') {
        // Create a unique string based on key GA4 beacon properties
        const keyProperties = [
          beacon.eventName || '',
          beacon.pageTitle || beacon.parameters?.page_title || '',
          beacon.pageLocation || beacon.parameters?.page_location || ''
        ].join('|');

        const hash = generateHash(keyProperties);
        
        // Format as XX.YY.ZZ
        const num = hash % 1000000; // Keep it within 6 digits
        const num1 = String(Math.floor(num / 10000)).padStart(2, '0');
        const num2 = String(Math.floor((num % 10000) / 100)).padStart(2, '0');
        const num3 = String(num % 100).padStart(2, '0');
        
        return `${num1}.${num2}.${num3}`;
      }
      
      return beacon.id || `${String(index).padStart(2, '0')}`;
    };

    return (
      <div 
        className={`${styles.beaconCard} ${selectedBeacon && selectedBeacon.id === beacon.id ? styles.selected : ''}`} 
        onClick={() => setSelectedBeacon(beacon)}
      >
        <div className={styles.beaconCardHeader}>
          <div className={styles.beaconEventName}>
            <span className={styles.beaconNumber}>{index}</span>
            {beacon.source === 'Adobe' ? (beacon.type === 's.tl' ? 'custom' : 'page_view') : (beacon.eventName || 'Unknown Event')}
          </div>
          <span className={`${styles.platformBadge} ${getPlatformBadgeClass(beacon.source)}`}>
            {beacon.source}
          </span>
        </div>
        <div className={styles.beaconLine}>
          <span className={styles.beaconCommand}>time:</span>
          <span className={styles.beaconOutput}>{new Date(beacon.timestamp).toLocaleTimeString()}</span>
        </div>
        <div className={styles.beaconLine}>
          <span className={styles.beaconCommand}>beacon:</span>
          <span className={styles.beaconOutput}>{getBeaconId(beacon)}</span>
        </div>
        <div className={styles.beaconLine}>
          <span className={styles.beaconCommand}>page:</span>
          <span className={styles.beaconOutput}>{getPageName(beacon)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <div className={styles.logoContainer}>
          <img 
            src="/logo.png" 
            alt="Enlighten Logo" 
            className={styles.logo}
          />
        </div>
        <div className={styles.filters}>
          <div className={styles.sourceToggle}>
            <button 
              className={`${styles.toggleButton} ${sourceFilter === 'all' ? styles.active : ''}`}
              onClick={() => setSourceFilter('all')}
              data-source="all"
            >
              All
            </button>
            <button 
              className={`${styles.toggleButton} ${sourceFilter === 'Adobe' ? styles.active : ''}`}
              onClick={() => setSourceFilter('Adobe')}
              data-source="Adobe"
            >
              Adobe
            </button>
            <button 
              className={`${styles.toggleButton} ${sourceFilter === 'GA4' ? styles.active : ''}`}
              onClick={() => setSourceFilter('GA4')}
              data-source="GA4"
            >
              Google
            </button>
          </div>
          <input
            type="text"
            placeholder="Enter keywords..."
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setParameterFilter(e.target.value);
              setParameterValueFilter(e.target.value);
            }}
            className={styles.filterInput}
          />
          <label className={styles.autoRefreshLabel}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
        </div>

        <div className={styles.beaconList}>
          {[...filteredBeacons].reverse().map((beacon, index) => (
            <BeaconCard key={`${beacon.timestamp}-${index}`} beacon={beacon} index={index + 1} />
          ))}
        </div>
      </div>

      <div className={styles.content}>
        {selectedBeacon ? (
          <>
            <h1 className={styles.pageTitle}>
              {selectedBeacon.source === 'Adobe' 
                ? `${selectedBeacon.type === 's.tl' ? 'Custom Event' : 'Page View'} (Adobe Analytics)`
                : `${selectedBeacon.eventName} (GA4)`
              }
            </h1>
            
            <div className={styles.beaconSection}>
              <h3>Event Details</h3>
              <div className={styles.infoRow}>
                <div className={styles.label}>Type:</div>
                <div className={styles.value}>{selectedBeacon.type}</div>
              </div>
              <div className={styles.infoRow}>
                <div className={styles.label}>Event ID:</div>
                <div className={styles.value}>{selectedBeacon.id}</div>
              </div>
              <div className={styles.infoRow}>
                <div className={styles.label}>Timestamp:</div>
                <div className={styles.value}>{selectedBeacon.timestamp}</div>
              </div>
            </div>

            <div className={styles.beaconSection}>
              <h3>All Parameters</h3>
              <div className={styles.parameterControls}>
                <input
                  type="text"
                  placeholder="Search parameters..."
                  className={styles.parameterSearchInput}
                  value={parameterSearch}
                  onChange={(e) => setParameterSearch(e.target.value)}
                />
                <button 
                  className={styles.showFullDataButton}
                  onClick={() => setShowFullData(!showFullData)}
                >
                  Show Full Data
                </button>
              </div>
              <div className={styles.parameterTable}>
                <div className={styles.parameterTableHeader}>
                  <span>Parameter</span>
                  <span>Value</span>
                </div>
                {filterParameters(selectedBeacon.parameters || {}).map(([key, value]) => (
                  <div key={key} className={styles.parameterRow}>
                    <div className={styles.parameterName}>{key}</div>
                    <div className={styles.parameterValue}>{String(value)}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className={styles.noSelection}>
            <p>Select a beacon from the list to view details</p>
          </div>
        )}
      </div>

      <div className={styles.screenshotColumn}>
        <div className={styles.screenshotControls}>
          <button 
            className={styles.retakeButton}
            onClick={handleRetakeScreenshot}
            disabled={!selectedBeacon || screenshotStatus === 'capturing'}
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
            disabled={!selectedBeacon || !selectedScreenshot}
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
                      alt="Screenshot for selected beacon"
                      className={styles.screenshot}
                    />
                  </div>
                  <div className={styles.screenshotInfo}>
                    <span className={styles.dimensions}>
                      {selectedScreenshot.width} x {selectedScreenshot.height}
                    </span>
                    <span className={styles.timestamp}>
                      {new Date(selectedScreenshot.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </>
              ) : (
                <div className={styles.screenshotPlaceholder}>
                  <span>Loading screenshot...</span>
                  <span className={`${styles.dimensions} ${styles.loading}`}>{selectedScreenshot.width} x {selectedScreenshot.height}</span>
                </div>
              )}
            </>
          ) : (
            <div className={styles.screenshotPlaceholder}>
              <span>{selectedBeacon ? 'No Screenshot Available' : 'Select a beacon to view screenshot'}</span>
              <span className={styles.dimensions}>720 x 1,604</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 