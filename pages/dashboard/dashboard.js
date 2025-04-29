import Head from 'next/head';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import styles from '@/styles/pages/dashboard.module.css';

export default function DashboardView({ navigateTo }) {
  const { user, loading } = useAuth();

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
      tab: 'unified'
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
          <button 
            className={styles.debugButton}
            onClick={handleStartDebugging}
          >
            Start Debugging
          </button>
        </div>
      </main>
    </>
  );
} 