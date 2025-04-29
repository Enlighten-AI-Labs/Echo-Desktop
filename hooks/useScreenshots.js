import { useState } from 'react';

export default function useScreenshots() {
  const [screenshots, setScreenshots] = useState({});
  const [screenshotStatus, setScreenshotStatus] = useState('idle');
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);

  // Function to capture screenshot
  const captureScreenshot = async (eventId) => {
    if (!eventId || screenshots[eventId]) return;

    try {
      setScreenshotStatus('capturing');
      const result = await window.api.rtmp.captureScreenshot(eventId);
      
      if (result.success) {
        setScreenshots(prev => ({
          ...prev,
          [eventId]: {
            fileName: result.fileName,
            timestamp: new Date(result.timestamp).toISOString(),
            width: result.dimensions?.width || 720,
            height: result.dimensions?.height || null,
            dataUrl: null
          }
        }));
      }
      
      setScreenshotStatus('idle');
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      setScreenshotStatus('error');
    }
  };

  // Function to load screenshot data
  const loadScreenshotData = async (eventId) => {
    if (!screenshots[eventId] || screenshots[eventId].dataUrl) return;
    
    try {
      setScreenshotStatus('loading');
      const result = await window.api.rtmp.getScreenshotDataUrl(screenshots[eventId].fileName);
      
      if (result.success) {
        setScreenshots(prev => ({
          ...prev,
          [eventId]: {
            ...prev[eventId],
            dataUrl: result.dataUrl,
            width: result.dimensions?.width || prev[eventId].width || 720,
            height: result.dimensions?.height || prev[eventId].height || null
          }
        }));
      }
      
      setScreenshotStatus('idle');
    } catch (error) {
      console.error('Error loading screenshot data:', error);
      setScreenshotStatus('error');
    }
  };

  // Function to handle retaking screenshot
  const handleRetakeScreenshot = async (eventId) => {
    if (!eventId) return;
    
    try {
      setScreenshots(prev => {
        const newScreenshots = { ...prev };
        delete newScreenshots[eventId];
        return newScreenshots;
      });
      
      setScreenshotStatus('capturing');
      await captureScreenshot(eventId);
      
      setTimeout(async () => {
        await loadScreenshotData(eventId);
        setSelectedScreenshot(screenshots[eventId]);
      }, 500);
    } catch (error) {
      console.error('Error retaking screenshot:', error);
      setScreenshotStatus('error');
    }
  };

  // Function to handle deleting screenshot
  const handleDeleteScreenshot = (eventId) => {
    if (!eventId) return;
    
    setScreenshots(prev => {
      const newScreenshots = { ...prev };
      delete newScreenshots[eventId];
      return newScreenshots;
    });
    
    setSelectedScreenshot(null);
  };

  return {
    screenshots,
    screenshotStatus,
    selectedScreenshot,
    setSelectedScreenshot,
    captureScreenshot,
    loadScreenshotData,
    handleRetakeScreenshot,
    handleDeleteScreenshot,
    setScreenshots
  };
}; 