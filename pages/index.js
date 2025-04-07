import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import styles from '@/styles/Home.module.css';
import AuthForm from '@/components/auth/AuthForm';
import { useAuth } from '@/contexts/AuthContext';

export default function Home() {
  const { user, loading, signOut } = useAuth();
  const [loadingApp, setLoadingApp] = useState(true);
  const router = useRouter();

  // Simulate app loading and redirect to dashboard when ready
  useEffect(() => {
    if (!loading && user) {
      // Only start loading app after auth state is determined
      const timer = setTimeout(() => {
        setLoadingApp(false);
        router.push('/dashboard');
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [loading, user, router]);

  // Show loading screen while auth state is being determined
  if (loading) {
    return (
      <>
        <Head>
          <title>enlighten | Echo Desktop</title>
          <meta name="description" content="App Analytics Debugging Tool" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <main className={styles.main}>
          <div className={styles.loadingContainer}>
            <h1 className={styles.logo}>enlighten</h1>
            <div className={styles.loadingBar}>
              <div className={styles.loadingProgress}></div>
            </div>
            <p className={styles.loadingText}>Loading Echo Desktop...</p>
          </div>
        </main>
      </>
    );
  }

  // User is not logged in, show auth form
  if (!user) {
    return (
      <>
        <Head>
          <title>Sign In | enlighten Echo Desktop</title>
          <meta name="description" content="Sign in to Echo Desktop" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <main className={styles.main}>
          <AuthForm />
        </main>
      </>
    );
  }

  // User is logged in, show loading screen or dashboard
  return (
    <>
      <Head>
        <title>enlighten | Echo Desktop</title>
        <meta name="description" content="App Analytics Debugging Tool" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.main}>
        {loadingApp ? (
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
              <h2 className={styles.headerTitle}>enlighten</h2>
              <nav className={styles.headerNav}>
                <span className={styles.navItem}>Dashboard</span>
                <span className={styles.navItem}>Analytics</span>
                <span className={styles.navItem}>Settings</span>
                <span 
                  className={styles.navItem} 
                  onClick={signOut}
                >
                  Sign Out
                </span>
              </nav>
            </header>
            <div className={styles.welcomeSection}>
              <h1 className={styles.welcomeTitle}>Welcome, {user.email}</h1>
              <p className={styles.welcomeText}>
                Echo Desktop helps you analyze and debug your application analytics in real-time.
              </p>
            </div>
          </div>
        )}
      </main>
    </>
  );
} 