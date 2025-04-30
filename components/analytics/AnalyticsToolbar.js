import React from 'react';
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

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarLeft}>
        <button
          className={`${styles.captureButton} ${isCapturingLogcat ? styles.stopButton : styles.startButton}`}
          onClick={handleToggleLogcat}
          disabled={!deviceId || !packageName}
        >
          {isCapturingLogcat ? 'Stop Logcat' : 'Start Logcat'}
        </button>
        <button
          className={styles.clearButton}
          onClick={handleClearEvents}
          disabled={events.length === 0}
        >
          Clear Events
        </button>
        <div className={styles.filterContainer}>
          <input
            type="text"
            className={styles.filterInput}
            placeholder="Filter events..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
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
        <select
          className={styles.sourceSelect}
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
        >
          <option value="all">All Sources</option>
          <option value="logcat">Android Debug Bridge</option>
          <option value="proxy">Network</option>
        </select>
        <button 
          className={styles.addJourneyButton}
          onClick={handleAddJourney}
        >
          <span>+ Add Journey</span>
        </button>
      </div>

      <div className={styles.toolbarRight}>
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
        <select 
          value={analyticsType}
          onChange={(e) => setAnalyticsType(e.target.value)}
          className={styles.typeSelect}
        >
          <option value="all">All Analytics</option>
          <option value="google">Google Analytics</option>
          <option value="adobe">Adobe Analytics</option>
        </select>

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