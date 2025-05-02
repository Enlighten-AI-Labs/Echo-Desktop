import React from 'react';
import styles from '@/styles/pages/debugger.module.css';

export default function AiAnalysisPanel({ aiAnalysis, expanded, onToggle }) {
  return (
    <div className={styles.aiPanelContainer}>
      {/* Toggle button that's always visible */}

      {/* Collapsible panel content */}
      <div className={`${styles.aiPanelContent} ${expanded ? styles.aiPanelExpanded : styles.aiPanelCollapsed}`}>
        <div className={styles.aiPanelHeader}>
          <h3>AI Analysis</h3>
        </div>
        
        <div className={styles.aiPanelBody}>
          {aiAnalysis && aiAnalysis.timestamp ? (
            <>
              <div className={styles.aiTimestamp}>
                {new Date(aiAnalysis.timestamp).toLocaleTimeString()}
              </div>
              
              {aiAnalysis.progressSummary && (
                <div className={styles.progressSection}>
                  <h4>Progress: {aiAnalysis.progressSummary.type}</h4>
                  <div className={styles.progressBar}>
                    <div 
                      className={styles.progressFill}
                      style={{ width: `${aiAnalysis.progressSummary.progressPercent}%` }}
                    />
                    <span>
                      Step {aiAnalysis.progressSummary.currentStep} of {aiAnalysis.progressSummary.totalSteps} 
                      ({aiAnalysis.progressSummary.progressPercent}%)
                    </span>
                  </div>
                </div>
              )}
              
              {aiAnalysis.nextSteps && aiAnalysis.nextSteps.length > 0 && (
                <div className={styles.nextStepsSection}>
                  <h4>Next Steps</h4>
                  <div className={styles.nextStepsList}>
                    {aiAnalysis.nextSteps.map((step, index) => (
                      <div key={index} className={`${styles.nextStepItem} ${index === 0 ? styles.currentStep : ''}`}>
                        <span className={styles.stepNumber}>Step {index + 1}:</span> {step}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {aiAnalysis.topElements && aiAnalysis.topElements.length > 0 && (
                <div className={styles.topElementsSection}>
                  <h4>Recommended Elements to Click</h4>
                  <div className={styles.elementList}>
                    {aiAnalysis.topElements.map((element, index) => (
                      <div key={index} className={styles.elementItem}>
                        <div className={styles.elementHeader}>
                          <span className={styles.elementScore}>{element.score}</span>
                          <span className={styles.elementClass}>{element.class}</span>
                        </div>
                        {element.text && (
                          <div className={styles.elementText}>"{element.text}"</div>
                        )}
                        <div className={styles.elementReasoning}>{element.reasoning}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className={styles.aiProgressEmpty}>
              Waiting for AI analysis...
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 