import React from 'react';
import styles from '@/styles/components/unified-analytics-debugger.module.css';
import { ShoppingCartIcon } from '../icons/AnalyticsIcons';
import { cleanEventName } from '@/lib/ga4-analytics-parser';
import { parseLogcatParameters } from '@/lib/ga4-analytics-parser';
import { extractItems } from '@/lib/event-parameter-utils';

const EventCard = ({ 
  event, 
  index, 
  journeys, 
  isSelected, 
  onSelect, 
  onRemoveJourney,
  getJourneyColor,
  filteredEvents
}) => {
  const validJourneys = (event.journeys || []).filter(eventJourney => 
    journeys.some(j => j.id === eventJourney.id)
  );
  
  const hasEcommerceData = (() => {
    if (event.source === 'logcat') {
      const params = parseLogcatParameters(event.message) || {};
      // Check both for items array and common eCommerce event names
      return (
        (params.items && Array.isArray(params.items) && params.items.length > 0) ||
        params.value !== undefined ||
        /add_to_cart|remove_from_cart|begin_checkout|purchase|view_item|select_item/.test(event.eventName || event.message || '')
      );
    } else {
      const items = extractItems(event.parameters || {});
      return items.length > 0 || 
        (event.parameters?.value !== undefined) ||
        /add_to_cart|remove_from_cart|begin_checkout|purchase|view_item|select_item/.test(event.eventName || '');
    }
  })();

  const analyticsType = (() => {
    if (event.analyticsType) return event.analyticsType;
    if (event.source === 'logcat' && (event.message?.includes('/b/ss/') || event.message?.includes('s.t') || event.message?.includes('s.tl'))) return 'Adobe';
    return 'GA4';
  })();

  const isAdobeTrackingEvent = event.type === 's.t' || event.type === 's.tl' || 
    (event.message && (event.message.includes('s.t') || event.message.includes('s.tl')));
  
  return (
    <div
      key={event.id}
      className={`${styles.eventCard} ${isSelected ? styles.selected : ''}`}
      onClick={() => onSelect(event)}
      data-event-number={filteredEvents.length - index}
      data-analytics-type={analyticsType}
      data-adobe-tracking={isAdobeTrackingEvent}
    >
      {validJourneys.length > 0 && (
        <div className={styles.journeyTags}>
          {validJourneys.map((journey) => (
            <div
              key={journey.id}
              className={styles.journeyTag}
              style={{ backgroundColor: getJourneyColor(journey.name) }}
            >
              {journey.name}
              <div 
                className={styles.journeyTagClose}
                onClick={(e) => onRemoveJourney(event.id, journey.id, e)}
                title="Remove from journey"
              >
                ×
              </div>
            </div>
          ))}
        </div>
      )}

      {hasEcommerceData && (
        <div className={styles.ecommerceTab} title="Contains eCommerce data">
          <ShoppingCartIcon />
        </div>
      )}

      {/* Row 1: Event name */}
      <div className={styles.eventNameRow}>
        {event.source === 'logcat'
          ? (event.message?.includes('Logging event:') 
              ? cleanEventName(event.message.match(/name=([^,]+)/)?.[1]) || 'Unknown Event'
              : 'Analytics Event')
          : cleanEventName(event.eventName || event.type) || 'Unknown Event'}
      </div>

      {/* Row 2: Screen/Page name */}
      <div className={styles.eventPageRow}>
        {event.source === 'logcat' 
          ? (event.message?.includes('/b/ss/') 
              ? event.pageName || 'Unknown Page'
              : (parseLogcatParameters(event.message)?.ga_screen || 'Unknown Page'))
          : (event.analyticsType === 'adobe' 
              ? event.pageName || 'Unknown Page'
              : event.parameters?.ga_screen || event.parameters?.screen_name || 'Unknown Page')}
      </div>

      {/* Row 3: Metadata */}
      <div className={styles.eventMetadataRow}>
        <span className={styles.beaconId}>{event.beaconId}</span>
        <span className={styles.eventTime}>
          {new Date(event.timestamp).toLocaleTimeString([], { 
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
          })}
        </span>
      </div>
    </div>
  );
};

export default EventCard; 