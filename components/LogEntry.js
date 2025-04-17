import { useState } from 'react';
import styles from '@/styles/LogEntry.module.css';

// Icons for different log types
const LogIcon = ({ type }) => {
  switch (type) {
    case 'error':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 15A7 7 0 108 1a7 7 0 000 14zM8 4v5M8 11v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    case 'warning':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8.5 2.37L15 13.5H2L8.5 2.37z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M8.5 11v.01M8.5 6v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );
    case 'success':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 15A7 7 0 108 1a7 7 0 000 14z" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 15A7 7 0 108 1a7 7 0 000 14z" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 11v.01M8 4v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );
  }
};

export default function LogEntry({ log }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div 
      className={`${styles.logEntry} ${styles[log.type]}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className={styles.logHeader}>
        <div className={styles.logIcon}>
          <LogIcon type={log.type} />
        </div>
        <div className={styles.logMessage}>
          {log.message}
        </div>
        <div className={styles.expandIcon}>
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 16 16" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
      {isExpanded && (
        <div className={styles.logDetails}>
          <div className={styles.logTime}>
            {new Date(log.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
} 