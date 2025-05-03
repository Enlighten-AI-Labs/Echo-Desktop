import styles from '@/styles/components/unified-analytics-debugger.module.css';
import { useEffect, useState, useRef, useDeferredValue, useMemo } from 'react';
import { useReact19 } from '@/contexts/React19Provider';
import { useAnalyticsEvents } from '@/contexts/AnalyticsEventsProvider';
import EventCard from './EventCard';
import JourneyModal from './JourneyModal';
import AnalyticsToolbar from './AnalyticsToolbar';
import EventDetailsPanel from './EventDetailsPanel';
import ScreenshotPanel from './ScreenshotPanel';
import useEventCapture from '@/hooks/useEventCapture';
import useJourneys from '@/hooks/useJourneys';
import useResizablePanels from '@/hooks/useResizablePanels';
import useEventFiltering from '@/hooks/useEventFiltering';
import useScreenshots from '@/hooks/useScreenshots';
import { groupEventsByScreen } from '@/lib/beacon-utils';

export default function UnifiedAnalyticsDebugger({ deviceId, packageName, show, crawlerStatus }) {
  if (!show) {
    return null;
  }

  // Determine if screenshot panel should be hidden (when crawler is running)
  const isScreenshotPanelHidden = crawlerStatus === 'running';

  const { startTransition, isPending } = useReact19();
  const { events, addOrUpdateEvents, deleteEvent, clearEvents, exportEvents, importEvents } = useAnalyticsEvents();
  
  // Use custom hooks for component functionality
  const { filteredEvents, filterControls } = useEventFiltering(events);
  
  const { screenshots, 
    screenshotStatus, 
    selectedScreenshot, 
    setSelectedScreenshot,
    captureScreenshot,
    loadScreenshotData,
    handleRetakeScreenshot: retakeScreenshot,
    handleDeleteScreenshot: deleteScreenshot
  } = useScreenshots();
  
  const {
    isCapturingLogcat,
    isCheckingStatus,
    autoRefresh,
    setAutoRefresh,
    handleToggleLogcat,
    handleClearEvents
  } = useEventCapture({ 
    deviceId, 
    packageName, 
    events, 
    clearEvents, 
    addOrUpdateEvents, 
    captureScreenshot 
  });
  
  const {
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
    handleRemoveEventFromJourney
  } = useJourneys(events, addOrUpdateEvents);
  
  const {
    leftPanelWidth,
    rightPanelWidth,
    isResizing,
    containerRef,
    eventsListRef,
    detailsPanelRef,
    screenshotPanelRef,
    startResize,
    handleResize,
    stopResize
  } = useResizablePanels({ startTransition });
  
  // State for the selected event and user interaction
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [userSelectedEvent, setUserSelectedEvent] = useState(false);
  const [userInteracting, setUserInteracting] = useState(false);

  // Use deferred value for events to prevent UI blocking
  const deferredEvents = useDeferredValue(events);
  
  // Move screenshot selection to a custom hook or memoized value instead of effect
  const currentScreenshot = useMemo(() => {
    return selectedEvent ? screenshots[selectedEvent?.id] : null;
  }, [selectedEvent, screenshots]);
  
  // Replace the problematic useEffect with this one
  useEffect(() => {
    // Only handle the loading of screenshot data
    if (selectedEvent && 
        screenshots[selectedEvent.id] && 
        !screenshots[selectedEvent.id].dataUrl) {
      loadScreenshotData(selectedEvent.id);
    }
  }, [selectedEvent, screenshots, loadScreenshotData]);

  // Separate effect for updating the selected screenshot
  useEffect(() => {
    setSelectedScreenshot(currentScreenshot);
  }, [currentScreenshot, setSelectedScreenshot]);

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

    if (screenshotPanel && !isScreenshotPanelHidden) {
      screenshotPanel.addEventListener('mouseenter', handlePanelInteraction);
      screenshotPanel.addEventListener('touchstart', handlePanelInteraction);
    }

    return () => {
      if (detailsPanel) {
        detailsPanel.removeEventListener('mouseenter', handlePanelInteraction);
        detailsPanel.removeEventListener('touchstart', handlePanelInteraction);
      }
      if (screenshotPanel && !isScreenshotPanelHidden) {
        screenshotPanel.removeEventListener('mouseenter', handlePanelInteraction);
        screenshotPanel.removeEventListener('touchstart', handlePanelInteraction);
      }
    };
  }, [detailsPanelRef, screenshotPanelRef, isScreenshotPanelHidden]);

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

  // Effect to update events with screenshot data
  useEffect(() => {
    if (Object.keys(screenshots).length > 0) {
      // Create updated events with screenshot data
      const updatedEvents = events.map(event => ({
        ...event,
        screenshot: screenshots[event.id]
      }));
      
      // Update events in context
      addOrUpdateEvents(updatedEvents);
    }
  }, [screenshots, events, addOrUpdateEvents]);

  // Wrapper function for the hook's functions that need the specific event
  const handleRetakeScreenshot = () => {
    if (!selectedEvent) return;
    retakeScreenshot(selectedEvent.id);
  };
  
  const handleDeleteScreenshot = () => {
    if (!selectedEvent) return;
    deleteScreenshot(selectedEvent.id);
  };

  // Add delete event handler
  const handleDeleteEvent = (eventToDelete, e) => {
    e.stopPropagation(); // Prevent event card selection when deleting
    deleteEvent(eventToDelete.id);
    if (selectedEvent?.id === eventToDelete.id) {
      setSelectedEvent(null);
    }
  };

  // Function to scroll to most recent event
  const scrollToMostRecent = () => {
    if (eventsListRef.current) {
      eventsListRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

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
  const handlePanelInteraction = () => {
    setUserInteracting(true);
  };

  // Effect to auto-select most recent event if no user selection
  useEffect(() => {
    if (filteredEvents.length > 0 && !userSelectedEvent && !userInteracting) {
      setSelectedEvent(filteredEvents[0]);
    }
  }, [filteredEvents, userSelectedEvent, userInteracting]);

  return (
    <div className={styles.container}>
      <AnalyticsToolbar 
        events={events}
        isCapturingLogcat={isCapturingLogcat}
        deviceId={deviceId}
        packageName={packageName}
        handleToggleLogcat={handleToggleLogcat}
        handleClearEvents={handleClearEvents}
        handleAddJourney={handleAddJourney}
        filterControls={{
          ...filterControls,
          autoRefresh,
          setAutoRefresh
        }}
        exportEvents={exportEvents}
        importEvents={importEvents}
      />

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
              onDelete={handleDeleteEvent}
            />
          ))}
        </div>

      <div className={styles.divider} onMouseDown={startResize('left')}>
        <div className={styles.dividerHandle} />
      </div>

        <EventDetailsPanel
          ref={detailsPanelRef}
          selectedEvent={selectedEvent}
          handleDeleteEvent={handleDeleteEvent}
          isFullWidth={isScreenshotPanelHidden}
        />

      {!isScreenshotPanelHidden && (
        <>
          <div className={styles.divider} onMouseDown={startResize('right')}>
            <div className={styles.dividerHandle} />
          </div>

          <ScreenshotPanel
            ref={screenshotPanelRef}
            selectedEvent={selectedEvent}
            selectedScreenshot={selectedScreenshot}
            screenshotStatus={screenshotStatus}
            handleRetakeScreenshot={handleRetakeScreenshot}
            handleDeleteScreenshot={handleDeleteScreenshot}
            rightPanelWidth={rightPanelWidth}
          />
        </>
      )}

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