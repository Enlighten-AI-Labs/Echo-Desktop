import { useState, useEffect } from 'react';
import styles from '@/styles/AndroidAppSelector.module.css';

export default function AndroidAppSelector({ isOpen, onClose, deviceId, onSelectApp }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen && deviceId) {
      fetchInstalledApps();
    }
  }, [isOpen, deviceId]);

  const fetchInstalledApps = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch installed apps using ADB
      const appsList = await window.api.adb.getInstalledApps(deviceId);
      setApps(appsList);
    } catch (err) {
      console.error('Error fetching installed apps:', err);
      setError('Failed to get installed apps. Please make sure your device is connected.');
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchApp = () => {
    if (!selectedPackage) return;
    
    const selectedApp = apps.find(app => app.packageName === selectedPackage);
    if (selectedApp) {
      onSelectApp(selectedApp);
    }
  };

  const filteredApps = apps.filter(app => 
    app.appName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    app.packageName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Select Android App</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        
        <div className={styles.modalBody}>
          <div className={styles.searchContainer}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search apps..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {loading ? (
            <div className={styles.loading}>
              <div className={styles.spinnerContainer}>
                <div className={styles.spinner}></div>
              </div>
              <p>Fetching installed apps...</p>
            </div>
          ) : error ? (
            <div className={styles.error}>
              <p>{error}</p>
              <button 
                onClick={fetchInstalledApps} 
                className={styles.refreshButton}
              >
                Try Again
              </button>
            </div>
          ) : apps.length === 0 ? (
            <div className={styles.noApps}>
              <p>No apps found on this device.</p>
              <button 
                onClick={fetchInstalledApps} 
                className={styles.refreshButton}
              >
                Refresh App List
              </button>
            </div>
          ) : (
            <div className={styles.appList}>
              {filteredApps.length === 0 ? (
                <div className={styles.noResults}>No apps match your search</div>
              ) : (
                filteredApps.map(app => (
                  <div
                    key={app.packageName}
                    className={`${styles.appItem} ${selectedPackage === app.packageName ? styles.selected : ''}`}
                    onClick={() => setSelectedPackage(app.packageName)}
                  >
                    <div className={styles.appIcon}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                        <path d="M17.523 15.3414c-.5511 0-.998-.4478-.998-.998v-5.3438c0-.5511.4478-.998.998-.998.5511 0 .998.4478.998.998v5.3438c0 .5511-.4478.998-.998.998m-11.046 0c-.5511 0-.998-.4478-.998-.998v-5.3438c0-.5511.4478-.998.998-.998.5511 0 .998.4478.998.998v5.3438c0 .5511-.4478.998-.998.998m7.0098-14.291.8899-1.6631c.0394-.0738.0116-.1662-.0622-.2061-.0739-.0398-.1663-.0119-.2061.0622l-.9003 1.6827c-.7057-.3099-1.4976-.4817-2.33-.4817-.8325 0-1.6245.1718-2.33.4817l-.9003-1.6827c-.0398-.074-.1322-.102-.2061-.0622-.0739.0398-.1016.1323-.0622.2061l.8899 1.6631C4.6414 2.3295 1.7382 5.6783 1.7382 9.6047h20.5236c0-3.9264-2.9032-7.2752-8.7138-8.5543"></path>
                      </svg>
                    </div>
                    <div className={styles.appInfo}>
                      <h3 className={styles.appName}>{app.appName}</h3>
                      <p className={styles.packageName}>{app.packageName}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        
        <div className={styles.modalFooter}>
          <button 
            className={styles.cancelButton} 
            onClick={onClose}
          >
            Back
          </button>
          <button 
            className={styles.launchButton} 
            onClick={handleLaunchApp}
            disabled={!selectedPackage || loading}
          >
            Launch App
          </button>
        </div>
      </div>
    </div>
  );
} 