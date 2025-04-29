import React from 'react';
import journeyStyles from '@/styles/components/journey-modal.module.css';
import { TrashIcon, EditIcon } from '../icons/AnalyticsIcons';

const JourneyModal = ({
  showJourneyModal,
  handleCloseModal,
  journeys,
  selectedJourneyId,
  journeyName,
  setJourneyName,
  selectedEvents,
  events,
  collapsedScreens,
  setCollapsedScreens,
  toggleEventSelection,
  handleSaveJourney,
  handleSelectExistingJourney,
  handleDeleteJourney,
  handleRemoveEventFromJourney,
  groupEventsByScreen,
  isBulkEditMode,
  setIsBulkEditMode,
  selectedJourneyIds,
  setSelectedJourneyIds,
  selectedEventIds,
  setSelectedEventIds,
  handleBulkAssignEvents,
  handleBulkClearJourneys,
  handleBulkDelete,
  handleCreateNewJourney,
  getJourneyColor
}) => {
  const handleSelectAllJourneys = () => {
    setSelectedJourneyIds(new Set(journeys.map(j => j.id)));
  };

  const handleUnselectAllJourneys = () => {
    setSelectedJourneyIds(new Set());
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

  if (!showJourneyModal) return null;

  return (
    <div className={journeyStyles.modalOverlay} onClick={handleCloseModal}>
      <div className={journeyStyles.modal} onClick={e => e.stopPropagation()}>
        <div className={journeyStyles.modalHeader}>
          <h2 className={journeyStyles.modalTitle}>Journey Management</h2>
          <div className={journeyStyles.modalActions}>
            <button 
              className={`${journeyStyles.button} ${journeyStyles.secondaryButton} ${journeyStyles.smallButton}`}
              onClick={() => setIsBulkEditMode(!isBulkEditMode)}
            >
              {isBulkEditMode ? 'Exit Bulk Edit' : 'Bulk Edit'}
            </button>
            <button className={journeyStyles.modalClose} onClick={handleCloseModal}>×</button>
          </div>
        </div>
        <div className={journeyStyles.modalContent}>
          {/* Left side - Journey List */}
          <div className={journeyStyles.journeysList}>
            <div className={journeyStyles.journeyListHeader}>
              {isBulkEditMode ? (
                <div className={journeyStyles.bulkActions}>
                  <button 
                    className={`${journeyStyles.button} ${journeyStyles.secondaryButton} ${journeyStyles.smallButton}`}
                    onClick={handleSelectAllJourneys}
                  >
                    Select All Journeys
                  </button>
                  <button 
                    className={`${journeyStyles.button} ${journeyStyles.secondaryButton} ${journeyStyles.smallButton}`}
                    onClick={handleUnselectAllJourneys}
                  >
                    Unselect All Journeys
                  </button>
                  <button 
                    className={`${journeyStyles.button} ${journeyStyles.dangerButton} ${journeyStyles.smallButton}`}
                    onClick={handleBulkDelete}
                    disabled={selectedJourneyIds.size === 0}
                  >
                    Delete Selected ({selectedJourneyIds.size})
                  </button>
                </div>
              ) : (
                <button 
                  className={journeyStyles.addJourneyButton} 
                  onClick={handleCreateNewJourney}
                >
                  + Create New Journey
                </button>
              )}
            </div>

            {journeys.map((journey) => (
              <div 
                key={journey.id}
                className={`${journeyStyles.journeyCard} ${selectedJourneyId === journey.id ? journeyStyles.selected : ''} ${selectedJourneyIds.has(journey.id) ? journeyStyles.bulkSelected : ''}`}
                onClick={(e) => isBulkEditMode ? handleToggleJourneySelection(journey.id, e) : handleSelectExistingJourney(journey.id)}
              >
                <h3 className={journeyStyles.journeyName}>{journey.name}</h3>
                <div className={journeyStyles.journeyMeta}>
                  {journey.events.length} events • {journey.updatedAt 
                    ? `Updated ${new Date(journey.updatedAt).toLocaleDateString()}`
                    : `Created ${new Date(journey.createdAt).toLocaleDateString()}`
                  }
                </div>
                {!isBulkEditMode && (
                  <div className={journeyStyles.journeyActions}>
                    <button 
                      className={journeyStyles.actionButton} 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectExistingJourney(journey.id);
                      }}
                      title="Edit journey"
                    >
                      <EditIcon />
                    </button>
                    <button 
                      className={journeyStyles.actionButton}
                      onClick={(e) => handleDeleteJourney(journey.id, e)}
                      title="Delete journey"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right side - Journey Form and Events */}
          <div className={journeyStyles.journeyContent}>
            {isBulkEditMode ? (
              <div className={journeyStyles.bulkActions}>
                <div className={journeyStyles.bulkActionRow}>
                  <button 
                    className={`${journeyStyles.button} ${journeyStyles.secondaryButton} ${journeyStyles.smallButton}`}
                    onClick={() => setSelectedEventIds(new Set(events.map(e => e.id)))}
                  >
                    Select All Events
                  </button>
                  <button 
                    className={`${journeyStyles.button} ${journeyStyles.secondaryButton} ${journeyStyles.smallButton}`}
                    onClick={() => setSelectedEventIds(new Set())}
                  >
                    Unselect All Events
                  </button>
                  <button 
                    className={`${journeyStyles.button} ${journeyStyles.primaryButton} ${journeyStyles.smallButton}`}
                    onClick={handleBulkAssignEvents}
                    disabled={selectedEventIds.size === 0 || selectedJourneyIds.size === 0}
                  >
                    Assign to Selected Journey ({selectedEventIds.size} events)
                  </button>
                  <button 
                    className={`${journeyStyles.button} ${journeyStyles.dangerButton} ${journeyStyles.smallButton}`}
                    onClick={handleBulkClearJourneys}
                    disabled={selectedEventIds.size === 0}
                  >
                    Clear All Journeys ({selectedEventIds.size} events)
                  </button>
                </div>
              </div>
            ) : (
              <div className={journeyStyles.journeyForm}>
                <input
                  type="text"
                  className={journeyStyles.journeyNameInput}
                  placeholder={selectedJourneyId ? "Edit journey name..." : "Enter new journey name..."}
                  value={journeyName}
                  onChange={e => setJourneyName(e.target.value)}
                />
              </div>
            )}

            <div className={journeyStyles.eventsList}>
              {Object.entries(groupEventsByScreen(events)).map(([groupKey, groupEvents], groupIndex) => {
                const screenId = `screen-${groupIndex}`;
                const isCollapsed = collapsedScreens[screenId];
                const screenName = groupEvents[0].screenName;
                const allScreenEventsSelected = groupEvents.every(event => 
                  isBulkEditMode
                    ? selectedEventIds.has(event.id)
                    : selectedEvents.includes(event.id)
                );
                const someScreenEventsSelected = groupEvents.some(event => 
                  isBulkEditMode
                    ? selectedEventIds.has(event.id)
                    : selectedEvents.includes(event.id)
                );

                return (
                  <div key={screenId} className={journeyStyles.screenGroup}>
                    <div 
                      className={journeyStyles.screenHeader}
                      onClick={() => setCollapsedScreens(prev => ({
                        ...prev,
                        [screenId]: !prev[screenId]
                      }))}
                    >
                      <div className={journeyStyles.screenName}>
                        <div 
                          className={journeyStyles.screenCheckbox}
                          onClick={e => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={allScreenEventsSelected}
                            ref={input => {
                              if (input) {
                                input.indeterminate = someScreenEventsSelected && !allScreenEventsSelected;
                              }
                            }}
                            onChange={(e) => {
                              if (isBulkEditMode) {
                                const newSelection = new Set(selectedEventIds);
                                groupEvents.forEach(event => {
                                  if (allScreenEventsSelected) {
                                    newSelection.delete(event.id);
                                  } else {
                                    newSelection.add(event.id);
                                  }
                                });
                                setSelectedEventIds(newSelection);
                              } else {
                                const newSelectedEvents = [...selectedEvents];
                                groupEvents.forEach(event => {
                                  const eventIndex = newSelectedEvents.indexOf(event.id);
                                  if (allScreenEventsSelected) {
                                    if (eventIndex > -1) {
                                      newSelectedEvents.splice(eventIndex, 1);
                                    }
                                  } else {
                                    if (eventIndex === -1) {
                                      newSelectedEvents.push(event.id);
                                    }
                                  }
                                });
                                toggleEventSelection(newSelectedEvents);
                              }
                            }}
                          />
                        </div>
                        <span className={journeyStyles.screenNameText}>
                          {screenName} ({groupEvents.length} events)
                        </span>
                      </div>
                      <div className={journeyStyles.collapseIcon}>{isCollapsed ? '▸' : '▾'}</div>
                    </div>

                    {!isCollapsed && (
                      <div className={journeyStyles.screenEvents}>
                        {groupEvents.map((event) => {
                          const isSelected = isBulkEditMode
                            ? selectedEventIds.has(event.id)
                            : selectedEvents.includes(event.id);

                          return (
                            <div key={event.id} className={journeyStyles.eventItem}>
                              <input
                                type="checkbox"
                                className={journeyStyles.eventCheckbox}
                                checked={isSelected}
                                onChange={() => {
                                  if (isBulkEditMode) {
                                    setSelectedEventIds(prev => {
                                      const newSelection = new Set(prev);
                                      if (isSelected) {
                                        newSelection.delete(event.id);
                                      } else {
                                        newSelection.add(event.id);
                                      }
                                      return newSelection;
                                    });
                                  } else {
                                    toggleEventSelection(event.id);
                                  }
                                }}
                              />
                              <div className={journeyStyles.eventInfo}>
                                <div className={journeyStyles.eventNameRow}>
                                  <div className={journeyStyles.eventNameAndId}>
                                    {event.eventName || event.type || 'Unknown Event'}
                                    <span className={journeyStyles.beaconId}>{event.beaconId}</span>
                                  </div>
                                  {event.journeys?.length > 0 && (
                                    <div className={journeyStyles.eventJourneys}>
                                      {event.journeys.map(j => (
                                        <span 
                                          key={j.id}
                                          className={journeyStyles.journeyTag}
                                          style={{ backgroundColor: getJourneyColor(j.name) }}
                                        >
                                          {j.name}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={journeyStyles.modalFooter}>
          <button 
            className={`${journeyStyles.button} ${journeyStyles.secondaryButton}`}
            onClick={handleCloseModal}
          >
            Cancel
          </button>
          {!isBulkEditMode && (
            <button 
              className={`${journeyStyles.button} ${journeyStyles.primaryButton}`}
              onClick={handleSaveJourney}
              disabled={!journeyName.trim() || (!selectedJourneyId && selectedEvents.length === 0)}
            >
              {selectedJourneyId ? 'Update Journey' : 'Create Journey'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default JourneyModal; 