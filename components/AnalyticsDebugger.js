import styles from '@/styles/AnalyticsDebugger.module.css';
import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';

export default function AnalyticsDebugger({ deviceId, packageName, show }) {
  const router = useRouter();
  const [mitmproxyStatus, setMitmproxyStatus] = useState({ running: false });
  const [analyticsTraffic, setAnalyticsTraffic] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastEntryId, setLastEntryId] = useState(null);
  const [expanded, setExpanded] = useState({});
  
  useEffect(() => {
    // Check if mitmproxy is running when component mounts
    async function checkMitmproxyStatus() {
      try {
        const status = await window.api.mitmproxy.status();
        setMitmproxyStatus(status);
        
        if (status.running) {
          fetchAnalyticsTraffic();
        }
      } catch (error) {
        console.error('Failed to check mitmproxy status:', error);
      }
    }
    
    checkMitmproxyStatus();
    
    // Set up polling for new traffic if mitmproxy is running
    let intervalId;
    if (mitmproxyStatus.running) {
      intervalId = setInterval(() => {
        fetchAnalyticsTraffic();
      }, 2000);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [mitmproxyStatus.running]);
  
  const fetchAnalyticsTraffic = async () => {
    try {
      setIsLoading(true);
      const allTraffic = await window.api.mitmproxy.getTraffic();
      
      if (allTraffic && Array.isArray(allTraffic)) {
        // Filter traffic for analytics-related endpoints only
        const analyticsData = allTraffic.filter(entry => {
          return (
            entry.type === 'request' && 
            (
              // Common analytics endpoints
              entry.fullUrl?.includes('google-analytics.com') ||
              entry.fullUrl?.includes('analytics.google.com') ||
              entry.fullUrl?.includes('firebase') ||
              entry.fullUrl?.includes('analytics') ||
              entry.fullUrl?.includes('collect') ||
              entry.fullUrl?.includes('metrics') ||
              entry.fullUrl?.includes('events') ||
              entry.fullUrl?.includes('track') ||
              entry.fullUrl?.includes('b/ss')
            )
          );
        });
        
        // Sort by timestamp, newest first
        const sortedTraffic = [...analyticsData].sort((a, b) => 
          new Date(b.timestamp) - new Date(a.timestamp)
        );
        
        setAnalyticsTraffic(sortedTraffic.slice(0, 10)); // Show only the latest 10 entries
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch analytics traffic:', error);
      setIsLoading(false);
    }
  };
  
  if (!show) return null;
  
  // Function to handle the "Connect a device" button click
  const handleConnectDevice = () => {
    // Redirect to device setup page
    router.push('/device-setup');
  };
  
  // Function to handle the "View MitmProxy Logs" button click
  const handleViewMitmproxyLogs = async () => {
    try {
      // If MitmProxy is not running, start it
      if (!mitmproxyStatus.running) {
        const result = await window.api.mitmproxy.startCapturing();
        if (!result.success) {
          alert('Failed to start MitmProxy: ' + result.message);
          return;
        }
        setMitmproxyStatus({ running: true });
      }
      
      // Navigate to our custom mitmproxy logs page
      router.push('/mitmproxy-logs');
    } catch (error) {
      console.error('Error accessing MitmProxy:', error);
      alert('Error accessing MitmProxy: ' + error.message);
    }
  };
  
  // Function to handle starting the proxy directly in the analytics debugger
  const handleToggleProxy = async () => {
    try {
      if (mitmproxyStatus.running) {
        const result = await window.api.mitmproxy.stopCapturing();
        if (result.success) {
          setMitmproxyStatus({ running: false });
          setAnalyticsTraffic([]);
        } else {
          alert('Failed to stop MitmProxy: ' + result.message);
        }
      } else {
        const result = await window.api.mitmproxy.startCapturing();
        if (result.success) {
          setMitmproxyStatus({ running: true });
          fetchAnalyticsTraffic();
        } else {
          alert('Failed to start MitmProxy: ' + result.message);
        }
      }
    } catch (error) {
      console.error('Error toggling MitmProxy:', error);
      alert('Error toggling MitmProxy: ' + error.message);
    }
  };
  
  const toggleExpand = (id) => {
    setExpanded(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };
  
  // Format URL for display
  const formatUrl = (url) => {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      return `${urlObj.hostname}${urlObj.pathname}`;
    } catch (e) {
      return url;
    }
  };
  
  // Extract query parameters from URL
  const extractParams = (url) => {
    if (!url) return {};
    try {
      const urlObj = new URL(url);
      const params = {};
      urlObj.searchParams.forEach((value, key) => {
        params[key] = value;
      });
      return params;
    } catch (e) {
      return {};
    }
  };
  
  // Show "No devices connected" message when no deviceId is provided
  if (!deviceId) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>Analytics Debugger</h2>
          <div className={styles.headerButtons}>
            <button 
              className={styles.viewLogsButton}
              onClick={handleViewMitmproxyLogs}
            >
              {mitmproxyStatus.running ? 'View Full MitmProxy Logs' : 'View MitmProxy Logs'}
            </button>
            <button 
              className={mitmproxyStatus.running ? styles.stopButton : styles.startButton}
              onClick={handleToggleProxy}
            >
              {mitmproxyStatus.running ? 'Stop Capturing' : 'Start Capturing'}
            </button>
          </div>
        </div>
        
        <div className={styles.content}>
          {mitmproxyStatus.running && analyticsTraffic.length > 0 ? (
            <div className={styles.analyticsTrafficContainer}>
              <h3>Recent Analytics Traffic</h3>
              <div className={styles.trafficList}>
                {analyticsTraffic.map(entry => (
                  <div 
                    key={entry.id}
                    className={styles.trafficItem}
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <div className={styles.trafficHeader}>
                      <span className={styles.method}>{entry.method}</span>
                      <span className={styles.url}>{formatUrl(entry.fullUrl)}</span>
                      <span className={styles.timestamp}>
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    
                    {expanded[entry.id] && (
                      <div className={styles.trafficDetails}>
                        <div className={styles.fullUrl}>
                          <strong>Full URL:</strong> {entry.fullUrl}
                        </div>
                        <div className={styles.metadataContainer}>
                          <div className={styles.metadataItem}>
                            <strong>Source:</strong> {entry.source}
                          </div>
                          <div className={styles.metadataItem}>
                            <strong>Destination:</strong> {entry.destination}
                          </div>
                          <div className={styles.metadataItem}>
                            <strong>Timestamp:</strong> {new Date(entry.timestamp).toLocaleString()}
                          </div>
                          <div className={styles.metadataItem}>
                            <strong>Method:</strong> {entry.method}
                          </div>
                          <div className={styles.metadataItem}>
                            <strong>Path:</strong> {entry.path}
                          </div>
                        </div>
                        <div className={styles.paramsContainer}>
                          <strong>Parameters:</strong>
                          <pre>{JSON.stringify(extractParams(entry.fullUrl), null, 2)}</pre>
                        </div>
                        <div className={styles.rawDetailsContainer}>
                          <strong>Raw Details:</strong>
                          <pre className={styles.rawDetails}>{entry.details}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : mitmproxyStatus.running ? (
            <div className={styles.messageContainer}>
              <div className={styles.message}>
                <h3>No Analytics Traffic Detected</h3>
                <p>Start using your device to generate analytics traffic.</p>
                <button 
                  className={styles.connectButton}
                  onClick={handleConnectDevice}
                >
                  Connect a Device
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.messageContainer}>
              <div className={styles.message}>
                <h3>No Devices Connected</h3>
                <button 
                  className={styles.connectButton}
                  onClick={handleConnectDevice}
                >
                  Connect a Device
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Analytics Debugger</h2>
        <div className={styles.headerButtons}>
          <button 
            className={styles.viewLogsButton}
            onClick={handleViewMitmproxyLogs}
          >
            {mitmproxyStatus.running ? 'View Full MitmProxy Logs' : 'View MitmProxy Logs'}
          </button>
          <button 
            className={mitmproxyStatus.running ? styles.stopButton : styles.startButton}
            onClick={handleToggleProxy}
          >
            {mitmproxyStatus.running ? 'Stop Capturing' : 'Start Capturing'}
          </button>
        </div>
      </div>
      
      <div className={styles.content}>
        <div className={styles.deviceInfo}>
          <h3>Device Information</h3>
          {deviceId && <p>Device ID: {deviceId}</p>}
          {packageName && <p>Package Name: {packageName}</p>}
          <button 
            className={styles.connectButton}
            onClick={handleConnectDevice}
          >
            Connect a Device
          </button>
        </div>
        
        {mitmproxyStatus.running && analyticsTraffic.length > 0 ? (
          <div className={styles.analyticsTrafficContainer}>
            <h3>Recent Analytics Traffic</h3>
            <div className={styles.trafficList}>
              {analyticsTraffic.map(entry => (
                <div 
                  key={entry.id}
                  className={styles.trafficItem}
                  onClick={() => toggleExpand(entry.id)}
                >
                  <div className={styles.trafficHeader}>
                    <span className={styles.method}>{entry.method}</span>
                    <span className={styles.url}>{formatUrl(entry.fullUrl)}</span>
                    <span className={styles.timestamp}>
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  
                  {expanded[entry.id] && (
                    <div className={styles.trafficDetails}>
                      <div className={styles.fullUrl}>
                        <strong>Full URL:</strong> {entry.fullUrl}
                      </div>
                      <div className={styles.metadataContainer}>
                        <div className={styles.metadataItem}>
                          <strong>Source:</strong> {entry.source}
                        </div>
                        <div className={styles.metadataItem}>
                          <strong>Destination:</strong> {entry.destination}
                        </div>
                        <div className={styles.metadataItem}>
                          <strong>Timestamp:</strong> {new Date(entry.timestamp).toLocaleString()}
                        </div>
                        <div className={styles.metadataItem}>
                          <strong>Method:</strong> {entry.method}
                        </div>
                        <div className={styles.metadataItem}>
                          <strong>Path:</strong> {entry.path}
                        </div>
                      </div>
                      <div className={styles.paramsContainer}>
                        <strong>Parameters:</strong>
                        <pre>{JSON.stringify(extractParams(entry.fullUrl), null, 2)}</pre>
                      </div>
                      <div className={styles.rawDetailsContainer}>
                        <strong>Raw Details:</strong>
                        <pre className={styles.rawDetails}>{entry.details}</pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : mitmproxyStatus.running ? (
          <div className={styles.messageContainer}>
            <div className={styles.message}>
              <h3>No Analytics Traffic Detected</h3>
              <p>Start using your device to generate analytics traffic.</p>
              <button 
                className={styles.connectButton}
                onClick={handleConnectDevice}
              >
                Connect a Device
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.messageContainer}>
            <div className={styles.message}>
              <h3>Analytics Monitoring Disabled</h3>
              <p>Start the proxy to begin monitoring analytics traffic.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 