import { useState, useCallback, useEffect } from 'react';
import storage from '@/lib/storage';
import journeyStyles from '@/styles/components/journey-modal.module.css';
import { groupEventsByScreen } from '@/lib/beacon-utils';

export default function useJourneys(events, addOrUpdateEvents) {
  // Journey state
  const [showJourneyModal, setShowJourneyModal] = useState(false);
  const [journeyName, setJourneyName] = useState('');
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [journeys, setJourneys] = useState(() => {
    // Initialize journeys from localStorage
    const savedJourneys = storage.getItem('analyticsJourneys');
    return savedJourneys ? JSON.parse(savedJourneys) : [];
  });
  const [selectedJourneyId, setSelectedJourneyId] = useState(null);
  const [selectedJourneyIds, setSelectedJourneyIds] = useState(new Set());
  const [isBulkEditMode, setIsBulkEditMode] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState(new Set());
  const [collapsedScreens, setCollapsedScreens] = useState({});

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

  // Save journeys to localStorage whenever they change
  useEffect(() => {
    storage.setItem('analyticsJourneys', JSON.stringify(journeys));
    
    // Dispatch a custom event to notify other components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('journeysUpdated'));
    }
  }, [journeys]);

  // Journey related functions
  const handleAddJourney = () => {
    setShowJourneyModal(true);
    setJourneyName('');
    setSelectedEvents([]);
    setSelectedJourneyId(null);
  };

  // Helper functions for bulk event management
  const handleBulkAssignEvents = () => {
    if (selectedEventIds.size === 0 || selectedJourneyIds.size === 0) return;

    const selectedJourney = journeys.find(j => selectedJourneyIds.has(j.id));
    if (!selectedJourney) return;

    // Update events with the selected journey
    const updatedEvents = events.map(event => {
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
    });
    
    // Update events in context
    addOrUpdateEvents(updatedEvents);

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
      const updatedEvents = events.map(event => {
        if (selectedEventIds.has(event.id)) {
          return {
            ...event,
            journeys: []
          };
        }
        return event;
      });
      
      // Update events in context
      addOrUpdateEvents(updatedEvents);

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

  const handleCreateNewJourney = () => {
    setSelectedJourneyId(null);
    setJourneyName('');
    setSelectedEvents([]);
    // Clear any existing journey selection
    const existingJourneyCards = document.querySelectorAll(`.${journeyStyles.selected}`);
    existingJourneyCards.forEach(card => card.classList.remove(journeyStyles.selected));
  };

  const handleSaveJourney = () => {
    if (!journeyName.trim()) {
      alert('Please enter a journey name');
      return;
    }

    if (!selectedJourneyId && selectedEvents.length === 0) {
      alert('Please select at least one event');
      return;
    }

    // Generate a new journey ID once for both the journey and event references
    const newJourneyId = selectedJourneyId || Date.now();

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
      // Create new journey - use the ID we already generated
      const newJourney = {
        id: newJourneyId,
        name: journeyName.trim(),
        events: selectedEvents,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      setJourneys(prevJourneys => [...prevJourneys, newJourney]);
    }

    // Update events with their journey assignments
    const updatedEvents = events.map(event => {
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
          // For new journey, add it to the event's journeys - use the same ID we generated
          return {
            ...event,
            journeys: [...existingJourneys, {
              id: newJourneyId,
              name: journeyName.trim()
            }]
          };
        }
      }
      return event;
    });
    
    // Update events in context
    addOrUpdateEvents(updatedEvents);

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
    const updatedEvents = events.map(event => 
      event.id === eventId
        ? {
            ...event,
            journeys: event.journeys?.filter(j => j.id !== journeyId) || []
          }
        : event
    );
    
    // Update events in context
    addOrUpdateEvents(updatedEvents);
    
    // If this event was selected in the modal, remove it from selection
    if (selectedEvents.includes(eventId)) {
      setSelectedEvents(prev => prev.filter(id => id !== eventId));
    }
  };

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
      const updatedEvents = events.map(event => ({
        ...event,
        journeys: event.journeys?.filter(j => !selectedJourneyIds.has(j.id)) || []
      }));
      
      // Update events in context
      addOrUpdateEvents(updatedEvents);
      
      // Clear selection
      setSelectedJourneyIds(new Set());
      setIsBulkEditMode(false);
    }
  };

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
      const updatedEvents = events.map(event => ({
        ...event,
        // Remove the journey from the event's journeys array if it exists
        journeys: event.journeys?.filter(j => j.id !== journeyId) || []
      }));
      
      // Update events in context
      addOrUpdateEvents(updatedEvents);
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
    const updatedEvents = events.map(event => 
      event.id === eventId
        ? {
            ...event,
            journeys: event.journeys?.filter(j => j.id !== journeyId) || []
          }
        : event
    );
    
    // Update events in context
    addOrUpdateEvents(updatedEvents);
    
    // If this event was selected in the modal, remove it from selection
    if (selectedEvents.includes(eventId)) {
      setSelectedEvents(prev => prev.filter(id => id !== eventId));
    }
  };

  return {
    journeys,
    showJourneyModal,
    journeyName,
    selectedEvents,
    selectedJourneyId,
    selectedJourneyIds,
    selectedEventIds,
    isBulkEditMode,
    collapsedScreens,
    handleAddJourney,
    handleCloseModal,
    handleSaveJourney,
    handleSelectExistingJourney,
    handleDeleteJourney,
    handleRemoveJourneyFromEvent,
    handleBulkAssignEvents,
    handleBulkClearJourneys,
    handleBulkDelete,
    handleCreateNewJourney,
    getJourneyColor,
    setJourneyName,
    setSelectedEvents,
    setCollapsedScreens,
    setIsBulkEditMode,
    setSelectedJourneyIds,
    setSelectedEventIds,
    toggleEventSelection,
    handleRemoveEventFromJourney,
    handleToggleJourneySelection,
    handleSelectAllJourneys,
    handleUnselectAllJourneys
  };
} 