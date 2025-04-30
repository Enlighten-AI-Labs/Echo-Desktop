import React, { forwardRef } from 'react';
import styles from '@/styles/components/unified-analytics-debugger.module.css';

const ScreenshotPanel = forwardRef(({
  selectedEvent,
  selectedScreenshot,
  screenshotStatus,
  handleRetakeScreenshot,
  handleDeleteScreenshot,
  rightPanelWidth
}, ref) => {
  return (
    <div ref={ref} className={styles.screenshotPanel} style={{ flex: `0 0 ${rightPanelWidth}px` }}>
      <div className={styles.screenshotControls}>
        <button 
          className={styles.retakeButton}
          onClick={handleRetakeScreenshot}
          disabled={!selectedEvent || screenshotStatus === 'capturing'}
        >
          {screenshotStatus === 'capturing' ? 'Capturing...' : 'Retake Screenshot'}
        </button>
        <button 
          className={styles.deleteButton}
          onClick={handleDeleteScreenshot}
          disabled={!selectedEvent || !selectedScreenshot}
        >
          Delete Screenshot
        </button>
      </div>
      
      <div className={styles.screenshotContainer}>
        {selectedScreenshot ? (
          <>
            {selectedScreenshot.dataUrl ? (
              <div className={styles.screenshotWrapper}>
                <div className={styles.statusBarIcons}></div>
                <img 
                  src={selectedScreenshot.dataUrl} 
                  alt="Event Screenshot"
                  className={styles.screenshot}
                />
              </div>
            ) : (
              <div className={styles.loading}>Loading screenshot...</div>
            )}
          </>
        ) : (
          <div className={styles.noScreenshot}>
            <p>No screenshot available</p>
            <p>Select an event to view or capture a screenshot</p>
          </div>
        )}
      </div>
    </div>
  );
});

ScreenshotPanel.displayName = 'ScreenshotPanel';

export default ScreenshotPanel; 