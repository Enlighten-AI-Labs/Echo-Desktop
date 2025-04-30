import React, { useState, useEffect, useRef } from 'react';
import styles from '@/styles/components/unified-analytics-debugger.module.css';

export default function AnalyticsToolbar({
  events,
  isCapturingLogcat,
  deviceId,
  packageName,
  handleToggleLogcat,
  handleClearEvents,
  handleAddJourney,
  filterControls,
  exportEvents,
  importEvents
}) {
  const {
    filterText,
    setFilterText,
    filterType,
    setFilterType,
    sourceFilter,
    setSourceFilter,
    analyticsType,
    setAnalyticsType,
    autoRefresh,
    setAutoRefresh
  } = filterControls;

  const [ribbonExpanded, setRibbonExpanded] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const searchContainerRef = useRef(null);

  // Close filters dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setFiltersExpanded(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className={styles.toolbarContainer}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <button
            className={styles.clearButton}
            onClick={handleClearEvents}
            disabled={events.length === 0}
          >
            Clear Events
          </button>
          
          <div className={styles.searchContainer} ref={searchContainerRef}>
            <div className={styles.filterContainer}>
              <input
                type="text"
                className={styles.filterInput}
                placeholder="Filter events..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                onClick={() => setFiltersExpanded(!filtersExpanded)}
              />
              <button 
                className={styles.filterButton}
                onClick={() => setFiltersExpanded(!filtersExpanded)}
                aria-expanded={filtersExpanded}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 6H20M8 12H16M11 18H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            
            {/* Filters Dropdown */}
            <div className={`${styles.filtersDropdown} ${filtersExpanded ? styles.expanded : styles.collapsed}`}>
              <div className={styles.filterRow}>
                <label>Filter Type:</label>
                <select
                  className={styles.filterTypeSelect}
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <option value="all">All</option>
                  <option value="beaconId">Beacon ID</option>
                  <option value="eventName">Event Name</option>
                  <option value="screen">Screen</option>
                </select>
              </div>
              
              <div className={styles.filterRow}>
                <label>Source:</label>
                <select
                  className={styles.sourceSelect}
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                >
                  <option value="all">All Sources</option>
                  <option value="logcat">Android Debug Bridge</option>
                  <option value="proxy">Network</option>
                </select>
              </div>
              
              <div className={styles.filterRow}>
                <label>Analytics Type:</label>
                <select 
                  value={analyticsType}
                  onChange={(e) => setAnalyticsType(e.target.value)}
                  className={styles.typeSelect}
                >
                  <option value="all">All Analytics</option>
                  <option value="google">Google Analytics</option>
                  <option value="adobe">Adobe Analytics</option>
                </select>
              </div>
            </div>
          </div>
          
          <button 
            className={styles.addJourneyButton}
            onClick={handleAddJourney}
          >
            <span> Journeys </span>
          </button>
        </div>

        <div className={styles.toolbarRight}>
          <button 
            className={styles.toggleRibbonButton}
            onClick={() => setRibbonExpanded(!ribbonExpanded)}
            aria-expanded={ribbonExpanded}
          >
            Show Tools
            <span className={styles.toggleIcon}>▼</span>
          </button>
        </div>
      </div>

      {/* Expandable Ribbon */}
      <div className={`${styles.ribbon} ${ribbonExpanded ? styles.expanded : styles.collapsed}`}>
        <button
          className={`${styles.captureButton} ${isCapturingLogcat ? styles.stopButton : styles.startButton}`}
          onClick={handleToggleLogcat}
          disabled={!deviceId || !packageName}
        >
          {isCapturingLogcat ? 'Stop Logcat' : 'Start Logcat'}
        </button>
        <button 
          className={styles.exportButton}
          onClick={exportEvents}
          disabled={events.length === 0}
        >
          Export Events
        </button>
        <button 
          className={styles.importButton}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
              const file = e.target.files[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                  const result = importEvents(event.target.result);
                  if (!result.success) {
                    alert(`Import failed: ${result.error}`);
                  }
                };
                reader.readAsText(file);
              }
            };
            input.click();
          }}
        >
          Import Events
        </button>
        <label className={styles.autoRefreshLabel}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto Refresh
        </label>
      </div>
    </div>
  );
} 