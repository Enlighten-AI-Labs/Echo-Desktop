import React from 'react';
import styles from '@/styles/pages/debugger.module.css';

export default function AiAnalysisPanel({ aiAnalysis, expanded, onToggle }) {
  if (!expanded) return null;

  return (
    <div className={styles.aiPanelContainer}>
      <div className={styles.aiPanelHeader}>AI Analysis</div>
      <div className={styles.aiPanelBody}>
        {aiAnalysis ? (
          <>
            <div className={styles.aiTimestamp}>
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            
            <h3 className={styles.progressTitle}>
              Progress: {aiAnalysis.progressSummary?.type || 'Retail & E-Commerce - Product Search & Filtering'}
            </h3>
            <div className={styles.progressIndicator}>
              <span className={styles.progressBadge}>
                Step {aiAnalysis.progressSummary?.currentStep || 1} of {aiAnalysis.progressSummary?.totalSteps || 8}
              </span>
              <span className={styles.progressText}>
                {aiAnalysis.progressSummary?.progressPercent || 13}% Complete
              </span>
            </div>
            
            {aiAnalysis.nextSteps && aiAnalysis.nextSteps.length > 0 ? (
              <div className={styles.stepsSection}>
                <h3 className={styles.stepsTitle}>Next Steps</h3>
                
                {aiAnalysis.nextSteps.map((step, index) => (
                  <div key={index} className={styles.stepItem}>
                    <div className={styles.stepHeader}>Step {index + 1}:</div>
                    <div className={styles.stepContent}>{step.description}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.stepsSection}>
                <h3 className={styles.stepsTitle}>Next Steps</h3>
                <div className={styles.stepItem}>
                  <div className={styles.stepHeader}>Step 1:</div>
                  <div className={styles.stepContent}>Locate and tap the search bar.</div>
                </div>
                <div className={styles.stepItem}>
                  <div className={styles.stepHeader}>Step 2:</div>
                  <div className={styles.stepContent}>Enter search terms for various products.</div>
                </div>
                <div className={styles.stepItem}>
                  <div className={styles.stepHeader}>Step 3:</div>
                  <div className={styles.stepContent}>Examine search results for relevance.</div>
                </div>
              </div>
            )}
            
            {aiAnalysis.recommendedElements && aiAnalysis.recommendedElements.length > 0 ? (
              <div className={styles.elementsSection}>
                <h3>Recommended Elements to Click</h3>
                
                {aiAnalysis.recommendedElements.map((element, index) => (
                  <div key={index} className={styles.elementCard}>
                    <div className={styles.elementHeader}>
                      <span className={styles.elementId}>{element.id || index + 85}</span>
                      <span className={styles.elementType}>{element.type || 'android.view.View'}</span>
                    </div>
                    <div className={styles.elementName}>"{element.text || `Element ${index + 1}`}"</div>
                    <div className={styles.elementDescription}>{element.reason || 'This element may help with navigation.'}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.elementsSection}>
                <h3>Recommended Elements to Click</h3>
                <div className={styles.elementCard}>
                  <div className={styles.elementHeader}>
                    <span className={styles.elementId}>85</span>
                    <span className={styles.elementType}>android.view.View</span>
                  </div>
                  <div className={styles.elementName}>"Home"</div>
                  <div className={styles.elementDescription}>Navigating to the Home screen is a common strategy to find a search bar, as it's often located there.</div>
                </div>
                <div className={styles.elementCard}>
                  <div className={styles.elementHeader}>
                    <span className={styles.elementId}>20</span>
                    <span className={styles.elementType}>android.view.View</span>
                  </div>
                  <div className={styles.elementName}>"Digital Exclusives"</div>
                  <div className={styles.elementDescription}>Navigating into a category might show products, but won't directly help find the main search bar.</div>
                </div>
                <div className={styles.elementCard}>
                  <div className={styles.elementHeader}>
                    <span className={styles.elementId}>20</span>
                    <span className={styles.elementType}>android.view.View</span>
                  </div>
                  <div className={styles.elementName}>"Limited Time Only"</div>
                  <div className={styles.elementDescription}>Navigating into a category might show products, but won't directly help find the main search bar.</div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className={styles.emptyState}>
            No AI analysis available yet. Start crawling to see AI recommendations.
          </div>
        )}
      </div>
      
      <div className={styles.controlButtons}>
        <button className={`${styles.aiButton} ${styles.primary}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          AI
        </button>
        <button className={`${styles.aiButton} ${styles.danger}`} onClick={onToggle}>
          Stop Crawling
        </button>
      </div>
    </div>
  );
}