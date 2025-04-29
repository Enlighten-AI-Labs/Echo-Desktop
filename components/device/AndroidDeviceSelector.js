import { useState, useEffect } from 'react';
import styles from '@/styles/components/android-device-selector.module.css';

export default function AndroidDeviceSelector({ isOpen, onClose, onSelectDevice, appName }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [installingAdb, setInstallingAdb] = useState(false);
  const [showManualPairing, setShowManualPairing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchConnectedDevices();
    }
  }, [isOpen]);

  const fetchConnectedDevices = async () => {
    try {
      setLoading(true);
      setError(null);
      setInstallingAdb(false);
      
      // Use the actual ADB implementation from preload.js
      const devicesList = await window.api.adb.getDevices();
      setDevices(devicesList);
    } catch (err) {
      console.error('Error fetching devices:', err);
      
      // Check if the error message indicates ADB is being installed/downloaded
      if (err.message && err.message.includes('download')) {
        setInstallingAdb(true);
        setError('Installing Android Debug Bridge tools. This may take a minute...');
        
        // Retry after a delay to give time for ADB installation
        setTimeout(() => {
          fetchConnectedDevices();
        }, 10000); // Retry after 10 seconds
      } else {
        setError('Failed to connect to ADB. Make sure your Android device is connected and USB debugging is enabled.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDevice = () => {
    if (!selectedDeviceId) return;
    
    const selectedDevice = devices.find(device => device.id === selectedDeviceId);
    if (selectedDevice) {
      onSelectDevice(selectedDevice);
    }
  };

  const generateQrCode = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Generate QR code for wireless debugging
      const result = await window.api.adb.generateQRCode();
      
      // Set connection info
      setConnectionInfo(result);
      
      // Use the data URL directly now
      setQrCodeUrl(result.qrCodePath);
      
      setShowQrCode(true);
    } catch (err) {
      console.error('Error generating QR code:', err);
      setError('Failed to generate QR code. Make sure your device supports wireless debugging (Android 11+).');
    } finally {
      setLoading(false);
    }
  };

  const attemptConnection = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!connectionInfo || !connectionInfo.hostIp) {
        throw new Error('Connection information is missing');
      }
      
      console.log('Attempting to connect to device at', connectionInfo.hostIp, 'port', connectionInfo.pairingPort, 'with code', connectionInfo.pairingCode);
      
      // Attempt to connect to the device
      const result = await window.api.adb.connectDevice(
        connectionInfo.hostIp, 
        connectionInfo.pairingPort,
        connectionInfo.pairingCode
      );
      console.log('Connection result:', result);
      
      if (result.success) {
        console.log('Successfully connected to device, refreshing device list');
        // Refresh the device list to show the newly connected device
        await fetchConnectedDevices();
        setShowQrCode(false);
        setShowManualPairing(false);
      } else {
        console.error('Connection failed:', result.message);
        throw new Error(result.message || 'Failed to connect to device');
      }
    } catch (err) {
      console.error('Error connecting to device:', err);
      setError(`Failed to connect to device: ${err.message}. Check your device's wireless debugging settings.`);
    } finally {
      setLoading(false);
    }
  };

  const startManualPairing = async () => {
    // Simply show the manual pairing UI
    setShowManualPairing(true);
    setConnectionInfo({
      hostIp: '',
      pairingPort: '',
      pairingCode: ''
    });
  };
  
  const handleInputChange = (field, value) => {
    setConnectionInfo(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const renderDebugInstructions = () => (
    <div className={styles.debugInstructions}>
      <h3 className={styles.instructionsTitle}>USB Debugging Setup</h3>
      <ol className={styles.instructionsList}>
        <li>On your Android device, go to <strong>Settings</strong></li>
        <li>Scroll down and tap <strong>About phone</strong></li>
        <li>Tap <strong>Build number</strong> 7 times to enable Developer options</li>
        <li>Go back to <strong>Settings</strong> and tap <strong>System</strong> &gt; <strong>Developer options</strong></li>
        <li>Enable <strong>USB debugging</strong></li>
        <li>Connect your device via USB and allow debugging when prompted</li>
        <li>Click "Refresh Device List" below</li>
      </ol>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Select Android Device</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        
        <div className={styles.modalBody}>
          <p className={styles.appName}>App: {appName}</p>
          
          {loading ? (
            <div className={styles.loading}>
              <div className={styles.spinnerContainer}>
                <div className={styles.spinner}></div>
              </div>
              <p>{installingAdb 
                ? 'Installing Android Debug Bridge tools. This may take a minute...' 
                : 'Initializing ADB and scanning for devices...'}</p>
            </div>
          ) : error ? (
            <div className={styles.error}>
              <p>{error}</p>
              <button 
                onClick={fetchConnectedDevices} 
                className={styles.refreshButton}
              >
                Try Again
              </button>
              {!installingAdb && renderDebugInstructions()}
            </div>
          ) : (
            <>
              {showQrCode ? (
                <div className={styles.qrCodeContainer}>
                  <h3 className={styles.qrCodeTitle}>Wireless Debugging</h3>
                  <div className={styles.qrCode}>
                    {qrCodeUrl ? (
                      <img 
                        src={qrCodeUrl} 
                        alt="QR Code for pairing" 
                        className={styles.qrCodeImage}
                      />
                    ) : (
                      <div className={styles.qrPlaceholder}>QR Code</div>
                    )}
                  </div>
                  {connectionInfo && (
                    <div className={styles.connectionInfo}>
                      <p>IP Address: <strong>{connectionInfo.hostIp}</strong></p>
                      <p>Port: <strong>{connectionInfo.pairingPort}</strong></p>
                      <p>Pairing Code: <strong>{connectionInfo.pairingCode}</strong></p>
                    </div>
                  )}
                  
                  <div className={styles.pairingCodeNotice}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <span>Scan QR code with your Android device and follow these steps</span>
                  </div>
                  
                  <div className={styles.commandLine}>
                    <h4>Or run this command on your computer:</h4>
                    <pre>adb pair {connectionInfo?.hostIp}:{connectionInfo?.pairingPort} {connectionInfo?.pairingCode}</pre>
                    <p className={styles.commandHelp}>This starts the ADB pairing service on your computer</p>
                  </div>
                  
                  <p className={styles.qrInstructions}>
                    <strong>1. On your computer:</strong> Run the command above to start the pairing service
                    <br />
                    <strong>2. On your Android device:</strong> Go to Settings → Developer options → Wireless debugging → 
                    Pair device with QR code
                    <br />
                    <strong>3. Scan</strong> the QR code above with your device's camera
                    <br />
                    <strong>4. Once paired, </strong> click "Connect to Device" below
                  </p>
                  <div className={styles.qrCodeActions}>
                    <button 
                      className={styles.connectButton}
                      onClick={attemptConnection}
                      disabled={loading}
                    >
                      {loading ? 'Connecting...' : 'Connect to Device'}
                    </button>
                    <button 
                      className={styles.backButton}
                      onClick={() => {
                        setShowQrCode(false);
                        // Refresh device list
                        fetchConnectedDevices();
                      }}
                      disabled={loading}
                    >
                      Back to Device List
                    </button>
                  </div>
                </div>
              ) : showManualPairing ? (
                <div className={styles.manualPairingContainer}>
                  <h3 className={styles.qrCodeTitle}>Manual Pairing</h3>
                  
                  <div className={styles.pairingCodeNotice}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <span>Enter the connection details shown on your Android device</span>
                  </div>
                  
                  <p className={styles.qrInstructions}>
                    <strong>1. On your Android device:</strong> Go to Settings → Developer options → Wireless debugging
                    <br />
                    <strong>2. Tap "Pair device with pairing code"</strong> to get your IP, port, and pairing code
                    <br />
                    <strong>3. Enter those details below</strong> and click "Connect to Device"
                  </p>
                  
                  <div className={styles.inputContainer}>
                    <div className={styles.inputGroup}>
                      <label htmlFor="ipAddress" className={styles.inputLabel}>IP Address</label>
                      <input
                        id="ipAddress"
                        type="text"
                        className={styles.textInput}
                        placeholder="192.168.1.100"
                        value={connectionInfo?.hostIp || ''}
                        onChange={(e) => handleInputChange('hostIp', e.target.value)}
                      />
                    </div>
                    
                    <div className={styles.inputGroup}>
                      <label htmlFor="port" className={styles.inputLabel}>Port</label>
                      <input
                        id="port"
                        type="text"
                        className={styles.textInput}
                        placeholder="37000"
                        value={connectionInfo?.pairingPort || ''}
                        onChange={(e) => handleInputChange('pairingPort', e.target.value)}
                      />
                    </div>
                    
                    <div className={styles.inputGroup}>
                      <label htmlFor="pairingCode" className={styles.inputLabel}>Pairing Code</label>
                      <input
                        id="pairingCode"
                        type="text"
                        className={styles.textInput}
                        placeholder="123456"
                        value={connectionInfo?.pairingCode || ''}
                        onChange={(e) => handleInputChange('pairingCode', e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className={styles.qrCodeActions}>
                    <button 
                      className={styles.connectButton}
                      onClick={attemptConnection}
                      disabled={loading || !connectionInfo?.hostIp || !connectionInfo?.pairingPort || !connectionInfo?.pairingCode}
                    >
                      {loading ? 'Connecting...' : 'Connect to Device'}
                    </button>
                    <button 
                      className={styles.backButton}
                      onClick={() => {
                        setShowManualPairing(false);
                        // Refresh device list
                        fetchConnectedDevices();
                      }}
                      disabled={loading}
                    >
                      Back to Device List
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.deviceList}>
                    <h3 className={styles.deviceListTitle}>Connected Devices</h3>
                    {devices.length === 0 ? (
                      <div className={styles.noDevices}>
                        <p>No devices connected.</p>
                        <p>Connect your Android device via USB and make sure USB debugging is enabled.</p>
                        {renderDebugInstructions()}
                      </div>
                    ) : (
                      devices.map(device => (
                        <div
                          key={device.id}
                          className={`${styles.deviceItem} ${selectedDeviceId === device.id ? styles.selected : ''}`}
                          onClick={() => setSelectedDeviceId(device.id)}
                        >
                          <div className={styles.deviceIcon}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                              <path d="M17.523 15.3414c-.5511 0-.998-.4478-.998-.998v-5.3438c0-.5511.4478-.998.998-.998.5511 0 .998.4478.998.998v5.3438c0 .5511-.4478.998-.998.998m-11.046 0c-.5511 0-.998-.4478-.998-.998v-5.3438c0-.5511.4478-.998.998-.998.5511 0 .998.4478.998.998v5.3438c0 .5511-.4478.998-.998.998m7.0098-14.291.8899-1.6631c.0394-.0738.0116-.1662-.0622-.2061-.0739-.0398-.1663-.0119-.2061.0622l-.9003 1.6827c-.7057-.3099-1.4976-.4817-2.33-.4817-.8325 0-1.6245.1718-2.33.4817l-.9003-1.6827c-.0398-.074-.1322-.102-.2061-.0622-.0739.0398-.1016.1323-.0622.2061l.8899 1.6631C4.6414 2.3295 1.7382 5.6783 1.7382 9.6047h20.5236c0-3.9264-2.9032-7.2752-8.7138-8.5543"></path>
                            </svg>
                          </div>
                          <div className={styles.deviceInfo}>
                            <h4 className={styles.deviceName}>{device.name || 'Unknown Device'}</h4>
                            <p className={styles.deviceId}>{device.id}</p>
                            <p className={styles.deviceModel}>{device.model || device.status}</p>
                            {device.status !== 'device' && (
                              <p className={styles.deviceWarning}>
                                {device.status === 'unauthorized' 
                                  ? 'Device is unauthorized. Accept debugging on your device.' 
                                  : `Status: ${device.status}`}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className={styles.actionsContainer}>
                    <button
                      className={styles.pairButton}
                      onClick={generateQrCode}
                    >
                      Connect with QR Code
                    </button>
                    <button
                      className={styles.pairButton}
                      onClick={startManualPairing}
                    >
                      Manual Pairing
                    </button>
                    <button
                      className={styles.refreshButton}
                      onClick={fetchConnectedDevices}
                    >
                      Refresh Device List
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
        
        <div className={styles.modalFooter}>
          <button 
            className={styles.cancelButton} 
            onClick={onClose}
          >
            Back
          </button>
          <button 
            className={styles.selectButton} 
            onClick={handleSelectDevice}
            disabled={!selectedDeviceId || loading || showQrCode || 
                     (selectedDeviceId && devices.find(d => d.id === selectedDeviceId)?.status !== 'device')}
          >
            Next: Select App
          </button>
        </div>
      </div>
    </div>
  );
} 