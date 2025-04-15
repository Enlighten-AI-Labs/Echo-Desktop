import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import AnalyticsDebugger from '@/components/AnalyticsDebugger';
import styles from '@/styles/AnalyticsDebuggerPage.module.css';

export default function AnalyticsDebuggerPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [packageName, setPackageName] = useState('');
  
  useEffect(() => {
    // Get query parameters when the page loads
    if (router.isReady) {
      const { deviceId, packageName } = router.query;
      if (deviceId) setDeviceId(deviceId);
      if (packageName) setPackageName(packageName);
    }
  }, [router.isReady, router.query]);
  
  const handleBack = () => {
    router.push('/dashboard');
  };
  
  const handleViewLogs = () => {
    router.push('/mitmproxy-logs');
  };
  
  const handleSetupDevice = () => {
    const query = {};
    if (deviceId) query.deviceId = deviceId;
    if (packageName) query.packageName = packageName;
    router.push({
      pathname: '/device-setup',
      query
    });
  };
  
  const handleAppCrawler = () => {
    const query = {};
    if (deviceId) query.deviceId = deviceId;
    if (packageName) query.packageName = packageName;
    router.push({
      pathname: '/app-crawler',
      query
    });
  };
  
  return (
    <>
      <Head>
        <title>Analytics Debugger | Echo Desktop</title>
        <meta name="description" content="Echo Desktop Analytics Debugger" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button 
              className={styles.backButton}
              onClick={handleBack}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Back to Dashboard
            </button>
            <h1 className={styles.pageTitle}>Analytics Debugger</h1>
          </div>
          <div className={styles.headerButtons}>
            <button 
              className={styles.viewLogsButton}
              onClick={handleAppCrawler}
            >
              App Crawler
            </button>
            <button 
              className={styles.viewLogsButton}
              onClick={handleSetupDevice}
            >
              Setup Device
            </button>
            <button 
              className={styles.viewLogsButton}
              onClick={handleViewLogs}
            >
              View Logs
            </button>
          </div>
        </div>
        <div className={styles.debuggerContainer}>
          <AnalyticsDebugger
            deviceId={deviceId}
            packageName={packageName}
            show={true}
          />
        </div>
      </div>
    </>
  );
} 