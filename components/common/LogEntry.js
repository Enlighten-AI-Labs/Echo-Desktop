import { useState, useRef, useEffect } from 'react';
import styles from '@/styles/components/log-entry.module.css';

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

// Format JSON data if present in the log message
const formatData = (data) => {
  if (!data) return null;
  
  try {
    // If it's already an object, stringify it
    if (typeof data === 'object') {
      return JSON.stringify(data, null, 2);
    }
    
    // Try to parse as JSON
    const parsed = JSON.parse(data);
    return JSON.stringify(parsed, null, 2);
  } catch (e) {
    // Not JSON, return as is
    return data;
  }
};

export default function LogEntry({ log }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasLongMessage, setHasLongMessage] = useState(false);
  const messageRef = useRef(null);
  
  // Check if the message is truncated or long
  useEffect(() => {
    if (messageRef.current) {
      const isOverflowing = messageRef.current.scrollWidth > messageRef.current.clientWidth;
      setHasLongMessage(isOverflowing || log.message.length > 80);
    }
  }, [log.message]);

  // Extract JSON data if present
  const formattedData = log.data ? formatData(log.data) : null;
  
  // Determine if we should show expand icon
  const shouldShowMore = hasLongMessage || formattedData || log.details;

  return (
    <div className={`${styles.logEntry} ${styles[log.type]} ${isExpanded ? styles.expanded : ''}`}>
      <div 
        className={styles.logHeader}
        onClick={() => shouldShowMore && setIsExpanded(!isExpanded)}
      >
        <div className={styles.logIcon}>
          <LogIcon type={log.type} />
        </div>
        <div 
          className={styles.logMessage} 
          ref={messageRef}
          title={log.message}
        >
          {log.message}
        </div>
        {shouldShowMore && (
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
        )}
      </div>
      
      {isExpanded && (
        <div className={styles.logDetails}>
          <div className={styles.logMessageExpanded}>
            {log.message}
          </div>
          
          {/* Show timestamp when expanded */}
          <div className={styles.logTimestamp}>
            {new Date(log.timestamp).toLocaleString([], {
              year: 'numeric',
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            })}
          </div>
          
          {(formattedData || log.details) && (
            <div className={styles.logData}>
              {formattedData && (
                <pre className={styles.jsonData}>{formattedData}</pre>
              )}
              {log.details && (
                <div className={styles.logDetailsText}>{log.details}</div>
              )}
            </div>
          )}
          
          {/* Additional metadata if available */}
          {log.meta && (
            <div className={styles.logMeta}>
              {Object.entries(log.meta).map(([key, value]) => (
                <div key={key} className={styles.metaItem}>
                  <span className={styles.metaKey}>{key}:</span>
                  <span className={styles.metaValue}>
                    {typeof value === 'object' ? JSON.stringify(value) : value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 