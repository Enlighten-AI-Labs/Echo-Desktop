import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import styles from '@/styles/DeviceSetup.module.css';

export default function DeviceSetup() {
  const router = useRouter();
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [localIp, setLocalIp] = useState('Loading...');

  useEffect(() => {
    // Get the local IP address when component mounts
    async function fetchLocalIp() {
      try {
        const ipAddress = await window.api.mitmproxy.getProxyIp();
        setLocalIp(ipAddress);
      } catch (error) {
        console.error('Failed to get local IP address:', error);
        setLocalIp('Failed to detect');
      }
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
  }, [showIOSInstructions, selectedPlatform]);

  const handleContinue = () => {
    if (!selectedPlatform) return;
    
    if (selectedPlatform === 'ios') {
      // For iOS, show MitmProxy setup instructions
      setShowIOSInstructions(true);
    } else {
      // For Android, just go back to the analytics debugger
      router.push('/analytics-debugger');
    }
  };

  const handleBack = () => {
    if (showIOSInstructions) {
      // If showing iOS instructions, go back to platform selection
      setShowIOSInstructions(false);
    } else {
      // Otherwise, return to analytics debugger
      router.push('/analytics-debugger');
    }
  };

  const handleStartCapturing = () => {
    // Inform backend to start capturing with MitmProxy if not already running
    window.api.mitmproxy.startCapturing()
      .then(result => {
        if (result.success) {
          // Redirect to analytics debugger with mitmproxy status
          router.push('/analytics-debugger?mitmproxy=true');
        } else {
          alert('Failed to start MitmProxy: ' + result.message);
        }
      })
      .catch(error => {
        alert('Error starting MitmProxy: ' + error.message);
      });
  };

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