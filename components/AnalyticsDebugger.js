import { useState, useEffect, useCallback, useRef } from 'react';
import styles from '@/styles/AnalyticsDebugger.module.css';

export default function AnalyticsDebugger({ deviceId, packageName, show }) {
  const [activeTypes, setActiveTypes] = useState({ ga4: true, adobe: false });
  const [logs, setLogs] = useState([]);
  const [bundledLogs, setBundledLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [tagFilter, setTagFilter] = useState('');
  const [appFilter, setAppFilter] = useState(''); // New state for app filter
  const logsContainerRef = useRef(null);
  const maxLogsRef = useRef(1000); // Maximum number of logs to keep
  const bundleTimeWindowRef = useRef(1000); // Time window in ms for bundling related logs

  // GA4 keyword filters
  const GA4_FILTERS = [
    "FA-SVC", 
    "FA", 
    "FirebaseAnalytics", 
    "GoogleAnalyticsImpl", 
    "GoogleAnalytics", 
    "GAv4", 
    "GoogleService", 
    "GoogleTagManager"
  ];

  // Helper function to escape HTML
  const escapeHTML = (str) => {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // Function to format JSON in log messages
  const formatJsonInMessage = (message) => {
    try {
      // First check for common GA4 event patterns
      const eventRegex = /Logging event: (.*?)(?:, bundle:|\n|$)/i;
      const eventMatch = message.match(eventRegex);
      
      if (eventMatch && eventMatch[1]) {
        const eventName = eventMatch[1].trim();
        
        // Highlight the event name with stronger formatting
        message = message.replace(
          eventRegex, 
          `Logging event: <strong>${eventName}</strong>,`
        );
      }
      
      // Check for Firebase parameter patterns
      message = message.replace(
        /(param|parameter|key):\s*([a-zA-Z0-9_]+)/gi,
        '$1: <em>$2</em>'
      );
      
      // Try to find JSON objects in the message
      // This regex tries to match JSON objects but is more precise in finding properly formatted ones
      const jsonRegex = /(\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}|\[(?:[^\[\]]|(?:\[(?:[^\[\]]|(?:\[[^\[\]]*\]))*\]))*\])/g;
      
      return message.replace(jsonRegex, (match) => {
        try {
          // Parse and format the JSON
          const parsed = JSON.parse(match);
          
          // Instead of just returning formatted JSON, return a structured visual representation
          return `\n<div class="${styles.jsonContainer}">
            ${formatJSONObject(parsed)}
          </div>`;
        } catch (e) {
          // If it doesn't parse as valid JSON, try to fix common issues and parse again
          try {
            // Replace single quotes with double quotes
            const fixedJSON = match
              .replace(/'/g, '"')                    // Replace single quotes with double quotes
              .replace(/,\s*}/g, '}')               // Remove trailing commas
              .replace(/,\s*]/g, ']')               // Remove trailing commas in arrays
              .replace(/([{,]\s*)(\w+):/g, '$1"$2":'); // Add quotes to keys
              
            const parsed = JSON.parse(fixedJSON);
            return `\n<div class="${styles.jsonContainer}">
              ${formatJSONObject(parsed)}
            </div>`;
          } catch {
            // If it's still not valid JSON after fixing, return the original match
            return match;
          }
        }
      });
    } catch (e) {
      return message;
    }
  };

  // Helper function to format a JSON object as a collapsible tree view
  const formatJSONObject = (obj, depth = 0) => {
    if (obj === null) return `<span class="${styles.jsonNull}">null</span>`;
    
    const type = typeof obj;
    
    // Handle primitives
    if (type !== 'object') {
      if (type === 'string') return `<span class="${styles.jsonString}">"${escapeHTML(obj)}"</span>`;
      if (type === 'number') return `<span class="${styles.jsonNumber}">${obj}</span>`;
      if (type === 'boolean') return `<span class="${styles.jsonBoolean}">${obj}</span>`;
      return `<span>${escapeHTML(obj)}</span>`;
    }
    
    // Handle arrays and objects
    const isArray = Array.isArray(obj);
    const isEmpty = isArray ? obj.length === 0 : Object.keys(obj).length === 0;
    
    if (isEmpty) {
      return isArray ? '[]' : '{}';
    }
    
    const indent = '  '.repeat(depth);
    const childIndent = '  '.repeat(depth + 1);
    let result = isArray ? '[' : '{';
    
    if (isArray) {
      result += '\n';
      obj.forEach((item, index) => {
        result += `${childIndent}${formatJSONObject(item, depth + 1)}${index < obj.length - 1 ? ',' : ''}\n`;
      });
      result += `${indent}]`;
    } else {
      result += '\n';
      const keys = Object.keys(obj);
      keys.forEach((key, index) => {
        const value = obj[key];
        result += `${childIndent}<span class="${styles.jsonKey}">"${key}"</span>: ${formatJSONObject(value, depth + 1)}${index < keys.length - 1 ? ',' : ''}\n`;
      });
      result += `${indent}}`;
    }
    
    return result;
  };

  // Function to start logcat streams for active types
  const startLogcatStreams = useCallback(async () => {
    if (!deviceId || !packageName || !show) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Start streams for each active analytics type
      for (const type of Object.keys(activeTypes)) {
        if (activeTypes[type]) {
          console.log(`Starting ${type} stream...`);
          
          // No filters means capture all logs
          const result = await window.api.adb.startLogcatStream(deviceId, type);
          
          if (!result.success) {
            console.error(`Failed to start ${type} stream:`, result.message);
            setError(`Failed to start ${type} monitoring`);
          }
        }
      }
    } catch (err) {
      console.error('Error starting logcat streams:', err);
      setError('Failed to start monitoring');
    } finally {
      setLoading(false);
    }
  }, [deviceId, packageName, activeTypes, show]);

  // Process logs to bundle related events
  const processAndBundleLogs = useCallback((rawLogs) => {
    // Start by sorting logs by timestamp
    const sortedLogs = [...rawLogs].sort((a, b) => a.timestampMs - b.timestampMs);
    const bundles = [];
    let currentBundle = [];
    let currentBundleTag = null;
    let lastTimestamp = 0;

    // Go through sorted logs to create bundles
    sortedLogs.forEach(log => {
      // Skip logs without messages
      if (!log.message) return;

      const timestamp = log.timestampMs;
      const tag = log.tag;
      const isFirebaseEvent = log.message.includes('Logging event:') || 
                              log.message.includes('event_name') ||
                              log.message.includes('params:');

      // Start a new bundle if:
      // 1. This is a Firebase event log
      // 2. The time gap is too large
      // 3. The tag is different from the current bundle
      const shouldStartNewBundle = 
        isFirebaseEvent || 
        currentBundle.length === 0 || 
        (timestamp - lastTimestamp) > bundleTimeWindowRef.current ||
        (currentBundleTag && tag && tag !== currentBundleTag);

      if (shouldStartNewBundle && currentBundle.length > 0) {
        bundles.push({
          id: `bundle-${currentBundle[0].timestampMs}`,
          logs: [...currentBundle],
          timestamp: currentBundle[0].timestamp,
          timestampMs: currentBundle[0].timestampMs,
          analyticsType: currentBundle[0].analyticsType,
          tag: currentBundleTag,
          message: combineMessages(currentBundle)
        });
        currentBundle = [];
        currentBundleTag = null;
      }

      // Add to current bundle
      currentBundle.push(log);
      currentBundleTag = tag || currentBundleTag;
      lastTimestamp = timestamp;
    });

    // Add the last bundle if not empty
    if (currentBundle.length > 0) {
      bundles.push({
        id: `bundle-${currentBundle[0].timestampMs}`,
        logs: [...currentBundle],
        timestamp: currentBundle[0].timestamp,
        timestampMs: currentBundle[0].timestampMs,
        analyticsType: currentBundle[0].analyticsType,
        tag: currentBundleTag,
        message: combineMessages(currentBundle)
      });
    }

    // Process the JSON in the bundled messages
    const processedBundles = bundles.map(bundle => ({
      ...bundle,
      message: formatJsonInMessage(bundle.message || ''),
      hasFormattedJson: true
    }));

    return processedBundles;
  }, [formatJsonInMessage]);

  // Combine messages from multiple logs into a single coherent message
  const combineMessages = (logs) => {
    // Extract app package name if available
    let appPackageName = "Unknown App";
    for (const log of logs) {
      const packageMatch = log.message.match(/com\.[a-zA-Z0-9_.]+/);
      if (packageMatch) {
        appPackageName = packageMatch[0];
        break;
      }
    }

    // Data structure to store the processed event
    let eventData = {
      event_name: '',
      params: {},
      formatted_params: {},
      user_defined_params: {},
      ecommerce_items: [],
      internal_params: {},
      app_package: appPackageName,
      device_info: {},
      campaign_info: {},
      engagement_info: {},
      custom_dimensions: {},
      error_tracking: {},
      performance_metrics: {},
      user_properties: {}
    };
    
    // Maps to track parameter categories based on naming patterns
    const internalParamPrefixes = ['ga_', 'firebase_', 'google_', '_', 'engagement_time_msec'];
    const deviceInfoKeys = ['device_category', 'device_id', 'device_model', 'os_version', 'app_version', 'screen_resolution', 'platform', 'browser', 'timezone'];
    const campaignKeys = ['campaign', 'source', 'medium', 'term', 'content', 'gclid', 'click_id', 'referral', 'utm_'];
    const engagementKeys = ['engagement', 'session', 'screen_view', 'page_view', 'user_engagement', 'scroll', 'click'];
    const ecommerceKeys = ['item_', 'product_', 'transaction_', 'promotion_', 'checkout_', 'purchase', 'cart', 'currency', 'value', 'coupon'];
    const customDimensionKeys = ['dimension', 'metric', 'custom_', 'user_segment', 'ab_test', 'experiment', 'variant'];
    const errorKeys = ['error', 'exception', 'crash', 'failure', 'api_error', 'http_response', 'validation'];
    const performanceKeys = ['load_time', 'render_time', 'paint', 'fps', 'memory', 'latency', 'response_time'];
    
    // Process each log to extract event information
    let eventNameFound = false;
    let bundleParams = {};
    let jsonData = {};
    
    // First pass: extract event name and key information
    for (const log of logs) {
      const message = log.message;
      
      // Check for "Logging event:" pattern
      if (message.includes('Logging event:')) {
        const eventMatch = message.match(/Logging event:\s*(\w+)(?:,\s*bundle:.*)?/);
        if (eventMatch && eventMatch[1]) {
          eventData.event_name = eventMatch[1];
          eventNameFound = true;
        }
        
        // Try to extract bundle parameters
        const bundleMatch = message.match(/bundle:\s*(\{.*\})/);
        if (bundleMatch && bundleMatch[1]) {
          try {
            const bundleData = JSON.parse(bundleMatch[1]);
            bundleParams = bundleData;
            
            // Categorize parameters
            for (const [key, value] of Object.entries(bundleData)) {
              categorizeParameter(key, value, eventData);
            }
          } catch (e) {
            // If JSON parsing fails, try to extract using regex
            const paramMatches = bundleMatch[1].match(/(\w+)=([^,}]+)/g);
            if (paramMatches) {
              paramMatches.forEach(match => {
                const [_, name, value] = match.match(/(\w+)=([^,}]+)/) || [];
                if (name && value) {
                  bundleParams[name] = value;
                  categorizeParameter(name, value, eventData);
                }
              });
            }
          }
        }
      }
      
      // Look for event_name in the log if not found yet
      if (!eventNameFound && message.includes('event_name')) {
        const eventNameMatch = message.match(/event_name[:|=]\s*["']?([^"',}]+)["']?/);
        if (eventNameMatch && eventNameMatch[1]) {
          eventData.event_name = eventNameMatch[1];
          eventNameFound = true;
        }
      }
      
      // Extract JSON objects from logs
      const jsonMatch = message.match(/(\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}|\[(?:[^\[\]]|(?:\[(?:[^\[\]]|(?:\[[^\[\]]*\]))*\]))*\])/g);
      if (jsonMatch) {
        for (const json of jsonMatch) {
          try {
            const data = JSON.parse(json);
            if (typeof data === 'object' && data !== null) {
              // Merge with existing data
              jsonData = { ...jsonData, ...data };
              
              // Look for event_name
              if (!eventNameFound && data.event_name) {
                eventData.event_name = data.event_name;
                eventNameFound = true;
              }
              
              // Process parameters
              if (data.params) {
                for (const [key, value] of Object.entries(data.params)) {
                  categorizeParameter(key, value, eventData);
                }
              }
            }
          } catch (e) {
            // JSON parsing failed, skip this match
          }
        }
      }
      
      // Look for parameter patterns in the log
      const paramMatches = message.match(/param:\s*(\w+)=([^,]+)/g);
      if (paramMatches) {
        paramMatches.forEach(match => {
          const [_, name, value] = match.match(/param:\s*(\w+)=([^,]+)/) || [];
          if (name && value) {
            categorizeParameter(name, value, eventData);
          }
        });
      }
      
      // Look for user properties
      if (message.includes('user_property {')) {
        const userPropertyMatch = message.match(/name:\s*"([^"]+)".*?string_value:\s*"([^"]+)"/);
        if (userPropertyMatch && userPropertyMatch.length >= 3) {
          const name = userPropertyMatch[1];
          const value = userPropertyMatch[2];
          eventData.user_properties[name] = value;
        }
      }
    }
    
    // Second pass: extract any missing information from each log
    for (const log of logs) {
      const message = log.message;
      
      // Skip messages that are just JSON we've already processed
      if (message.trim().startsWith('{') && message.trim().endsWith('}')) {
        continue;
      }
      
      // Add relevant log messages that aren't just parameter data
      if (!message.includes('param:') && 
          !message.includes('bundle:') && 
          !message.includes('user_property {') &&
          !message.includes('{') && 
          !message.includes('[') &&
          message.trim().length > 10) {
        // Add as a relevant message if it's not already included
        if (!eventData.relevant_messages) {
          eventData.relevant_messages = [message];
        } else if (!eventData.relevant_messages.includes(message)) {
          eventData.relevant_messages.push(message);
        }
      }
    }
    
    // Build the formatted output
    return formatEventDataToHTML(eventData);
  };

  // Helper function to categorize a parameter based on its key name
  const categorizeParameter = (key, value, eventData) => {
    const keyLower = key.toLowerCase();
    
    // Track the parameter in the full params list
    eventData.params[key] = value;
    
    // Check for ecommerce items array
    if (keyLower === 'items' && Array.isArray(value)) {
      eventData.ecommerce_items = value;
      return;
    }
    
    // Internal GA4 parameters
    if (keyLower.startsWith('ga_') || 
        keyLower.startsWith('firebase_') || 
        keyLower.startsWith('google_') || 
        keyLower.startsWith('_') || 
        keyLower === 'engagement_time_msec') {
      eventData.internal_params[key] = value;
      return;
    }
    
    // Device information
    if (deviceInfoKeys.some(prefix => keyLower.includes(prefix))) {
      eventData.device_info[key] = value;
      return;
    }
    
    // Campaign & traffic source
    if (campaignKeys.some(prefix => keyLower.includes(prefix))) {
      eventData.campaign_info[key] = value;
      return;
    }
    
    // Engagement
    if (engagementKeys.some(prefix => keyLower.includes(prefix))) {
      eventData.engagement_info[key] = value;
      return;
    }
    
    // Ecommerce
    if (ecommerceKeys.some(prefix => keyLower.includes(prefix))) {
      eventData.formatted_params[key] = value;
      return;
    }
    
    // Custom dimensions
    if (customDimensionKeys.some(prefix => keyLower.includes(prefix))) {
      eventData.custom_dimensions[key] = value;
      return;
    }
    
    // Error tracking
    if (errorKeys.some(prefix => keyLower.includes(prefix))) {
      eventData.error_tracking[key] = value;
      return;
    }
    
    // Performance metrics
    if (performanceKeys.some(prefix => keyLower.includes(prefix))) {
      eventData.performance_metrics[key] = value;
      return;
    }
    
    // If not categorized, add to user-defined parameters
    eventData.user_defined_params[key] = value;
  };

  // Format event data into HTML for display
  const formatEventDataToHTML = (eventData) => {
    let html = '';
    
    // Add event name header
    if (eventData.event_name) {
      html += `<strong>Event: ${eventData.event_name}</strong>\n\n`;
    }
    
    // Add app package name
    html += `<div class="${styles.eventDetail}">App: ${eventData.app_package}</div>\n`;
    
    // Add user-defined parameters section if available
    if (Object.keys(eventData.user_defined_params).length > 0) {
      html += `<div class="${styles.parametersHeader} ${styles.userDefinedHeader}">User-Defined Parameters:</div>\n`;
      html += `<div class="${styles.parametersJson}">${JSON.stringify(eventData.user_defined_params, null, 2)}</div>\n`;
    }
    
    // Add ecommerce items if available
    if (eventData.ecommerce_items && eventData.ecommerce_items.length > 0) {
      html += `<div class="${styles.parametersHeader} ${styles.ecommerceHeader}">Ecommerce Items:</div>\n`;
      html += `<div class="${styles.parametersJson}">${JSON.stringify(eventData.ecommerce_items, null, 2)}</div>\n`;
    }
    
    // Add device information if available
    if (Object.keys(eventData.device_info).length > 0) {
      html += `<div class="${styles.parametersHeader} ${styles.deviceHeader}">Device Information:</div>\n`;
      html += `<div class="${styles.parametersJson}">${JSON.stringify(eventData.device_info, null, 2)}</div>\n`;
    }
    
    // Add campaign information if available
    if (Object.keys(eventData.campaign_info).length > 0) {
      html += `<div class="${styles.parametersHeader} ${styles.campaignHeader}">Campaign & Traffic Source:</div>\n`;
      html += `<div class="${styles.parametersJson}">${JSON.stringify(eventData.campaign_info, null, 2)}</div>\n`;
    }
    
    // Add engagement information if available
    if (Object.keys(eventData.engagement_info).length > 0) {
      html += `<div class="${styles.parametersHeader} ${styles.engagementHeader}">App Engagement:</div>\n`;
      html += `<div class="${styles.parametersJson}">${JSON.stringify(eventData.engagement_info, null, 2)}</div>\n`;
    }
    
    // Add custom dimensions if available
    if (Object.keys(eventData.custom_dimensions).length > 0) {
      html += `<div class="${styles.parametersHeader} ${styles.dimensionsHeader}">Custom Dimensions:</div>\n`;
      html += `<div class="${styles.parametersJson}">${JSON.stringify(eventData.custom_dimensions, null, 2)}</div>\n`;
    }
    
    // Add error tracking information if available
    if (Object.keys(eventData.error_tracking).length > 0) {
      html += `<div class="${styles.parametersHeader} ${styles.errorHeader}">Error Tracking:</div>\n`;
      html += `<div class="${styles.parametersJson}">${JSON.stringify(eventData.error_tracking, null, 2)}</div>\n`;
    }
    
    // Add performance metrics if available
    if (Object.keys(eventData.performance_metrics).length > 0) {
      html += `<div class="${styles.parametersHeader} ${styles.performanceHeader}">Performance Metrics:</div>\n`;
      html += `<div class="${styles.parametersJson}">${JSON.stringify(eventData.performance_metrics, null, 2)}</div>\n`;
    }
    
    // Add internal parameters if available
    if (Object.keys(eventData.internal_params).length > 0) {
      html += `<div class="${styles.parametersHeader} ${styles.internalHeader}">Internal Parameters:</div>\n`;
      html += `<div class="${styles.parametersJson}">${JSON.stringify(eventData.internal_params, null, 2)}</div>\n`;
    }
    
    // Add user properties if available
    if (Object.keys(eventData.user_properties).length > 0) {
      html += `<div class="${styles.parametersHeader} ${styles.userPropertiesHeader}">User Properties:</div>\n`;
      html += `<div class="${styles.parametersJson}">${JSON.stringify(eventData.user_properties, null, 2)}</div>\n`;
    }
    
    // Add relevant messages if available
    if (eventData.relevant_messages && eventData.relevant_messages.length > 0) {
      html += `<div class="${styles.parametersHeader} ${styles.messagesHeader}">Additional Information:</div>\n`;
      html += `<div class="${styles.parametersJson}">${eventData.relevant_messages.join("\n")}</div>\n`;
    }
    
    return html.trim();
  };

  // Effect to set up logcat data listener
  useEffect(() => {
    // Set up listener for streaming logcat data from the main process
    const handleLogcatData = (newLogsData) => {
      if (!show) return;

      console.log(`Received ${newLogsData.length} log entries from main process`);
      
      // Debug: log the first entry to see its format
      if (newLogsData.length > 0) {
        console.log('Sample log entry:', JSON.stringify(newLogsData[0]));
      }

      setLogs(prevLogs => {
        // Add new logs to existing logs
        const combined = [...newLogsData, ...prevLogs];
        
        // Deduplicate based on timestamp and message content
        const deduped = [];
        const seen = new Set();
        
        for (const log of combined) {
          // Skip invalid logs
          if (!log.message) continue;
          
          const key = `${log.analyticsType}-${log.timestamp}-${log.message.substring(0, 100)}`;
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(log);
          }
        }
        
        // Sort by timestamp (most recent first for display, but not for bundling)
        const sorted = deduped.sort((a, b) => b.timestampMs - a.timestampMs);
        
        // Limit the number of logs to prevent memory issues
        const limited = sorted.slice(0, maxLogsRef.current);
        
        console.log(`Updated logs state: ${limited.length} total entries`);
        
        // Process the bundled logs whenever raw logs change
        setBundledLogs(processAndBundleLogs(limited));
        
        return limited;
      });
    };
    
    // Register the listener
    console.log('Setting up logcat-data event listener');
    window.api.receive('logcat-data', handleLogcatData);
    
    // Clean up the listener when the component unmounts
    return () => {
      console.log('Cleaning up logcat-data event listener');
      // No direct way to remove listeners in preload.js setup
      // Instead we'll use the 'show' flag to ignore new data when not showing
    };
  }, [show, formatJsonInMessage, processAndBundleLogs]);

  // Effect to enable analytics debugging when component mounts
  useEffect(() => {
    const enableDebugging = async () => {
      if (!deviceId || !packageName || !show) return;
      
      try {
        // Clear logs when showing the debugger
        setLogs([]);
        
        // Enable analytics debugging
        const result = await window.api.adb.enableAnalyticsDebugging(deviceId, packageName);
        if (!result.success) {
          setError('Failed to enable analytics debugging');
        } else {
          console.log('Analytics debugging enabled');
          
          // Start logcat streams
          await startLogcatStreams();
        }
      } catch (err) {
        console.error('Error enabling analytics debugging:', err);
        setError('Failed to enable analytics debugging');
      }
    };
    
    enableDebugging();
    
    // Clean up when unmounting or hiding
    return () => {
      if (show) {
        window.api.adb.stopAllLogcatStreams()
          .catch(err => console.error('Error stopping logcat streams:', err));
      }
    };
  }, [deviceId, packageName, show, startLogcatStreams]);

  // Effect to handle changes in active types
  useEffect(() => {
    if (show) {
      startLogcatStreams();
    }
  }, [activeTypes, show, startLogcatStreams]);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && logsContainerRef.current && logs.length > 0) {
      logsContainerRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  // Toggle an analytics type
  const toggleAnalyticsType = async (type) => {
    // Stop the stream for this type if it's active
    if (activeTypes[type]) {
      await window.api.adb.stopLogcatStream(type);
    }
    
    // Update active types
    setActiveTypes(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  // Clear logs
  const clearLogs = () => {
    setLogs([]);
  };

  if (!show) return null;

  // Get unique tags from GA4 logs for the dropdown
  const uniqueTags = Array.from(
    new Set(
      bundledLogs
        .filter(log => log.analyticsType === 'ga4' && log.tag)
        .map(log => log.tag)
    )
  ).sort();

  // Get unique app package names for the app filter dropdown
  const uniqueApps = Array.from(
    new Set(
      bundledLogs
        .map(log => {
          // Extract app package from message or use stored value
          if (log.message && log.message.includes('App: ')) {
            const appMatch = log.message.match(/App: (com\.[a-zA-Z0-9_.]+)/);
            return appMatch ? appMatch[1] : null;
          }
          return null;
        })
        .filter(Boolean) // Remove null values
    )
  ).sort();

  // Count logs by type for the UI
  const logCounts = {
    total: logs.length,
    bundled: bundledLogs.length,
    filtered: 0,
    ga4: bundledLogs.filter(log => log.analyticsType === 'ga4').length,
    adobe: bundledLogs.filter(log => log.analyticsType === 'adobe').length,
    byApp: {}
  };

  // Count logs by app
  bundledLogs.forEach(log => {
    if (log.message && log.message.includes('App: ')) {
      const appMatch = log.message.match(/App: (com\.[a-zA-Z0-9_.]+)/);
      if (appMatch) {
        const app = appMatch[1];
        logCounts.byApp[app] = (logCounts.byApp[app] || 0) + 1;
      }
    }
  });

  // Filter out logs based on active analytics types, tag filter, and app filter
  const filteredLogs = bundledLogs.filter(log => {
    // Filter by active type first
    if (!activeTypes[log.analyticsType]) return false;
    
    // If it's GA4 logs and we have a tag filter, apply it
    if (log.analyticsType === 'ga4' && tagFilter && log.tag !== tagFilter) {
      return false;
    }
    
    // Apply app filter if selected
    if (appFilter && log.message) {
      const appMatch = log.message.match(/App: (com\.[a-zA-Z0-9_.]+)/);
      if (!appMatch || appMatch[1] !== appFilter) {
        return false;
      }
    }
    
    return true;
  });

  // Update filtered count
  logCounts.filtered = filteredLogs.length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Analytics Debugger</h2>
        <div className={styles.tabs}>
          <button 
            className={`${styles.tabButton} ${activeTypes.ga4 ? styles.active : ''}`}
            onClick={() => toggleAnalyticsType('ga4')}
          >
            <div className={styles.checkboxContainer}>
              <input 
                type="checkbox" 
                checked={activeTypes.ga4} 
                onChange={() => {}} // Handled by the button click
                className={styles.checkbox}
              />
              <span>Google Analytics 4</span>
            </div>
          </button>
          <button 
            className={`${styles.tabButton} ${activeTypes.adobe ? styles.active : ''}`}
            onClick={() => toggleAnalyticsType('adobe')}
          >
            <div className={styles.checkboxContainer}>
              <input 
                type="checkbox" 
                checked={activeTypes.adobe} 
                onChange={() => {}} // Handled by the button click
                className={styles.checkbox}
              />
              <span>Adobe Analytics</span>
            </div>
          </button>
        </div>
        <div className={styles.controls}>
          {activeTypes.ga4 && uniqueTags.length > 0 && (
            <div className={styles.tagFilterContainer}>
              <span className={styles.tagFilterLabel}>Filter by Tag:</span>
              <select 
                className={styles.tagFilter}
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
              >
                <option value="">All Tags</option>
                {uniqueTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
              {tagFilter && (
                <button 
                  className={styles.tagFilterClear} 
                  onClick={() => setTagFilter('')}
                  title="Clear filter"
                >
                  &times;
                </button>
              )}
            </div>
          )}
          
          {uniqueApps.length > 0 && (
            <div className={styles.tagFilterContainer}>
              <span className={styles.tagFilterLabel}>Filter by App:</span>
              <select 
                className={styles.tagFilter}
                value={appFilter}
                onChange={(e) => setAppFilter(e.target.value)}
              >
                <option value="">All Apps</option>
                {uniqueApps.map(app => (
                  <option key={app} value={app}>
                    {app.split('.').slice(-1)[0]} {/* Show last part of package name */}
                    <span className={styles.appCount}>({logCounts.byApp[app] || 0})</span>
                  </option>
                ))}
              </select>
              {appFilter && (
                <button 
                  className={styles.tagFilterClear} 
                  onClick={() => setAppFilter('')}
                  title="Clear app filter"
                >
                  &times;
                </button>
              )}
            </div>
          )}
          
          <button 
            className={styles.clearButton}
            onClick={clearLogs}
            disabled={loading}
          >
            Clear
          </button>
          <label className={styles.autoScrollLabel}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={() => setAutoScroll(!autoScroll)}
            />
            Auto-scroll
          </label>
          {loading && <div className={styles.spinnerContainer}>
            <div className={styles.spinner}></div>
          </div>}
        </div>
      </div>
      
      <div className={styles.logsContainer} ref={logsContainerRef}>
        {error ? (
          <div className={styles.error}>
            <p>{error}</p>
            <button 
              onClick={startLogcatStreams} 
              className={styles.retryButton}
            >
              Retry
            </button>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className={styles.noLogs}>
            <p>No analytics events found yet.</p>
            <p>Logs will stream here automatically as they're captured.</p>
            <p>Try interacting with your app to generate events.</p>
          </div>
        ) : (
          <>
            {(tagFilter || appFilter) && (
              <div className={styles.filterInfo}>
                {tagFilter && (
                  <span>Tag: <strong>{tagFilter}</strong></span>
                )}
                {tagFilter && appFilter && <span> | </span>}
                {appFilter && (
                  <span>App: <strong>{appFilter.split('.').slice(-1)[0]}</strong></span>
                )}
              </div>
            )}
            <div className={styles.logCountInfo}>
              Displaying {filteredLogs.length} bundled events ({logCounts.bundled} bundles from {logCounts.total} raw logs)
              {activeTypes.ga4 && ` (GA4: ${logCounts.ga4})`}
              {activeTypes.adobe && ` (Adobe: ${logCounts.adobe})`}
              {appFilter && ` (App: ${appFilter.split('.').slice(-1)[0]})`}
            </div>
            <div className={styles.logs}>
              {filteredLogs.map((log) => (
                <div 
                  key={log.id} 
                  className={`${styles.logEntry} ${styles[`logEntry_${log.analyticsType}`]} ${styles.bundledLogEntry}`}
                >
                  <div className={styles.logHeader}>
                    <div className={styles.logTime}>{log.timestamp}</div>
                    <div className={styles.logType}>
                      {log.analyticsType === 'ga4' ? 'Google Analytics' : 'Adobe Analytics'}
                      {log.logs && ` (${log.logs.length} logs)`}
                    </div>
                  </div>
                  {log.analyticsType === 'ga4' && log.tag && (
                    <div className={styles.logDetails}>
                      <span className={styles.logTag}>{log.tag}</span>
                      {log.logs && log.logs[0] && log.logs[0].level && (
                        <span className={`${styles.logLevel} ${styles[`logLevel_${log.logs[0].level}`]}`}>
                          {log.logs[0].level}
                        </span>
                      )}
                    </div>
                  )}
                  <div 
                    className={styles.logMessage}
                    dangerouslySetInnerHTML={{ __html: log.message }}
                  />
                  {log.logs && log.logs.length > 1 && (
                    <div className={styles.bundleInfo}>
                      <span>{log.logs.length} related logs bundled</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
} 