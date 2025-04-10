import styles from '@/styles/AnalyticsDebugger.module.css';

export default function AnalyticsDebugger({ deviceId, packageName, show }) {
  if (!show) return null;
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Analytics Debugger</h2>
      </div>
      
      <div className={styles.content}>
        <div className={styles.messageContainer}>
          <div className={styles.message}>
            <h3>Analytics Logging Feature Removed</h3>
            <p>The analytics debugging and logging functionality has been removed from this application.</p>
            <p>Device ID: {deviceId}</p>
            <p>Package Name: {packageName}</p>
          </div>
        </div>
      </div>
    </div>
  );
} 