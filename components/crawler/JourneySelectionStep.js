import React from 'react';
import styles from './AiPromptModal.module.css';

const JourneySelectionStep = ({ 
  selectedVertical, 
  selectedJourneys, 
  onSelectJourney, 
  verticalPrompts 
}) => {
  if (!selectedVertical || !verticalPrompts[selectedVertical]) {
    return (
      <div className={styles.journeySelectionStep}>
        <h3>Select Journey</h3>
        <div className={styles.emptyJourneyList}>
          <p>No vertical selected or no journeys available for this vertical. Please go back and select a different vertical.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.journeySelectionStep}>
      <h3>Select {selectedVertical} Journey</h3>
      <p>Select one or more journeys you want the AI to focus on.</p>
      
      <div className={styles.journeyList}>
        {verticalPrompts[selectedVertical].map((journey, index) => (
          <div 
            key={index}
            className={`${styles.journeyItem} ${selectedJourneys.some(j => j.name === journey.name) ? styles.selectedJourney : ''}`}
            onClick={() => onSelectJourney(journey)}
          >
            <div className={styles.journeyHeader}>
              <div className={styles.journeyName}>{journey.name}</div>
              <button 
                className={styles.viewPromptButton}
                onClick={(e) => {
                  e.stopPropagation(); // Prevent the journeyItem click from firing
                  onSelectJourney(journey, true); // true indicates view prompt action
                }}
              >
                View Prompt
              </button>
            </div>
            <div className={styles.journeyDescription}>{journey.description}</div>
          </div>
        ))}
        
        {(!verticalPrompts[selectedVertical] || verticalPrompts[selectedVertical].length === 0) && (
          <div className={styles.emptyJourneyList}>
            <p>No journeys available for this vertical yet. Please go back and select a different vertical.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default JourneySelectionStep; 