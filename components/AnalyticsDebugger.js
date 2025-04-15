import styles from '@/styles/AnalyticsDebugger.module.css';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import AdobeAnalyticsDebugger from './AdobeAnalyticsDebugger';

export default function AnalyticsDebugger({ deviceId, packageName, show }) {
  const router = useRouter();
  const [mitmproxyStatus, setMitmproxyStatus] = useState({ running: false });
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [analyticsData, setAnalyticsData] = useState([]);
  const [hasTraffic, setHasTraffic] = useState(false);
  
  useEffect(() => {
    // Check if mitmproxy is running and get traffic data
    async function checkStatus() {
      try {
        console.log('Checking mitmproxy status...');
        const status = await window.api.mitmproxy.status();
        console.log('Mitmproxy status:', status);
        setMitmproxyStatus(status);

        if (status.running) {
          // Check if there's any traffic
          const traffic = await window.api.mitmproxy.getTraffic();
          setHasTraffic(traffic && traffic.length > 0);
          
          // Filter for Analytics requests and parse them
          const analyticsBeacons = traffic
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
            .map(entry => ({
              type: entry.type,
              fullUrl: entry.fullUrl,
              timestamp: entry.timestamp,
              // Add any other necessary fields from the traffic data
            }));
          
          setAnalyticsData(analyticsBeacons);
        }
      } catch (error) {
        console.error('Failed to check status:', error);
      } finally {
        setIsCheckingStatus(false);
      }
    }
    
    checkStatus();

    // Set up periodic status check
    const intervalId = setInterval(checkStatus, 5000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, []);
  
  if (!show) {
    console.log('Analytics Debugger hidden (show=false)');
    return null;
  }
  
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

  const handleViewLogs = () => {
    console.log('Redirecting to mitmproxy logs...');
    router.push('/mitmproxy-logs');
  };
  
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
  
  // Show appropriate message based on mitmproxy status and traffic
  if (!mitmproxyStatus.running) {
    return (
      <div className={styles.container}>
        <div className={styles.messageContainer}>
          <div className={styles.message}>
            <h3>Start Network Capture</h3>
            <p>Network capture needs to be enabled to debug analytics traffic.</p>
            <button 
              className={styles.startButton}
              onClick={async () => {
                try {
                  console.log('Starting network capture...');
                  const result = await window.api.mitmproxy.startCapturing();
                  console.log('Network capture result:', result);
                  if (result.success) {
                    setMitmproxyStatus({ running: true });
                  } else {
                    alert('Failed to start network capture: ' + result.message);
                  }
                } catch (error) {
                  console.error('Error starting capture:', error);
                  alert('Error starting network capture: ' + error.message);
                }
              }}
            >
              Start Capture
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If mitmproxy is running but no traffic detected
  if (!hasTraffic) {
    return (
      <div className={styles.container}>
        <div className={styles.messageContainer}>
          <div className={styles.message}>
            <h3>Waiting for Traffic</h3>
            <p>Mitmproxy is running but no network traffic has been detected. Make sure your device is properly connected and generating traffic.</p>
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
  
  return (
    <div className={styles.container}>
      <AdobeAnalyticsDebugger analyticsData={analyticsData} />
    </div>
  );
} 