import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from '@/styles/AppSelector.module.css';

export default function AppSelector({ isOpen, onClose, onSelectApp }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAppId, setSelectedAppId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Only fetch apps when the modal is open
    if (isOpen) {
      fetchApps();
    }
  }, [isOpen]);

  const fetchApps = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('Apps')
        .select('*');
      
      if (error) throw error;
      
      setApps(data || []);
    } catch (err) {
      console.error('Error fetching apps:', err);
      setError('Failed to load apps. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectApp = () => {
    if (!selectedAppId) return;
    
    const selectedApp = apps.find(app => app.id === selectedAppId);
    if (selectedApp) {
      onSelectApp(selectedApp);
    }
  };

  const filteredApps = apps.filter(app => 
    app.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Select an App</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        
        <div className={styles.searchAndActionsBar}>
          <div className={styles.searchContainer}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search apps..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className={styles.actionsContainer}>
            <button
              className={styles.refreshButton}
              onClick={fetchApps}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button 
              className={styles.selectButton} 
              onClick={handleSelectApp}
              disabled={!selectedAppId || loading}
            >
              Debug Selected App
            </button>
          </div>
        </div>
        
        <div className={styles.modalBody}>
          {loading ? (
            <div className={styles.loading}>Loading apps...</div>
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : filteredApps.length === 0 ? (
            <div className={styles.noApps}>
              {searchQuery ? 'No matching apps found.' : 'No apps found. Please create an app first.'}
            </div>
          ) : (
            <div className={styles.appsList}>
              {filteredApps.map(app => (
                <div
                  key={app.id}
                  className={`${styles.appItem} ${selectedAppId === app.id ? styles.selected : ''}`}
                  onClick={() => setSelectedAppId(app.id)}
                >
                  <div className={styles.appIcon}>
                    {app.icon || '📱'}
                  </div>
                  <div className={styles.appInfo}>
                    <h3 className={styles.appName}>{app.name}</h3>
                    <p className={styles.appId}>ID: {app.id}</p>
                    <p className={styles.appDate}>Created: {new Date(app.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className={styles.modalFooter}>
          <button 
            className={styles.cancelButton} 
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
} 