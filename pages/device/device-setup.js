import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import styles from '@/styles/pages/device-setup.module.css';

export default function DeviceSetupView({ navigateTo, params }) {
  const { deviceId, packageName } = params || {};
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

  const [isDeviceSectionCollapsed, setIsDeviceSectionCollapsed] = useState(false);
  const [isDiscoveryActive, setIsDiscoveryActive] = useState(false);

  const searchInputRef = useRef(null);

  // Focus search input when a device is selected
  useEffect(() => {
    if (selectedDevice && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [selectedDevice]);

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
    } catch (error) {
      console.error('Failed to get ADB devices:', error);
      setConnectionError('Failed to get connected devices. Make sure ADB is working properly.');
    } finally {
      setIsLoadingDevices(false);
    }
  };

  // Generate QR code for wireless debugging
  const generateQrCode = async () => {
    // If discovery is already active, stop it first
    if (isDiscoveryActive) {
      try {
        await window.api.adb.stopDeviceDiscovery?.();
        setIsDiscoveryActive(false);
        setPairingInProgress(false);
        setQrCodeData(null);
        setDiscoveryStatus(null);
        return;
      } catch (error) {
        console.error('Failed to stop device discovery:', error);
      }
    }

    setPairingInProgress(true);
    setConnectionError('');
    setDiscoveryStatus({
      status: 'waiting',
      message: 'Generating QR code and preparing for device discovery...'
    });
    
    // Get IP address early so it's available for the timeout handler
    const localIpAddress = await getLocalIpAddress();
    
    try {
      console.log('Attempting to generate QR code');
      
      // Execute our custom QR code generator
      const result = await window.api.adb.generateAdbWifiQRCode();
      
      console.log('QR code generation successful, received result:', result);
      
      // Set discovery as active
      setIsDiscoveryActive(true);
      
      // Set the discovery status to "waiting"
      setDiscoveryStatus({
        status: 'waiting',
        message: 'Waiting for device to connect... Scan the QR code with your Android device.'
      });
      
      // Set the qrCodeData with connection information and QR code image
      setQrCodeData({
        usingTerminalQr: false,
        qrCodePath: result.qrCodePath,
        hostIp: result.hostIp || localIpAddress || "Unknown",
        pairingPort: result.pairingPort || "5555",
        pairingCode: result.pairingCode,
        message: result.message || "Scan the QR code with your Android device to connect wirelessly."
      });
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      setConnectionError('Failed to generate QR code for wireless debugging. Please try manual connection.');
      
      // Set minimal QR data to prevent UI from being stuck in loading state
      setQrCodeData({
        usingTerminalQr: false,
        hostIp: localIpAddress || "Unknown",
        pairingPort: "5555",
        message: "Failed to generate QR code. Please try manual connection."
      });
      
      setDiscoveryStatus({
        status: 'error',
        message: 'Failed to start device discovery. Please try again.'
      });
      
      setIsDiscoveryActive(false);
    } finally {
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
  const fetchInstalledApps = async (deviceId = selectedDevice) => {
    if (!deviceId) return;
    
    setIsLoadingApps(true);
    setAppError('');
    
    try {
      const appsList = await window.api.adb.getInstalledApps(deviceId);
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
      console.log('Launching app:', selectedApp);

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
      console.log('App package name:', selectedApp);
      const launchResult = await window.api.adb.launchApp(selectedDevice, selectedApp);

      if (!launchResult.success) {
        console.error('Failed to launch app:', launchResult.message);
      }
      
      setLaunchStatus({ step: 'complete', message: 'App launched successfully!' });
      console.log('App launched successfully');
      
      // Clear loading states
      setIsLoadingApps(false);
      setLaunchStatus({ step: '', message: '' });
      
      // Navigate to analytics debugger with the device ID and package name
      navigateTo('debugger', {
        deviceId: selectedDevice,
        packageName: selectedApp,
        tab: 'unified'
      });
    } catch (error) {
      console.error('Error in handleAppLaunch:', error);
      setAppError(`Error: ${error.message}`);
      setLaunchStatus({ step: 'error', message: error.message });
      setIsLoadingApps(false);
    }
  };

  // Filter apps based on search term and sort alphabetically
  const filteredApps = apps
    .map(app => ({
      ...app,
      displayName: (app.appName || app.packageName).replace(/^com\./, '')
    }))
    .filter(app => 
      app.packageName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (app.displayName && app.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => {
      const nameA = a.displayName || a.packageName;
      const nameB = b.displayName || b.packageName;
      return nameA.localeCompare(nameB);
    });

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
      navigateTo('rtmp-setup', params); // Preserve any existing query parameters
    }
  };

  const handleBack = () => {
    // Clean up any active processes before navigating
    if (isDiscoveryActive) {
      try {
        window.api.adb.stopDeviceDiscovery?.();
      } catch (error) {
        console.error("Error stopping device discovery:", error);
      }
    }
    
    // Always navigate back to the debugger with preserved parameters
    const navigateParams = {};
    if (deviceId) navigateParams.deviceId = deviceId;
    if (packageName) navigateParams.packageName = packageName;
    // Preserve the tab parameter if it exists
    if (params?.tab) navigateParams.tab = params.tab;
    navigateTo('debugger', navigateParams);
  };

  const handleStartCapturing = () => {
    // Inform backend to start capturing with MitmProxy if not already running
    window.api.mitmproxy.startCapturing()
      .then(result => {
        if (result.success) {
          // Redirect to analytics debugger with preserved parameters
          const navigateParams = {
            mitmproxy: 'true'
          };
          if (deviceId) navigateParams.deviceId = deviceId;
          if (packageName) navigateParams.packageName = packageName;
          // Preserve the tab parameter if it exists
          if (params?.tab) navigateParams.tab = params.tab;
          navigateTo('debugger', navigateParams);
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
      navigateTo('app-selection', {
        deviceId: selectedDevice
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
    navigateTo('rtmp-setup');
  };

  const handleDeviceSelect = (deviceId) => {
    setSelectedDevice(deviceId);
    setIsDeviceSectionCollapsed(true);
    // Cleanup wireless pairing when device is selected
    if (isDiscoveryActive) {
      window.api.adb.stopDeviceDiscovery?.()
        .catch(console.error);
      setIsDiscoveryActive(false);
      setPairingInProgress(false);
      setQrCodeData(null);
      setDiscoveryStatus(null);
    }
    // Pass the deviceId directly to fetchInstalledApps
    fetchInstalledApps(deviceId);
  };

  // Add cleanup function for wireless pairing
  useEffect(() => {
    return () => {
      // Cleanup wireless pairing when component unmounts
      if (isDiscoveryActive) {
        window.api.adb.stopDeviceDiscovery?.()
          .catch(console.error);
        setIsDiscoveryActive(false);
        setPairingInProgress(false);
        setQrCodeData(null);
        setDiscoveryStatus(null);
      }
    };
  }, [isDiscoveryActive]);

  // Update the button text based on discovery state
  const getPairButtonText = () => {
    if (pairingInProgress) return 'Preparing QR Code...';
    if (isDiscoveryActive) return 'Stop Wireless Pairing';
    return 'Pair New Device Wirelessly';
  };

  var content = (
    <div className={styles.splitView}>
      {/* Android Section */}
      <div className={styles.platformSection}>
        <h2>Android</h2>
        <div className={styles.instructionsContainer}>
          <div className={styles.instructionsStep}>
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepContent}>
              <h3>Enable USB Debugging</h3>
              <p>On your Android device, go to <strong>Settings &gt; About phone</strong> and tap <strong>Build number</strong> 7 times to enable Developer Options.</p>
              <p>Then go to <strong>Settings &gt; Developer options</strong> and enable <strong>USB debugging</strong>.</p>
            </div>
          </div>
          
          <div className={`${styles.instructionsStep} ${isDeviceSectionCollapsed ? styles.collapsed : ''}`}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepContent}>
              <div className={styles.stepHeader} onClick={() => !selectedDevice && setIsDeviceSectionCollapsed(!isDeviceSectionCollapsed)}>
                <h3>Connect Your Device</h3>
                {selectedDevice && (
                  <button 
                    className={styles.expandButton}
                    onClick={() => setIsDeviceSectionCollapsed(!isDeviceSectionCollapsed)}
                  >
                    {isDeviceSectionCollapsed ? 'Show Details' : 'Hide Details'}
                  </button>
                )}
              </div>
              <div className={styles.stepBody}>
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
                          onClick={() => handleDeviceSelect(device.id)}
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
                    disabled={pairingInProgress}
                  >
                    <div className={styles.methodIcon}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                        <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
                      </svg>
                    </div>
                    <span>{getPairButtonText()}</span>
                  </button>
                  
                  {/* QR Code Display */}
                  {qrCodeData && (
                    <div className={styles.qrCodeSection}>
                      {qrCodeData.qrCodePath && (
                        <div className={styles.qrCodeContainer}>
                          <img 
                            src={qrCodeData.qrCodePath} 
                            alt="QR Code for wireless debugging"
                            className={styles.qrCode}
                          />
                        </div>
                      )}
                      <div className={styles.qrCodeInfo}>
                        <p className={styles.qrCodeMessage}>{qrCodeData.message}</p>
                        {discoveryStatus && (
                          <div className={`${styles.discoveryStatus} ${styles[discoveryStatus.status]}`}>
                            {discoveryStatus.message}
                          </div>
                        )}
                        {connectionError && (
                          <div className={styles.errorMessage}>{connectionError}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
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
                      ref={searchInputRef}
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
                              className={`${styles.appCard} ${selectedApp === app.packageName ? styles.selectedApp : ''}`}
                              onClick={() => setSelectedApp(app.packageName)}
                            >
                              <div className={styles.appIcon}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M17 3H7c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7V5h10v14z" fill="currentColor"/>
                                  <path d="M12 7c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="currentColor"/>
                                </svg>
                              </div>
                              <div className={styles.appInfo}>
                                <p className={styles.packageName}>
                                  {app.displayName || app.packageName}
                                </p>
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
        </div>
      </div>

      {/* iOS Section */}
      <div className={styles.platformSection}>
        <h2>iOS</h2>
        <div className={styles.instructionsContainer}>
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
              <p>Go to <strong>Settings &gt; General &gt; About &gt; Certificate Trust Settings</strong> and enable full trust for the MitmProxy certificate.</p>
            </div>
          </div>

          <div className={styles.instructionsStep}>
            <div className={styles.stepNumber}>4</div>
            <div className={styles.stepContent}>
              <h3>Set up proxy</h3>
              <p>Go to <strong>Settings &gt; WiFi</strong>, tap the (i) icon next to your network, scroll down to "Configure Proxy" and select "Manual".</p>
              <div className={styles.proxyDetails}>
                <div className={styles.proxyItem}>
                  <span className={styles.proxyLabel}>Server:</span>
                  <span className={styles.proxyValue}>{localIp}</span>
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
              <button className={styles.continueButton}>
                Start Capturing
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

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
        
        <div className={styles.content}>
          {content}
        </div>
      </div>
    </>
  );
} 