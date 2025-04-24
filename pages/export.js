import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { supabase } from '@/lib/supabase';
import styles from '@/styles/Export.module.css';
import { v4 as uuidv4 } from 'uuid';
import { parseLogcatParameters, extractItems } from '@/lib/analytics-utils';
import storage from '../lib/storage';

const JsonPreview = ({ data }) => {
  const initializeExpandedSections = (obj, path = 'root') => {
    let sections = { [path]: true };
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          sections = { ...sections, ...initializeExpandedSections(item, `${path}.${index}`) };
        }
      });
    } else if (typeof obj === 'object' && obj !== null) {
      Object.entries(obj).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          sections = { ...sections, ...initializeExpandedSections(value, `${path}.${key}`) };
        }
      });
    }
    return sections;
  };

  const [expandedSections, setExpandedSections] = useState(() => initializeExpandedSections(data));

  const renderValue = (value, key, path = '', isLast = false) => {
    const renderComma = !isLast && <span className={styles.jsonComma}>,</span>;

    if (value === null) return <>{<span className={styles.jsonNull}>null</span>}{renderComma}</>;
    if (typeof value === 'boolean') return <>{<span className={styles.jsonBoolean}>{value.toString()}</span>}{renderComma}</>;
    if (typeof value === 'number') return <>{<span className={styles.jsonNumber}>{value}</span>}{renderComma}</>;
    if (typeof value === 'string') return <>{<span className={styles.jsonString}>"{value}"</span>}{renderComma}</>;
    
    if (Array.isArray(value)) {
      if (value.length === 0) return <>{<span className={styles.jsonArray}>[]</span>}{renderComma}</>;
      const currentPath = `${path}.${key}`;
      const isExpanded = expandedSections[currentPath];
      
      return (
        <div className={styles.jsonArrayContainer}>
          <div className={styles.jsonLine}>
            <span 
              className={styles.jsonToggle}
              onClick={() => setExpandedSections(prev => ({...prev, [currentPath]: !prev[currentPath]}))}
            >
              {isExpanded ? '▼' : '▶'}
            </span>
            <span className={styles.jsonBracket}>[</span>
            {!isExpanded && (
              <>
                <span className={styles.jsonCollapsed}>{value.length} items</span>
                <span className={styles.jsonBracket}>]</span>
                {renderComma}
              </>
            )}
          </div>
          {isExpanded && (
            <>
              <div className={styles.jsonArrayItems}>
                {value.map((item, index) => (
                  <div key={index} className={styles.jsonArrayItem}>
                    {renderValue(item, index, currentPath, index === value.length - 1)}
                  </div>
                ))}
              </div>
              <div className={styles.jsonLine}>
                <span className={styles.jsonBracket}>]</span>{renderComma}
              </div>
            </>
          )}
        </div>
      );
    }
    
    if (typeof value === 'object') {
      const currentPath = `${path}.${key}`;
      const isExpanded = expandedSections[currentPath];
      const entries = Object.entries(value);
      
      return (
        <div className={styles.jsonObjectContainer}>
          <div className={styles.jsonLine}>
            <span 
              className={styles.jsonToggle}
              onClick={() => setExpandedSections(prev => ({...prev, [currentPath]: !prev[currentPath]}))}
            >
              {isExpanded ? '▼' : '▶'}
            </span>
            <span className={styles.jsonBracket}>{'{'}</span>
            {!isExpanded && (
              <>
                <span className={styles.jsonCollapsed}>
                  {entries.length} properties
                </span>
                <span className={styles.jsonBracket}>{'}'}</span>
                {renderComma}
              </>
            )}
          </div>
          {isExpanded && (
            <>
              <div className={styles.jsonObjectProperties}>
                {entries.map(([k, v], index) => (
                  <div key={k} className={styles.jsonProperty}>
                    <span className={styles.jsonKey}>{k}</span>
                    <span className={styles.jsonColon}>:</span>
                    {renderValue(v, k, currentPath, index === entries.length - 1)}
                  </div>
                ))}
              </div>
              <div className={styles.jsonLine}>
                <span className={styles.jsonBracket}>{'}'}</span>{renderComma}
              </div>
            </>
          )}
        </div>
      );
    }
    
    return String(value);
  };

  return (
    <div className={styles.jsonViewer}>
      {renderValue(data, 'root')}
    </div>
  );
};

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
  const [screenshots, setScreenshots] = useState({});

  useEffect(() => {
    // Load journeys and events from localStorage
    const savedJourneys = storage.getItem('analyticsJourneys');
    const savedEvents = storage.getItem('analyticsEvents');
    
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

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
      return () => window.removeEventListener('storage', handleStorageChange);
    }
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

  // Add this effect to handle platform changes
  useEffect(() => {
    if (exportConfig.platform && exportConfig.targetVersion) {
      // Find the current version group
      const currentVersion = versions.find(v => v.ids.includes(exportConfig.targetVersion));
      if (currentVersion) {
        // Find the version ID for the selected platform
        const platformIndex = currentVersion.platforms.findIndex(p => 
          p.toLowerCase() === exportConfig.platform.toLowerCase()
        );
        if (platformIndex !== -1) {
          // Update to the correct version ID for this platform
          setExportConfig(prev => ({
            ...prev,
            targetVersion: currentVersion.ids[platformIndex]
          }));
        }
      }
    }
  }, [exportConfig.platform]);

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

      // Get journey names for this event
      const journeyNames = journeys
        .filter(journey => exportConfig.selectedJourneys.includes(journey.id))
        .filter(journey => event.journeys?.some(ej => ej.id === journey.id))
        .map(journey => journey.name);

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
        journeys: journeyNames,
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

      // Group versions by app_version
      const groupedVersions = data.reduce((acc, version) => {
        const existingVersion = acc.find(v => v.app_version === version.app_version);
        if (existingVersion) {
          existingVersion.platforms = existingVersion.platforms || [];
          existingVersion.platforms.push(version.platform || 'unknown');
          existingVersion.ids = existingVersion.ids || [existingVersion.id];
          existingVersion.ids.push(version.id);
        } else {
          acc.push({
            ...version,
            platforms: [version.platform || 'unknown'],
            ids: [version.id]
          });
        }
        return acc;
      }, []);

      setVersions(groupedVersions || []);
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

      // Upload screenshots for each event that has one
      const screenshotUploads = previewData.map(async (event) => {
        if (event.screenshot_url && screenshots[event.id]?.dataUrl) {
          try {
            // Convert base64 data URL to blob
            const response = await fetch(screenshots[event.id].dataUrl);
            const blob = await response.blob();

            // Upload to Supabase storage
            const { error: uploadError } = await supabase.storage
              .from('crawl-data')
              .upload(`${crawl.id}/${event.id}.png`, blob, {
                contentType: 'image/png',
                cacheControl: '3600',
                upsert: true
              });

            if (uploadError) {
              console.error(`Error uploading screenshot for event ${event.id}:`, uploadError);
            }
          } catch (error) {
            console.error(`Error processing screenshot for event ${event.id}:`, error);
          }
        }
      });

      // Wait for all screenshot uploads to complete
      await Promise.all(screenshotUploads);

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
      alert('Export successful! Crawl created and screenshots uploaded.');
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
          app_version: newVersion.trim(),
          platform: exportConfig.platform
        }])
        .select()
        .single();

      if (error) throw error;

      // Add the new version to the list and select it
      await fetchVersions(exportConfig.targetApp);
      setExportConfig(prev => ({ ...prev, targetVersion: data.id }));
      setShowCreateVersion(false);
      setNewVersion('');
    } catch (error) {
      console.error('Error creating version:', error);
      alert('Failed to create version: ' + error.message);
    }
  };

  // Update the platform button click handler
  const handlePlatformSelect = async (platform) => {
    // Find the current version group if one is selected
    const currentVersion = exportConfig.targetVersion ? 
      versions.find(v => v.ids.includes(exportConfig.targetVersion)) : null;

    if (currentVersion) {
      // Find the version ID for the selected platform
      const platformIndex = currentVersion.platforms.findIndex(p => 
        p.toLowerCase() === platform.toLowerCase()
      );
      
      if (platformIndex !== -1) {
        // Platform exists for this version, use its ID
        setExportConfig(prev => ({
          ...prev,
          platform,
          targetVersion: currentVersion.ids[platformIndex]
        }));
      } else {
        // Platform doesn't exist for this version, create it
        try {
          const { data, error } = await supabase
            .from('Versions')
            .insert([{
              app_id: exportConfig.targetApp,
              app_version: currentVersion.app_version,
              platform: platform
            }])
            .select()
            .single();

          if (error) throw error;

          // Refresh versions list
          await fetchVersions(exportConfig.targetApp);

          // Update export config with new version
          setExportConfig(prev => ({
            ...prev,
            platform,
            targetVersion: data.id
          }));
        } catch (error) {
          console.error('Error creating version:', error);
          alert('Failed to create version for platform: ' + error.message);
        }
      }
    } else {
      // No version selected, just update platform
      setExportConfig(prev => ({
        ...prev,
        platform
      }));
    }
  };

  // Update the version button click handler
  const handleVersionSelect = (version) => {
    const platformIndex = exportConfig.platform ? 
      version.platforms.findIndex(p => p.toLowerCase() === exportConfig.platform.toLowerCase()) : 0;
    
    setExportConfig(prev => ({
      ...prev,
      targetVersion: version.ids[platformIndex !== -1 ? platformIndex : 0]
    }));
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
                          key={version.app_version}
                          className={`${styles.versionButton} ${version.ids.includes(exportConfig.targetVersion) ? styles.selected : ''}`}
                          onClick={() => handleVersionSelect(version)}
                          disabled={exportConfig.platform && !version.platforms.some(p => 
                            p.toLowerCase() === exportConfig.platform.toLowerCase()
                          )}
                        >
                          <div className={styles.versionInfo}>
                            <span className={styles.versionNumber}>{version.app_version}</span>
                            <div className={styles.versionPlatforms}>
                              {version.platforms.map((platform, index) => (
                                <div 
                                  key={index} 
                                  className={`${styles.platformIcon} ${exportConfig.platform && platform.toLowerCase() === exportConfig.platform.toLowerCase() ? styles.activePlatform : ''}`} 
                                  title={platform}
                                >
                                  {platform.toLowerCase() === 'android' ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                      <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-2.86-1.21-6.08-1.21-8.94 0L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48C3.3 11.25 1.28 14.44 1 18h22c-.28-3.56-2.3-6.75-5.4-8.52zM7 15.25c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25z"/>
                                    </svg>
                                  ) : platform.toLowerCase() === 'ios' ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                      <path d="M17.0748 11.9146c-.0018-1.613.7424-3.0892 1.9365-4.0345-1.0096-1.3956-2.6084-2.2066-4.2984-2.1532-1.7339-.1703-3.3888 1.0347-4.2637 1.0347-.8969 0-2.2458-1.016-3.7053-1.0003-1.8851.03-3.6412 1.1065-4.5986 2.8124-1.9855 3.4368-.5065 8.4962 1.4022 11.2669.9533 1.3576 2.0753 2.8693 3.5406 2.8167 1.437-.0593 1.9685-.9106 3.7052-.9106 1.7172 0 2.2268.9106 3.7225.8793 1.5414-.0243 2.5157-1.3771 3.4445-2.7413.6681-.9626 1.1759-2.0425 1.4976-3.1814-1.6936-.7015-2.7889-2.3726-2.7831-4.2175zM14.4365 5.7815c.8303-1.0452 1.1553-2.3956.9-3.7226-1.2436.0895-2.3858.6866-3.1897 1.6663-.7854.9668-1.1657 2.1961-1.0554 3.4445 1.2791.016 2.4945-.6108 3.3451-1.3882z"></path>
                                    </svg>
                                  ) : platform.toLowerCase() === 'web' ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                      <path d="M16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2m-5.15 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56M14.34 14H9.66c-.1-.66-.16-1.32-.16-2 0-.68.06-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2M12 19.96c-.83-1.2-1.5-2.53-1.91-3.96h3.82c-.41 1.43-1.08 2.76-1.91 3.96M8 8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8 8M5.08 16H8c.35 1.25.81 2.45 1.41 3.56-1.84-.63-3.37-1.9-4.33-3.56M4.26 14c-.16-.64-.26-1.31-.26-2s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2M12 4.03c.83 1.2 1.5 2.54 1.91 3.97h-3.82c.41-1.43 1.08-2.77 1.91-3.97M18.92 8h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56M12 2C6.47 2 2 6.5 2 12s4.47 10 10 10 10-4.5 10-10S17.53 2 12 2"></path>
                                    </svg>
                                  ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                                    </svg>
                                  )}
                                </div>
                              ))}
                            </div>
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
                        onClick={() => handlePlatformSelect('android')}
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
                        onClick={() => handlePlatformSelect('iOS')}
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
                      <button
                        className={`${styles.platformButton} ${exportConfig.platform === 'web' ? styles.selected : ''}`}
                        onClick={() => handlePlatformSelect('web')}
                      >
                        <div className={styles.platformIcon}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                            <path d="M16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2m-5.15 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56M14.34 14H9.66c-.1-.66-.16-1.32-.16-2 0-.68.06-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2M12 19.96c-.83-1.2-1.5-2.53-1.91-3.96h3.82c-.41 1.43-1.08 2.76-1.91 3.96M8 8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8 8M5.08 16H8c.35 1.25.81 2.45 1.41 3.56-1.84-.63-3.37-1.9-4.33-3.56M4.26 14c-.16-.64-.26-1.31-.26-2s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2M12 4.03c.83 1.2 1.5 2.54 1.91 3.97h-3.82c.41-1.43 1.08-2.77 1.91-3.97M18.92 8h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56M12 2C6.47 2 2 6.5 2 12s4.47 10 10 10 10-4.5 10-10S17.53 2 12 2"></path>
                          </svg>
                        </div>
                        <div className={styles.platformInfo}>
                          <span className={styles.platformName}>Web</span>
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
                      <JsonPreview data={previewData} />
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