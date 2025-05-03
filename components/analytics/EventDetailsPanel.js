import React, { useState, forwardRef } from 'react';
import styles from '@/styles/components/unified-analytics-debugger.module.css';
import { TrashIcon } from '../icons/AnalyticsIcons';
import { separateParameters, extractItems } from '@/lib/event-parameter-utils';
import { isEcommerceParameter } from '@/lib/beacon-utils';
import { parseLogcatParameters, cleanEventName } from '@/lib/ga4-analytics-parser'; 
import EcommerceCard from './EcommerceCard';

const EventDetailsPanel = forwardRef(({ selectedEvent, handleDeleteEvent, isFullWidth }, ref) => {
  const [expandedSections, setExpandedSections] = useState({
    basicInfo: false,
    parameters: true,
    eCommerce: true,
    userProperties: true,
    rawData: false,
    uiXml: false,
    interactions: true
  });

  if (!selectedEvent) {
    return (
      <div ref={ref} className={`${styles.eventDetails} ${isFullWidth ? styles.fullWidth : ''}`}>
        <div className={styles.noEventSelected}>
          <p>No event selected</p>
          <p>Select an event from the list to view details</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className={`${styles.eventDetails} ${isFullWidth ? styles.fullWidth : ''}`}>
      <div className={styles.eventDetailsHeader}>
        <div className={styles.eventDetailsTitle}>
          {selectedEvent.eventName}
        </div>
        <button
          className={styles.deleteEventButton}
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteEvent(selectedEvent, e);
          }}
          title="Delete event"
        >
          <TrashIcon />
        </button>
      </div>

      <div className={styles.eventDetailsContent}>
        <div className={styles.section}>
          <div 
            className={`${styles.sectionHeader} ${expandedSections.basicInfo ? styles.expanded : ''}`}
            onClick={() => setExpandedSections(prev => ({
              ...prev,
              basicInfo: !prev.basicInfo
            }))}
          >
            <h3>Basic Information</h3>
            <span>{expandedSections.basicInfo ? '−' : '+'}</span>
          </div>
          <div className={styles.sectionContent}>
            <div className={styles.parametersTable}>
              <div className={styles.parametersHeader}>
                <div className={styles.paramNumber}>#</div>
                <div className={styles.paramName}>FIELD</div>
                <div className={styles.paramValue}>VALUE</div>
              </div>
              <div className={styles.parameterRow}>
                <div className={styles.paramNumber}>#1</div>
                <div className={styles.paramName}>Source</div>
                <div className={styles.paramValue}>{selectedEvent.source}</div>
              </div>
              <div className={styles.parameterRow}>
                <div className={styles.paramNumber}>#2</div>
                <div className={styles.paramName}>Type</div>
                <div className={styles.paramValue}>{selectedEvent.analyticsType || 'GA4'}</div>
              </div>
              <div className={styles.parameterRow}>
                <div className={styles.paramNumber}>#3</div>
                <div className={styles.paramName}>Beacon ID</div>
                <div className={styles.paramValue}>{selectedEvent.beaconId}</div>
              </div>
              <div className={styles.parameterRow}>
                <div className={styles.paramNumber}>#4</div>
                <div className={styles.paramName}>Timestamp</div>
                <div className={styles.paramValue}>{selectedEvent.timestamp}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div 
            className={`${styles.sectionHeader} ${expandedSections.parameters ? styles.expanded : ''}`}
            onClick={() => setExpandedSections(prev => ({
              ...prev,
              parameters: !prev.parameters
            }))}
          >
            <h3>Parameters</h3>
            <span>{expandedSections.parameters ? '−' : '+'}</span>
          </div>
          <div className={styles.sectionContent}>
            {(() => {
              const { general } = separateParameters(selectedEvent.parameters || {});
              
              if (Object.keys(general).length === 0) {
                return <div className={styles.noData}>No general parameters available</div>;
              }
              
              return (
                <div className={styles.parametersTable}>
                  <div className={styles.parametersHeader}>
                    <div className={styles.paramNumber}>#</div>
                    <div className={styles.paramName}>PARAMETER NAME</div>
                    <div className={styles.paramValue}>VALUE</div>
                  </div>
                  {Object.entries(general).map(([key, value], index) => (
                    <div key={index} className={styles.parameterRow}>
                      <div className={styles.paramNumber}>#{index + 1}</div>
                      <div className={styles.paramName}>{key}</div>
                      <div className={styles.paramValue}>
                        {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        {(() => {
          // Determine if there's eCommerce data to display
          const hasEcommerceData = (() => {
            if (selectedEvent.source === 'logcat') {
              const params = parseLogcatParameters(selectedEvent.message) || {};
              // Check both for items array and common eCommerce event names
              return (
                (params.items && Array.isArray(params.items) && params.items.length > 0) ||
                params.value !== undefined ||
                /add_to_cart|remove_from_cart|begin_checkout|purchase|view_item|select_item/.test(selectedEvent.eventName || selectedEvent.message || '')
              );
            } else {
              const items = extractItems(selectedEvent.parameters || {});
              return items.length > 0 || 
                (selectedEvent.parameters?.value !== undefined) ||
                /add_to_cart|remove_from_cart|begin_checkout|purchase|view_item|select_item/.test(selectedEvent.eventName || '');
            }
          })();

          // Only render the eCommerce section if there's data
          if (!hasEcommerceData) return null;

          return (
            <div className={styles.section}>
              <div 
                className={`${styles.sectionHeader} ${expandedSections.eCommerce ? styles.expanded : ''}`}
                onClick={() => setExpandedSections(prev => ({
                  ...prev,
                  eCommerce: !prev.eCommerce
                }))}
              >
                <h3>eCommerce</h3>
                <span>{expandedSections.eCommerce ? '−' : '+'}</span>
              </div>
              <div className={styles.sectionContent}>
                {(() => {
                  // For logcat events
                  if (selectedEvent.source === 'logcat') {
                    const params = parseLogcatParameters(selectedEvent.message) || {};
                    const items = extractItems(params);
                    const { ecommerce } = separateParameters(params);

                    const ecommerceData = {
                      eventName: selectedEvent.message?.includes('Logging event:') 
                        ? cleanEventName(selectedEvent.message.match(/name=([^,]+)/)?.[1]) 
                        : 'Analytics Event',
                      couponCode: ecommerce.coupon || ecommerce.promotion_code || 'N/A',
                      currency: ecommerce.currency || 'USD',
                      uniqueProductsCount: items.length,
                      totalItemsCount: items.reduce((acc, item) => acc + (parseInt(item.quantity) || 1), 0),
                      orderTotal: items.reduce((acc, item) => acc + ((parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1)), 0).toFixed(2),
                      items: items.map(item => ({
                        ...item,
                        item_customized: ecommerce.item_customized,
                        item_discounted: ecommerce.item_discounted,
                        item_customization_amount: ecommerce.item_customization_amount,
                        discount: ecommerce.discount,
                        in_stock: ecommerce.in_stock,
                        custom_attributes: Object.entries(ecommerce)
                          .filter(([key]) => !isEcommerceParameter(key))
                          .map(([label, value]) => ({ label, value }))
                      }))
                    };

                    return <EcommerceCard data={ecommerceData} />;
                  }
                  
                  // For proxy/network events
                  const items = extractItems(selectedEvent.parameters || {});
                  const { ecommerce } = separateParameters(selectedEvent.parameters || {});

                  const ecommerceData = {
                    eventName: selectedEvent.eventName || 'Analytics Event',
                    couponCode: ecommerce.coupon || ecommerce.promotion_code || 'N/A',
                    currency: ecommerce.currency || 'USD',
                    uniqueProductsCount: items.length,
                    totalItemsCount: items.reduce((acc, item) => acc + (parseInt(item.quantity) || 1), 0),
                    orderTotal: items.reduce((acc, item) => acc + ((parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1)), 0).toFixed(2),
                    items: items.map(item => ({
                      ...item,
                      item_customized: ecommerce.item_customized,
                      item_discounted: ecommerce.item_discounted,
                      item_customization_amount: ecommerce.item_customization_amount,
                      discount: ecommerce.discount,
                      in_stock: ecommerce.in_stock,
                      custom_attributes: Object.entries(ecommerce)
                        .filter(([key]) => !isEcommerceParameter(key))
                        .map(([label, value]) => ({ label, value }))
                    }))
                  };

                  return <EcommerceCard data={ecommerceData} />;
                })()}
              </div>
            </div>
          );
        })()}

        <div className={styles.section}>
          <div 
            className={`${styles.sectionHeader} ${expandedSections.rawData ? styles.expanded : ''}`}
            onClick={() => setExpandedSections(prev => ({
              ...prev,
              rawData: !prev.rawData
            }))}
          >
            <h3>Raw Data</h3>
            <span>{expandedSections.rawData ? '−' : '+'}</span>
          </div>
          <div className={styles.sectionContent}>
            <div className={styles.rawDataContainer}>
              <div className={styles.rawDataHeader}>
                <span>Raw network request</span>
                <button 
                  className={styles.copyButton}
                  onClick={() => {
                    const rawData = selectedEvent.source === 'logcat' 
                      ? selectedEvent.message 
                      : JSON.stringify(selectedEvent, null, 2);
                    navigator.clipboard.writeText(rawData);
                  }}
                >
                  Copy
                </button>
              </div>
              <div className={styles.rawData}>
                <pre>
                  {selectedEvent.source === 'logcat' 
                    ? selectedEvent.message 
                    : JSON.stringify(selectedEvent, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* UI XML Section */}
        {selectedEvent?.uiXml && (
          <div className={styles.section}>
            <div 
              className={`${styles.sectionHeader} ${expandedSections.uiXml ? styles.expanded : ''}`}
              onClick={() => setExpandedSections(prev => ({
                ...prev,
                uiXml: !prev.uiXml
              }))}
            >
              <h3>UI XML Structure</h3>
              <span>{expandedSections.uiXml ? '−' : '+'}</span>
            </div>
            <div className={styles.sectionContent}>
              <div className={styles.rawDataContainer}>
                <div className={styles.rawDataHeader}>
                  <span>UI Hierarchy XML</span>
                  <button 
                    className={styles.copyButton}
                    onClick={() => {
                      navigator.clipboard.writeText(selectedEvent.uiXml);
                    }}
                  >
                    Copy
                  </button>
                </div>
                <div className={styles.rawData}>
                  <pre>{selectedEvent.uiXml}</pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* User Interactions Section */}
        {selectedEvent?.interactions && selectedEvent.interactions.length > 0 && (
          <div className={styles.section}>
            <div 
              className={`${styles.sectionHeader} ${expandedSections.interactions ? styles.expanded : ''}`}
              onClick={() => setExpandedSections(prev => ({
                ...prev,
                interactions: !prev.interactions
              }))}
            >
              <h3>User Interactions</h3>
              <span>{expandedSections.interactions ? '−' : '+'}</span>
            </div>
            <div className={styles.sectionContent}>
              <div className={styles.interactionsContainer}>
                {selectedEvent.interactions.map((interaction, index) => (
                  <div key={index} className={styles.interactionCard}>
                    <div className={styles.interactionHeader}>
                      <span className={styles.interactionType}>{interaction.type}</span>
                      <span className={styles.interactionTime}>
                        {new Date(interaction.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className={styles.interactionDetails}>
                      <div className={styles.interactionCoordinates}>
                        <div className={styles.coordinateField}>
                          <span className={styles.coordinateLabel}>Start:</span>
                          <span className={styles.coordinateValue}>
                            X: {interaction.startX}, Y: {interaction.startY}
                          </span>
                        </div>
                        <div className={styles.coordinateField}>
                          <span className={styles.coordinateLabel}>End:</span>
                          <span className={styles.coordinateValue}>
                            X: {interaction.endX}, Y: {interaction.endY}
                          </span>
                        </div>
                      </div>
                      <div className={styles.interactionMetrics}>
                        <div className={styles.metricField}>
                          <span className={styles.metricLabel}>Distance:</span>
                          <span className={styles.metricValue}>{Math.round(interaction.distance)} px</span>
                        </div>
                        <div className={styles.metricField}>
                          <span className={styles.metricLabel}>Duration:</span>
                          <span className={styles.metricValue}>{interaction.duration} ms</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* End of User Interactions Section */}
      </div>
    </div>
  );
});

EventDetailsPanel.displayName = 'EventDetailsPanel';

export default EventDetailsPanel;