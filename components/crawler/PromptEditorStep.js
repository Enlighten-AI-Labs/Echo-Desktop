import React from 'react';
import styles from './AiPromptModal.module.css';

const PromptEditorStep = ({ 
  selectedJourneys,
  promptValue,
  onPromptChange,
  onRemoveJourney
}) => {
  if (selectedJourneys.length === 0) {
    return (
      <div className={styles.promptEditorStep}>
        <h3>Edit Prompt</h3>
        <p>No journeys selected. Please go back and select at least one journey.</p>
      </div>
    );
  }
  
  return (
    <div className={styles.promptEditorStep}>
      <h3>Review and Edit Prompt</h3>
      <p>Review the AI crawler instructions or make any necessary adjustments.</p>
      
      {selectedJourneys.length > 1 ? (
        <div className={styles.multiJourneyPrompt}>
          <div className={styles.selectedJourneysHeader}>
            <span>Selected Journeys:</span> 
            <span className={styles.journeyCount}>{selectedJourneys.length}</span>
          </div>
          <div className={styles.selectedJourneysList}>
            {selectedJourneys.map((journey, index) => (
              <div key={index} className={styles.selectedJourneyItem}>
                <span>{journey.name}</span>
                <button 
                  className={styles.removeJourneyButton}
                  onClick={() => onRemoveJourney(journey)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.singleJourneyHeader}>
          <span>Selected Journey:</span>
          <span className={styles.journeyName}>{selectedJourneys[0]?.name}</span>
        </div>
      )}
      
      <textarea
        className={styles.aiPromptTextarea}
        value={promptValue}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="Enter your instructions for the AI..."
      />
    </div>
  );
};

export default PromptEditorStep; 