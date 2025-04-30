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