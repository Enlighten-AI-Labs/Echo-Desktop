import Head from 'next/head';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AppSelector from '@/components/AppSelector';
import PlatformSelector from '@/components/PlatformSelector';
import AndroidDeviceSelector from '@/components/AndroidDeviceSelector';
import AndroidAppSelector from '@/components/AndroidAppSelector';
import AnalyticsDebugger from '@/components/AnalyticsDebugger';
import styles from '@/styles/Dashboard.module.css';

export default function DashboardView({ navigateTo }) {
  const { user, loading } = useAuth();
  const [isAppSelectorOpen, setIsAppSelectorOpen] = useState(false);
  const [isPlatformSelectorOpen, setIsPlatformSelectorOpen] = useState(false);
  const [isAndroidDeviceSelectorOpen, setIsAndroidDeviceSelectorOpen] = useState(false);
  const [isAndroidAppSelectorOpen, setIsAndroidAppSelectorOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [selectedAndroidApp, setSelectedAndroidApp] = useState(null);
  const [debuggingActive, setDebuggingActive] = useState(false);

  if (!loading && !user) {
    navigateTo('login');
    return null;
  }

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <h1 className={styles.logo}>enlighten</h1>
        <p className={styles.loadingText}>Loading...</p>
      </div>
    );
  }

  const handleStartDebugging = () => {
    navigateTo('debugger', { tab: 'unified' });
  };

  const handleCloseAppSelector = () => {
    setIsAppSelectorOpen(false);
  };

  const handleSelectApp = (app) => {
    setSelectedApp(app);
    setIsAppSelectorOpen(false);
    setIsPlatformSelectorOpen(true);
  };

  const handleClosePlatformSelector = () => {
    setIsPlatformSelectorOpen(false);
  };

  const handleSelectPlatform = (platform) => {
    setSelectedPlatform(platform);
    setIsPlatformSelectorOpen(false);
    
    if (platform === 'android') {
      setIsAndroidDeviceSelectorOpen(true);
    } else {
      setDebuggingActive(true);
    }
  };

  const handleCloseAndroidDeviceSelector = () => {
    setIsAndroidDeviceSelectorOpen(false);
  };

  const handleSelectAndroidDevice = (device) => {
    setSelectedDevice(device);
    setIsAndroidDeviceSelectorOpen(false);
    
    setIsAndroidAppSelectorOpen(true);
  };
  
  const handleCloseAndroidAppSelector = () => {
    setIsAndroidAppSelectorOpen(false);
  };
  
  const handleSelectAndroidApp = async (app) => {
    try {
      setSelectedAndroidApp(app);
      
      const launchResult = await window.api.adb.launchApp(selectedDevice.id, app.packageName);
      
      if (launchResult.success) {
        console.log('Successfully launched app:', app.packageName);
      } else {
        console.error('Failed to launch app:', launchResult.message);
      }
      
      setIsAndroidAppSelectorOpen(false);
      setDebuggingActive(true);
      
      console.log('Selected app for debugging:', selectedApp);
      console.log('Selected platform for debugging:', selectedPlatform);
      console.log('Selected Android device for debugging:', selectedDevice);
      console.log('Launched Android app:', app);
    } catch (error) {
      console.error('Error launching app:', error);
    }
  };

  const handleStopDebugging = () => {
    setDebuggingActive(false);
    setSelectedApp(null);
    setSelectedPlatform(null);
    setSelectedDevice(null);
    setSelectedAndroidApp(null);
  };

  const handleToggleAnalyticsDebugger = () => {
    navigateTo('debugger', {
      deviceId: selectedDevice?.id,
      packageName: selectedAndroidApp?.packageName,
      tab: 'network'
    });
  };

  const handleSplitScreenDebugger = () => {
    navigateTo('debugger', {
      deviceId: selectedDevice?.id,
      packageName: selectedAndroidApp?.packageName,
      tab: 'network'
    });
  };

  return (
    <>
      <Head>
        <title>Dashboard | enlighten</title>
        <meta name="description" content="Echo Desktop Dashboard" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.mainContainer}>
        <div className={styles.settingsContainer}>
          <button 
            className={styles.settingsButton} 
            aria-label="Settings"
            onClick={() => navigateTo('settings')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </div>

        <div className={styles.centerContent}>
          <h1 className={styles.title}>Echo Desktop</h1>
          
          {debuggingActive && selectedApp && selectedPlatform ? (
            <div className={styles.debuggingInfo}>
              <div className={styles.appDetails}>
                <h2 className={styles.debuggingTitle}>Currently Debugging:</h2>
                <div className={styles.selectedAppInfo}>
                  <div className={styles.selectedAppIcon}>
                    {selectedApp.icon || '📱'}
                  </div>
                  <div>
                    <h3 className={styles.selectedAppName}>{selectedApp.name}</h3>
                    <div className={styles.appMeta}>
                      <p className={styles.selectedAppId}>App ID: {selectedApp.id}</p>
                      <div className={styles.platformBadge}>
                        {selectedPlatform === 'android' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M17.523 15.3414c-.5511 0-.998-.4478-.998-.998v-5.3438c0-.5511.4478-.998.998-.998.5511 0 .998.4478.998.998v5.3438c0 .5511-.4478.998-.998.998m-11.046 0c-.5511 0-.998-.4478-.998-.998v-5.3438c0-.5511.4478-.998.998-.998.5511 0 .998.4478.998.998v5.3438c0 .5511-.4478.998-.998.998m7.0098-14.291.8899-1.6631c.0394-.0738.0116-.1662-.0622-.2061-.0739-.0398-.1663-.0119-.2061.0622l-.9003 1.6827c-.7057-.3099-1.4976-.4817-2.33-.4817-.8325 0-1.6245.1718-2.33.4817l-.9003-1.6827c-.0398-.074-.1322-.102-.2061-.0622-.0739.0398-.1016.1323-.0622.2061l.8899 1.6631C4.6414 2.3295 1.7382 5.6783 1.7382 9.6047h20.5236c0-3.9264-2.9032-7.2752-8.7138-8.5543"></path>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M17.0748 11.9146c-.0018-1.613.7424-3.0892 1.9365-4.0345-1.0096-1.3956-2.6084-2.2066-4.2984-2.1532-1.7339-.1703-3.3888 1.0347-4.2637 1.0347-.8969 0-2.2458-1.016-3.7053-1.0003-1.8851.03-3.6412 1.1065-4.5986 2.8124-1.9855 3.4368-.5065 8.4962 1.4022 11.2669.9533 1.3576 2.0753 2.8693 3.5406 2.8167 1.437-.0593 1.9685-.9106 3.7052-.9106 1.7172 0 2.2268.9106 3.7225.8793 1.5414-.0243 2.5157-1.3771 3.4445-2.7413.6681-.9626 1.1759-2.0425 1.4976-3.1814-1.6936-.7015-2.7889-2.3726-2.7831-4.2175zM14.4365 5.7815c.8303-1.0452 1.1553-2.3956.9-3.7226-1.2436.0895-2.3858.6866-3.1897 1.6663-.7854.9668-1.1657 2.1961-1.0554 3.4445 1.2791.016 2.4945-.6108 3.3451-1.3882z"></path>
                          </svg>
                        )}
                        <span>{selectedPlatform === 'android' ? 'Android' : 'iOS'}</span>
                      </div>
                      {selectedDevice && selectedPlatform === 'android' && (
                        <div className={styles.deviceBadge}>
                          <span>Device: {selectedDevice.name}</span>
                        </div>
                      )}
                      {selectedAndroidApp && selectedPlatform === 'android' && (
                        <div className={styles.androidAppBadge}>
                          <span>App: {selectedAndroidApp.appName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className={styles.debuggingActions}>
                {selectedPlatform === 'android' && selectedAndroidApp && (
                  <>
                    <button 
                      className={styles.analyticsButton}
                      onClick={handleSplitScreenDebugger}
                    >
                      Debugger
                    </button>
                  </>
                )}
                <button 
                  className={styles.stopDebuggingButton}
                  onClick={handleStopDebugging}
                >
                  Stop Debugging
                </button>
              </div>
            </div>
          ) : (
            <button 
              className={styles.debugButton}
              onClick={handleStartDebugging}
            >
              Start Debugging
            </button>
          )}
        </div>

        <AppSelector 
          isOpen={isAppSelectorOpen}
          onClose={handleCloseAppSelector}
          onSelectApp={handleSelectApp}
        />

        <PlatformSelector 
          isOpen={isPlatformSelectorOpen}
          onClose={handleClosePlatformSelector}
          onSelectPlatform={handleSelectPlatform}
          appName={selectedApp?.name || ''}
        />

        <AndroidDeviceSelector
          isOpen={isAndroidDeviceSelectorOpen}
          onClose={handleCloseAndroidDeviceSelector}
          onSelectDevice={handleSelectAndroidDevice}
          appName={selectedApp?.name || ''}
        />
        
        <AndroidAppSelector
          isOpen={isAndroidAppSelectorOpen}
          onClose={handleCloseAndroidAppSelector}
          deviceId={selectedDevice?.id}
          onSelectApp={handleSelectAndroidApp}
        />
      </main>
    </>
  );
} 