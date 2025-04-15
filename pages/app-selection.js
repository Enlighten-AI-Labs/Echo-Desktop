import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import styles from '@/styles/AppSelection.module.css';

export default function AppSelection() {
  const router = useRouter();
  const deviceId = router.query.deviceId || '';
  const [proxyIp, setProxyIp] = useState('');
  const [proxyPort, setProxyPort] = useState('8080');
  const [apps, setApps] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [proxyStatus, setProxyStatus] = useState({
    enabled: false,
    loading: false,
    error: null,
    message: null
  });
  const [launchStatus, setLaunchStatus] = useState({
    step: '',
    message: ''
  });

  useEffect(() => {
    // Only fetch apps when deviceId is available
    if (deviceId) {
      fetchDeviceInfo();
      fetchInstalledApps();
      getProxyIpAddress();
      checkCurrentProxyStatus();
    }
  }, [deviceId]);

  const getProxyIpAddress = async () => {
    try {
      // Get the local IP address for mitmproxy
      const localIp = await window.api.mitmproxy.getProxyIp();
      setProxyIp(localIp);
    } catch (error) {
      console.error('Failed to get proxy IP address:', error);
      setProxyIp('127.0.0.1'); // Fallback to localhost
    }
  };

  const fetchDeviceInfo = async () => {
    try {
      const devices = await window.api.adb.getDevices();
      const device = devices.find(d => d.id === deviceId);
      if (device) {
        setDeviceInfo(device);
      }
    } catch (error) {
      console.error('Failed to get device info:', error);
    }
  };

  const fetchInstalledApps = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const appsList = await window.api.adb.getInstalledApps(deviceId);
      setApps(appsList);
    } catch (err) {
      console.error('Error fetching installed apps:', err);
      setError('Failed to get installed apps. Please make sure your device is connected.');
    } finally {
      setIsLoading(false);
    }
  };

  const checkCurrentProxyStatus = async () => {
    if (!deviceId) return;

    try {
      // Check if proxy is already enabled
      const globalProxy = await executeAdbCommand(`shell settings get global http_proxy`);
      console.log("Current global proxy settings:", globalProxy);
      
      if (globalProxy.output && globalProxy.output !== ':0' && globalProxy.output.trim() !== '') {
        // Extract proxy IP and port from the output
        const proxyMatch = globalProxy.output.match(/([0-9.]+):(\d+)/);
        if (proxyMatch) {
          const [_, ip, port] = proxyMatch;
          setProxyIp(ip);
          setProxyPort(port);
          setProxyStatus({
            enabled: true,
            loading: false,
            error: null,
            message: `Proxy detected: ${ip}:${port}`
          });
          console.log(`Proxy already enabled with ${ip}:${port}`);
          return;
        }
      }
      
      // Also check system settings as fallback
      const systemProxy = await executeAdbCommand(`shell settings get system http_proxy`);
      console.log("Current system proxy settings:", systemProxy);
      
      if (systemProxy.output && systemProxy.output !== ':0' && systemProxy.output.trim() !== '') {
        const proxyMatch = systemProxy.output.match(/([0-9.]+):(\d+)/);
        if (proxyMatch) {
          const [_, ip, port] = proxyMatch;
          setProxyIp(ip);
          setProxyPort(port);
          setProxyStatus({
            enabled: true,
            loading: false,
            error: null,
            message: `Proxy detected: ${ip}:${port} (system settings)`
          });
          console.log(`Proxy already enabled with ${ip}:${port} (system settings)`);
          return;
        }
      }
      
      // If we get here, no proxy is set
      console.log("No proxy is currently set");
      setProxyStatus({
        enabled: false,
        loading: false,
        error: null,
        message: null
      });
      
    } catch (error) {
      console.error("Error checking proxy status:", error);
      // Don't update state, just log the error
    }
  };

  const setDeviceProxy = async () => {
    if (!deviceId) {
      setProxyStatus({
        enabled: false,
        loading: false,
        error: "Device ID not available"
      });
      return false; // Return success status
    }
    
    setProxyStatus({
      enabled: false,
      loading: true,
      error: null,
      message: "Setting up proxy..."
    });
    
    try {
      console.log(`Setting up proxy for device ${deviceId}: ${proxyIp}:${proxyPort}`);
      
      // Try both global and system settings approaches to ensure compatibility with different devices
      const setGlobalResult = await executeAdbCommand(`shell settings put global http_proxy ${proxyIp}:${proxyPort}`);
      console.log("Set global http_proxy result:", setGlobalResult);
      
      await executeAdbCommand(`shell settings put global global_http_proxy_host ${proxyIp}`);
      await executeAdbCommand(`shell settings put global global_http_proxy_port ${proxyPort}`);
      
      // Verify the proxy settings were applied
      const verifyResult = await executeAdbCommand(`shell settings get global http_proxy`);
      console.log("Verify proxy settings:", verifyResult);
      
      // If the global setting was successful, we're done
      if (verifyResult.output && verifyResult.output.includes(proxyIp)) {
        setProxyStatus({
          enabled: true,
          loading: false,
          error: null,
          message: `Proxy successfully configured: ${proxyIp}:${proxyPort}`
        });
        return true; // Return success status
      } else {
        // Try an alternative approach using system settings
        console.log("Global settings didn't work, trying system settings...");
        
        await executeAdbCommand(`shell settings put system http_proxy ${proxyIp}:${proxyPort}`);
        await executeAdbCommand(`shell settings put system global_http_proxy_host ${proxyIp}`);
        await executeAdbCommand(`shell settings put system global_http_proxy_port ${proxyPort}`);
        
        const verifySystemProxy = await executeAdbCommand(`shell settings get system http_proxy`);
        console.log("Verify system proxy settings:", verifySystemProxy);
        
        if (verifySystemProxy.output && verifySystemProxy.output.includes(proxyIp)) {
          setProxyStatus({
            enabled: true,
            loading: false,
            error: null,
            message: `Proxy successfully configured through system settings: ${proxyIp}:${proxyPort}`
          });
          return true; // Return success status
        } else {
          throw new Error("Failed to verify proxy settings");
        }
      }
    } catch (error) {
      console.error('Failed to set proxy:', error);
      setProxyStatus({
        enabled: false,
        loading: false,
        error: error.message || 'Failed to set proxy settings',
        message: "An error occurred while setting up the proxy"
      });
      return false; // Return failure status
    }
  };

  const clearDeviceProxy = async () => {
    if (!deviceId) {
      setProxyStatus({
        enabled: false,
        loading: false,
        error: "Device ID not available"
      });
      return;
    }
    
    setProxyStatus({
      enabled: false,
      loading: true,
      error: null,
      message: "Clearing proxy settings..."
    });
    
    try {
      console.log(`Clearing proxy for device ${deviceId}`);
      
      // Execute ADB commands to clear the proxy from both global and system
      const deleteGlobalResult = await executeAdbCommand('shell settings delete global http_proxy');
      console.log("Delete global http_proxy result:", deleteGlobalResult);
      
      await executeAdbCommand('shell settings delete global global_http_proxy_host');
      await executeAdbCommand('shell settings delete global global_http_proxy_port');
      
      // Also try system settings
      await executeAdbCommand('shell settings delete system http_proxy');
      await executeAdbCommand('shell settings delete system global_http_proxy_host');
      await executeAdbCommand('shell settings delete system global_http_proxy_port');
      
      // Alternative direct command that works on some devices
      await executeAdbCommand('shell settings put global http_proxy :0');
      
      // Verify the proxy settings are cleared
      const verifyProxy = await executeAdbCommand(`shell settings get global http_proxy`);
      console.log("Verify proxy settings cleared:", verifyProxy);
      
      setProxyStatus({
        enabled: false,
        loading: false,
        error: null,
        message: "Proxy successfully disabled"
      });
    } catch (error) {
      console.error('Failed to clear proxy:', error);
      setProxyStatus({
        enabled: false,
        loading: false,
        error: error.message || 'Failed to clear proxy settings',
        message: "An error occurred while disabling the proxy"
      });
    }
  };

  const executeAdbCommand = async (command) => {
    try {
      const result = await window.api.adb.executeCommand(deviceId, command);
      console.log(`ADB command result (${command}):`, result);
      
      if (!result.success) {
        throw new Error(result.error || "Command failed");
      }
      
      return result;
    } catch (error) {
      console.error(`Error executing ADB command (${command}):`, error);
      throw error;
    }
  };

  const handleContinue = async () => {
    if (!selectedApp) {
      setError('Please select an app to continue');
      return;
    }

    setIsLoading(true);
    setLaunchStatus({ step: 'starting', message: 'Starting launch process...' });

    try {
      console.log('Launching app:', selectedApp.packageName);

      // Check if proxy is enabled on device
      /*
      if (!proxyStatus.enabled) {
        setLaunchStatus({ step: 'proxy', message: 'Setting up proxy on device...' });
        console.log('Proxy not enabled on device, setting it up...');
        const proxySetupSuccess = await setDeviceProxy();
        
        if (!proxySetupSuccess) {
          throw new Error('Failed to set up proxy on device. Please try enabling it manually.');
        }
      }
      */

      // Check mitm proxy status and start if not running
      setLaunchStatus({ step: 'mitmproxy', message: 'Checking mitmproxy status...' });
      const proxyRunningStatus = await window.api.mitmproxy.status();
      if (!proxyRunningStatus.running) {
        setLaunchStatus({ step: 'mitmproxy', message: 'Starting mitmproxy...' });
        console.log('Starting mitmproxy...');
        const proxyResult = await window.api.mitmproxy.startCapturing();
        
        if (!proxyResult.success) {
          throw new Error(`Failed to start proxy: ${proxyResult.message}`);
        }
        console.log('Mitmproxy started successfully');
      }

      // Clear any existing analytics data
      setLaunchStatus({ step: 'clearTraffic', message: 'Clearing previous analytics data...' });
      await window.api.mitmproxy.clearTraffic();
      
      // Launch the app on the device
      setLaunchStatus({ step: 'launchApp', message: 'Launching app on device...' });
      console.log('Launching app on device:', deviceId);
      const launchResult = await window.api.adb.launchApp(deviceId, selectedApp.packageName);

      if (!launchResult.success) {
        throw new Error(`Failed to launch app: ${launchResult.message}`);
      }
      
      setLaunchStatus({ step: 'complete', message: 'App launched successfully!' });
      console.log('App launched successfully, redirecting to analytics debugger');
      
      // Navigate to analytics debugger with the device ID and package name
      router.push({
        pathname: '/analytics-debugger',
        query: { 
          deviceId, 
          packageName: selectedApp.packageName,
          proxyEnabled: true
        }
      });
    } catch (error) {
      console.error('Error in handleContinue:', error);
      setError(`Error: ${error.message}`);
      setLaunchStatus({ step: 'error', message: error.message });
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    router.push({
      pathname: '/device-setup',
      query: router.query
    });
  };

  // Filter apps based on search term
  const filteredApps = apps.filter(app => 
    app.packageName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <Head>
        <title>Select App | Echo Desktop</title>
        <meta name="description" content="Select Android App" />
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
            Back
          </button>
          <h1 className={styles.pageTitle}>Select Android App</h1>
        </div>
        
        <div className={styles.content}>
          <div className={styles.selectionContainer}>
            <div className={styles.deviceInfoBar}>
              <div className={styles.deviceIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M17.523 15.3414c-.5511 0-.998-.4478-.998-.998v-5.3438c0-.5511.4478-.998.998-.998.5511 0 .998.4478.998.998v5.3438c0 .5511-.4478.998-.998.998m-11.046 0c-.5511 0-.998-.4478-.998-.998v-5.3438c0-.5511.4478-.998.998-.998.5511 0 .998.4478.998.998v5.3438c0 .5511-.4478.998-.998.998m7.0098-14.291.8899-1.6631c.0394-.0738.0116-.1662-.0622-.2061-.0739-.0398-.1663-.0119-.2061.0622l-.9003 1.6827c-.7057-.3099-1.4976-.4817-2.33-.4817-.8325 0-1.6245.1718-2.33.4817l-.9003-1.6827c-.0398-.074-.1322-.102-.2061-.0622-.0739.0398-.1016.1323-.0622.2061l.8899 1.6631C4.6414 2.3295 1.7382 5.6783 1.7382 9.6047h20.5236c0-3.9264-2.9032-7.2752-8.7138-8.5543"></path>
                </svg>
              </div>
              <div className={styles.deviceDetails}>
                <h3>Selected Device</h3>
                <p>{deviceInfo ? deviceInfo.name || deviceInfo.id : deviceId}</p>
              </div>
              
              <div className={styles.proxyControls}>
                <div className={styles.proxyStatus}>
                  {proxyStatus.enabled ? (
                    <span className={styles.proxyEnabled}>Proxy Enabled</span>
                  ) : (
                    <span className={styles.proxyDisabled}>Proxy Disabled</span>
                  )}
                </div>
                <div className={styles.proxyButtons}>
                  <button 
                    className={`${styles.proxyButton} ${styles.enableProxy}`}
                    onClick={setDeviceProxy}
                    disabled={proxyStatus.loading || proxyStatus.enabled}
                  >
                    {proxyStatus.loading ? 'Setting...' : 'Enable Proxy'}
                  </button>
                  <button 
                    className={`${styles.proxyButton} ${styles.disableProxy}`}
                    onClick={clearDeviceProxy}
                    disabled={proxyStatus.loading || !proxyStatus.enabled}
                  >
                    {proxyStatus.loading ? 'Clearing...' : 'Disable Proxy'}
                  </button>
                </div>
              </div>
            </div>
            
            <div className={styles.proxySettings}>
              <h3>Proxy Settings</h3>
              <div className={styles.proxyInputs}>
                <div className={styles.proxyInputField}>
                  <label htmlFor="proxyIp">Proxy IP:</label>
                  <input
                    id="proxyIp"
                    type="text"
                    value={proxyIp}
                    onChange={(e) => setProxyIp(e.target.value)}
                    className={styles.proxyInput}
                    placeholder="192.168.1.100"
                    disabled={proxyStatus.loading}
                  />
                </div>
                <div className={styles.proxyInputField}>
                  <label htmlFor="proxyPort">Port:</label>
                  <input
                    id="proxyPort"
                    type="text"
                    value={proxyPort}
                    onChange={(e) => setProxyPort(e.target.value)}
                    className={styles.proxyInput}
                    placeholder="8080"
                    disabled={proxyStatus.loading}
                  />
                </div>
              </div>
              
              {proxyStatus.message && (
                <div className={`${styles.proxyMessage} ${proxyStatus.error ? styles.proxyMessageError : ''}`}>
                  {proxyStatus.message}
                </div>
              )}
              
              {proxyStatus.error && (
                <div className={styles.proxyError}>{proxyStatus.error}</div>
              )}
            </div>
            
            <div className={styles.appSelectionPanel}>
              <h2 className={styles.selectionTitle}>Select an App to Debug</h2>
              
              <div className={styles.searchContainer}>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search installed apps..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <button 
                  className={styles.refreshButton}
                  onClick={fetchInstalledApps}
                  disabled={isLoading}
                >
                  {isLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              
              {error && (
                <div className={styles.errorMessage}>{error}</div>
              )}
              
              {isLoading ? (
                <div className={styles.loadingContainer}>
                  <div className={styles.spinner}></div>
                  <p>Loading installed apps...</p>
                </div>
              ) : apps.length === 0 ? (
                <div className={styles.noApps}>
                  <p>No apps found on this device. Make sure third-party apps are installed.</p>
                </div>
              ) : (
                <div className={styles.appsGrid}>
                  {filteredApps.length === 0 ? (
                    <div className={styles.noSearchResults}>No apps match your search</div>
                  ) : (
                    filteredApps.map(app => (
                      <div
                        key={app.packageName}
                        className={`${styles.appCard} ${selectedApp === app.packageName ? styles.selectedApp : ''}`}
                        onClick={() => setSelectedApp(app)}
                      >
                        <div className={styles.appIcon}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                            <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2m0 2v14h14V5H5z"/>
                          </svg>
                        </div>
                        <div className={styles.appInfo}>
                          <h3 className={styles.appName}>{app.appName}</h3>
                          <p className={styles.packageName}>{app.packageName}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            
            <div className={styles.actionsContainer}>
              {launchStatus.loading ? (
                <div className={styles.launchingContainer}>
                  <div className={styles.spinner}></div>
                  <p>{launchStatus.message}</p>
                </div>
              ) : (
                <button 
                  className={styles.continueButton}
                  onClick={handleContinue}
                  disabled={!selectedApp || isLoading}
                >
                  Launch & Debug
                </button>
              )}
              {launchStatus.error && (
                <div className={styles.launchError}>{launchStatus.error}</div>
              )}
            </div>
          </div>
        </div>
        
        {isLoading && (
          <div className={styles.overlayLoading}>
            <div className={styles.loadingContent}>
              <div className={styles.spinner}></div>
              <h3>{launchStatus.step === 'error' ? 'Error' : 'Launching App'}</h3>
              <p>{launchStatus.message}</p>
              {launchStatus.step === 'error' && (
                <button 
                  className={styles.retryButton}
                  onClick={() => {
                    setError('');
                    setIsLoading(false);
                  }}
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
} 