import React, { useState, useEffect, useRef } from 'react';
import styles from './AiPromptModal.module.css';
import VerticalSelectionStep from './VerticalSelectionStep';
import JourneySelectionStep from './JourneySelectionStep';
import PromptEditorStep from './PromptEditorStep';
import verticalPrompts from './verticalPrompts';

// Helper function to check if arrays have the same items
const areArraysEqual = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  
  // For this use case, comparing by name property is sufficient
  // Sort both arrays to ensure consistent comparison
  const sortedA = [...a].sort((x, y) => x.name.localeCompare(y.name));
  const sortedB = [...b].sort((x, y) => x.name.localeCompare(y.name));
  
  return sortedA.every((item, index) => item.name === sortedB[index].name);
};

const AiPromptModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialPrompt = '',
  initialVertical = null,
  initialJourneys = []
}) => {
  const [step, setStep] = useState(1);
  const [selectedVertical, setSelectedVertical] = useState(initialVertical);
  const [selectedJourneys, setSelectedJourneys] = useState(initialJourneys);
  const [promptValue, setPromptValue] = useState(initialPrompt);
  
  // Use a ref to track if the initialization has happened
  const initialized = useRef(false);

  // Reset state when modal is opened
  useEffect(() => {
    // Only run this effect if the modal is being opened (went from closed to open)
    // or if it's the first render and the modal is open
    if (isOpen && (!initialized.current || 
        initialPrompt !== promptValue || 
        initialVertical !== selectedVertical || 
        !areArraysEqual(initialJourneys, selectedJourneys))) {
      
      // Update ref to mark that we've initialized
      initialized.current = true;
      
      // If we have initial values, use them
      if (initialVertical !== selectedVertical) {
        setSelectedVertical(initialVertical);
      }
      
      if (!areArraysEqual(initialJourneys, selectedJourneys)) {
        setSelectedJourneys(initialJourneys);
      }
      
      if (initialPrompt !== promptValue) {
        setPromptValue(initialPrompt);
      }
      
      // Go to appropriate step based on initial values
      if (initialVertical && initialJourneys.length > 0) {
        setStep(3); // Go directly to prompt editor
      } else if (initialVertical) {
        setStep(2); // Go to journey selection
      } else {
        setStep(1); // Start at vertical selection
      }
    }
  }, [isOpen]); // Only depend on isOpen, not on values that change frequently

  // Handle vertical selection
  const handleSelectVertical = (vertical) => {
    setSelectedVertical(vertical);
    // Remove automatic step advancement to step 2
    // Clear previous journey selections when changing vertical
    setSelectedJourneys([]);
  };

  // Handle journey selection
  const handleSelectJourney = (journey, viewPrompt = false) => {
    // Toggle selection
    setSelectedJourneys(prev => {
      const isAlreadySelected = prev.some(j => j.name === journey.name);
      
      if (isAlreadySelected) {
        return prev.filter(j => j.name !== journey.name);
      } else {
        return [...prev, journey];
      }
    });

    // If viewPrompt is true, go to the prompt editor step with this journey
    if (viewPrompt) {
      setSelectedJourneys([journey]);
      setPromptValue(journey.prompt);
      setStep(3);
    }
  };

  // Handle journey removal from the final step
  const handleRemoveJourney = (journey) => {
    setSelectedJourneys(prev => {
      const remaining = prev.filter(j => j.name !== journey.name);
      
      // If removing the last journey, go back to step 2
      if (remaining.length === 0) {
        setStep(2);
      } else {
        // Update the combined prompt
        const combinedPrompt = remaining.map(j => {
          return `[${j.name}]\n${j.prompt}`;
        }).join('\n\n');
        
        setPromptValue(combinedPrompt);
      }
      
      return remaining;
    });
  };

  // Navigation handlers
  const handleNext = () => {
    if (step === 2 && selectedJourneys.length === 0) {
      // Don't advance if no journeys are selected
      return;
    }

    if (step === 2 && selectedJourneys.length > 0) {
      // Prepare combined prompt for multiple journeys
      const combinedPrompt = selectedJourneys.map(journey => {
        return `[${journey.name}]\n${journey.prompt}`;
      }).join('\n\n');
      
      setPromptValue(combinedPrompt);
    }

    setStep(prevStep => Math.min(prevStep + 1, 3));
  };

  const handlePrev = () => {
    setStep(prevStep => Math.max(prevStep - 1, 1));
  };

  // Close modal handler
  const handleCancel = (e) => {
    // If clicked directly on the overlay, close the modal
    if (e && e.target === e.currentTarget) {
      onClose();
      return;
    }
    
    // If called directly from a button click or without an event
    onClose();
  };

  // Save handler - format the prompt based on selected content
  const handleSave = () => {
    let finalPrompt = promptValue;
    
    if (selectedVertical && selectedJourneys.length > 0) {
      const verticalName = selectedVertical;
      let journeyNames = selectedJourneys.map(journey => journey.name).join(", ");
      
      // If this is a multiple journey selection and not already formatted
      if (selectedJourneys.length > 1 && !promptValue.includes('[')) {
        finalPrompt = `[${verticalName} - Multiple Journeys: ${journeyNames}]\n\n${finalPrompt}`;
      } else if (selectedJourneys.length === 1 && !promptValue.includes('[')) {
        // Single journey case without formatting
        finalPrompt = `[${verticalName} - ${selectedJourneys[0].name}]\n\n${finalPrompt}`;
      }
    }
    
    onSave(finalPrompt);
  };

  // Don't render anything if modal is closed
  if (!isOpen) return null;

  return (
    <div className={styles.aiPromptModal} onClick={handleCancel}>
      <div className={styles.aiPromptContent} onClick={e => e.stopPropagation()}>
        <div className={styles.aiPromptHeader}>
          <h3>AI-Powered Crawling</h3>
          <button 
            className={styles.aiPromptClose}
            onClick={handleCancel}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        {/* Step indicator */}
        <div className={styles.stepIndicator}>
          <div className={`${styles.step} ${step === 1 ? styles.activeStep : ''}`}>
            <div className={styles.stepNumber}>1</div>
            <span>Select Vertical</span>
          </div>
          <div className={styles.stepDivider}></div>
          <div className={`${styles.step} ${step === 2 ? styles.activeStep : ''}`}>
            <div className={styles.stepNumber}>2</div>
            <span>Select Journey</span>
          </div>
          <div className={styles.stepDivider}></div>
          <div className={`${styles.step} ${step === 3 ? styles.activeStep : ''}`}>
            <div className={styles.stepNumber}>3</div>
            <span>Review Prompt</span>
          </div>
        </div>
        
        {/* Step content */}
        {step === 1 && (
          <VerticalSelectionStep 
            selectedVertical={selectedVertical} 
            onSelectVertical={handleSelectVertical} 
          />
        )}
        
        {step === 2 && (
          <JourneySelectionStep 
            selectedVertical={selectedVertical}
            selectedJourneys={selectedJourneys}
            onSelectJourney={handleSelectJourney}
            verticalPrompts={verticalPrompts}
          />
        )}
        
        {step === 3 && (
          <PromptEditorStep 
            selectedJourneys={selectedJourneys}
            promptValue={promptValue}
            onPromptChange={setPromptValue}
            onRemoveJourney={handleRemoveJourney}
          />
        )}
        
        {/* Navigation Footer */}
        <div className={styles.aiPromptButtons}>
          <button 
            className={`${styles.aiPromptButton} ${styles.cancel}`}
            onClick={handleCancel}
          >
            Cancel
          </button>
          
          {step > 1 && (
            <button 
              className={`${styles.aiPromptButton} ${styles.back}`}
              onClick={handlePrev}
            >
              ← Back
            </button>
          )}
          
          {step === 3 ? (
            <button 
              className={`${styles.aiPromptButton} ${styles.apply}`}
              onClick={handleSave}
              disabled={!promptValue.trim()}
            >
              Apply
            </button>
          ) : (
            <button 
              className={`${styles.aiPromptButton} ${styles.next}`}
              onClick={handleNext}
              disabled={
                (step === 1 && !selectedVertical) || 
                (step === 2 && selectedJourneys.length === 0)
              }
            >
              {step === 2 ? `Next (${selectedJourneys.length} selected) →` : 'Next →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AiPromptModal; 