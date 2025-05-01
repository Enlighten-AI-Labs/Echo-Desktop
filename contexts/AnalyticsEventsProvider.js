import React, { createContext, useContext, useState, useEffect } from 'react';
import storage from '@/lib/storage';

// Create the context
const AnalyticsEventsContext = createContext();

// Custom hook for accessing the analytics events context
export function useAnalyticsEvents() {
  const context = useContext(AnalyticsEventsContext);
  if (!context) {
    throw new Error('useAnalyticsEvents must be used within an AnalyticsEventsProvider');
  }
  return context;
}

// Analytics Events Provider component
export function AnalyticsEventsProvider({ children }) {
  // Initialize events state from localStorage
  const [events, setEvents] = useState(() => {
    const savedEvents = storage.getItem('analyticsEvents');
    return savedEvents ? JSON.parse(savedEvents) : [];
  });

  // Update localStorage whenever events change
  useEffect(() => {
    storage.setItem('analyticsEvents', JSON.stringify(events));
  }, [events]);

  // Listen for XML update events from the main process
  useEffect(() => {
    // Add listener for events updated from the main process
    const handleAnalyticsEventUpdated = (updatedEvent) => {
      console.log('Received updated event from main process:', updatedEvent);
      
      if (!updatedEvent) return;
      
      setEvents(currentEvents => {
        // First try to find a matching event by ID
        let foundIndex = currentEvents.findIndex(e => e.id === updatedEvent.id);
        
        // If not found by ID, try matching by multiple properties
        if (foundIndex === -1 && updatedEvent.message && updatedEvent.timestamp) {
          foundIndex = currentEvents.findIndex(e => 
            e.message === updatedEvent.message && 
            e.timestamp === updatedEvent.timestamp
          );
        }
        
        // If still not found, try with rawLog
        if (foundIndex === -1 && updatedEvent.rawLog) {
          foundIndex = currentEvents.findIndex(e => e.rawLog === updatedEvent.rawLog);
        }
        
        // If we found a matching event, update it
        if (foundIndex !== -1) {
          console.log('Found matching event at index:', foundIndex);
          
          // Create a new array to trigger a re-render
          const updatedEvents = [...currentEvents];
          
          // Update the XML for the existing event
          updatedEvents[foundIndex] = {
            ...updatedEvents[foundIndex],
            uiXml: updatedEvent.uiXml
          };
          
          return updatedEvents;
        }
        
        // If no matching event was found, just return the current events unchanged
        console.log('No matching event found for:', updatedEvent.id);
        return currentEvents;
      });
    };

    // Add listener for interaction events
    const handleAnalyticsEventInteractions = (updatedEvent) => {
      console.log('Received interaction event from main process:', updatedEvent);
      
      if (!updatedEvent || !updatedEvent.interactions) return;
      
      setEvents(currentEvents => {
        // First try to find a matching event by ID
        let foundIndex = currentEvents.findIndex(e => e.id === updatedEvent.id);
        
        // If not found by ID, try matching by event name and timestamp
        if (foundIndex === -1 && updatedEvent.eventName && updatedEvent.timestamp) {
          foundIndex = currentEvents.findIndex(e => 
            e.eventName === updatedEvent.eventName && 
            e.timestamp === updatedEvent.timestamp
          );
        }
        
        // If we found a matching event, update it
        if (foundIndex !== -1) {
          console.log('Found matching event for interactions at index:', foundIndex);
          
          // Create a new array to trigger a re-render
          const updatedEvents = [...currentEvents];
          
          // Update the interactions for the existing event
          updatedEvents[foundIndex] = {
            ...updatedEvents[foundIndex],
            interactions: updatedEvent.interactions
          };
          
          return updatedEvents;
        }
        
        // If no matching event was found, just return the current events unchanged
        console.log('No matching event found for interactions:', updatedEvent.id);
        return currentEvents;
      });
    };

    // Register event listeners
    if (window.api?.adb?.onAnalyticsEventUpdated) {
      window.api.adb.onAnalyticsEventUpdated(handleAnalyticsEventUpdated);
    }
    
    if (window.api?.adb?.onAnalyticsEventInteractions) {
      window.api.adb.onAnalyticsEventInteractions(handleAnalyticsEventInteractions);
    }

    // Clean up the listeners on unmount
    return () => {
      if (window.api?.adb?.removeAnalyticsEventListeners) {
        window.api.adb.removeAnalyticsEventListeners();
      }
    };
  }, []);

  // Add a new event or update an existing one
  const addOrUpdateEvents = (newEvents) => {
    setEvents(currentEvents => {
      // Create a map of existing events for faster lookup
      const existingEventsMap = new Map(currentEvents.map(e => [e.id, e]));
      
      // Add new events to the map, preserving existing ones
      newEvents.forEach(e => {
        if (!existingEventsMap.has(e.id)) {
          existingEventsMap.set(e.id, e);
        } else {
          // Update existing events with any new properties
          const existingEvent = existingEventsMap.get(e.id);
          existingEventsMap.set(e.id, { ...existingEvent, ...e });
        }
      });
      
      // Convert map back to array and sort
      const updatedEvents = Array.from(existingEventsMap.values())
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Limit the number of events to prevent memory issues
      const maxEventsToKeep = 1000; // Increased from 500 to 1000
      return updatedEvents.slice(0, maxEventsToKeep);
    });
  };

  // Delete an event
  const deleteEvent = (eventId) => {
    setEvents(currentEvents => currentEvents.filter(event => event.id !== eventId));
  };

  // Clear all events
  const clearEvents = () => {
    setEvents([]);
  };

  // Export events as JSON
  const exportEvents = () => {
    const dataStr = JSON.stringify(events, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `analytics_events_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  // Import events from JSON file
  const importEvents = (jsonData) => {
    try {
      const parsedData = JSON.parse(jsonData);
      if (Array.isArray(parsedData)) {
        setEvents(parsedData);
        return { success: true };
      }
      return { success: false, error: 'Invalid data format' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const value = {
    events,
    addOrUpdateEvents,
    deleteEvent,
    clearEvents,
    exportEvents,
    importEvents
  };

  return (
    <AnalyticsEventsContext.Provider value={value}>
      {children}
    </AnalyticsEventsContext.Provider>
  );
} 