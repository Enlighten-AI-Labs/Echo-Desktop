import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { supabase } from '@/lib/supabase';
import styles from '@/styles/Export.module.css';
import { v4 as uuidv4 } from 'uuid';
import { parseLogcatParameters, extractItems } from '@/lib/analytics-utils';

export default function ExportPage() {
  const router = useRouter();
  const [apps, setApps] = useState([]);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateVersion, setShowCreateVersion] = useState(false);
  const [newVersion, setNewVersion] = useState('');
  const [journeys, setJourneys] = useState([]);
  const [exportConfig, setExportConfig] = useState({
    targetApp: '',
    targetVersion: '',
    platform: '',
    deviceName: '',
    selectedJourneys: []
  });
  const [previewData, setPreviewData] = useState(null);
  const [events, setEvents] = useState([]);

  // Load journeys and events from localStorage
  useEffect(() => {
    const savedJourneys = localStorage.getItem('analyticsJourneys');
    const savedEvents = localStorage.getItem('analyticsEvents');
    if (savedJourneys) {
      setJourneys(JSON.parse(savedJourneys));
    }
    if (savedEvents) {
      setEvents(JSON.parse(savedEvents));
    }

    // Add event listener for storage changes
    const handleStorageChange = (e) => {
      if (e.key === 'analyticsEvents') {
        setEvents(JSON.parse(e.newValue));
      }
      if (e.key === 'analyticsJourneys') {
        setJourneys(JSON.parse(e.newValue));
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

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

  // Update preview data when events or selected journeys change
  useEffect(() => {
    if (exportConfig.selectedJourneys.length > 0 && events.length > 0) {
      generatePreviewData();
    } else {
      setPreviewData(null);
    }
  }, [exportConfig.selectedJourneys, events]);

  const generatePreviewData = () => {
    // Get all events from selected journeys
    const selectedEvents = events.filter(event => 
      event.journeys?.some(journey => exportConfig.selectedJourneys.includes(journey.id))
    );

    // Transform events to match the sample format
    const transformedEvents = selectedEvents.map(event => {
      const params = event.source === 'logcat' 
        ? parseLogcatParameters(event.message) 
        : event.parameters;

      const items = extractItems(params);

      const baseEvent = {
        id: uuidv4().toUpperCase(),
        timestamp: event.timestamp,
        event_name: event.eventName || event.type || 'Unknown Event',
        parameters: {
          screen: params?.ga_screen || params?.screen_name || params?.pageName || 'Unknown Screen',
          beacon_id: event.beaconId,
          page_type: params?.page_type || 'Unknown',
          screen_id: params?.screen_id || uuidv4(),
          event_origin: 'app',
          screen_class: params?.ga_screen_class || params?.screen_class || 'Unknown',
          ...params
        },
        screenshot_url: event.screenshot?.dataUrl || null
      };

      // Add ecommerce items if they exist
      if (items.length > 0) {
        baseEvent.ecommerce_items = items.map(item => ({
          name: item.item_name || item.product_name,
          brand: item.brand || 'UNKNOWN',
          index: item.index || 0,
          price: parseFloat(item.price || item.product_price) || 0,
          item_id: item.item_id || item.product_id,
          list_id: item.list_id || '0',
          variant: item.variant || 'default',
          category: item.category || 'Unknown',
          currency: item.currency || 'USD',
          quantity: parseInt(item.quantity) || 1
        }));
      }

      // Add custom dimensions if they exist
      const customDimensions = Object.entries(params || {})
        .filter(([key]) => !key.startsWith('ga_') && !key.startsWith('firebase_'))
        .map(([key, value]) => ({
          key,
          value: String(value)
        }));

      if (customDimensions.length > 0) {
        baseEvent.custom_dimensions = customDimensions;
      }

      // Add bundle properties if they exist
      if (params?.bundle_properties) {
        baseEvent.bundle_properties = params.bundle_properties.map(prop => ({
          key: prop.key,
          value: String(prop.value)
        }));
      }

      return baseEvent;
    });

    setPreviewData(transformedEvents);
  };

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
      if (!previewData) {
        alert('Please select at least one journey to export');
        return;
      }

      // Create a new crawl in Supabase
      const { data: crawl, error: crawlError } = await supabase
        .from('Crawls')
        .insert([{
          app_id: exportConfig.targetApp,
          version_id: exportConfig.targetVersion,
          expected_json: previewData,
          actual_json: previewData,
          device_os_version: exportConfig.platform === 'ios' ? 'iOS' : 'Android',
          device_model: exportConfig.deviceName,
        }])
        .select()
        .single();

      if (crawlError) {
        throw new Error(`Failed to create crawl: ${crawlError.message}`);
      }

      // Create a Blob with the JSON data
      const blob = new Blob([JSON.stringify(previewData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // Create a temporary link and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = `analytics_export_${new Date().toISOString()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Show success message
      alert('Export successful! Crawl created.');
    } catch (error) {
      console.error('Error exporting:', error);
      alert('Error exporting data: ' + error.message);
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
                    {journeys.map(journey => (
                      <button
                        key={journey.id}
                        className={`${styles.journeyButton} ${exportConfig.selectedJourneys.includes(journey.id) ? styles.selected : ''}`}
                        onClick={() => {
                          const updatedJourneys = exportConfig.selectedJourneys.includes(journey.id)
                            ? exportConfig.selectedJourneys.filter(j => j !== journey.id)
                            : [...exportConfig.selectedJourneys, journey.id];
                          setExportConfig({...exportConfig, selectedJourneys: updatedJourneys});
                        }}
                      >
                        <div className={styles.journeyIcon}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                            <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
                          </svg>
                        </div>
                        <div className={styles.journeyInfo}>
                          <span className={styles.journeyName}>{journey.name}</span>
                          <span className={styles.journeyEventCount}>{journey.events.length} events</span>
                        </div>
                      </button>
                    ))}
                    {journeys.length === 0 && (
                      <div className={styles.noJourneys}>
                        No journeys available. Create journeys in the Analytics Debugger.
                      </div>
                    )}
                  </div>
                </div>

                {previewData && (
                  <div className={styles.formGroup}>
                    <label>Preview</label>
                    <div className={styles.previewContainer}>
                      <pre className={styles.preview}>
                        {JSON.stringify(previewData, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
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