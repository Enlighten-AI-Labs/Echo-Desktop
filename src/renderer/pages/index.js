import Head from 'next/head';
import styles from '@/styles/pages/home.module.css';
import { useEffect, useState } from 'react';

export default function Home() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading process
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <Head>
        <title>enlighten | Echo Desktop</title>
        <meta name="description" content="App Analytics Debugging Tool" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.main}>
        {loading ? (
          <div className={styles.loadingContainer}>
            <h1 className={styles.logo}>enlighten</h1>
            <div className={styles.loadingBar}>
              <div className={styles.loadingProgress}></div>
            </div>
            <p className={styles.loadingText}>Loading Echo Desktop...</p>
          </div>
        ) : (
          <div className={styles.dashboardContainer}>
            <header className={styles.header}>
              <h2 className={styles.headerTitle}>Echo Desktop</h2>
              <div className={styles.headerNav}>
                <span className={styles.navItem}>Dashboard</span>
                <span className={styles.navItem}>Devices</span>
                <span className={styles.navItem}>Captures</span>
                <span className={styles.navItem}>Settings</span>
              </div>
            </header>
            
            <div className={styles.welcomeSection}>
              <h1 className={styles.welcomeTitle}>Welcome</h1>
              <p className={styles.welcomeText}>
                Echo Desktop helps you debug analytics data from your mobile applications.
              </p>
              <div className={styles.actionButtons}>
                <button className={`${styles.button} ${styles.primaryButton}`}>
                  Connect Device
                </button>
                <button className={`${styles.button} ${styles.secondaryButton}`}>
                  View Documentation
                </button>
              </div>
            </div>
            
            <div className={styles.featuresSection}>
              <h3 className={styles.sectionTitle}>Features</h3>
              <div className={styles.featureGrid}>
                <div className={styles.featureCard}>
                  <div className={styles.featureIcon} style={{ backgroundColor: 'var(--color-purple)' }}></div>
                  <h4 className={styles.featureTitle}>Android Debugging</h4>
                  <p className={styles.featureDescription}>
                    Connect to Android devices via ADB.
                  </p>
                </div>
                <div className={styles.featureCard}>
                  <div className={styles.featureIcon} style={{ backgroundColor: 'var(--color-blue)' }}></div>
                  <h4 className={styles.featureTitle}>iOS Debugging</h4>
                  <p className={styles.featureDescription}>
                    Debug iOS apps using proxy settings.
                  </p>
                </div>
                <div className={styles.featureCard}>
                  <div className={styles.featureIcon} style={{ backgroundColor: 'var(--color-red)' }}></div>
                  <h4 className={styles.featureTitle}>RTMP Streaming</h4>
                  <p className={styles.featureDescription}>
                    Capture and analyze RTMP streams.
                  </p>
                </div>
                <div className={styles.featureCard}>
                  <div className={styles.featureIcon} style={{ backgroundColor: 'var(--color-green)' }}></div>
                  <h4 className={styles.featureTitle}>Cloud Storage</h4>
                  <p className={styles.featureDescription}>
                    Store captures in Supabase for later analysis.
                  </p>
                </div>
              </div>
            </div>
            
            <footer className={styles.footer}>
              <span className={styles.footerText}>enlighten</span>
              <span className={styles.footerVersion}>Version 1.0.0</span>
            </footer>
          </div>
        )}
      </main>
    </>
  );
} 