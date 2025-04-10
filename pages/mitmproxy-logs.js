import { useRouter } from 'next/router';
import { useEffect, useState, useRef, useCallback } from 'react';
import Head from 'next/head';
import styles from '@/styles/MitmproxyLogs.module.css';

// Component to display the server IP address
function ServerIpDisplay() {
  const [ipAddress, setIpAddress] = useState('Loading...');
  
  useEffect(() => {
    async function fetchIp() {
      try {
        const ip = await window.api.mitmproxy.getProxyIp();
        setIpAddress(ip);
      } catch (error) {
        console.error('Failed to get IP address:', error);
        setIpAddress('Failed to fetch');
      }
    }
    
    fetchIp();
  }, []);
  
  return <span className={styles.ipAddress}>{ipAddress}</span>;
}

export default function MitmproxyLogsPage() {
  const router = useRouter();
  const [proxyStatus, setProxyStatus] = useState({ running: false });
  const [proxyUrl, setProxyUrl] = useState('');
  const [traffic, setTraffic] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [lastEntryId, setLastEntryId] = useState(null);
  const trafficListRef = useRef(null); // Reference to the traffic list container
  const [scrollPos, setScrollPos] = useState(0); // Track scroll position

  // Save scroll position before update
  const saveScrollPosition = useCallback(() => {
    if (trafficListRef.current) {
      setScrollPos(trafficListRef.current.scrollTop);
    }
  }, []);

  // Restore scroll position after update
  useEffect(() => {
    if (trafficListRef.current && scrollPos > 0) {
      trafficListRef.current.scrollTop = scrollPos;
    }
  }, [traffic, scrollPos]);

  // Function to fetch only new traffic data
  const fetchTraffic = async (initialLoad = false) => {
    try {
      if (initialLoad) {
        setIsLoading(true);
      } else {
        // Save scroll position before updating traffic data
        saveScrollPosition();
      }
      
      const trafficData = await window.api.mitmproxy.getTraffic();
      
      if (trafficData && Array.isArray(trafficData)) {
        // Sort by timestamp, newest first
        const sortedTraffic = [...trafficData].sort((a, b) => 
          new Date(b.timestamp) - new Date(a.timestamp)
        );
        
        if (initialLoad) {
          // For initial load, replace the entire state
          setTraffic(sortedTraffic);
          if (sortedTraffic.length > 0) {
            setLastEntryId(sortedTraffic[0].id);
          }
        } else {
          // For subsequent loads, merge only new entries
          if (sortedTraffic.length > 0 && lastEntryId) {
            // Find the index of the last known entry
            const lastKnownIndex = sortedTraffic.findIndex(entry => entry.id === lastEntryId);
            
            if (lastKnownIndex === -1) {
              // Last known entry not found - likely old data was cleared
              setTraffic(sortedTraffic);
            } else if (lastKnownIndex > 0) {
              // We have new entries (they appear before the last known entry)
              const newEntries = sortedTraffic.slice(0, lastKnownIndex);
              setTraffic(prevTraffic => [...newEntries, ...prevTraffic]);
            }
            
            // Update last seen entry ID
            if (sortedTraffic[0] && sortedTraffic[0].id !== lastEntryId) {
              setLastEntryId(sortedTraffic[0].id);
            }
          } else {
            // If we don't have a reference point, update the whole list
            setTraffic(sortedTraffic);
            if (sortedTraffic.length > 0) {
              setLastEntryId(sortedTraffic[0].id);
            }
          }
        }
        
        setLastRefresh(new Date()); // Update last refresh time
      } else {
        if (initialLoad) {
          setTraffic([]);
        }
      }
      
      if (initialLoad) {
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Failed to fetch traffic:', error);
      if (initialLoad) {
        setIsLoading(false);
      }
    }
  };
  
  useEffect(() => {
    // Check if mitmproxy is running when the component mounts
    async function checkMitmproxyStatus() {
      try {
        const status = await window.api.mitmproxy.status();
        setProxyStatus(status);
        
        if (status.running) {
          // Fetch initial traffic data
          fetchTraffic(true);
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to check mitmproxy status:', error);
        setIsLoading(false);
      }
    }
    
    checkMitmproxyStatus();
    
    // Set up an interval for streaming updates if enabled
    let intervalId;
    if (proxyStatus.running && autoRefresh) {
      intervalId = setInterval(() => {
        fetchTraffic(false);
      }, 1000); // More frequent, lighter updates
    }
    
    // Clean up the interval when component unmounts or dependencies change
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [proxyStatus.running, autoRefresh, lastEntryId]);
  
  const handleBack = () => {
    router.push('/analytics-debugger');
  };
  
  const handleStartProxy = async () => {
    try {
      const result = await window.api.mitmproxy.startCapturing();
      if (result.success) {
        setProxyStatus({ running: true });
        // Remove reference to web interface URL
        // const webInterfaceUrl = await window.api.mitmproxy.getWebInterfaceUrl();
        // setProxyUrl(webInterfaceUrl);
      } else {
        alert('Failed to start MitmProxy: ' + result.message);
      }
    } catch (error) {
      alert('Error starting MitmProxy: ' + error.message);
    }
  };
  
  const handleStopProxy = async () => {
    try {
      const result = await window.api.mitmproxy.stopCapturing();
      if (result.success) {
        setProxyStatus({ running: false });
        setProxyUrl('');
      }
    } catch (error) {
      alert('Error stopping MitmProxy: ' + error.message);
    }
  };
  
  const handleClearTraffic = async () => {
    try {
      await window.api.mitmproxy.clearTraffic();
      setTraffic([]);
      setLastEntryId(null); // Reset the last entry ID
    } catch (error) {
      alert('Error clearing traffic: ' + error.message);
    }
  };
  
  // Manual refresh that preserves user state
  const handleManualRefresh = () => {
    fetchTraffic(false);
  };
  
  // Filter traffic based on type and search term
  const filteredTraffic = traffic.filter(entry => {
    const matchesFilter = filter === 'all' || entry.type === filter;
    const matchesSearch = searchTerm === '' || 
                          JSON.stringify(entry).toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });
  
  return (
    <>
      <Head>
        <title>MitmProxy Logs | Echo Desktop</title>
        <meta name="description" content="Echo Desktop MitmProxy Logs" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className={styles.container}>
        <div className={styles.header}>
          <button 
            className={styles.backButton}
            onClick={handleBack}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to Analytics Debugger
          </button>
          <h1 className={styles.pageTitle}>MitmProxy Logs</h1>
        </div>
        
        <div className={styles.content}>
          <div className={styles.proxyStatusContainer}>
            <div className={styles.statusHeader}>
              <h2 className={styles.statusTitle}>MitmProxy Status</h2>
              <div className={styles.statusIndicator}>
                <span 
                  className={`${styles.statusDot} ${proxyStatus.running ? styles.statusRunning : styles.statusStopped}`}
                ></span>
                <span className={styles.statusText}>
                  {proxyStatus.running ? 'Running' : 'Stopped'}
                </span>
              </div>
            </div>
            
            <div className={styles.controlsContainer}>
              {proxyStatus.running ? (
                <>
                  <button 
                    className={styles.stopButton}
                    onClick={handleStopProxy}
                  >
                    Stop MitmProxy
                  </button>
                  <button 
                    className={styles.clearButton}
                    onClick={handleClearTraffic}
                  >
                    Clear Traffic
                  </button>
                </>
              ) : (
                <button 
                  className={styles.startButton}
                  onClick={handleStartProxy}
                >
                  Start MitmProxy
                </button>
              )}
            </div>
            
            {proxyStatus.running && (
              <div className={styles.infoContainer}>
                <p className={styles.infoText}>
                  MitmProxy is currently running and capturing network traffic.
                </p>
              </div>
            )}
          </div>
          
          {proxyStatus.running && (
            <div className={styles.trafficContainer}>
              <div className={styles.trafficHeader}>
                <h2 className={styles.trafficTitle}>Network Traffic</h2>
                
                <div className={styles.trafficFilters}>
                  <div className={styles.filterGroup}>
                    <label htmlFor="filterType">Filter by type:</label>
                    <select 
                      id="filterType" 
                      className={styles.filterSelect}
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">All Traffic</option>
                      <option value="request">Requests</option>
                      <option value="response">Responses</option>
                    </select>
                  </div>
                  
                  <div className={styles.autoRefreshToggle}>
                    <label htmlFor="autoRefresh">
                      <input
                        type="checkbox"
                        id="autoRefresh"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                      />
                      Auto-refresh
                    </label>
                  </div>
                  
                  <div className={styles.searchGroup}>
                    <input
                      type="text"
                      placeholder="Search traffic..."
                      className={styles.searchInput}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              
              {lastRefresh && (
                <div className={styles.lastRefreshInfo}>
                  Last updated: {lastRefresh.toLocaleTimeString()}
                  <button 
                    className={styles.refreshButton}
                    onClick={handleManualRefresh}
                    disabled={isLoading}
                  >
                    Refresh Now
                  </button>
                </div>
              )}
              
              <div className={styles.trafficList} ref={trafficListRef}>
                {isLoading ? (
                  <div className={styles.loadingContainer}>
                    <p>Loading traffic data...</p>
                  </div>
                ) : filteredTraffic.length === 0 ? (
                  <div className={styles.emptyContainer}>
                    <p>No traffic captured yet. Start browsing on your device to see network requests.</p>
                  </div>
                ) : (
                  filteredTraffic.map((entry) => (
                    <div 
                      key={entry.id} 
                      className={`${styles.trafficEntry} ${entry.type === 'request' ? styles.requestEntry : styles.responseEntry}`}
                    >
                      <div className={styles.entryHeader}>
                        <div className={styles.entryType}>
                          {entry.type === 'request' ? 'REQUEST' : 'RESPONSE'}
                        </div>
                        <div className={styles.entryTimestamp}>
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                      
                      <div className={styles.entryDetails}>
                        {entry.type === 'request' ? (
                          <>
                            <div className={styles.entryMethod}>{entry.method}</div>
                            {entry.fullUrl && (
                              <div className={styles.entryFullUrl}>{entry.fullUrl}</div>
                            )}
                            <div className={styles.entryPath}>
                              {entry.destination} {entry.path}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className={`${styles.entryStatus} ${
                              entry.status < 300 ? styles.statusSuccess : 
                              entry.status < 400 ? styles.statusRedirect :
                              entry.status < 500 ? styles.statusClientError :
                              styles.statusServerError
                            }`}>
                              Status: {entry.status}
                            </div>
                            <div className={styles.entryContent}>{entry.content}</div>
                          </>
                        )}
                      </div>
                      
                      <div className={styles.entryConnection}>
                        <div className={styles.entrySource}>From: {entry.source}</div>
                        <div className={styles.entryArrow}>→</div>
                        <div className={styles.entryDestination}>To: {entry.destination}</div>
                      </div>
                      
                      <details className={styles.entryRawDetails}>
                        <summary>Raw Details</summary>
                        <div className={styles.entryRawData}>
                          <pre>{entry.details}</pre>
                        </div>
                      </details>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
} 