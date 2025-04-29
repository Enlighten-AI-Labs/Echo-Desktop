import { useRouter } from 'next/router';
import { useEffect } from 'react';
import Head from 'next/head';
import AnalyticsDebugger from '@/components/analytics/AnalyticsDebugger';
import LogcatAnalyticsDebugger from '@/components/analytics/LogcatAnalyticsDebugger';
import styles from '@/styles/pages/analytics-debugger.module.css';

export default function AnalyticsDebuggerPage() {
  const router = useRouter();
  
  useEffect(() => {
    // Wait for router to be ready
    if (router.isReady) {
      // Redirect to the new debugger page with the same query parameters
      router.replace({
        pathname: '/debugger',
        query: router.query
      });
    }
  }, [router.isReady, router.query]);
  
  // Return a simple loading screen while redirecting
  return (
    <>
      <Head>
        <title>Analytics Debugger | Echo Desktop</title>
        <meta name="description" content="Echo Desktop Analytics Debugger" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: '#262628',
        color: '#ffffff'
      }}>
        Redirecting to new Debugger...
      </div>
    </>
  );
} 