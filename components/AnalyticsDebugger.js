import styles from '@/styles/AnalyticsDebugger.module.css';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function AnalyticsDebugger({ deviceId, packageName, show }) {
  const router = useRouter();
  const [mitmproxyStatus, setMitmproxyStatus] = useState({ running: false });
  
  useEffect(() => {
    // Check if mitmproxy is running and get traffic data
    async function checkStatus() {
      try {
        console.log('Checking mitmproxy status...');
        const status = await window.api.mitmproxy.status();
        console.log('Mitmproxy status:', status);
        setMitmproxyStatus(status);
      } catch (error) {
        console.error('Failed to check status:', error);
      } finally {
        setIsCheckingStatus(false);
      }
    }
    
    checkMitmproxyStatus();
  }, []);
  
  if (!show) {
    console.log('Analytics Debugger hidden (show=false)');
    return null;
  }
  
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
  
  // Show "No devices connected" message when no deviceId is provided
  if (!deviceId) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>Analytics Debugger</h2>
          <button 
            className={styles.viewLogsButton}
            onClick={handleViewMitmproxyLogs}
          >
            {mitmproxyStatus.running ? 'View MitmProxy Logs' : 'Start MitmProxy'}
          </button>
        </div>
        
        <div className={styles.content}>
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
        </div>
      </div>
    );
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Analytics Debugger</h2>
        <button 
          className={styles.viewLogsButton}
          onClick={handleViewMitmproxyLogs}
        >
          {mitmproxyStatus.running ? 'View MitmProxy Logs' : 'Start MitmProxy'}
        </button>
      </div>
      
      <div className={styles.content}>
        <div className={styles.messageContainer}>
          <div className={styles.message}>
            <h3>Analytics Logging Feature Removed</h3>
            <p>The analytics debugging and logging functionality has been removed from this application.</p>
            {deviceId && <p>Device ID: {deviceId}</p>}
            {packageName && <p>Package Name: {packageName}</p>}
          </div>
        </div>
      </div>
    </div>
  );
} 