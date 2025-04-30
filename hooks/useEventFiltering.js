import { useState, useMemo } from 'react';
import { parseLogcatParameters } from '@/lib/ga4-analytics-parser';

export default function useEventFiltering(events) {
  // Filter state
  const [filter, setFilter] = useState('');
  const [filterText, setFilterText] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all', 'logcat', 'proxy'
  const [analyticsType, setAnalyticsType] = useState('all'); // 'all', 'google', 'adobe', 'firebase'

  // Filter events based on user input
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Filter by source
      if (sourceFilter !== 'all' && event.source !== sourceFilter) return false;

      // Filter by analytics type
      if (analyticsType !== 'all') {
        if (event.source === 'logcat') {
          if (analyticsType === 'adobe' && !event.message?.includes('/b/ss/')) return false;
          if (analyticsType === 'google' && !event.message?.includes('firebase')) return false;
        } else if (event.source === 'proxy') {
          if (analyticsType === 'adobe' && event.analyticsType !== 'adobe') return false;
          if (analyticsType === 'google' && event.analyticsType !== 'ga4') return false;
        }
      }

      // Filter by search text
      if (filter) {
        const searchText = filter.toLowerCase();
        return (
          event.eventName?.toLowerCase().includes(searchText) ||
          event.pageName?.toLowerCase().includes(searchText) ||
          event.message?.toLowerCase().includes(searchText) ||
          event.url?.toLowerCase().includes(searchText)
        );
      }

      // Filter by the new filter box - simplified to search across all fields
      if (filterText) {
        const searchText = filterText.toLowerCase();
        return (
          event.beaconId?.toLowerCase().includes(searchText) ||
          event.eventName?.toLowerCase().includes(searchText) ||
          (event.source === 'logcat' 
            ? (event.message?.includes('/b/ss/') 
                ? event.pageName?.toLowerCase().includes(searchText)
                : (parseLogcatParameters(event.message)?.ga_screen || '').toLowerCase().includes(searchText))
            : (event.analyticsType === 'adobe' 
                ? event.pageName?.toLowerCase().includes(searchText)
                : event.parameters?.ga_screen?.toLowerCase().includes(searchText) || 
                  event.parameters?.screen_name?.toLowerCase().includes(searchText)))
        );
      }

      return true;
    });
  }, [events, filter, filterText, filterType, sourceFilter, analyticsType]);

  const filterControls = {
    filter,
    setFilter,
    filterText,
    setFilterText,
    filterType,
    setFilterType,
    sourceFilter,
    setSourceFilter,
    analyticsType,
    setAnalyticsType
  };

  return {
    filteredEvents,
    filterControls
  };
} 