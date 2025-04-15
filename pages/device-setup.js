import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import styles from '@/styles/DeviceSetup.module.css';

export default function DeviceSetup() {
  const router = useRouter();
  const { deviceId, packageName } = router.query;
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [showAndroidInstructions, setShowAndroidInstructions] = useState(false);
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

  const handleContinue = () => {
    if (!selectedPlatform) return;
    
    if (selectedPlatform === 'ios') {
      // For iOS, show MitmProxy setup instructions
      setShowIOSInstructions(true);
    } else if (selectedPlatform === 'android') {
      // For Android, show Android ADB setup instructions
      setShowAndroidInstructions(true);
      // Fetch connected devices on initial load
      fetchConnectedDevices();
    } else if (selectedPlatform === 'rtmp') {
      // For RTMP, redirect to the RTMP setup page
      const query = {};
      if (deviceId) query.deviceId = deviceId;
      if (packageName) query.packageName = packageName;
      router.push({
        pathname: '/rtmp-setup',
        query
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

  // Android ADB setup instructions view
  if (showAndroidInstructions) {
    return (
      <>
        <Head>
          <title>Android Setup | Echo Desktop</title>
          <meta name="description" content="Android ADB Setup" />
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
          </div>
          
          <div className={styles.content}>
            <div className={styles.instructionsContainer}>
              <h2 className={styles.instructionsTitle}>Connect Your Android Device</h2>
              
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
                      <h3>Choose Connection Method</h3>
                      <div className={styles.connectionMethods}>
                        <button 
                          className={styles.connectionMethodButton}
                          onClick={() => {
                            setAndroidConnectionMethod('usb');
                            fetchConnectedDevices();
                          }}
                        >
                          <div className={styles.methodIcon}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                              <path d="M15 7h2c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2h2V5c0-1.1.9-2 2-2h2c1.1 0 2 .9 2 2v2zm-2-2h-2v2h2V5zm2 14H7V9h8v8z"/>
                            </svg>
                          </div>
                          <span>USB Connection</span>
                        </button>
                        <button 
                          className={styles.connectionMethodButton}
                          onClick={() => {
                            setAndroidConnectionMethod('wireless');
                            generateQrCode();
                          }}
                        >
                          <div className={styles.methodIcon}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                              <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
                            </svg>
                          </div>
                          <span>Wireless Connection</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : androidConnectionMethod === 'usb' ? (
                // USB connection section
                <>
                  <div className={styles.instructionsStep}>
                    <div className={styles.stepNumber}>1</div>
                    <div className={styles.stepContent}>
                      <h3>Connect your device via USB</h3>
                      <p>Connect your Android device to this computer using a USB cable.</p>
                      <p>If prompted on your device, allow USB debugging for this computer.</p>
                      
                      <div className={styles.deviceListContainer}>
                        <div className={styles.deviceListHeader}>
                          <h4>Connected Devices</h4>
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
                                onClick={() => setSelectedDevice(device.id)}
                              >
                                <div className={styles.deviceIcon}>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                                    <path d="M17.523 15.3414c-.5511 0-.998-.4478-.998-.998v-5.3438c0-.5511.4478-.998.998-.998.5511 0 .998.4478.998.998v5.3438c0 .5511-.4478.998-.998.998m-11.046 0c-.5511 0-.998-.4478-.998-.998v-5.3438c0-.5511.4478-.998.998-.998.5511 0 .998.4478.998.998v5.3438c0 .5511-.4478.998-.998.998m7.0098-14.291.8899-1.6631c.0394-.0738.0116-.1662-.0622-.2061-.0739-.0398-.1663-.0119-.2061.0622l-.9003 1.6827c-.7057-.3099-1.4976-.4817-2.33-.4817-.8325 0-1.6245.1718-2.33.4817l-.9003-1.6827c-.0398-.074-.1322-.102-.2061-.0622-.0739.0398-.1016.1323-.0622.2061l.8899 1.6631C4.6414 2.3295 1.7382 5.6783 1.7382 9.6047h20.5236c0-3.9264-2.9032-7.2752-8.7138-8.5543"></path>
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
              ) : (
                // Wireless connection section
                <>
                  <div className={styles.instructionsStep}>
                    <div className={styles.stepNumber}>1</div>
                    <div className={styles.stepContent}>
                      <h3>Connect Wirelessly</h3>
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

                        {/* Connection Info Section */}
                        <div className={styles.connectionInfoArea}>
                          {qrCodeData && (
                            <div className={styles.connectionDetails}>
                              <h4>Connection Details</h4>
                              <div className={styles.pairingInfo}>
                                <div className={styles.pairingDetail}>
                                  <span className={styles.pairingLabel}>IP Address:</span>
                                  <span className={styles.pairingValue}>{qrCodeData.hostIp}</span>
                                </div>
                                <div className={styles.pairingDetail}>
                                  <span className={styles.pairingLabel}>Port:</span>
                                  <span className={styles.pairingValue}>{qrCodeData.pairingPort || 5555}</span>
                                </div>
                                {qrCodeData.pairingCode && (
                                  <div className={styles.pairingDetail}>
                                    <span className={styles.pairingLabel}>Pairing Code:</span>
                                    <span className={styles.pairingValue}>{qrCodeData.pairingCode}</span>
                                  </div>
                                )}
                              </div>
                              
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
                          )}
                          
                          {connectionError && (
                            <div className={styles.errorMessage}>{connectionError}</div>
                          )}
                        </div>
                      </div>

                      <div className={styles.deviceListContainer}>
                        <div className={styles.deviceListHeader}>
                          <h4>Connected Devices</h4>
                          <button 
                            className={styles.refreshButton}
                            onClick={fetchConnectedDevices}
                            disabled={isLoadingDevices}
                          >
                            {isLoadingDevices ? 'Refreshing...' : 'Refresh'}
                          </button>
                        </div>
                        
                        {connectedDevices.length > 0 ? (
                          <div className={styles.deviceItems}>
                            {connectedDevices.map(device => (
                              <div 
                                key={device.id}
                                className={`${styles.deviceItem} ${selectedDevice === device.id ? styles.selectedDevice : ''}`}
                                onClick={() => setSelectedDevice(device.id)}
                              >
                                <div className={styles.deviceIcon}>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                                    <path d="M17.523 15.3414c-.5511 0-.998-.4478-.998-.998v-5.3438c0-.5511.4478-.998.998-.998.5511 0 .998.4478.998.998v5.3438c0 .5511-.4478.998-.998.998m-11.046 0c-.5511 0-.998-.4478-.998-.998v-5.3438c0-.5511.4478-.998.998-.998.5511 0 .998.4478.998.998v5.3438c0 .5511-.4478.998-.998.998m7.0098-14.291.8899-1.6631c.0394-.0738.0116-.1662-.0622-.2061-.0739-.0398-.1663-.0119-.2061.0622l-.9003 1.6827c-.7057-.3099-1.4976-.4817-2.33-.4817-.8325 0-1.6245.1718-2.33.4817l-.9003-1.6827c-.0398-.074-.1322-.102-.2061-.0622-.0739.0398-.1016.1323-.0622.2061l.8899 1.6631C4.6414 2.3295 1.7382 5.6783 1.7382 9.6047h20.5236c0-3.9264-2.9032-7.2752-8.7138-8.5543"></path>
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
                              'No devices found. Connect using the options above.'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
              
              {androidConnectionMethod && (
                <button 
                  className={styles.continueButton}
                  onClick={handleAndroidContinue}
                  disabled={!selectedDevice}
                >
                  Continue with Selected Device
                </button>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // iOS MitmProxy setup instructions view
  if (showIOSInstructions) {
    return (
      <>
        <Head>
          <title>iOS Setup | Echo Desktop</title>
          <meta name="description" content="iOS MitmProxy Setup" />
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
            <h1 className={styles.pageTitle}>iOS MitmProxy Setup</h1>
          </div>
          
          <div className={styles.content}>
            <div className={styles.instructionsContainer}>
              <h2 className={styles.instructionsTitle}>Setup MitmProxy on your iOS Device</h2>
              
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
      </>
    );
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
          <h1 className={styles.pageTitle}>Connect a Device</h1>
        </div>
        
        <div className={styles.content}>
          <div className={styles.platformsContainer}>
            <div 
              className={`${styles.platformCard} ${selectedPlatform === 'android' ? styles.selected : ''}`}
              onClick={() => setSelectedPlatform('android')}
            >
              <div className={styles.platformIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64" fill="currentColor">
                  <path d="M17.523 15.3414c-.5511 0-.998-.4478-.998-.998v-5.3438c0-.5511.4478-.998.998-.998.5511 0 .998.4478.998.998v5.3438c0 .5511-.4478.998-.998.998m-11.046 0c-.5511 0-.998-.4478-.998-.998v-5.3438c0-.5511.4478-.998.998-.998.5511 0 .998.4478.998.998v5.3438c0 .5511-.4478.998-.998.998m7.0098-14.291.8899-1.6631c.0394-.0738.0116-.1662-.0622-.2061-.0739-.0398-.1663-.0119-.2061.0622l-.9003 1.6827c-.7057-.3099-1.4976-.4817-2.33-.4817-.8325 0-1.6245.1718-2.33.4817l-.9003-1.6827c-.0398-.074-.1322-.102-.2061-.0622-.0739.0398-.1016.1323-.0622.2061l.8899 1.6631C4.6414 2.3295 1.7382 5.6783 1.7382 9.6047h20.5236c0-3.9264-2.9032-7.2752-8.7138-8.5543"></path>
                  <path d="M6.0477 11.4753c0 .828-.6722 1.5-1.5 1.5s-1.5-.672-1.5-1.5.6722-1.5 1.5-1.5 1.5.672 1.5 1.5m14.9023 0c0 .828-.6722 1.5-1.5 1.5s-1.5-.672-1.5-1.5.6722-1.5 1.5-1.5 1.5.672 1.5 1.5M5.0379 19.3037c0 .5511.4478.998.998.998h.9984v2.4946c0 .5511.4478.998.998.998.5511 0 .998-.4478.998-.998V20.3017h1.9969v2.4946c0 .5511.4478.998.998.998.5511 0 .998-.4478.998-.998V20.3017h.9984c.5511 0 .998-.4478.998-.998v-8.3093H5.0379v8.3093zm15.184-8.3093h-2.3438c-.5511 0-.998.4478-.998.998v8.3093c0 .5511.4478.998.998.998.5511 0 .998-.4478.998-.998v-7.3114h1.3458c.5511 0 .998-.4478.998-.998 0-.5511-.4478-.998-.998-.998"></path>
                </svg>
              </div>
              <h3 className={styles.platformName}>Android</h3>
            </div>
            
            <div 
              className={`${styles.platformCard} ${selectedPlatform === 'ios' ? styles.selected : ''}`}
              onClick={() => setSelectedPlatform('ios')}
            >
              <div className={styles.platformIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64" fill="currentColor">
                  <path d="M17.0748 11.9146c-.0018-1.613.7424-3.0892 1.9365-4.0345-1.0096-1.3956-2.6084-2.2066-4.2984-2.1532-1.7339-.1703-3.3888 1.0347-4.2637 1.0347-.8969 0-2.2458-1.016-3.7053-1.0003-1.8851.03-3.6412 1.1065-4.5986 2.8124-1.9855 3.4368-.5065 8.4962 1.4022 11.2669.9533 1.3576 2.0753 2.8693 3.5406 2.8167 1.437-.0593 1.9685-.9106 3.7052-.9106 1.7172 0 2.2268.9106 3.7225.8793 1.5414-.0243 2.5157-1.3771 3.4445-2.7413.6681-.9626 1.1759-2.0425 1.4976-3.1814-1.6936-.7015-2.7889-2.3726-2.7831-4.2175zM14.4365 5.7815c.8303-1.0452 1.1553-2.3956.9-3.7226-1.2436.0895-2.3858.6866-3.1897 1.6663-.7854.9668-1.1657 2.1961-1.0554 3.4445 1.2791.016 2.4945-.6108 3.3451-1.3882z"></path>
                </svg>
              </div>
              <h3 className={styles.platformName}>iOS</h3>
            </div>

            <div 
              className={`${styles.platformCard} ${selectedPlatform === 'rtmp' ? styles.selected : ''}`}
              onClick={() => setSelectedPlatform('rtmp')}
            >
              <div className={styles.platformIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64" fill="currentColor">
                  <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/>
                </svg>
              </div>
              <h3 className={styles.platformName}>RTMP Streaming</h3>
            </div>
          </div>
          
          <div className={styles.actionsContainer}>
            <button 
              className={styles.continueButton}
              onClick={handleContinue}
              disabled={!selectedPlatform}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </>
  );
} 