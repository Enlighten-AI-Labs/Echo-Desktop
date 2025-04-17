import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import styles from '../styles/device-setup.module.css';

export default function DeviceSetup() {
  const router = useRouter();
  const { deviceId, packageName } = router.query;
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [showAndroidInstructions, setShowAndroidInstructions] = useState(true);
  const [androidConnectionMethod, setAndroidConnectionMethod] = useState(null);
  const [connectedDevices, setConnectedDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [manualIpAddress, setManualIpAddress] = useState('');
  const [manualPort, setManualPort] = useState('5555');
  const [pairingCode, setPairingCode] = useState('');
  const [localIp, setLocalIp] = useState('Loading...');
  const [connectionError, setConnectionError] = useState('');
  const [pairingInProgress, setPairingInProgress] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState(null);
  const [selectedTab, setSelectedTab] = useState('android');
  const [proxyStatus, setProxyStatus] = useState({
    enabled: false,
    loading: false,
    error: null,
    message: null
  });
  
  // App selection state
  const [apps, setApps] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [appError, setAppError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [launchStatus, setLaunchStatus] = useState({
    step: '',
    message: ''
  });

  // Helper function to get local IP address if needed during timeout
  const getLocalIpAddress = async () => {
    // If we already have it in state, use that
    if (localIp !== 'Loading...' && localIp !== 'Failed to detect') {
      return localIp;
    }
    
    // Otherwise, try to get it from the API
    try {
      const ipAddress = await window.api.adb.getLocalIp();
      // Update the state for future calls
      setLocalIp(ipAddress);
      return ipAddress;
    } catch (error) {
      console.error('Failed to get local IP address from API:', error);
      return 'Unknown';
    }
  };

  useEffect(() => {
    // Get the local IP address when component mounts
    async function fetchLocalIp() {
      // Use the improved getLocalIpAddress function which already handles errors
      await getLocalIpAddress();
    }
    
    fetchLocalIp();
    
    // Check if mitmproxy is already running
    async function checkMitmproxyStatus() {
      try {
        const status = await window.api.mitmproxy.status();
        if (!status.running && selectedPlatform === 'ios') {
          // If iOS is selected but mitmproxy is not running, start it
          await window.api.mitmproxy.startCapturing();
        }
      } catch (error) {
        console.error('Failed to check mitmproxy status:', error);
      }
    }
    
    if (showIOSInstructions) {
      checkMitmproxyStatus();
    }

    // Listen for device paired events from main process
    if (typeof window !== 'undefined' && window.api && window.api.receive) {
      window.api.receive('adb:devicePaired', (data) => {
        console.log('Device paired event received:', data);
        if (data.success) {
          setDiscoveryStatus({
            status: 'success',
            message: data.message
          });
          // Fetch the devices list to show the newly connected device
          fetchConnectedDevices();
        } else {
          setDiscoveryStatus({
            status: 'error',
            message: data.message || 'Failed to pair with device'
          });
        }
      });
    }

    // Cleanup listener when component unmounts
    return () => {
      if (typeof window !== 'undefined' && window.api && window.api.removeListener) {
        window.api.removeListener('adb:devicePaired');
      }
    };
  }, [showIOSInstructions, selectedPlatform]);

  // Fetch connected Android devices
  const fetchConnectedDevices = async () => {
    setIsLoadingDevices(true);
    setConnectionError('');
    try {
      const devices = await window.api.adb.getDevices();
      setConnectedDevices(devices);
      // If we have devices and none are selected, select the first one
      if (devices.length > 0 && !selectedDevice) {
        setSelectedDevice(devices[0].id);
      }
    } catch (error) {
      console.error('Failed to get ADB devices:', error);
      setConnectionError('Failed to get connected devices. Make sure ADB is working properly.');
    } finally {
      setIsLoadingDevices(false);
    }
  };

  // Generate QR code for wireless debugging
  const generateQrCode = async () => {
    setPairingInProgress(true);
    setConnectionError('');
    setDiscoveryStatus(null);
    
    // Get IP address early so it's available for the timeout handler
    const localIpAddress = await getLocalIpAddress();
    
    // Set a timeout to prevent the UI from being stuck indefinitely
    const timeoutId = setTimeout(async () => {
      console.log('QR code generation timed out');
      setQrCodeData({
        usingTerminalQr: false,
        hostIp: localIpAddress || "Unknown",
        pairingPort: "5555",
        message: "QR code generation timed out. Please try again or use manual connection."
      });
      setPairingInProgress(false);
    }, 10000); // Increase timeout to 10 seconds for slower systems
    
    try {
      console.log('Attempting to generate QR code');
      
      // Execute our custom QR code generator
      const result = await window.api.adb.generateAdbWifiQRCode();
      
      // Clear the timeout since we got a response
      clearTimeout(timeoutId);
      
      console.log('QR code generation successful, received result:', result);
      
      // Set the discovery status to "waiting"
      setDiscoveryStatus({
        status: 'waiting',
        message: 'Waiting for device to connect... Scan the QR code with your Android device.'
      });
      
      // Set the qrCodeData with connection information and QR code image
      setQrCodeData({
        usingTerminalQr: false, // We're using a UI QR code now
        qrCodePath: result.qrCodePath,
        hostIp: result.hostIp || localIpAddress || "Unknown",
        pairingPort: result.pairingPort || "5555",
        pairingCode: result.pairingCode,
        message: result.message || "Scan the QR code with your Android device to connect wirelessly."
      });
    } catch (error) {
      // Clear the timeout since we got an error
      clearTimeout(timeoutId);
      
      console.error('Failed to generate QR code:', error);
      setConnectionError('Failed to generate QR code for wireless debugging. Trying fallback method...');
      
      // Fall back to the original method if our QR code method fails
      try {
        console.log('Using fallback QR code generation method');
        const qrData = await window.api.adb.generateQRCode();
        
        if (qrData && qrData.qrCodePath) {
          console.log('Fallback QR code generation successful');
          setQrCodeData(qrData);
        } else {
          // If the fallback didn't provide a QR code path, use minimal info
          console.warn('Fallback QR code did not include image data, using available info');
          setQrCodeData({
            usingTerminalQr: false,
            hostIp: qrData?.hostIp || localIpAddress || "Unknown",
            pairingPort: qrData?.pairingPort || "5555",
            pairingCode: qrData?.pairingCode,
            message: "Failed to generate QR code image. Please try manual connection."
          });
        }
      } catch (fallbackError) {
        console.error('Fallback QR code generation also failed:', fallbackError);
        setConnectionError('Failed to generate QR code for wireless debugging. Please use manual connection.');
        
        // Set minimal QR data to prevent UI from being stuck in loading state
        setQrCodeData({
          usingTerminalQr: false,
          hostIp: localIpAddress || "Unknown",
          pairingPort: "5555",
          message: "Failed to generate QR code. Please use manual connection."
        });
      }
    } finally {
      // Make sure we're not stuck in the loading state
      setPairingInProgress(false);
    }
  };

  // Connect to device with manual IP
  const connectToDevice = async () => {
    if (!manualIpAddress) {
      setConnectionError('Please enter an IP address');
      return;
    }
    
    setPairingInProgress(true);
    setConnectionError('');
    
    try {
      // If pairing code is provided, use it to pair first
      if (pairingCode) {
        const pairResult = await window.api.adb.connectDevice(
          manualIpAddress, 
          manualPort, 
          pairingCode
        );
        
        if (!pairResult.success) {
          setConnectionError(`Pairing failed: ${pairResult.message}`);
          setPairingInProgress(false);
          return;
        }
      }
      
      // Now connect to the device
      const result = await window.api.adb.connectDevice(manualIpAddress, manualPort);
      
      if (result.success) {
        // Refresh the device list
        await fetchConnectedDevices();
      } else {
        setConnectionError(`Failed to connect: ${result.message}`);
      }
    } catch (error) {
      console.error('Failed to connect to device:', error);
      setConnectionError(`Connection error: ${error.message}`);
    } finally {
      setPairingInProgress(false);
    }
  };

  const executeAdbCommand = async (command) => {
    try {
      const result = await window.api.adb.executeCommand(selectedDevice, command);
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

  // App selection functions
  const fetchInstalledApps = async () => {
    if (!selectedDevice) return;
    
    setIsLoadingApps(true);
    setAppError('');
    
    try {
      const appsList = await window.api.adb.getInstalledApps(selectedDevice);
      setApps(appsList);
    } catch (err) {
      console.error('Error fetching installed apps:', err);
      setAppError('Failed to get installed apps. Please make sure your device is connected.');
    } finally {
      setIsLoadingApps(false);
    }
  };

  const handleAppLaunch = async () => {
    if (!selectedDevice || !selectedApp) {
      setAppError('Please select a device and app to continue');
      return;
    }

    setIsLoadingApps(true);
    setLaunchStatus({ step: 'starting', message: 'Starting launch process...' });

    try {
      console.log('Launching app:', selectedApp.packageName);

      // Set Firebase Analytics debug properties and start logcat capture
      setLaunchStatus({ step: 'debug', message: 'Setting up Firebase Analytics debug mode...' });
      console.log('Setting up Firebase Analytics logging...');
      
      // Step 1 & 2: Set Firebase Analytics to VERBOSE
      await window.api.adb.executeCommand(selectedDevice, 'shell setprop log.tag.FA VERBOSE');
      await window.api.adb.executeCommand(selectedDevice, 'shell setprop log.tag.FA-SVC VERBOSE');
      
      // Step 3: Start logcat capture with the specific filter
      setLaunchStatus({ step: 'logcat', message: 'Starting logcat capture...' });
      console.log('Starting logcat capture for Firebase Analytics events...');
      
      // First stop any existing logcat capture
      await window.api.adb.stopLogcatCapture();
      
      // Start new capture with the exact parameters specified
      const logcatResult = await window.api.adb.startLogcatCapture(selectedDevice, 'FA FA-SVC');
      if (!logcatResult.success) {
        console.warn(`Warning: Failed to start logcat capture: ${logcatResult.message}`);
      }

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

      // Launch the app on the device
      setLaunchStatus({ step: 'launchApp', message: 'Launching app on device...' });
      console.log('Launching app on device:', selectedDevice);
      const launchResult = await window.api.adb.launchApp(selectedDevice, selectedApp.packageName);

      if (!launchResult.success) {
        throw new Error(`Failed to launch app: ${launchResult.message}`);
      }
      
      setLaunchStatus({ step: 'complete', message: 'App launched successfully!' });
      console.log('App launched successfully');
      
      // Clear loading states
      setIsLoadingApps(false);
      setLaunchStatus({ step: '', message: '' });
      
      // Navigate to analytics debugger with the device ID and package name
      router.push({
        pathname: '/debugger',
        query: {
          deviceId: selectedDevice,
          packageName: selectedApp.packageName,
          tab: 'unified' // Default to network tab
        }
      });
    } catch (error) {
      console.error('Error in handleAppLaunch:', error);
      setAppError(`Error: ${error.message}`);
      setLaunchStatus({ step: 'error', message: error.message });
      setIsLoadingApps(false);
    }
  };

  // Filter apps based on search term
  const filteredApps = apps.filter(app => 
    app.packageName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (app.appName && app.appName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleContinue = () => {
    if (!selectedPlatform) return;
    
    if (selectedPlatform === 'ios') {
      setShowIOSInstructions(true);
      setSelectedTab('ios');
    } else if (selectedPlatform === 'android') {
      setShowAndroidInstructions(true);
      setSelectedTab('android');
      fetchConnectedDevices();
    } else if (selectedPlatform === 'rtmp') {
      // Navigate to RTMP setup page
      router.push({
        pathname: '/rtmp-setup',
        query: router.query // Preserve any existing query parameters
      });
    }
  };

  const handleBack = () => {
    if (showIOSInstructions) {
      // If showing iOS instructions, go back to platform selection
      setShowIOSInstructions(false);
    } else if (showAndroidInstructions) {
      // If showing Android instructions, go back to platform selection
      setShowAndroidInstructions(false);
      setAndroidConnectionMethod(null);
      setQrCodeData(null);
      setSelectedDevice(null);
    } else {
      // Otherwise, return to analytics debugger with preserved parameters
      const query = {};
      if (deviceId) query.deviceId = deviceId;
      if (packageName) query.packageName = packageName;
      // Preserve the tab parameter if it exists
      if (router.query.tab) query.tab = router.query.tab;
      router.push({
        pathname: '/debugger',
        query
      });
    }
  };

  const handleStartCapturing = () => {
    // Inform backend to start capturing with MitmProxy if not already running
    window.api.mitmproxy.startCapturing()
      .then(result => {
        if (result.success) {
          // Redirect to analytics debugger with preserved parameters
          const query = {
            mitmproxy: 'true'
          };
          if (deviceId) query.deviceId = deviceId;
          if (packageName) query.packageName = packageName;
          // Preserve the tab parameter if it exists
          if (router.query.tab) query.tab = router.query.tab;
          router.push({
            pathname: '/debugger',
            query
          });
        } else {
          alert('Failed to start MitmProxy: ' + result.message);
        }
      })
      .catch(error => {
        alert('Error starting MitmProxy: ' + error.message);
      });
  };

  const handleAndroidContinue = async () => {
    // If no device is selected, show an error
    if (!selectedDevice) {
      setConnectionError('Please connect and select a device');
      return;
    }

    try {
      // Set debug properties for Firebase Analytics
      console.log('Setting Firebase Analytics debug properties...');
      await window.api.adb.executeCommand(selectedDevice, 'setprop log.tag.FA VERBOSE');
      await window.api.adb.executeCommand(selectedDevice, 'setprop log.tag.FA-SVC VERBOSE');
      
      // Redirect to app selection page with the selected device
      router.push({
        pathname: '/app-selection',
        query: {
          deviceId: selectedDevice
        }
      });
    } catch (error) {
      console.error('Error setting debug properties:', error);
      setConnectionError(`Error setting debug properties: ${error.message}`);
    }
  };

  // Add useEffect to fetch devices on component mount
  useEffect(() => {
    if (showAndroidInstructions) {
      fetchConnectedDevices();
    }
  }, [showAndroidInstructions]);

  // Add proxy control functions
  const checkCurrentProxyStatus = async () => {
    if (!selectedDevice) return;

    try {
      // Check if proxy is already enabled
      const globalProxy = await executeAdbCommand(`shell settings get global http_proxy`);
      console.log("Current global proxy settings:", globalProxy);
      
      if (globalProxy.output && globalProxy.output !== ':0' && globalProxy.output.trim() !== '') {
        // Extract proxy IP and port from the output
        const proxyMatch = globalProxy.output.match(/([0-9.]+):(\d+)/);
        if (proxyMatch) {
          const [_, ip, port] = proxyMatch;
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
    }
  };

  const setDeviceProxy = async () => {
    if (!selectedDevice) {
      setProxyStatus({
        enabled: false,
        loading: false,
        error: "Device not selected"
      });
      return;
    }
    
    setProxyStatus({
      enabled: false,
      loading: true,
      error: null,
      message: "Setting up proxy..."
    });
    
    try {
      console.log(`Setting up proxy for device ${selectedDevice}: ${localIp}:8080`);
      
      // Try both global and system settings approaches
      const setGlobalResult = await executeAdbCommand(`shell settings put global http_proxy ${localIp}:8080`);
      console.log("Set global http_proxy result:", setGlobalResult);
      
      await executeAdbCommand(`shell settings put global global_http_proxy_host ${localIp}`);
      await executeAdbCommand(`shell settings put global global_http_proxy_port 8080`);
      
      // Verify the proxy settings were applied
      const verifyResult = await executeAdbCommand(`shell settings get global http_proxy`);
      console.log("Verify proxy settings:", verifyResult);
      
      if (verifyResult.output && verifyResult.output.includes(localIp)) {
        setProxyStatus({
          enabled: true,
          loading: false,
          error: null,
          message: `Proxy enabled: ${localIp}:8080`
        });
      } else {
        throw new Error("Failed to verify proxy settings");
      }
    } catch (error) {
      console.error('Failed to set proxy:', error);
      setProxyStatus({
        enabled: false,
        loading: false,
        error: error.message || 'Failed to set proxy settings',
        message: "An error occurred while setting up the proxy"
      });
    }
  };

  const clearDeviceProxy = async () => {
    if (!selectedDevice) {
      setProxyStatus({
        enabled: false,
        loading: false,
        error: "Device not selected"
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
      console.log(`Clearing proxy for device ${selectedDevice}`);
      
      // Execute ADB commands to clear the proxy
      await executeAdbCommand('shell settings delete global http_proxy');
      await executeAdbCommand('shell settings delete global global_http_proxy_host');
      await executeAdbCommand('shell settings delete global global_http_proxy_port');
      await executeAdbCommand('shell settings put global http_proxy :0');
      
      setProxyStatus({
        enabled: false,
        loading: false,
        error: null,
        message: "Proxy disabled"
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

  const handleRTMPClick = () => {
    router.push('/rtmp-setup');
  };

  var content = null;

  // Android ADB setup instructions view
  if (showAndroidInstructions || showIOSInstructions) {
    content = (
      <>
        <Head>
          <title>Android Setup | Echo Desktop</title>
          <meta name="description" content="Android ADB Setup" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
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
            <h1 className={styles.pageTitle}>Device Setup</h1>
            <button 
              className={styles.rtmpButton}
              onClick={handleRTMPClick}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/>
              </svg>
              RTMP Setup
            </button>
          </div>
        <div className={styles.container} style={{display: 'flex', flexDirection: 'row', width: '100%', alignItems: 'flex-start'}}>
          <div className={styles.container} style={{width: '50%', minHeight: '100vh'}}>
          <div className={styles.content}>
            <div className={styles.instructionsContainer} style={{minHeight: '80vh', minWidth: '95%'}}>
              <h2 className={styles.instructionsTitle}>Android</h2>
              
              {!androidConnectionMethod ? (
                // Connection method selection
                <>
                  <div className={styles.instructionsStep}>
                    <div className={styles.stepNumber}>1</div>
                    <div className={styles.stepContent}>
                      <h3>Enable USB Debugging</h3>
                      <p>On your Android device, go to <strong>Settings &gt; About phone</strong> and tap <strong>Build number</strong> 7 times to enable Developer Options.</p>
                      <p>Then go to <strong>Settings &gt; Developer options</strong> and enable <strong>USB debugging</strong>.</p>
                    </div>
                  </div>
                  
                  <div className={styles.instructionsStep}>
                    <div className={styles.stepNumber}>2</div>
                    <div className={styles.stepContent}>
                      <h3>Connect Your Device</h3>
                      <div className={styles.deviceListContainer}>
                        <div className={styles.deviceListHeader}>
                          <h4>Available USB Devices</h4>
                          <div className={styles.deviceControls}>
                            {selectedDevice && (
                              <>
                                <button 
                                  className={`${styles.proxyButton} ${proxyStatus.enabled ? styles.proxyEnabled : ''}`}
                                  onClick={proxyStatus.enabled ? clearDeviceProxy : setDeviceProxy}
                                  disabled={proxyStatus.loading}
                                >
                                  {proxyStatus.loading ? 'Working...' : proxyStatus.enabled ? 'Disable Proxy' : 'Enable Proxy'}
                                </button>
                              </>
                            )}
                            <button 
                              className={styles.refreshButton}
                              onClick={fetchConnectedDevices}
                              disabled={isLoadingDevices}
                            >
                              {isLoadingDevices ? 'Refreshing...' : 'Refresh'}
                            </button>
                          </div>
                        </div>
                        
                        {connectionError && (
                          <div className={styles.errorMessage}>{connectionError}</div>
                        )}
                        
                        {connectedDevices.length > 0 ? (
                          <div className={styles.deviceItems}>
                            {connectedDevices.map(device => (
                              <div 
                                key={device.id}
                                className={`${styles.deviceItem} ${selectedDevice === device.id ? styles.selectedDevice : ''}`}
                                onClick={() => {
                                  setSelectedDevice(device.id);
                                  fetchInstalledApps();
                                }}
                              >
                                <div className={styles.deviceIcon}>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                                    <path d="M6,18c0,0.55 0.45,1 1,1h1v3.5c0,0.83 0.67,1.5 1.5,1.5s1.5,-0.67 1.5,-1.5V19h2v3.5c0,0.83 0.67,1.5 1.5,1.5s1.5,-0.67 1.5,-1.5V19h1c0.55,0 1,-0.45 1,-1V8H6v10zM3.5,8C2.67,8 2,8.67 2,9.5v7c0,0.83 0.67,1.5 1.5,1.5S5,17.33 5,16.5v-7C5,8.67 4.33,8 3.5,8zm17,0c-0.83,0 -1.5,0.67 -1.5,1.5v7c0,0.83 0.67,1.5 1.5,1.5s1.5,-0.67 1.5,-1.5v-7c0,-0.83 -0.67,-1.5 -1.5,-1.5zm-4.97,-5.84l1.3,-1.3c0.2,-0.2 0.2,-0.51 0,-0.71c-0.2,-0.2 -0.51,-0.2 -0.71,0l-1.48,1.48C13.85,1.23 12.95,1 12,1c-0.96,0 -1.86,0.23 -2.66,0.63L7.85,0.15c-0.2,-0.2 -0.51,-0.2 -0.71,0c-0.2,0.2 -0.2,0.51 0,0.71l1.31,1.31C6.97,3.26 6,5.01 6,7h12c0,-1.99 -0.97,-3.75 -2.47,-4.84zM10,5H9V4h1v1zm5,0h-1V4h1v1z"/>
                                  </svg>
                                </div>
                                <div className={styles.deviceInfo}>
                                  <div className={styles.deviceName}>
                                    {device.name || device.id}
                                  </div>
                                  <div className={styles.deviceStatus}>
                                    {device.status === 'device' ? 'Connected' : device.status}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className={styles.noDevices}>
                            {isLoadingDevices ? 
                              'Searching for devices...' : 
                              'No devices found. Make sure USB debugging is enabled and your device is connected.'}
                          </div>
                        )}

                        <div className={styles.wirelessPairingSection}>
                          <div className={styles.divider}>
                            <span>or</span>
                          </div>
                          <button 
                            className={styles.pairNewDeviceButton}
                            onClick={() => {
                              setAndroidConnectionMethod('wireless');
                              generateQrCode();
                            }}
                          >
                            <div className={styles.methodIcon}>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                                <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
                              </svg>
                            </div>
                            <span>Pair New Device Wirelessly</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.instructionsStep}>
                    <div className={styles.stepNumber}>1</div>
                    <div className={styles.stepContent}>
                      <h3>{androidConnectionMethod === 'usb' ? 'Connect via USB' : 'Connect Wirelessly'}</h3>
                      {androidConnectionMethod === 'usb' ? (
                        <>
                          <p>Connect your Android device to this computer using a USB cable.</p>
                          <p>If prompted on your device, allow USB debugging for this computer.</p>
                        </>
                      ) : (
                        <>
                          <p>Make sure your Android device and this computer are on the same WiFi network.</p>
                          <div className={styles.wirelessConnectionContainer}>
                            {/* QR Code Section */}
                            <div className={styles.qrCodeArea}>
                              <h4>Scan QR Code (Android 11+)</h4>
                              
                              {qrCodeData ? (
                                <div className={styles.qrCodeContainer}>
                                  {qrCodeData.qrCodePath ? (
                                    <img 
                                      src={qrCodeData.qrCodePath} 
                                      alt="ADB Pairing QR Code"
                                      className={styles.qrCode}
                                    />
                                  ) : (
                                    <div className={styles.noQrPlaceholder}>
                                      <p>No QR code available</p>
                                    </div>
                                  )}

                                  {discoveryStatus && (
                                    <div className={`${styles.discoveryStatus} ${styles[discoveryStatus.status]}`}>
                                      {discoveryStatus.status === 'waiting' && (
                                        <div className={styles.spinner}></div>
                                      )}
                                      {discoveryStatus.status === 'success' && (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                          <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                        </svg>
                                      )}
                                      {discoveryStatus.status === 'error' && (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <circle cx="12" cy="12" r="10"></circle>
                                          <line x1="15" y1="9" x2="9" y2="15"></line>
                                          <line x1="9" y1="9" x2="15" y2="15"></line>
                                        </svg>
                                      )}
                                      <p>{discoveryStatus.message}</p>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className={styles.loadingQrContainer}>
                                  <div className={styles.loadingQR}>
                                    {pairingInProgress ? 'Generating QR code...' : 'Failed to generate QR code'}
                                  </div>
                                  {!pairingInProgress && (
                                    <button 
                                      className={styles.refreshButton}
                                      onClick={generateQrCode}
                                    >
                                      Try Again
                                    </button>
                                  )}
                                </div>
                              )}
                              
                              <div className={styles.connectionInstructions}>
                                <ol className={styles.instructionsList}>
                                  <li>Go to <strong>Settings</strong> → <strong>Developer options</strong> → <strong>Wireless debugging</strong></li>
                                  <li>Turn on Wireless debugging</li>
                                  <li>Tap <strong>Pair device with QR code</strong></li>
                                  <li>Scan the QR code above</li>
                                </ol>
                              </div>
                            </div>

                            {/* Manual Connection Section */}
                            <div className={styles.manualConnectForm}>
                              <h4>Manual Connection</h4>
                              <div className={styles.formField}>
                                <label htmlFor="ipAddress">IP Address:</label>
                                <input
                                  id="ipAddress"
                                  type="text"
                                  value={manualIpAddress}
                                  onChange={(e) => setManualIpAddress(e.target.value)}
                                  placeholder="192.168.1.100"
                                  className={styles.formInput}
                                />
                              </div>
                              <div className={styles.formFields}>
                                <div className={styles.formField}>
                                  <label htmlFor="port">Port:</label>
                                  <input
                                    id="port"
                                    type="text"
                                    value={manualPort}
                                    onChange={(e) => setManualPort(e.target.value)}
                                    placeholder="5555"
                                    className={styles.formInput}
                                  />
                                </div>
                                <div className={styles.formField}>
                                  <label htmlFor="pairingCode">Pairing Code:</label>
                                  <input
                                    id="pairingCode"
                                    type="text"
                                    value={pairingCode}
                                    onChange={(e) => setPairingCode(e.target.value)}
                                    placeholder="123456"
                                    className={styles.formInput}
                                  />
                                </div>
                              </div>
                              <button 
                                className={styles.connectButton}
                                onClick={connectToDevice}
                                disabled={pairingInProgress || !manualIpAddress}
                              >
                                {pairingInProgress ? 'Connecting...' : 'Connect'}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className={styles.instructionsStep}>
                    <div className={styles.stepNumber}>2</div>
                    <div className={styles.stepContent}>
                      <h3>Connected Devices</h3>
                      <div className={styles.deviceListContainer}>
                        <div className={styles.deviceListHeader}>
                          <h4>Available Devices</h4>
                          <button 
                            className={styles.refreshButton}
                            onClick={fetchConnectedDevices}
                            disabled={isLoadingDevices}
                          >
                            {isLoadingDevices ? 'Refreshing...' : 'Refresh'}
                          </button>
                        </div>
                        
                        {connectionError && (
                          <div className={styles.errorMessage}>{connectionError}</div>
                        )}
                        
                        {connectedDevices.length > 0 ? (
                          <div className={styles.deviceItems}>
                            {connectedDevices.map(device => (
                              <div 
                                key={device.id}
                                className={`${styles.deviceItem} ${selectedDevice === device.id ? styles.selectedDevice : ''}`}
                                onClick={() => {
                                  setSelectedDevice(device.id);
                                  fetchInstalledApps();
                                }}
                              >
                                <div className={styles.deviceIcon}>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                                    <path d="M6,18c0,0.55 0.45,1 1,1h1v3.5c0,0.83 0.67,1.5 1.5,1.5s1.5,-0.67 1.5,-1.5V19h2v3.5c0,0.83 0.67,1.5 1.5,1.5s1.5,-0.67 1.5,-1.5V19h1c0.55,0 1,-0.45 1,-1V8H6v10zM3.5,8C2.67,8 2,8.67 2,9.5v7c0,0.83 0.67,1.5 1.5,1.5S5,17.33 5,16.5v-7C5,8.67 4.33,8 3.5,8zm17,0c-0.83,0 -1.5,0.67 -1.5,1.5v7c0,0.83 0.67,1.5 1.5,1.5s1.5,-0.67 1.5,-1.5v-7c0,-0.83 -0.67,-1.5 -1.5,-1.5zm-4.97,-5.84l1.3,-1.3c0.2,-0.2 0.2,-0.51 0,-0.71c-0.2,-0.2 -0.51,-0.2 -0.71,0l-1.48,1.48C13.85,1.23 12.95,1 12,1c-0.96,0 -1.86,0.23 -2.66,0.63L7.85,0.15c-0.2,-0.2 -0.51,-0.2 -0.71,0c-0.2,0.2 -0.2,0.51 0,0.71l1.31,1.31C6.97,3.26 6,5.01 6,7h12c0,-1.99 -0.97,-3.75 -2.47,-4.84zM10,5H9V4h1v1zm5,0h-1V4h1v1z"/>
                                  </svg>
                                </div>
                                <div className={styles.deviceInfo}>
                                  <div className={styles.deviceName}>
                                    {device.name || device.id}
                                  </div>
                                  <div className={styles.deviceStatus}>
                                    {device.status === 'device' ? 'Connected' : device.status}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className={styles.noDevices}>
                            {isLoadingDevices ? 
                              'Searching for devices...' : 
                              'No devices found. Make sure USB debugging is enabled and your device is connected.'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
              {selectedDevice && (
                    <div className={styles.instructionsStep}>
                      <div className={styles.stepNumber}>3</div>
                      <div className={styles.stepContent}>
                        <h3>Select App to Debug</h3>
                        <div className={styles.appSelectionPanel}>
                          <div className={styles.searchContainer}>
                            <input
                              type="text"
                              className={styles.searchInput}
                              placeholder="Search installed apps..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <button 
                              className={`${styles.refreshButton} ${styles.secondaryButton}`}
                              onClick={fetchInstalledApps}
                              disabled={isLoadingApps}
                            >
                              {isLoadingApps ? 'Refreshing...' : 'Refresh'}
                            </button>
                          </div>
                          
                          {appError && (
                            <div className={styles.errorMessage}>{appError}</div>
                          )}
                          
                          {isLoadingApps ? (
                            <div className={styles.loadingContainer}>
                              <div className={styles.spinner}></div>
                              <p>Loading installed apps...</p>
                            </div>
                          ) : apps.length === 0 ? (
                            <div className={styles.noApps}>
                              <p>No apps found on this device. Make sure third-party apps are installed.</p>
                            </div>
                          ) : (
                            <div className={styles.appsGridContainer}>
                              <div className={styles.appsGrid}>
                                {filteredApps.length === 0 ? (
                                  <div className={styles.noSearchResults}>No apps match your search</div>
                                ) : (
                                  filteredApps.map(app => (
                                    <div
                                      key={app.packageName}
                                      className={`${styles.appCard} ${selectedApp === app ? styles.selectedApp : ''}`}
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
                            </div>
                          )}

                          {selectedApp && (
                            <button 
                              className={`${styles.continueButton} ${styles.launchButton}`}
                              onClick={handleAppLaunch}
                              disabled={isLoadingApps}
                            >
                              Launch & Debug
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
              {isLoadingApps && launchStatus.step && (
                <div className={styles.overlayLoading}>
                  <div className={styles.loadingContent}>
                    <div className={styles.spinner}></div>
                    <h3>{launchStatus.step === 'error' ? 'Error' : 'Launching App'}</h3>
                    <p>{launchStatus.message}</p>
                    {launchStatus.step === 'error' && (
                      <button 
                        className={styles.retryButton}
                        onClick={() => {
                          setAppError('');
                          setIsLoadingApps(false);
                          setLaunchStatus({ step: '', message: '' });
                        }}
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
          <div className={styles.container} style={{width: '50%', minHeight: '100vh' }}>
          
          <div className={styles.content}>
            <div className={styles.instructionsContainer} style={{minHeight: '80vh', minWidth: '95%'}}>
              <h2 className={styles.instructionsTitle}>iOS</h2>
              
              <div className={styles.instructionsStep}>
                <div className={styles.stepNumber}>1</div>
                <div className={styles.stepContent}>
                  <h3>Connect to the same WiFi network</h3>
                  <p>Make sure your iOS device and this computer are on the same WiFi network.</p>
                </div>
              </div>
              
              <div className={styles.instructionsStep}>
                <div className={styles.stepNumber}>2</div>
                <div className={styles.stepContent}>
                  <h3>Install the MitmProxy certificate</h3>
                  <p>On your iOS device, go to <strong>http://mitm.it</strong> in Safari and install the certificate for iOS.</p>
                </div>
              </div>
              
              <div className={styles.instructionsStep}>
                <div className={styles.stepNumber}>3</div>
                <div className={styles.stepContent}>
                  <h3>Trust the certificate</h3>
                  <p>Go to <strong>Settings {`>`} General {`>`} About {`>`} Certificate Trust Settings</strong> and enable full trust for the MitmProxy certificate.</p>
                </div>
              </div>
              
              <div className={styles.instructionsStep}>
                <div className={styles.stepNumber}>4</div>
                <div className={styles.stepContent}>
                  <h3>Set up proxy</h3>
                  <p>Go to <strong>Settings {`>`} WiFi</strong>, tap the (i) icon next to your network, scroll down to "Configure Proxy" and select "Manual".</p>
                  <div className={styles.proxyDetails}>
                    <div className={styles.proxyItem}>
                      <span className={styles.proxyLabel}>Server:</span>
                      <span className={styles.proxyValue} id="proxy-ip">{localIp}</span>
                    </div>
                    <div className={styles.proxyItem}>
                      <span className={styles.proxyLabel}>Port:</span>
                      <span className={styles.proxyValue}>8080</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className={styles.instructionsStep}>
                <div className={styles.stepNumber}>5</div>
                <div className={styles.stepContent}>
                  <h3>Start capturing</h3>
                  <p>Once configured, click the button below to start capturing network traffic.</p>
                </div>
              </div>
              
              <button 
                className={styles.continueButton}
                onClick={handleStartCapturing}
              >
                Start Capturing
              </button>
            </div>
          </div>
          </div>
        </div>

      </>
    );
  }

  if (showAndroidInstructions || showIOSInstructions) {
    return content;
  }

  // Platform selection view
  return (
    <>
      <Head>
        <title>Device Setup | Echo Desktop</title>
        <meta name="description" content="Echo Desktop Device Setup" />
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
          <h1 className={styles.pageTitle}>Android Device Setup</h1>
          <button 
            className={styles.rtmpButton}
            onClick={handleRTMPClick}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/>
            </svg>
            RTMP Setup
          </button>
        </div>
        
        <div className={styles.content}>
          {content}
        </div>
      </div>
    </>
  );
} 