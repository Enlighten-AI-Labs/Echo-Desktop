import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import styles from '@/styles/Home.module.css';
import AuthForm from '@/components/auth/AuthForm';
import { useAuth } from '@/contexts/AuthContext';

export default function Home() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  // Redirect to dashboard when authenticated
  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
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

  // User is logged in and being redirected, show loading screen
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
          <p className={styles.loadingText}>Redirecting to dashboard...</p>
        </div>
      </main>
    </>
  );
} 