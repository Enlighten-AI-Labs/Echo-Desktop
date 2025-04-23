import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { supabase } from '@/lib/supabase';
import styles from '@/styles/Export.module.css';

export default function ExportPage() {
  const router = useRouter();
  const [apps, setApps] = useState([]);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateVersion, setShowCreateVersion] = useState(false);
  const [newVersion, setNewVersion] = useState('');
  const [exportConfig, setExportConfig] = useState({
    targetApp: '',
    targetVersion: '',
    platform: '',
    deviceName: '',
    selectedJourneys: []
  });

  // Handle query parameters
  useEffect(() => {
    if (router.isReady) {
      const { deviceId } = router.query;
      if (deviceId) {
        setExportConfig(prev => ({
          ...prev,
          deviceName: deviceId
        }));
      }
    }
  }, [router.isReady, router.query]);

  // Fetch apps when component mounts
  useEffect(() => {
    fetchApps();
  }, []);

  // Fetch versions when target app changes
  useEffect(() => {
    if (exportConfig.targetApp) {
      fetchVersions(exportConfig.targetApp);
    } else {
      setVersions([]);
    }
  }, [exportConfig.targetApp]);

  const fetchApps = async () => {
    try {
      const { data, error } = await supabase
        .from('Apps')
        .select('*')
        .order('name');

      if (error) throw error;

      setApps(data || []);
    } catch (error) {
      console.error('Error fetching apps:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVersions = async (appId) => {
    try {
      const { data, error } = await supabase
        .from('Versions')
        .select('*')
        .eq('app_id', appId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setVersions(data || []);
    } catch (error) {
      console.error('Error fetching versions:', error);
    }
  };

  const handleBack = () => {
    router.back();
  };

  const handleExport = async () => {
    try {
      // TODO: Implement export logic
      console.log('Exporting with config:', exportConfig);
    } catch (error) {
      console.error('Error exporting:', error);
    }
  };

  const handleCreateVersion = async () => {
    if (!exportConfig.targetApp || !newVersion.trim()) return;

    try {
      const { data, error } = await supabase
        .from('Versions')
        .insert([{
          app_id: exportConfig.targetApp,
          app_version: newVersion.trim()
        }])
        .select()
        .single();

      if (error) throw error;

      // Add the new version to the list and select it
      setVersions(prev => [data, ...prev]);
      setExportConfig(prev => ({ ...prev, targetVersion: data.id }));
      setShowCreateVersion(false);
      setNewVersion('');
    } catch (error) {
      console.error('Error creating version:', error);
      alert('Failed to create version: ' + error.message);
    }
  };

  return (
    <>
      <Head>
        <title>Export Analytics Data | Echo Desktop</title>
        <meta name="description" content="Export analytics data from Echo Desktop" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button 
              className={styles.backButton}
              onClick={handleBack}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Back
            </button>
            <h1 className={styles.pageTitle}>Export Analytics Data</h1>
          </div>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : (
            <div className={styles.exportForm}>
              <div className={styles.formSection}>
                <h2>Export Configuration</h2>
                
                <div className={styles.formGroup}>
                  <label>Target Application</label>
                  <div className={styles.appGrid}>
                    {apps.map(app => (
                      <button
                        key={app.id}
                        className={`${styles.appButton} ${exportConfig.targetApp === app.id ? styles.selected : ''}`}
                        onClick={() => setExportConfig({...exportConfig, targetApp: app.id, targetVersion: ''})}
                      >
                        <div className={styles.appIcon}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                            <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/>
                          </svg>
                        </div>
                        <div className={styles.appInfo}>
                          <span className={styles.appName}>{app.name}</span>
                          <span className={styles.appPackage}>{app.package_name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {exportConfig.targetApp && (
                  <div className={styles.formGroup}>
                    <div className={styles.versionHeader}>
                      <label>Target Version</label>
                      <button 
                        className={styles.createVersionButton}
                        onClick={() => setShowCreateVersion(true)}
                      >
                        Create New Version
                      </button>
                    </div>
                    {showCreateVersion && (
                      <div className={styles.createVersionForm}>
                        <input
                          type="text"
                          value={newVersion}
                          onChange={(e) => setNewVersion(e.target.value)}
                          placeholder="Enter version number (e.g. 1.0.0)"
                          className={styles.versionInput}
                        />
                        <div className={styles.createVersionActions}>
                          <button 
                            className={styles.cancelButton}
                            onClick={() => {
                              setShowCreateVersion(false);
                              setNewVersion('');
                            }}
                          >
                            Cancel
                          </button>
                          <button 
                            className={styles.saveButton}
                            onClick={handleCreateVersion}
                            disabled={!newVersion.trim()}
                          >
                            Create Version
                          </button>
                        </div>
                      </div>
                    )}
                    <div className={styles.versionGrid}>
                      {versions.map(version => (
                        <button
                          key={version.id}
                          className={`${styles.versionButton} ${exportConfig.targetVersion === version.id ? styles.selected : ''}`}
                          onClick={() => setExportConfig({...exportConfig, targetVersion: version.id})}
                        >
                          <div className={styles.versionInfo}>
                            <span className={styles.versionNumber}>{version.app_version}</span>
                            <span className={styles.versionDate}>
                              {new Date(version.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {exportConfig.targetVersion && (
                  <div className={styles.formGroup}>
                    <label>Platform</label>
                    <div className={styles.platformGrid}>
                      <button
                        className={`${styles.platformButton} ${exportConfig.platform === 'android' ? styles.selected : ''}`}
                        onClick={() => setExportConfig({...exportConfig, platform: 'android'})}
                      >
                        <div className={styles.platformIcon}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                            <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-2.86-1.21-6.08-1.21-8.94 0L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48C3.3 11.25 1.28 14.44 1 18h22c-.28-3.56-2.3-6.75-5.4-8.52zM7 15.25c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25z"/>
                          </svg>
                        </div>
                        <div className={styles.platformInfo}>
                          <span className={styles.platformName}>Android</span>
                        </div>
                      </button>
                      <button
                        className={`${styles.platformButton} ${exportConfig.platform === 'ios' ? styles.selected : ''}`}
                        onClick={() => setExportConfig({...exportConfig, platform: 'ios'})}
                      >
                        <div className={styles.platformIcon}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                          </svg>
                        </div>
                        <div className={styles.platformInfo}>
                          <span className={styles.platformName}>iOS</span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label>Device Name</label>
                  <input
                    type="text"
                    value={exportConfig.deviceName}
                    onChange={(e) => setExportConfig({...exportConfig, deviceName: e.target.value})}
                    placeholder="Enter device name"
                    className={styles.deviceInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Select Journeys to Export</label>
                  <div className={styles.journeyGrid}>
                    <button
                      className={`${styles.journeyButton} ${exportConfig.selectedJourneys.includes('signup') ? styles.selected : ''}`}
                      onClick={() => {
                        const journeys = exportConfig.selectedJourneys.includes('signup')
                          ? exportConfig.selectedJourneys.filter(j => j !== 'signup')
                          : [...exportConfig.selectedJourneys, 'signup'];
                        setExportConfig({...exportConfig, selectedJourneys: journeys});
                      }}
                    >
                      <div className={styles.journeyIcon}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                          <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0-6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm0 8c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm-6 4c.22-.72 3.31-2 6-2 2.7 0 5.8 1.29 6 2H9zm-3-3v-3h3v-2H6V7H4v3H1v2h3v3z"/>
                        </svg>
                      </div>
                      <span>Sign Up Journey</span>
                    </button>
                    <button
                      className={`${styles.journeyButton} ${exportConfig.selectedJourneys.includes('checkout') ? styles.selected : ''}`}
                      onClick={() => {
                        const journeys = exportConfig.selectedJourneys.includes('checkout')
                          ? exportConfig.selectedJourneys.filter(j => j !== 'checkout')
                          : [...exportConfig.selectedJourneys, 'checkout'];
                        setExportConfig({...exportConfig, selectedJourneys: journeys});
                      }}
                    >
                      <div className={styles.journeyIcon}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                          <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/>
                        </svg>
                      </div>
                      <span>Checkout Journey</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.formActions}>
                <button 
                  className={styles.exportButton}
                  onClick={handleExport}
                  disabled={!exportConfig.targetApp || !exportConfig.targetVersion || !exportConfig.platform || !exportConfig.deviceName || exportConfig.selectedJourneys.length === 0}
                >
                  Export Data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
} 