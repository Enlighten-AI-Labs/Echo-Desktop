import { useState, useEffect } from 'react';
import Head from 'next/head';
import styles from '@/styles/UnifiedDebugger.module.css';
import UnifiedAnalyticsDebugger from '@/components/UnifiedAnalyticsDebugger';

export default function UnifiedDebuggerPage() {
  const [deviceId, setDeviceId] = useState(null);
  const [packageName, setPackageName] = useState(null);

  useEffect(() => {
    // Get device and package info from localStorage or URL params
    const storedDeviceId = localStorage.getItem('selectedDeviceId');
    const storedPackageName = localStorage.getItem('selectedPackageName');
    setDeviceId(storedDeviceId);
    setPackageName(storedPackageName);
  }, []);

  return (
    <>
      <Head>
        <title>Unified Analytics Debugger</title>
      </Head>
      <div className={styles.container}>
        <UnifiedAnalyticsDebugger 
          deviceId={deviceId} 
          packageName={packageName} 
          show={true} 
        />
      </div>
    </>
  );
} 