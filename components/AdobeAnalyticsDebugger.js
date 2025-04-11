import { useState, useEffect } from 'react';
import styles from '@/styles/AdobeAnalyticsDebugger.module.css';
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

  // Add array of parameters to hide by default
  const hiddenParameters = [
    'AQB', 'ndh', 'pd', 't', 'ts', 'aamlh', 'ce', 'c.a.', 
    'CarrierName', 'DeviceName', '.a', '.c', 's', 'c', 'j', 
    'v', 'k', 'bh', 'AQE', 'pf', 'c.', 'a.'
  ];

  // Add copy to clipboard function
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

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
          .map(entry => {
            if (entry.fullUrl.includes('/b/ss/')) {
              return { 
                ...parseAdobeAnalyticsBeacon(entry.fullUrl), 
                source: 'Adobe',
                rawRequest: entry.fullUrl,  // Store the original request URL
                timestamp: entry.timestamp || new Date().toISOString()  // Use the original timestamp
              };
            } else if (entry.fullUrl.includes('/collect') || entry.fullUrl.includes('/g/collect')) {
              const url = new URL(entry.fullUrl);
              return { 
                ...parseGA4Beacon(entry.fullUrl, url.search), 
                source: 'GA4',
                rawRequest: entry.fullUrl,  // Store the original request URL
                timestamp: entry.timestamp || new Date().toISOString()  // Use the original timestamp
              };
            }
            return null;
          })
          .filter(beacon => beacon !== null);

        setBeacons(analyticsBeacons);
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
  }, [autoRefresh]);

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

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
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
            placeholder="Filter by Source/Event/Page..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={styles.filterInput}
          />
          <input
            type="text"
            placeholder="Filter by Parameter Name..."
            value={parameterFilter}
            onChange={(e) => setParameterFilter(e.target.value)}
            className={styles.filterInput}
          />
          <input
            type="text"
            placeholder="Filter by Parameter Value..."
            value={parameterValueFilter}
            onChange={(e) => setParameterValueFilter(e.target.value)}
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
            <div
              key={`${beacon.timestamp}-${index}`}
              className={`${styles.beaconItem} ${selectedBeacon === beacon ? styles.selected : ''} ${styles[`beacon${beacon.source}`]}`}
              onClick={() => setSelectedBeacon(beacon)}
            >
              <div className={styles.beaconNumber}>{filteredBeacons.length - index}</div>
              <div className={styles.beaconContent}>
                {renderBeaconContent(beacon)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.content}>
        {selectedBeacon ? (
          <div className={styles.beaconDetails}>
            {renderBeaconDetails(selectedBeacon)}
            
            <div className={styles.beaconSection}>
              <div 
                className={styles.accordionHeader}
                onClick={() => setExpandedSections(prev => ({
                  ...prev,
                  parameters: !prev.parameters
                }))}
              >
                <h3>All Parameters</h3>
                <span className={`${styles.accordionIcon} ${expandedSections.parameters ? styles.expanded : ''}`}>
                  {expandedSections.parameters ? '−' : '+'}
                </span>
              </div>
              {expandedSections.parameters && (
                <div className={styles.beaconInfo}>
                  <div className={styles.parameterControls}>
                    <div className={styles.parameterSearchContainer}>
                      <input
                        type="text"
                        placeholder="Search parameters..."
                        value={parameterSearch}
                        onChange={(e) => setParameterSearch(e.target.value)}
                        className={styles.parameterSearchInput}
                      />
                      {parameterSearch && (
                        <button 
                          className={styles.clearSearchButton}
                          onClick={() => setParameterSearch('')}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <button 
                      className={`${styles.toggleDataButton} ${showFullData ? styles.active : ''}`}
                      onClick={() => setShowFullData(!showFullData)}
                    >
                      {showFullData ? 'Hide System Parameters' : 'Show Full Data'}
                    </button>
                  </div>
                  <div className={styles.parametersList}>
                    {filterParameters(selectedBeacon.parameters).map(([key, value]) => (
                      <div key={key} className={styles.parameterRow}>
                        <span className={styles.parameterName}>{key}</span>
                        <span className={styles.parameterValue}>
                          {typeof value === 'object' ? JSON.stringify(value) : value}
                        </span>
                      </div>
                    ))}
                    {filterParameters(selectedBeacon.parameters).length === 0 && (
                      <div className={styles.noResults}>
                        No parameters match your search
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Raw Data Section */}
            <div className={styles.beaconSection}>
              <div 
                className={styles.accordionHeader}
                onClick={() => setExpandedSections(prev => ({
                  ...prev,
                  rawData: !prev.rawData
                }))}
              >
                <h3>Raw Data</h3>
                <span className={`${styles.accordionIcon} ${expandedSections.rawData ? styles.expanded : ''}`}>
                  {expandedSections.rawData ? '−' : '+'}
                </span>
              </div>
              {expandedSections.rawData && (
                <div className={styles.beaconInfo}>
                  <div className={styles.rawDataContainer}>
                    <button 
                      className={styles.copyButton}
                      onClick={() => copyToClipboard(selectedBeacon.rawRequest)}
                    >
                      Copy Request
                    </button>
                    <pre className={styles.codeBox}>
                      <code>{selectedBeacon.rawRequest}</code>
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.noSelection}>
            <p>Select a beacon from the list to view details</p>
          </div>
        )}
      </div>
    </div>
  );
} 