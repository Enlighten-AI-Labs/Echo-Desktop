import styles from '@/styles/components/unified-analytics-debugger.module.css';
import journeyStyles from '@/styles/components/journey-modal.module.css';
import { useEffect, useState, useRef, useCallback, useDeferredValue } from 'react';
import { parseAdobeAnalyticsBeacon } from '@/lib/adobe-analytics-parser';
import { useReact19 } from '@/contexts/React19Provider';
import EcommerceCard from './EcommerceCard';
import storage from '@/lib/storage';
import { TrashIcon, ShoppingCartIcon, EditIcon } from '../icons/AnalyticsIcons';
import { parseGA4Beacon, cleanEventName, parseLogcatParameters } from '@/lib/ga4-analytics-parser';
import { 
  generateBeaconId, 
  generateEventId,
  getScreenName,
  groupEventsByScreen,
  isEcommerceParameter
} from '@/lib/beacon-utils';
import { 
  separateParameters,
  extractItems,
  formatPrice
} from '@/lib/event-parameter-utils';
import EventCard from './EventCard';
import JourneyModal from './JourneyModal';
import useScreenshots from '@/hooks/useScreenshots';

export default function UnifiedAnalyticsDebugger({ deviceId, packageName, show }) {
  const { startTransition, isPending } = useReact19();
  
  // State for analytics events from all sources
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [userSelectedEvent, setUserSelectedEvent] = useState(false);
  const [userInteracting, setUserInteracting] = useState(false);
  const [filter, setFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all', 'logcat', 'proxy'
  const [analyticsType, setAnalyticsType] = useState('all'); // 'all', 'google', 'adobe', 'firebase'
  const [isCapturingLogcat, setIsCapturingLogcat] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [viewMode, setViewMode] = useState('parsed'); // 'parsed' or 'raw'
  const [expandedSections, setExpandedSections] = useState({
    basicInfo: false,
    parameters: true,
    eCommerce: true,
    userProperties: true,
    rawData: false
  });
  
  // New state for the filter box
  const [filterText, setFilterText] = useState('');
  const [filterType, setFilterType] = useState('all');
  // Add new state variables for journey functionality
  const [showJourneyModal, setShowJourneyModal] = useState(false);
  const [journeyName, setJourneyName] = useState('');
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [journeys, setJourneys] = useState(() => {
    // Initialize journeys from localStorage
    const savedJourneys = storage.getItem('analyticsJourneys');
    return savedJourneys ? JSON.parse(savedJourneys) : [];
  });
  const [selectedJourneyId, setSelectedJourneyId] = useState(null);
  // Add these state variables near your other state declarations
  const [selectedJourneyIds, setSelectedJourneyIds] = useState(new Set());
  const [isBulkEditMode, setIsBulkEditMode] = useState(false);
  // Add these state variables for bulk event management
  const [selectedEventIds, setSelectedEventIds] = useState(new Set());
  
  // Use the useScreenshots hook instead of managing screenshot state directly
  const { 
    screenshots, 
    screenshotStatus, 
    selectedScreenshot, 
    setSelectedScreenshot,
    captureScreenshot,
    loadScreenshotData,
    handleRetakeScreenshot: retakeScreenshot,
    handleDeleteScreenshot: deleteScreenshot,
    setScreenshots
  } = useScreenshots();
  
  const intervalRef = useRef(null);
  const processedEventIds = useRef(new Set());

  // Add this state near your other state declarations in UnifiedAnalyticsDebugger
  const [collapsedScreens, setCollapsedScreens] = useState({});

  // Add state for panel resizing
  const [leftPanelWidth, setLeftPanelWidth] = useState(375); // Default width for events list
  const [rightPanelWidth, setRightPanelWidth] = useState(300); // Default width for screenshot panel
  const [isResizing, setIsResizing] = useState(null); // null, 'left', or 'right'
  const containerRef = useRef(null);
  
  const eventsListRef = useRef(null);
  const detailsPanelRef = useRef(null);
  const screenshotPanelRef = useRef(null);

  // Use deferred value for events to prevent UI blocking
  const deferredEvents = useDeferredValue(events);
  
  // Wrapper function for the hook's functions that need the specific event
  const handleRetakeScreenshot = () => {
    if (!selectedEvent) return;
    retakeScreenshot(selectedEvent.id);
  };
  
  const handleDeleteScreenshot = () => {
    if (!selectedEvent) return;
    deleteScreenshot(selectedEvent.id);
  };

  // Start resize
  const startResize = (divider) => (e) => {
    e.preventDefault();
    setIsResizing(divider);
  };

  // Update the handleResize callback to use startTransition
  const handleResize = useCallback((e) => {
    if (!isResizing || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const mouseX = e.clientX - containerRect.left;

    startTransition(() => {
      if (isResizing === 'left') {
        const newWidth = Math.max(250, Math.min(mouseX, containerWidth - rightPanelWidth - 100));
        setLeftPanelWidth(newWidth);
      } else if (isResizing === 'right') {
        const newWidth = Math.max(200, Math.min(containerWidth - mouseX, containerWidth - leftPanelWidth - 100));
        setRightPanelWidth(newWidth);
      }
    });
  }, [isResizing, rightPanelWidth, leftPanelWidth, startTransition]);

  // Stop resize
  const stopResize = useCallback(() => {
    setIsResizing(null);
  }, []);

  // Add resize event listeners
  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResize);
      window.addEventListener('mouseup', stopResize);
    }
    return () => {
      window.removeEventListener('mousemove', handleResize);
      window.removeEventListener('mouseup', stopResize);
    };
  }, [isResizing, handleResize, stopResize]);

  // Add delete event handler
  const handleDeleteEvent = (eventToDelete, e) => {
    e.stopPropagation(); // Prevent event card selection when deleting
    setEvents(currentEvents => currentEvents.filter(event => event.id !== eventToDelete.id));
    if (selectedEvent?.id === eventToDelete.id) {
      setSelectedEvent(null);
    }
  };

  // Function to generate a consistent color based on journey name
  const getJourneyColor = useCallback((journeyName) => {
    const colors = [
      '#9C54AD', // Purple
      '#EB2726', // Red
      '#3C76A9', // Blue
      '#6DC19C', // Green
      '#F69757', // Orange
      '#FFCF4F'  // Yellow
    ];
    
    // Create a hash of the journey name
    const hash = journeyName.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    
    // Use the hash to select a color
    return colors[Math.abs(hash) % colors.length];
  }, []);

  // Function to generate a unique event ID
  const generateEventId = (event) => {
    const generateHash = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash);
    };

    const keyProperties = [
      event.source,
      event.timestamp,
      event.eventName || event.type || '',
      event.pageTitle || event.pageName || '',
      event.url || ''
    ].join('|');

    const hash = generateHash(keyProperties);
    const num = hash % 1000000;
    const num1 = String(Math.floor(num / 10000)).padStart(2, '0');
    const num2 = String(Math.floor((num % 10000) / 100)).padStart(2, '0');
    const num3 = String(num % 100).padStart(2, '0');
    
    return `${num1}.${num2}.${num3}`;
  };

  // Effect to fetch data from both sources
  useEffect(() => {
    let isMounted = true; // Add mounted check

    async function fetchData() {
      if (!isMounted) return; // Skip if unmounted

      try {
        // Get logcat status and data if running
        let isRunning = false;
        try {
          isRunning = await window.api.adb.isLogcatRunning();
          if (!isMounted) return; // Check if still mounted after await
        } catch (error) {
          console.error('Error checking logcat status:', error);
        }
        
        if (isMounted) {
          setIsCapturingLogcat(isRunning);
        }
        
        let newEvents = [];
        
        // Try to get logcat events
        if (isRunning) {
          try {
            const logcatLogs = await window.api.adb.getAnalyticsLogs();
            if (!isMounted) return; // Check if still mounted after await

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

                  event.id = generateEventId(event);
                  event.beaconId = generateBeaconId(event);
                  
                  return event;
                });

              // Process new logcat events
              parsedLogcatEvents.forEach(event => {
                if (!processedEventIds.current.has(event.id)) {
                  processedEventIds.current.add(event.id);
                  if (isMounted) {
                    captureScreenshot(event.id);
                  }
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
          if (!isMounted) return; // Check if still mounted after await

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
                parsedBeacon.id = generateEventId(parsedBeacon);
                parsedBeacon.beaconId = generateBeaconId(parsedBeacon);
                return parsedBeacon;
              }
              
              return null;
            })
            .filter(Boolean);

          // Process new proxy events
          analyticsBeacons.forEach(beacon => {
            if (!processedEventIds.current.has(beacon.id)) {
              processedEventIds.current.add(beacon.id);
              if (isMounted) {
                captureScreenshot(beacon.id);
              }
            }
          });

          newEvents = [...newEvents, ...analyticsBeacons];
        } catch (error) {
          console.error('Error fetching proxy events:', error);
        }

        // Only update events if we have new ones to add and component is still mounted
        if (newEvents.length > 0 && isMounted) {
          setEvents(currentEvents => {
            // Create a map of existing events for faster lookup
            const existingEventsMap = new Map(currentEvents.map(e => [e.id, e]));
            
            // Add new events to the map, preserving existing ones
            newEvents.forEach(e => {
              if (!existingEventsMap.has(e.id)) {
                existingEventsMap.set(e.id, e);
              }
            });
            
            // Convert map back to array and sort
            const updatedEvents = Array.from(existingEventsMap.values())
              .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            // Save to localStorage
            storage.setItem('analyticsEvents', JSON.stringify(updatedEvents));
            
            return updatedEvents;
          });
        }

      } catch (error) {
        console.error('Error in fetchData:', error);
      } finally {
        if (isMounted) {
          setIsCheckingStatus(false);
        }
      }
    }

    // Initial fetch
    fetchData();

    // Set up polling if autoRefresh is enabled
    let intervalId = null;
    if (autoRefresh) {
      intervalId = setInterval(fetchData, 1000);
    }

    // Cleanup function
    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [autoRefresh]);

  // Effect to update localStorage when screenshots change
  useEffect(() => {
    // Update events with screenshot data
    setEvents(currentEvents => {
      const updatedEvents = currentEvents.map(event => ({
        ...event,
        screenshot: screenshots[event.id]
      }));
      
      // Save to localStorage
      storage.setItem('analyticsEvents', JSON.stringify(updatedEvents));
      
      return updatedEvents;
    });
  }, [screenshots]);

  // Effect to handle screenshot updates when selected event changes
  useEffect(() => {
    if (selectedEvent) {
      if (screenshots[selectedEvent.id] && !screenshots[selectedEvent.id].dataUrl) {
        loadScreenshotData(selectedEvent.id);
      }
      setSelectedScreenshot(screenshots[selectedEvent.id]);
    } else {
      setSelectedScreenshot(null);
    }
  }, [selectedEvent, screenshots]);

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
      setEvents([]);
      setSelectedEvent(null);
    } catch (error) {
      console.error('Error clearing events:', error);
      alert('Error: ' + error.message);
    }
  };

  // Filter events based on user input
  const filteredEvents = events.filter(event => {
    // Filter by source
    if (sourceFilter !== 'all' && event.source !== sourceFilter) return false;

    // Filter by analytics type
    if (analyticsType !== 'all') {
      if (event.source === 'logcat') {
        if (analyticsType === 'adobe' && !event.message?.includes('/b/ss/')) return false;
        if (analyticsType === 'google' && !event.message?.includes('firebase')) return false;
      } else if (event.source === 'proxy') {
        if (analyticsType === 'adobe' && event.analyticsType !== 'adobe') return false;
        if (analyticsType === 'google' && event.analyticsType !== 'ga4') return false;
      }
    }

    // Filter by search text
    if (filter) {
      const searchText = filter.toLowerCase();
      return (
        event.eventName?.toLowerCase().includes(searchText) ||
        event.pageName?.toLowerCase().includes(searchText) ||
        event.message?.toLowerCase().includes(searchText) ||
        event.url?.toLowerCase().includes(searchText)
      );
    }

    // Filter by the new filter box - simplified to search across all fields
    if (filterText) {
      const searchText = filterText.toLowerCase();
      return (
        event.beaconId?.toLowerCase().includes(searchText) ||
        event.eventName?.toLowerCase().includes(searchText) ||
        (event.source === 'logcat' 
          ? (event.message?.includes('/b/ss/') 
              ? event.pageName?.toLowerCase().includes(searchText)
              : (parseLogcatParameters(event.message)?.ga_screen || '').toLowerCase().includes(searchText))
          : (event.analyticsType === 'adobe' 
              ? event.pageName?.toLowerCase().includes(searchText)
              : event.parameters?.ga_screen?.toLowerCase().includes(searchText) || 
                event.parameters?.screen_name?.toLowerCase().includes(searchText)))
      );
    }

    return true;
  });

  // Save journeys to localStorage whenever they change
  useEffect(() => {
    storage.setItem('analyticsJourneys', JSON.stringify(journeys));
  }, [journeys]);

  // Journey related functions
  const handleAddJourney = () => {
    setShowJourneyModal(true);
    setJourneyName('');
    setSelectedEvents([]);
    setSelectedJourneyId(null);
  };

  // Add these helper functions for bulk event management
  const handleBulkAssignEvents = () => {
    if (selectedEventIds.size === 0 || selectedJourneyIds.size === 0) return;

    const selectedJourney = journeys.find(j => selectedJourneyIds.has(j.id));
    if (!selectedJourney) return;

    // Update events with the selected journey
    setEvents(prevEvents => 
      prevEvents.map(event => {
        if (selectedEventIds.has(event.id)) {
          const existingJourneys = Array.isArray(event.journeys) ? event.journeys : [];
          if (!existingJourneys.some(j => j.id === selectedJourney.id)) {
            return {
              ...event,
              journeys: [...existingJourneys, {
                id: selectedJourney.id,
                name: selectedJourney.name
              }]
            };
          }
        }
        return event;
      })
    );

    // Update journey with new events
    setJourneys(prevJourneys =>
      prevJourneys.map(journey => {
        if (journey.id === selectedJourney.id) {
          return {
            ...journey,
            events: Array.from(new Set([...journey.events, ...Array.from(selectedEventIds)])),
            updatedAt: new Date().toISOString()
          };
        }
        return journey;
      })
    );

    // Clear selections
    setSelectedEventIds(new Set());
  };

  const handleBulkClearJourneys = () => {
    if (selectedEventIds.size === 0) return;

    if (window.confirm(`Are you sure you want to remove all journey assignments from ${selectedEventIds.size} selected events?`)) {
      // Remove journey assignments from selected events
      setEvents(prevEvents =>
        prevEvents.map(event => {
          if (selectedEventIds.has(event.id)) {
            return {
              ...event,
              journeys: []
            };
          }
          return event;
        })
      );

      // Remove events from all journeys
      setJourneys(prevJourneys =>
        prevJourneys.map(journey => ({
          ...journey,
          events: journey.events.filter(eventId => !selectedEventIds.has(eventId)),
          updatedAt: new Date().toISOString()
        }))
      );

      // Clear event selection
      setSelectedEventIds(new Set());
    }
  };

  // Update the handleCloseModal function
  const handleCloseModal = () => {
    setShowJourneyModal(false);
    setJourneyName('');
    setSelectedEvents([]);
    setSelectedJourneyId(null);
    setSelectedJourneyIds(new Set());
    setSelectedEventIds(new Set());
    setIsBulkEditMode(false);
  };

  const handleSelectExistingJourney = (journeyId) => {
    const journey = journeys.find(j => j.id === journeyId);
    if (journey) {
      setSelectedJourneyId(journeyId);
      setJourneyName(journey.name);
      setSelectedEvents(journey.events);
    }
  };

  // Add this new function before the handleSaveJourney function
  const handleCreateNewJourney = () => {
    setSelectedJourneyId(null);
    setJourneyName('');
    setSelectedEvents([]);
    // Clear any existing journey selection
    const existingJourneyCards = document.querySelectorAll(`.${journeyStyles.selected}`);
    existingJourneyCards.forEach(card => card.classList.remove(journeyStyles.selected));
  };

  // Update the handleSaveJourney function
  const handleSaveJourney = () => {
    if (!journeyName.trim()) {
      alert('Please enter a journey name');
      return;
    }

    if (!selectedJourneyId && selectedEvents.length === 0) {
      alert('Please select at least one event');
      return;
    }

    if (selectedJourneyId) {
      // Update existing journey
      setJourneys(prevJourneys => 
        prevJourneys.map(journey => {
          if (journey.id === selectedJourneyId) {
            return {
              ...journey,
              name: journeyName.trim(),
              events: Array.from(new Set([...journey.events, ...selectedEvents])),
              updatedAt: new Date().toISOString()
            };
          }
          return journey;
        })
      );
    } else {
      // Create new journey
      const newJourney = {
        id: Date.now(),
        name: journeyName.trim(),
        events: selectedEvents,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      setJourneys(prevJourneys => [...prevJourneys, newJourney]);
    }

    // Update events with their journey assignments
    setEvents(prevEvents => 
      prevEvents.map(event => {
        if (selectedEvents.includes(event.id)) {
          const existingJourneys = Array.isArray(event.journeys) ? event.journeys : [];
          if (selectedJourneyId) {
            // For existing journey, update the name if it changed
            return {
              ...event,
              journeys: existingJourneys.map(j => 
                j.id === selectedJourneyId 
                  ? { ...j, name: journeyName.trim() }
                  : j
              )
            };
          } else {
            // For new journey, add it to the event's journeys
            return {
              ...event,
              journeys: [...existingJourneys, {
                id: Date.now(),
                name: journeyName.trim()
              }]
            };
          }
        }
        return event;
      })
    );

    handleCloseModal();
  };

  const toggleEventSelection = (eventId) => {
    if (Array.isArray(eventId)) {
      // If we received an array, replace the selection
      setSelectedEvents(eventId);
    } else {
      // Otherwise toggle the single event
      setSelectedEvents(prev => 
        prev.includes(eventId)
          ? prev.filter(id => id !== eventId)
          : [...prev, eventId]
      );
    }
  };

  const getEventJourneys = useCallback((eventId) => {
    if (!eventId) return [];
    return journeys.filter(journey => 
      journey.events.includes(eventId)
    );
  }, [journeys]);

  // Function to handle removing a journey from an event
  const handleRemoveJourneyFromEvent = (eventId, journeyId, e) => {
    e.stopPropagation(); // Prevent event selection when removing journey
    
    // Update the journey's events
    setJourneys(prevJourneys => 
      prevJourneys.map(journey => 
        journey.id === journeyId
          ? { ...journey, events: journey.events.filter(id => id !== eventId) }
          : journey
      )
    );
    
    // Update the event's journey references
    setEvents(prevEvents => 
      prevEvents.map(event => 
        event.id === eventId
          ? {
              ...event,
              journeys: event.journeys?.filter(j => j.id !== journeyId) || []
            }
          : event
      )
    );
  };

  // Function to scroll to most recent event
  const scrollToMostRecent = useCallback(() => {
    if (eventsListRef.current) {
      eventsListRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }, []);

  // Effect to auto-select most recent event if no user selection
  useEffect(() => {
    if (filteredEvents.length > 0 && !userSelectedEvent && !userInteracting) {
      setSelectedEvent(filteredEvents[0]);
    }
  }, [filteredEvents, userSelectedEvent, userInteracting]);

  // Modified event selection handler
  const handleEventSelection = (event) => {
    setSelectedEvent(event);
    setUserSelectedEvent(true);
  };

  // Function to return to most recent event
  const handleGoToTop = () => {
    if (filteredEvents.length > 0) {
      setSelectedEvent(filteredEvents[0]);
      setUserSelectedEvent(false);
      setUserInteracting(false);
      scrollToMostRecent();
    }
  };

  // Handle user interaction with panels
  const handlePanelInteraction = useCallback(() => {
    setUserInteracting(true);
  }, []);

  // Add scroll event listener to events list
  useEffect(() => {
    const eventsList = eventsListRef.current;
    if (!eventsList) return;

    const handleScroll = () => {
      // If we're very close to the top (within 10px), allow auto-selection
      if (eventsList.scrollTop <= 10) {
        setUserInteracting(false);
      } else {
        setUserInteracting(true);
      }
    };

    eventsList.addEventListener('scroll', handleScroll);
    return () => eventsList.removeEventListener('scroll', handleScroll);
  }, []);

  // Add interaction listeners to panels
  useEffect(() => {
    const detailsPanel = detailsPanelRef.current;
    const screenshotPanel = screenshotPanelRef.current;

    if (detailsPanel) {
      detailsPanel.addEventListener('mouseenter', handlePanelInteraction);
      detailsPanel.addEventListener('touchstart', handlePanelInteraction);
    }

    if (screenshotPanel) {
      screenshotPanel.addEventListener('mouseenter', handlePanelInteraction);
      screenshotPanel.addEventListener('touchstart', handlePanelInteraction);
    }

    return () => {
      if (detailsPanel) {
        detailsPanel.removeEventListener('mouseenter', handlePanelInteraction);
        detailsPanel.removeEventListener('touchstart', handlePanelInteraction);
      }
      if (screenshotPanel) {
        screenshotPanel.removeEventListener('mouseenter', handlePanelInteraction);
        screenshotPanel.removeEventListener('touchstart', handlePanelInteraction);
      }
    };
  }, [handlePanelInteraction]);

  // Add these helper functions before the journey modal JSX
  const handleToggleJourneySelection = (journeyId, e) => {
    e.stopPropagation(); // Prevent journey selection for editing
    setSelectedJourneyIds(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(journeyId)) {
        newSelection.delete(journeyId);
      } else {
        newSelection.add(journeyId);
      }
      return newSelection;
    });
  };

  const handleSelectAllJourneys = () => {
    setSelectedJourneyIds(new Set(journeys.map(j => j.id)));
  };

  const handleUnselectAllJourneys = () => {
    setSelectedJourneyIds(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedJourneyIds.size === 0) return;
    
    if (window.confirm(`Are you sure you want to delete ${selectedJourneyIds.size} selected journeys?`)) {
      // Remove the journeys
      setJourneys(prevJourneys => prevJourneys.filter(j => !selectedJourneyIds.has(j.id)));
      
      // Remove journey references from events
      setEvents(prevEvents => 
        prevEvents.map(event => ({
          ...event,
          journeys: event.journeys?.filter(j => !selectedJourneyIds.has(j.id)) || []
        }))
      );
      
      // Clear selection
      setSelectedJourneyIds(new Set());
      setIsBulkEditMode(false);
    }
  };

  // Add missing journey-related functions
  const handleDeleteJourney = (journeyId, e) => {
    e.stopPropagation(); // Prevent journey selection when deleting
    
    if (window.confirm('Are you sure you want to delete this journey?')) {
      // Remove the journey from the journeys list
      setJourneys(prevJourneys => prevJourneys.filter(j => j.id !== journeyId));
      
      // If the deleted journey was selected, clear the selection
      if (selectedJourneyId === journeyId) {
        setSelectedJourneyId(null);
        setJourneyName('');
        setSelectedEvents([]);
      }
      
      // Remove journey reference from all events
      setEvents(prevEvents => 
        prevEvents.map(event => ({
          ...event,
          // Remove the journey from the event's journeys array if it exists
          journeys: event.journeys?.filter(j => j.id !== journeyId) || []
        }))
      );
    }
  };

  const handleRemoveEventFromJourney = (journeyId, eventId, e) => {
    e.stopPropagation(); // Prevent event selection when removing
    
    // Update the journey's events
    setJourneys(prevJourneys => 
      prevJourneys.map(journey => 
        journey.id === journeyId
          ? { ...journey, events: journey.events.filter(id => id !== eventId) }
          : journey
      )
    );
    
    // Update the event's journey references
    setEvents(prevEvents => 
      prevEvents.map(event => 
        event.id === eventId
          ? {
              ...event,
              journeys: event.journeys?.filter(j => j.id !== journeyId) || []
            }
          : event
      )
    );
    
    // If this event was selected in the modal, remove it from selection
    if (selectedEvents.includes(eventId)) {
      setSelectedEvents(prev => prev.filter(id => id !== eventId));
    }
  };

  if (!show) {
    return null;
  }

  return (
    <div className={styles.container}>
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

      <div ref={containerRef} className={styles.content}>
        <div ref={eventsListRef} className={styles.eventsList} style={{ flex: `0 0 ${leftPanelWidth}px` }}>
          {filteredEvents.map((event, index) => (
            <EventCard
              key={event.id}
              event={event}
              index={index}
              journeys={journeys}
              isSelected={selectedEvent?.id === event.id}
              onSelect={handleEventSelection}
              onRemoveJourney={handleRemoveJourneyFromEvent}
              getJourneyColor={getJourneyColor}
              filteredEvents={filteredEvents}
            />
          ))}
        </div>

      <div className={styles.divider} onMouseDown={startResize('left')}>
        <div className={styles.dividerHandle} />
      </div>

      <div ref={detailsPanelRef} className={styles.eventDetails}>
        {selectedEvent ? (
          <>
            <div className={styles.eventDetailsHeader}>
              <div className={styles.eventDetailsTitle}>
                {selectedEvent.eventName}
              </div>
              <button
                className={styles.deleteEventButton}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteEvent(selectedEvent, e);
                }}
                title="Delete event"
              >
                <TrashIcon />
              </button>
            </div>

            <div className={styles.section}>
              <div 
                className={styles.sectionHeader}
                onClick={() => setExpandedSections(prev => ({
                  ...prev,
                  basicInfo: !prev.basicInfo
                }))}
              >
                <h3>Basic Information</h3>
                <span>{expandedSections.basicInfo ? '−' : '+'}</span>
              </div>
              {expandedSections.basicInfo && (
                <div className={styles.sectionContent}>
                  <div className={styles.parametersTable}>
                    <div className={styles.parametersHeader}>
                      <div className={styles.paramNumber}>#</div>
                      <div className={styles.paramName}>FIELD</div>
                      <div className={styles.paramValue}>VALUE</div>
                    </div>
                    <div className={styles.parameterRow}>
                      <div className={styles.paramNumber}>#1</div>
                      <div className={styles.paramName}>Source</div>
                      <div className={styles.paramValue}>{selectedEvent.source}</div>
                    </div>
                    <div className={styles.parameterRow}>
                      <div className={styles.paramNumber}>#2</div>
                      <div className={styles.paramName}>Type</div>
                      <div className={styles.paramValue}>{selectedEvent.analyticsType || 'GA4'}</div>
                    </div>
                    <div className={styles.parameterRow}>
                      <div className={styles.paramNumber}>#3</div>
                      <div className={styles.paramName}>Beacon ID</div>
                      <div className={styles.paramValue}>{selectedEvent.beaconId}</div>
                    </div>
                    <div className={styles.parameterRow}>
                      <div className={styles.paramNumber}>#4</div>
                      <div className={styles.paramName}>Timestamp</div>
                      <div className={styles.paramValue}>{selectedEvent.timestamp}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.section}>
              <div 
                className={styles.sectionHeader}
                onClick={() => setExpandedSections(prev => ({
                  ...prev,
                  parameters: !prev.parameters
                }))}
              >
                <h3>Parameters</h3>
                <span>{expandedSections.parameters ? '−' : '+'}</span>
              </div>
              {expandedSections.parameters && (
                <div className={styles.sectionContent}>
                  {(() => {
                    const { general } = separateParameters(selectedEvent.parameters || {});
                    
                    if (Object.keys(general).length === 0) {
                      return <div className={styles.noData}>No general parameters available</div>;
                    }
                    
                    return (
                      <div className={styles.parametersTable}>
                        <div className={styles.parametersHeader}>
                          <div className={styles.paramNumber}>#</div>
                          <div className={styles.paramName}>PARAMETER NAME</div>
                          <div className={styles.paramValue}>VALUE</div>
                        </div>
                        {Object.entries(general).map(([key, value], index) => (
                          <div key={index} className={styles.parameterRow}>
                            <div className={styles.paramNumber}>#{index + 1}</div>
                            <div className={styles.paramName}>{key}</div>
                            <div className={styles.paramValue}>
                              {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {(() => {
              // Determine if there's eCommerce data to display
              const hasEcommerceData = (() => {
                if (selectedEvent.source === 'logcat') {
                  const params = parseLogcatParameters(selectedEvent.message) || {};
                  // Check both for items array and common eCommerce event names
                  return (
                    (params.items && Array.isArray(params.items) && params.items.length > 0) ||
                    params.value !== undefined ||
                    /add_to_cart|remove_from_cart|begin_checkout|purchase|view_item|select_item/.test(selectedEvent.eventName || selectedEvent.message || '')
                  );
                } else {
                  const items = extractItems(selectedEvent.parameters || {});
                  return items.length > 0 || 
                    (selectedEvent.parameters?.value !== undefined) ||
                    /add_to_cart|remove_from_cart|begin_checkout|purchase|view_item|select_item/.test(selectedEvent.eventName || '');
                }
              })();

              // Only render the eCommerce section if there's data
              if (!hasEcommerceData) return null;

              return (
                <div className={styles.section}>
                  <div 
                    className={styles.sectionHeader}
                    onClick={() => setExpandedSections(prev => ({
                      ...prev,
                      eCommerce: !prev.eCommerce
                    }))}
                  >
                    <h3>eCommerce</h3>
                    <span>{expandedSections.eCommerce ? '−' : '+'}</span>
                  </div>
                  {expandedSections.eCommerce && (
                    <div className={styles.sectionContent}>
                      {(() => {
                        // For logcat events
                        if (selectedEvent.source === 'logcat') {
                          const params = parseLogcatParameters(selectedEvent.message) || {};
                          const items = extractItems(params);
                          const { ecommerce } = separateParameters(params);

                          const ecommerceData = {
                            eventName: selectedEvent.message?.includes('Logging event:') 
                              ? cleanEventName(selectedEvent.message.match(/name=([^,]+)/)?.[1]) 
                              : 'Analytics Event',
                            couponCode: ecommerce.coupon || ecommerce.promotion_code || 'N/A',
                            currency: ecommerce.currency || 'USD',
                            uniqueProductsCount: items.length,
                            totalItemsCount: items.reduce((acc, item) => acc + (parseInt(item.quantity) || 1), 0),
                            orderTotal: items.reduce((acc, item) => acc + ((parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1)), 0).toFixed(2),
                            items: items.map(item => ({
                              ...item,
                              item_customized: ecommerce.item_customized,
                              item_discounted: ecommerce.item_discounted,
                              item_customization_amount: ecommerce.item_customization_amount,
                              discount: ecommerce.discount,
                              in_stock: ecommerce.in_stock,
                              custom_attributes: Object.entries(ecommerce)
                                .filter(([key]) => !isEcommerceParameter(key))
                                .map(([label, value]) => ({ label, value }))
                            }))
                          };

                          return <EcommerceCard data={ecommerceData} />;
                        }
                        
                        // For proxy/network events
                        const items = extractItems(selectedEvent.parameters || {});
                        const { ecommerce } = separateParameters(selectedEvent.parameters || {});

                        const ecommerceData = {
                          eventName: selectedEvent.eventName || 'Analytics Event',
                          couponCode: ecommerce.coupon || ecommerce.promotion_code || 'N/A',
                          currency: ecommerce.currency || 'USD',
                          uniqueProductsCount: items.length,
                          totalItemsCount: items.reduce((acc, item) => acc + (parseInt(item.quantity) || 1), 0),
                          orderTotal: items.reduce((acc, item) => acc + ((parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1)), 0).toFixed(2),
                          items: items.map(item => ({
                            ...item,
                            item_customized: ecommerce.item_customized,
                            item_discounted: ecommerce.item_discounted,
                            item_customization_amount: ecommerce.item_customization_amount,
                            discount: ecommerce.discount,
                            in_stock: ecommerce.in_stock,
                            custom_attributes: Object.entries(ecommerce)
                              .filter(([key]) => !isEcommerceParameter(key))
                              .map(([label, value]) => ({ label, value }))
                          }))
                        };

                        return <EcommerceCard data={ecommerceData} />;
                      })()}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className={styles.section}>
              <div 
                className={styles.sectionHeader}
                onClick={() => setExpandedSections(prev => ({
                  ...prev,
                  rawData: !prev.rawData
                }))}
              >
                <h3>Raw Data</h3>
                <span>{expandedSections.rawData ? '−' : '+'}</span>
              </div>
              {expandedSections.rawData && (
                <div className={styles.sectionContent}>
                  <div className={styles.rawDataContainer}>
                    <div className={styles.rawDataHeader}>
                      <span>Raw network request</span>
                      <button 
                        className={styles.copyButton}
                        onClick={() => {
                          const rawData = selectedEvent.source === 'logcat' 
                            ? selectedEvent.message 
                            : JSON.stringify(selectedEvent, null, 2);
                          navigator.clipboard.writeText(rawData);
                        }}
                      >
                        Copy
                      </button>
                    </div>
                    <div className={styles.rawData}>
                      <pre>
                        {selectedEvent.source === 'logcat' 
                          ? selectedEvent.message 
                          : JSON.stringify(selectedEvent, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className={styles.noEventSelected}>
            <p>No event selected</p>
            <p>Select an event from the list to view details</p>
          </div>
        )}
      </div>

      <div className={styles.divider} onMouseDown={startResize('right')}>
        <div className={styles.dividerHandle} />
      </div>

      <div ref={screenshotPanelRef} className={styles.screenshotPanel} style={{ flex: `0 0 ${rightPanelWidth}px` }}>
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

        {/* Only show Latest Event button if we're not at the top and user has selected a different event */}
        {userSelectedEvent && userInteracting && filteredEvents.length > 0 && selectedEvent?.id !== filteredEvents[0].id && (
          <button
            className={styles.goToTopButton}
            onClick={handleGoToTop}
            title="Go to most recent event"
          >
            Latest Event
          </button>
        )}
      </div>

      {/* Journey Modal */}
      {showJourneyModal && (
        <JourneyModal
          showJourneyModal={showJourneyModal}
          handleCloseModal={handleCloseModal}
          journeys={journeys}
          selectedJourneyId={selectedJourneyId}
          journeyName={journeyName}
          setJourneyName={setJourneyName}
          selectedEvents={selectedEvents}
          events={events}
          collapsedScreens={collapsedScreens}
          setCollapsedScreens={setCollapsedScreens}
          toggleEventSelection={toggleEventSelection}
          handleSaveJourney={handleSaveJourney}
          handleSelectExistingJourney={handleSelectExistingJourney}
          handleDeleteJourney={handleDeleteJourney}
          handleRemoveEventFromJourney={handleRemoveEventFromJourney}
          groupEventsByScreen={groupEventsByScreen}
          isBulkEditMode={isBulkEditMode}
          setIsBulkEditMode={setIsBulkEditMode}
          selectedJourneyIds={selectedJourneyIds}
          setSelectedJourneyIds={setSelectedJourneyIds}
          selectedEventIds={selectedEventIds}
          setSelectedEventIds={setSelectedEventIds}
          handleBulkAssignEvents={handleBulkAssignEvents}
          handleBulkClearJourneys={handleBulkClearJourneys}
          handleBulkDelete={handleBulkDelete}
          handleCreateNewJourney={handleCreateNewJourney}
          getJourneyColor={getJourneyColor}
        />
      )}
    </div>
  );
}