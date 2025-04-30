import { useState, useRef, useEffect, useCallback } from 'react';
import { generateBeaconId, generateEventId } from '@/lib/beacon-utils';
import { parseAdobeAnalyticsBeacon } from '@/lib/adobe-analytics-parser';
import { parseGA4Beacon, cleanEventName, parseLogcatParameters } from '@/lib/ga4-analytics-parser';

export default function useEventCapture({ 
  deviceId, 
  packageName, 
  events, 
  clearEvents, 
  addOrUpdateEvents, 
  captureScreenshot 
}) {
  const [isCapturingLogcat, setIsCapturingLogcat] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Use refs for callback functions to avoid dependency cycles
  const captureScreenshotRef = useRef(captureScreenshot);
  const addOrUpdateEventsRef = useRef(addOrUpdateEvents);
  const clearEventsRef = useRef(clearEvents);
  const processedEventIds = useRef(new Set());
  // Add a timestamp map to track when events were processed
  const eventTimestamps = useRef(new Map());
  // Add a cleanup interval reference
  const cleanupIntervalRef = useRef(null);

  // Update refs when props change
  useEffect(() => {
    captureScreenshotRef.current = captureScreenshot;
    addOrUpdateEventsRef.current = addOrUpdateEvents;
    clearEventsRef.current = clearEvents;
  }, [captureScreenshot, addOrUpdateEvents, clearEvents]);

  // Add a useEffect for cleaning up old events from the processed set
  useEffect(() => {
    // Function to clean up old event IDs (older than 1 hour)
    const cleanupOldEvents = () => {
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);
      
      eventTimestamps.current.forEach((timestamp, eventId) => {
        if (timestamp < oneHourAgo) {
          processedEventIds.current.delete(eventId);
          eventTimestamps.current.delete(eventId);
        }
      });
    };
    
    // Set up a cleanup interval (every 5 minutes)
    cleanupIntervalRef.current = setInterval(cleanupOldEvents, 5 * 60 * 1000);
    
    // Clean up on unmount
    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, []);
  
  // Create a stable fetchData function with useCallback
  const fetchData = useCallback(async () => {
    try {
      // Get logcat status and data if running
      let isRunning = false;
      try {
        isRunning = await window.api.adb.isLogcatRunning();
      } catch (error) {
        console.error('Error checking logcat status:', error);
      }
      
      setIsCapturingLogcat(isRunning);
      
      let newEvents = [];
      
      // Try to get logcat events
      if (isRunning) {
        try {
          const logcatLogs = await window.api.adb.getAnalyticsLogs();

          if (Array.isArray(logcatLogs)) {
            const parsedLogcatEvents = logcatLogs
              .filter(log => log.message?.includes('Logging event:') || log.message?.includes('FirebaseAnalytics'))
              .map(log => {
                const event = {
                  ...log,
                  source: 'logcat',
                  timestamp: log.timestamp || new Date().toISOString()
                };

                // Parse event name and parameters for Firebase/GA4 events
                if (log.message?.includes('Logging event:')) {
                  const nameMatch = log.message.match(/name=([^,]+)/);
                  if (nameMatch) {
                    event.eventName = cleanEventName(nameMatch[1]);
                  }
                  event.parameters = parseLogcatParameters(log.message);
                }
                // Parse Adobe Analytics events
                else if (log.message?.includes('/b/ss/')) {
                  const adobeParams = parseAdobeAnalyticsBeacon(log.message);
                  event.parameters = adobeParams;
                  event.pageName = adobeParams.pageName;
                  event.events = adobeParams.events;
                  event.analyticsType = 'adobe';
                }

                // Generate consistent ID first
                event.id = generateEventId(event);
                
                // Skip further processing if we've already seen this event
                if (processedEventIds.current.has(event.id)) {
                  return null;
                }
                
                // Only generate beaconId if it doesn't already exist
                if (!event.beaconId) {
                  event.beaconId = generateBeaconId(event);
                }
                
                return event;
              })
              .filter(Boolean); // Filter out null events (already processed)

            // Process new logcat events and track when they were processed
            parsedLogcatEvents.forEach(event => {
              if (!processedEventIds.current.has(event.id)) {
                processedEventIds.current.add(event.id);
                // Track when this event was processed
                eventTimestamps.current.set(event.id, Date.now());
                // Use the ref instead of the prop directly
                captureScreenshotRef.current(event.id);
              }
            });
            
            newEvents = [...newEvents, ...parsedLogcatEvents];
          }
        } catch (error) {
          console.error('Error fetching logcat events:', error);
        }
      }

      // Try to get proxy data
      try {
        const proxyTraffic = await window.api.mitmproxy.getTraffic();

        const analyticsBeacons = proxyTraffic
          .filter(entry => 
            entry.type === 'request' && 
            entry.fullUrl && (
              entry.fullUrl.includes('/b/ss/') || // Adobe Analytics
              entry.fullUrl.includes('/collect') || // GA4
              entry.fullUrl.includes('/g/collect') // GA4 alternative endpoint
            )
          )
          .map(entry => {
            let parsedBeacon = null;
            if (entry.fullUrl.includes('/b/ss/')) {
              parsedBeacon = { 
                ...parseAdobeAnalyticsBeacon(entry.fullUrl),
                source: 'proxy',
                analyticsType: 'adobe',
                timestamp: entry.timestamp || new Date().toISOString(),
                rawRequest: entry.fullUrl
              };
            } else if (entry.fullUrl.includes('/collect') || entry.fullUrl.includes('/g/collect')) {
              const url = new URL(entry.fullUrl);
              parsedBeacon = { 
                ...parseGA4Beacon(entry.fullUrl, url.search),
                source: 'proxy',
                analyticsType: 'ga4',
                timestamp: entry.timestamp || new Date().toISOString(),
                rawRequest: entry.fullUrl
              };
            }
            
            if (parsedBeacon) {
              // Generate consistent ID first
              parsedBeacon.id = generateEventId(parsedBeacon);
              
              // Skip further processing if we've already seen this beacon
              if (processedEventIds.current.has(parsedBeacon.id)) {
                return null;
              }
              
              // Only generate beaconId if it doesn't already exist
              if (!parsedBeacon.beaconId) {
                parsedBeacon.beaconId = generateBeaconId(parsedBeacon);
              }
              return parsedBeacon;
            }
            
            return null;
          })
          .filter(Boolean); // Filter out null beacons (already processed)

        // Process new proxy events and track when they were processed
        analyticsBeacons.forEach(beacon => {
          if (!processedEventIds.current.has(beacon.id)) {
            processedEventIds.current.add(beacon.id);
            // Track when this event was processed
            eventTimestamps.current.set(beacon.id, Date.now());
            // Use the ref instead of the prop directly
            captureScreenshotRef.current(beacon.id);
          }
        });

        newEvents = [...newEvents, ...analyticsBeacons];
      } catch (error) {
        console.error('Error fetching proxy events:', error);
      }

      // Only update events if we have new ones to add
      if (newEvents.length > 0) {
        // Use the ref instead of the prop directly
        addOrUpdateEventsRef.current(newEvents);
      }

    } catch (error) {
      console.error('Error in fetchData:', error);
    } finally {
      setIsCheckingStatus(false);
    }
  }, []);
  
  // Effect to fetch data from both sources
  useEffect(() => {
    let isMounted = true; // Add mounted check

    const fetchDataSafely = async () => {
      if (!isMounted) return; // Skip if unmounted
      await fetchData();
    };

    // Initial fetch
    fetchDataSafely();

    // Set up polling if autoRefresh is enabled
    let intervalId = null;
    if (autoRefresh) {
      intervalId = setInterval(fetchDataSafely, 1000);
    }

    // Cleanup function
    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [autoRefresh, deviceId, packageName, fetchData]);
  
  // Function to start/stop logcat capture
  const handleToggleLogcat = async () => {
    try {
      if (isCapturingLogcat) {
        const result = await window.api.adb.stopLogcatCapture();
        if (result.success) {
          setIsCapturingLogcat(false);
        }
      } else {
        if (!deviceId) {
          alert('Please select a device first.');
          return;
        }
        const result = await window.api.adb.startLogcatCapture(deviceId);
        if (result.success) {
          setIsCapturingLogcat(true);
          await window.api.adb.clearAnalyticsLogs();
        }
      }
    } catch (error) {
      console.error('Error toggling logcat capture:', error);
      alert('Error: ' + error.message);
    }
  };

  // Function to clear all events
  const handleClearEvents = async () => {
    try {
      await window.api.adb.clearAnalyticsLogs();
      clearEventsRef.current();
    } catch (error) {
      console.error('Error clearing events:', error);
      alert('Error: ' + error.message);
    }
  };

  return {
    isCapturingLogcat,
    isCheckingStatus,
    autoRefresh,
    setAutoRefresh,
    handleToggleLogcat,
    handleClearEvents
  };
} 