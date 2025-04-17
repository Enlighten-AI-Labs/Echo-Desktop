import styles from '@/styles/UnifiedAnalyticsDebugger.module.css';
import { useEffect, useState, useRef } from 'react';
import { parseAdobeAnalyticsBeacon } from '@/lib/adobe-analytics-parser';

function parseGA4Beacon(url, queryParams) {
  try {
    const params = new URLSearchParams(queryParams);
    
    // Parse the ep (event parameters) if present
    let eventParams = {};
    try {
      if (params.get('ep')) {
        eventParams = JSON.parse(decodeURIComponent(params.get('ep')));
      }
    } catch (e) {
      console.error('Error parsing event parameters:', e);
    }

    // Parse user properties if present
    let userProps = {};
    try {
      if (params.get('up')) {
        userProps = JSON.parse(decodeURIComponent(params.get('up')));
      }
    } catch (e) {
      console.error('Error parsing user properties:', e);
    }

    return {
      type: 'GA4',
      timestamp: params.get('_t') || params.get('_ts') || new Date().toISOString(),
      eventName: params.get('en') || eventParams._en || 'page_view',
      clientId: params.get('cid') || params.get('_cid') || '',
      sessionId: params.get('sid') || params.get('_sid') || '',
      measurementId: params.get('tid') || params.get('_tid') || '',
      parameters: {
        ...Object.fromEntries(params.entries()),
        ...eventParams
      },
      events: [{
        name: params.get('en') || eventParams._en || 'page_view',
        params: eventParams
      }],
      userProperties: userProps,
      pageLocation: params.get('dl') || eventParams.page_location,
      pageTitle: params.get('dt') || eventParams.page_title,
      url: url
    };
  } catch (error) {
    console.error('Error parsing GA4 beacon:', error);
    return null;
  }
}

function cleanEventName(name) {
  return name?.replace(/\([^)]+\)/g, '').trim();
}

function parseLogcatParameters(message) {
  if (!message) return {};
  
  // Look for params=Bundle[{...}] pattern
  const paramsMatch = message.match(/params=Bundle\[(.*)\]$/);
  if (!paramsMatch) return {};
  
  const paramsStr = paramsMatch[1];
  if (!paramsStr) return {};
  
  const params = {};
  
  try {
    // Remove outer braces and split by comma, but handle nested structures
    let cleanParamsStr = paramsStr.replace(/^\{|\}$/g, '');
    let currentKey = '';
    let currentValue = '';
    let inArray = false;
    let bracketCount = 0;
    let braceCount = 0;
    let parts = [];
    
    for (let i = 0; i < cleanParamsStr.length; i++) {
      const char = cleanParamsStr[i];
      
      if (char === '[') {
        inArray = true;
        bracketCount++;
        currentValue += char;
      } else if (char === ']') {
        bracketCount--;
        currentValue += char;
        if (bracketCount === 0) inArray = false;
      } else if (char === '{') {
        braceCount++;
        currentValue += char;
      } else if (char === '}') {
        braceCount--;
        currentValue += char;
      } else if (char === ',' && !inArray && bracketCount === 0 && braceCount === 0) {
        if (currentKey && currentValue) {
          parts.push(`${currentKey}=${currentValue}`);
        }
        currentKey = '';
        currentValue = '';
      } else if (char === '=' && !inArray && bracketCount === 0 && braceCount === 0) {
        currentKey = currentValue;
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    
    if (currentKey && currentValue) {
      parts.push(`${currentKey}=${currentValue}`);
    }

    // Process each part
    parts.forEach(pair => {
      const [key, ...valueParts] = pair.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        const cleanKey = key.trim().replace(/\([^)]+\)/g, '');
        
        // Special handling for items array
        if (cleanKey === 'items') {
          try {
            // Extract items between the outer brackets
            const itemsStr = value.slice(1, -1); // Remove outer []
            const items = [];
            let currentItem = '';
            let depth = 0;
            
            // Parse items character by character to handle nested structures
            for (let i = 0; i < itemsStr.length; i++) {
              const char = itemsStr[i];
              
              if (char === '{') {
                depth++;
                if (depth === 1) {
                  currentItem = '';
                  continue;
                }
              } else if (char === '}') {
                depth--;
                if (depth === 0) {
                  // Process completed item
                  const itemObj = {};
                  currentItem.split(',').forEach(prop => {
                    const [k, v] = prop.split('=').map(s => s.trim());
                    if (k && v) {
                      const cleanItemKey = k.replace(/\([^)]+\)/g, '');
                      itemObj[cleanItemKey] = v.replace(/^["']|["']$/g, '');
                    }
                  });
                  items.push(itemObj);
                  continue;
                }
              }
              
              if (depth > 0) {
                currentItem += char;
              }
            }
            
            params[cleanKey] = items;
          } catch (e) {
            console.error('Error parsing items array:', e);
            params[cleanKey] = value;
          }
        } else {
          // Handle regular values
          let cleanValue = value;
          if (/^-?\d+$/.test(cleanValue)) {
            cleanValue = parseInt(cleanValue, 10);
          } else if (/^-?\d*\.\d+$/.test(cleanValue)) {
            cleanValue = parseFloat(cleanValue);
          }
          params[cleanKey] = cleanValue;
        }
      }
    });
  } catch (error) {
    console.error('Error parsing parameters:', error);
  }
  
  return params;
}

function generateBeaconId(event) {
  let section = '00';
  let subsection = '00';
  let element = '00';

  // For logcat events
  if (event.source === 'logcat') {
    // Parse parameters first
    const params = parseLogcatParameters(event.message);
    
    // Extract event name from logcat message
    const nameMatch = event.message?.match(/name=([^,]+)/);
    const eventName = nameMatch ? cleanEventName(nameMatch[1]) : null;
    
    // Debug logging
    console.log('Generating beacon ID for event:', {
      eventName,
      screenName: params?.ga_screen,
      screenClass: params?.ga_screen_class,
      pageType: params?.page_type,
      message: event.message,
      params
    });

    // Handle Firebase/GA4 events
    if (event.message?.includes('Logging event:')) {
      // Get all relevant screen/page parameters
      const screenName = params?.ga_screen;
      const screenClass = params?.ga_screen_class?.toLowerCase();
      const pageType = params?.page_type?.toLowerCase();

      // Determine section based on all available parameters
      section = determineSection(screenName, screenClass, pageType);

      // Map event types to element numbers
      element = determineElement(eventName, params);
    }
    // Handle Adobe events
    else if (event.message?.includes('/b/ss/')) {
      const adobeParams = parseAdobeAnalyticsBeacon(event.message);
      section = determineAdobeSection(adobeParams);
      element = determineAdobeElement(adobeParams);
    }
  }
  // For proxy/network events
  else {
    if (event.analyticsType === 'ga4') {
      const params = event.parameters || {};
      section = determineSection(
        params.ga_screen,
        params.ga_screen_class?.toLowerCase(),
        params.page_type?.toLowerCase()
      );
      element = determineElement(event.eventName, params);
    }
    else if (event.analyticsType === 'adobe') {
      section = determineAdobeSection(event);
      element = determineAdobeElement(event);
    }
  }

  // Debug logging
  console.log('Generated beacon ID:', {
    section,
    subsection,
    element,
    final: `${section}.${subsection}.${element}`
  });

  return `${section}.${subsection}.${element}`;
}

// Helper function to determine section based on all parameters
function determineSection(screenName, screenClass, pageType) {
  // First try screen class based mapping
  if (screenClass) {
    if (screenClass.includes('history')) return '10';
    if (screenClass.includes('account')) return '08';
    if (screenClass.includes('rewards') || screenClass.includes('loyalty')) return '06';
    if (screenClass.includes('mobilepay')) return '07';
    if (screenClass.includes('cart') || screenClass.includes('bag')) return '04';
    if (screenClass.includes('checkout')) return '05';
    if (screenClass.includes('product')) return '03';
    if (screenClass.includes('category') || screenClass.includes('menu')) return '02';
    if (screenClass.includes('home')) return '01';
  }

  // Then try page type based mapping
  if (pageType) {
    if (pageType.includes('account')) return '08';
    if (pageType.includes('rewards')) return '06';
    if (pageType.includes('cart')) return '04';
    if (pageType.includes('checkout')) return '05';
    if (pageType.includes('product')) return '03';
    if (pageType.includes('category')) return '02';
    if (pageType.includes('homepage')) return '01';
  }

  // Finally try screen name based mapping
  if (screenName) {
    const screen = screenName.toLowerCase();
    if (screen.includes('history')) return '10';
    if (screen.includes('account')) return '08';
    if (screen.includes('rewards') || screen.includes('loyalty')) return '06';
    if (screen.includes('mobile pay')) return '07';
    if (screen.includes('bag') || screen.includes('cart')) return '04';
    if (screen.includes('checkout')) return '05';
    if (screen.includes('product') || screen.includes('item')) return '03';
    if (screen.includes('category') || screen.includes('menu')) return '02';
    if (screen.includes('home')) return '01';
    if (screen.includes('offers')) return '06';
  }

  // If we still don't have a section, use a default based on the screen class
  if (screenClass) {
    return '11'; // Miscellaneous pages
  }

  return '12'; // Unknown/Other
}

function determineElement(eventName, params) {
  if (!eventName) return '00';

  switch (eventName) {
    case 'screen_view':
      return '00';
    case 'select_item':
    case 'select_promotion':
      return '01';
    case 'view_item':
    case 'view_promotion':
      return '02';
    case 'add_to_cart':
    case 'add_to_bag':
      return '03';
    case 'remove_from_cart':
      return '04';
    case 'begin_checkout':
      return '05';
    case 'purchase':
      return '06';
    case 'offer_redemption':
      return '07';
    case 'select_content':
      if (params?.link_name || params?.link_text || params?.click_type) {
        return '08';
      }
      return '09';
    case 'view_search_results':
      return '10';
    case 'search':
      return '11';
    default:
      return '12';
  }
}

function determineAdobeSection(params) {
  const pageName = params?.pageName?.toLowerCase();
  
  if (!pageName) return '12';

  if (pageName.includes('history')) return '10';
  if (pageName.includes('account')) return '08';
  if (pageName.includes('rewards') || pageName.includes('loyalty')) return '06';
  if (pageName.includes('mobile pay')) return '07';
  if (pageName.includes('cart') || pageName.includes('bag')) return '04';
  if (pageName.includes('checkout')) return '05';
  if (pageName.includes('product')) return '03';
  if (pageName.includes('category')) return '02';
  if (pageName.includes('home')) return '01';
  if (pageName.includes('offers')) return '06';

  return '11';
}

function determineAdobeElement(params) {
  if (params?.events?.includes('prodView')) return '02';
  if (params?.events?.includes('scAdd')) return '03';
  if (params?.events?.includes('scRemove')) return '04';
  if (params?.events?.includes('scCheckout')) return '05';
  if (params?.events?.includes('purchase')) return '06';
  
  return '00';
}

export default function UnifiedAnalyticsDebugger({ deviceId, packageName, show }) {
  // State for analytics events from all sources
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [filter, setFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all', 'logcat', 'proxy'
  const [analyticsType, setAnalyticsType] = useState('all'); // 'all', 'google', 'adobe', 'firebase'
  const [screenshots, setScreenshots] = useState({});
  const [screenshotStatus, setScreenshotStatus] = useState('idle');
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);
  const [isCapturingLogcat, setIsCapturingLogcat] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [viewMode, setViewMode] = useState('parsed'); // 'parsed' or 'raw'
  const [expandedSections, setExpandedSections] = useState({
    basicInfo: false,
    parameters: true,
    eCommerce: true,
    userProperties: true,
    rawData: false
  });
  
  // New state for the filter box
  const [filterText, setFilterText] = useState('');
  
  const intervalRef = useRef(null);
  const processedEventIds = useRef(new Set());

  // Function to generate a unique event ID
  const generateEventId = (event) => {
    const generateHash = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash);
    };

    const keyProperties = [
      event.source,
      event.timestamp,
      event.eventName || event.type || '',
      event.pageTitle || event.pageName || '',
      event.url || ''
    ].join('|');

    const hash = generateHash(keyProperties);
    const num = hash % 1000000;
    const num1 = String(Math.floor(num / 10000)).padStart(2, '0');
    const num2 = String(Math.floor((num % 10000) / 100)).padStart(2, '0');
    const num3 = String(num % 100).padStart(2, '0');
    
    return `${num1}.${num2}.${num3}`;
  };

  // Function to capture screenshot
  const captureScreenshot = async (eventId) => {
    if (!eventId || screenshots[eventId]) return;

    try {
      setScreenshotStatus('capturing');
      const result = await window.api.rtmp.captureScreenshot(eventId);
      
      if (result.success) {
        setScreenshots(prev => ({
          ...prev,
          [eventId]: {
            fileName: result.fileName,
            timestamp: new Date(result.timestamp).toISOString(),
            width: result.dimensions?.width || 720,
            height: result.dimensions?.height || null,
            dataUrl: null
          }
        }));
        
        if (selectedEvent && selectedEvent.id === eventId) {
          loadScreenshotData(eventId);
        }
      }
      
      setScreenshotStatus('idle');
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      setScreenshotStatus('error');
    }
  };

  // Function to load screenshot data
  const loadScreenshotData = async (eventId) => {
    if (!screenshots[eventId] || screenshots[eventId].dataUrl) return;
    
    try {
      setScreenshotStatus('loading');
      const result = await window.api.rtmp.getScreenshotDataUrl(screenshots[eventId].fileName);
      
      if (result.success) {
        setScreenshots(prev => ({
          ...prev,
          [eventId]: {
            ...prev[eventId],
            dataUrl: result.dataUrl,
            width: result.dimensions?.width || prev[eventId].width || 720,
            height: result.dimensions?.height || prev[eventId].height || null
          }
        }));
      }
      
      setScreenshotStatus('idle');
    } catch (error) {
      console.error('Error loading screenshot data:', error);
      setScreenshotStatus('error');
    }
  };

  // Function to handle retaking screenshot
  const handleRetakeScreenshot = async () => {
    if (!selectedEvent) return;
    
    try {
      setScreenshots(prev => {
        const newScreenshots = { ...prev };
        delete newScreenshots[selectedEvent.id];
        return newScreenshots;
      });
      
      setScreenshotStatus('capturing');
      await captureScreenshot(selectedEvent.id);
      
      setTimeout(async () => {
        await loadScreenshotData(selectedEvent.id);
        setSelectedScreenshot(screenshots[selectedEvent.id]);
      }, 500);
    } catch (error) {
      console.error('Error retaking screenshot:', error);
      setScreenshotStatus('error');
    }
  };

  // Function to handle deleting screenshot
  const handleDeleteScreenshot = () => {
    if (!selectedEvent) return;
    
    setScreenshots(prev => {
      const newScreenshots = { ...prev };
      delete newScreenshots[selectedEvent.id];
      return newScreenshots;
    });
    
    setSelectedScreenshot(null);
  };

  // Helper function to identify eCommerce parameters
  const isEcommerceParameter = (key) => {
    const ecommerceKeys = [
      'item_id', 'item_name', 'item_brand', 'item_category', 'item_variant', 'item_list_name', 'item_list_id',
      'price', 'quantity', 'currency', 'value', 'transaction_id', 'tax', 'shipping', 'items',
      'product_id', 'product_name', 'product_brand', 'product_category', 'product_variant', 'product_list_name', 'product_list_id',
      'product_price', 'product_quantity', 'product_value',
      'cart_id', 'cart_value', 'cart_items',
      'checkout_id', 'checkout_value', 'checkout_items',
      'promotion_id', 'promotion_name', 'promotion_creative_name', 'promotion_creative_slot',
      'product', 'products', 'product_id', 'product_name', 'product_brand', 'product_category', 'product_variant',
      'product_list_name', 'product_list_id', 'product_price', 'product_quantity', 'product_value',
      'cart', 'cart_id', 'cart_value', 'cart_items',
      'checkout', 'checkout_id', 'checkout_value', 'checkout_items',
      'promotion', 'promotion_id', 'promotion_name', 'promotion_creative_name', 'promotion_creative_slot'
    ];
    
    return ecommerceKeys.some(ecommerceKey => 
      key.toLowerCase().includes(ecommerceKey.toLowerCase())
    );
  };

  // Helper function to separate eCommerce parameters from general parameters
  const separateParameters = (parameters) => {
    if (!parameters) return { ecommerce: {}, general: {} };
    
    const ecommerce = {};
    const general = {};
    
    Object.entries(parameters).forEach(([key, value]) => {
      if (isEcommerceParameter(key)) {
        ecommerce[key] = value;
      } else {
        general[key] = value;
      }
    });
    
    return { ecommerce, general };
  };

  // Helper function to extract items from parameters
  const extractItems = (parameters) => {
    if (!parameters) return [];
    
    // For logcat items array
    if (parameters.items) {
      // If items is already an array of objects
      if (Array.isArray(parameters.items)) {
        return parameters.items.map(item => ({
          item_id: item.item_id || item.id || 'N/A',
          item_name: item.item_name || item.name || 'Unknown Item',
          quantity: parseInt(item.quantity) || 1,
          price: parseFloat(item.price || item.value) || 0
        }));
      }
      
      // If items is a string that needs to be parsed
      if (typeof parameters.items === 'string') {
        try {
          // Clean up the string and try to parse it
          const cleanItemsStr = parameters.items.replace(/^\[|\]$/g, '');
          const items = cleanItemsStr.split('}, {').map(itemStr => {
            // Clean up each item string
            const cleanStr = itemStr.replace(/[{}]/g, '');
            const itemObj = {};
            
            // Split by comma and parse each key-value pair
            cleanStr.split(',').forEach(pair => {
              const [key, value] = pair.split('=').map(s => s.trim());
              if (key && value) {
                // Remove any analytics suffixes from keys
                const cleanKey = key.replace(/\([^)]+\)/g, '');
                itemObj[cleanKey] = value;
              }
            });
            
            return {
              item_id: itemObj.item_id || itemObj.id || 'N/A',
              item_name: itemObj.item_name || itemObj.name || 'Unknown Item',
              quantity: parseInt(itemObj.quantity) || 1,
              price: parseFloat(itemObj.price || itemObj.value) || 0
            };
          });
          
          return items;
        } catch (e) {
          console.error('Error parsing items string:', e);
        }
      }
    }
    
    // For individual item parameters
    const itemData = {};
    Object.entries(parameters).forEach(([key, value]) => {
      const cleanKey = key.replace(/\([^)]+\)/g, '').trim();
      
      if (cleanKey.includes('item_name') || cleanKey.includes('product_name')) {
        itemData.item_name = value;
      }
      if (cleanKey.includes('item_id') || cleanKey.includes('product_id')) {
        itemData.item_id = String(value).replace(/[\[\]{}]/g, '').trim();
      }
      if (cleanKey.includes('quantity')) {
        itemData.quantity = parseInt(value) || 1;
      }
      if (cleanKey.includes('price') || cleanKey.includes('value')) {
        itemData.price = parseFloat(value) || 0;
      }
    });

    // If we have at least a name or ID, create an item
    if (itemData.item_name || itemData.item_id) {
      return [{
        item_id: itemData.item_id || 'N/A',
        item_name: itemData.item_name || 'Unknown Item',
        quantity: itemData.quantity || 1,
        price: itemData.price || 0
      }];
    }
    
    return [];
  };

  // Helper function to format price
  const formatPrice = (price) => {
    if (typeof price === 'number') {
      return price.toFixed(2);
    }
    return price;
  };

  // Effect to fetch data from both sources
  useEffect(() => {
    async function fetchData() {
      try {
        // Get logcat status and data if running
        let isRunning = false;
        try {
          isRunning = await window.api.adb.isLogcatRunning();
        } catch (error) {
          console.error('Error checking logcat status:', error);
        }
        
        setIsCapturingLogcat(isRunning);
        
        if (isRunning) {
          const logcatLogs = await window.api.adb.getAnalyticsLogs();
          if (Array.isArray(logcatLogs)) {
            const parsedLogcatEvents = logcatLogs
              .filter(log => log.message?.includes('Logging event:') || log.message?.includes('FirebaseAnalytics'))
              .map(log => {
                const event = {
                  ...log,
                  source: 'logcat',
                  timestamp: log.timestamp || new Date().toISOString()
                };

                // Parse event name and parameters for Firebase/GA4 events
                if (log.message?.includes('Logging event:')) {
                  const nameMatch = log.message.match(/name=([^,]+)/);
                  if (nameMatch) {
                    event.eventName = cleanEventName(nameMatch[1]);
                  }
                  event.parameters = parseLogcatParameters(log.message);
                }
                // Parse Adobe Analytics events
                else if (log.message?.includes('/b/ss/')) {
                  const adobeParams = parseAdobeAnalyticsBeacon(log.message);
                  event.parameters = adobeParams;
                  event.pageName = adobeParams.pageName;
                  event.events = adobeParams.events;
                  event.analyticsType = 'adobe';
                }

                event.id = generateEventId(event);
                event.beaconId = generateBeaconId(event);
                
                return event;
              });

            // Process new logcat events
            parsedLogcatEvents.forEach(event => {
              if (!processedEventIds.current.has(event.id)) {
                processedEventIds.current.add(event.id);
                captureScreenshot(event.id);
              }
            });
            
            // Merge with existing events
            setEvents(currentEvents => {
              const existingEventsMap = new Map(currentEvents.map(e => [e.id, e]));
              parsedLogcatEvents.forEach(e => existingEventsMap.set(e.id, e));
              return Array.from(existingEventsMap.values())
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            });
          }
        }

        // Get proxy data
        const proxyTraffic = await window.api.mitmproxy.getTraffic();
        const analyticsBeacons = proxyTraffic
          .filter(entry => 
            entry.type === 'request' && 
            entry.fullUrl && (
              entry.fullUrl.includes('/b/ss/') || // Adobe Analytics
              entry.fullUrl.includes('/collect') || // GA4
              entry.fullUrl.includes('/g/collect') // GA4 alternative endpoint
            )
          )
          .map(entry => {
            let parsedBeacon = null;
            if (entry.fullUrl.includes('/b/ss/')) {
              parsedBeacon = { 
                ...parseAdobeAnalyticsBeacon(entry.fullUrl),
                source: 'proxy',
                analyticsType: 'adobe',
                timestamp: entry.timestamp || new Date().toISOString(),
                rawRequest: entry.fullUrl
              };
            } else if (entry.fullUrl.includes('/collect') || entry.fullUrl.includes('/g/collect')) {
              const url = new URL(entry.fullUrl);
              parsedBeacon = { 
                ...parseGA4Beacon(entry.fullUrl, url.search),
                source: 'proxy',
                analyticsType: 'ga4',
                timestamp: entry.timestamp || new Date().toISOString(),
                rawRequest: entry.fullUrl
              };
            }
            
            if (parsedBeacon) {
              parsedBeacon.id = generateEventId(parsedBeacon);
              parsedBeacon.beaconId = generateBeaconId(parsedBeacon);
              return parsedBeacon;
            }
            
            return null;
          })
          .filter(Boolean);

        // Process new proxy events
        analyticsBeacons.forEach(beacon => {
          if (!processedEventIds.current.has(beacon.id)) {
            processedEventIds.current.add(beacon.id);
            captureScreenshot(beacon.id);
          }
        });

        // Merge with existing events
        setEvents(currentEvents => {
          const existingEventsMap = new Map(currentEvents.map(e => [e.id, e]));
          analyticsBeacons.forEach(e => existingEventsMap.set(e.id, e));
          return Array.from(existingEventsMap.values())
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        });

      } catch (error) {
        console.error('Error fetching analytics data:', error);
      } finally {
        setIsCheckingStatus(false);
      }
    }

    // Initial fetch
    fetchData();

    // Set up polling if autoRefresh is enabled
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchData, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh]);

  // Effect to handle screenshot updates when selected event changes
  useEffect(() => {
    if (selectedEvent) {
      if (screenshots[selectedEvent.id] && !screenshots[selectedEvent.id].dataUrl) {
        loadScreenshotData(selectedEvent.id);
      }
      setSelectedScreenshot(screenshots[selectedEvent.id]);
    } else {
      setSelectedScreenshot(null);
    }
  }, [selectedEvent, screenshots]);

  // Function to start/stop logcat capture
  const handleToggleLogcat = async () => {
    try {
      if (isCapturingLogcat) {
        const result = await window.api.adb.stopLogcatCapture();
        if (result.success) {
          setIsCapturingLogcat(false);
        }
      } else {
        if (!deviceId) {
          alert('Please select a device first.');
          return;
        }
        const result = await window.api.adb.startLogcatCapture(deviceId);
        if (result.success) {
          setIsCapturingLogcat(true);
          await window.api.adb.clearAnalyticsLogs();
        }
      }
    } catch (error) {
      console.error('Error toggling logcat capture:', error);
      alert('Error: ' + error.message);
    }
  };

  // Function to clear all events
  const handleClearEvents = async () => {
    try {
      await window.api.adb.clearAnalyticsLogs();
      setEvents([]);
      setSelectedEvent(null);
    } catch (error) {
      console.error('Error clearing events:', error);
      alert('Error: ' + error.message);
    }
  };

  // Filter events based on user input
  const filteredEvents = events.filter(event => {
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

  if (!show) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <button 
            className={`${styles.captureButton} ${isCapturingLogcat ? styles.stopButton : styles.startButton}`}
            onClick={handleToggleLogcat}
          >
            {isCapturingLogcat ? 'Stop Logcat' : 'Start Logcat'}
          </button>
          
          <button 
            className={styles.clearButton}
            onClick={handleClearEvents}
            disabled={events.length === 0}
          >
            Clear Events
          </button>
        </div>

        <div className={styles.toolbarRight}>
          <select 
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className={styles.sourceSelect}
          >
            <option value="all">All Sources</option>
            <option value="logcat">Android Debug Bridge</option>
            <option value="proxy">Network</option>
          </select>

          <select
            value={analyticsType}
            onChange={(e) => setAnalyticsType(e.target.value)}
            className={styles.typeSelect}
          >
            <option value="all">All Analytics</option>
            <option value="google">Google Analytics</option>
            <option value="adobe">Adobe Analytics</option>
          </select>

          <input
            type="text"
            placeholder="Search events..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={styles.searchInput}
          />

          <label className={styles.autoRefreshLabel}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto Refresh
          </label>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.eventsList}>
          {/* Add the new filter box above the event list */}
          <div className={styles.filterBox}>
            <div className={styles.filterInputContainer}>
              <input
                type="text"
                placeholder="Filter by beaconID, event name, or screen..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className={styles.filterInput}
              />
              {filterText && (
                <button 
                  className={styles.clearFilterButton}
                  onClick={() => setFilterText('')}
                  title="Clear filter"
                >
                  ×
                </button>
              )}
            </div>
          </div>
          
          {filteredEvents.map((event, index) => (
            <div
              key={event.id}
              className={`${styles.eventCard} ${selectedEvent?.id === event.id ? styles.selected : ''}`}
              onClick={() => setSelectedEvent(event)}
              data-event-number={filteredEvents.length - index}
              data-analytics-type={
                event.source === 'logcat'
                  ? (event.message?.includes('/b/ss/') ? 'Adobe' : 'GA4')
                  : (event.analyticsType === 'adobe' ? 'Adobe' : 'GA4')
              }
            >
              <div className={styles.eventHeader}>
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
              <div className={styles.eventName}>
                {event.source === 'logcat'
                  ? (event.message?.includes('Logging event:') 
                      ? cleanEventName(event.message.match(/name=([^,]+)/)?.[1]) || 'Unknown Event'
                      : 'Analytics Event')
                  : cleanEventName(event.eventName || event.type) || 'Unknown Event'}
                <span className={styles.separator}>|</span>
                <span className={styles.eventPage}>
                  {event.source === 'logcat' 
                    ? (event.message?.includes('/b/ss/') 
                        ? event.pageName || 'Unknown Page'
                        : (parseLogcatParameters(event.message)?.ga_screen || 'Unknown Page'))
                    : (event.analyticsType === 'adobe' 
                        ? event.pageName || 'Unknown Page'
                        : event.parameters?.ga_screen || event.parameters?.screen_name || 'Unknown Page')}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.eventDetails}>
          {selectedEvent ? (
            <>
              <div className={styles.section}>
                <div 
                  className={styles.sectionHeader}
                  onClick={() => setExpandedSections(prev => ({
                    ...prev,
                    basicInfo: !prev.basicInfo
                  }))}
                >
                  <h3>Basic Information</h3>
                  <span>{expandedSections.basicInfo ? '−' : '+'}</span>
                </div>
                {expandedSections.basicInfo && (
                  <div className={styles.sectionContent}>
                    <div className={styles.basicInfo}>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Source:</span>
                        <span className={styles.infoValue}>{selectedEvent.source}</span>
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Type:</span>
                        <span className={styles.infoValue}>{selectedEvent.analyticsType || 'GA4'}</span>
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Beacon ID:</span>
                        <span className={styles.infoValue}>{selectedEvent.beaconId}</span>
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Timestamp:</span>
                        <span className={styles.infoValue}>{selectedEvent.timestamp}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.section}>
                <div 
                  className={styles.sectionHeader}
                  onClick={() => setExpandedSections(prev => ({
                    ...prev,
                    parameters: !prev.parameters
                  }))}
                >
                  <h3>Parameters</h3>
                  <span>{expandedSections.parameters ? '−' : '+'}</span>
                </div>
                {expandedSections.parameters && (
                  <div className={styles.sectionContent}>
                    <div className={styles.parametersTable}>
                      {selectedEvent.source === 'logcat' ? (
                        (() => {
                          const params = parseLogcatParameters(selectedEvent.message) || {};
                          const { general } = separateParameters(params);
                          
                          if (Object.keys(general).length === 0) {
                            return <div className={styles.noData}>No general parameters available</div>;
                          }
                          
                          return Object.entries(general).map(([key, value], index) => (
                            <div key={index} className={styles.parameterRow}>
                              <span className={styles.paramName}>{key}</span>
                              <span className={styles.paramValue}>
                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                              </span>
                            </div>
                          ));
                        })()
                      ) : (
                        (() => {
                          const { general } = separateParameters(selectedEvent.parameters || {});
                          
                          if (Object.keys(general).length === 0) {
                            return <div className={styles.noData}>No general parameters available</div>;
                          }
                          
                          return Object.entries(general).map(([key, value], index) => (
                            <div key={index} className={styles.parameterRow}>
                              <span className={styles.paramName}>{key}</span>
                              <span className={styles.paramValue}>
                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                              </span>
                            </div>
                          ));
                        })()
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.section}>
                <div 
                  className={styles.sectionHeader}
                  onClick={() => setExpandedSections(prev => ({
                    ...prev,
                    eCommerce: !prev.eCommerce
                  }))}
                >
                  <h3>eCommerce</h3>
                  <span>{expandedSections.eCommerce ? '−' : '+'}</span>
                </div>
                {expandedSections.eCommerce && (
                  <div className={styles.sectionContent}>
                    {selectedEvent.source === 'logcat' ? (
                      (() => {
                        const params = parseLogcatParameters(selectedEvent.message) || {};
                        const items = extractItems(params);
                        
                        if (items.length === 0) {
                          return <div className={styles.noData}>No eCommerce data available</div>;
                        }
                        
                        return (
                          <div className={styles.itemsTable}>
                            <div className={styles.itemsHeader}>
                              <div className={styles.itemNumber}>#</div>
                              <div className={styles.productName}>PRODUCT NAME</div>
                              <div className={styles.itemId}>ITEM ID</div>
                              <div className={styles.quantity}>QTY</div>
                              <div className={styles.price}>PRICE</div>
                            </div>
                            {items.map((item, index) => (
                              <div key={index} className={styles.itemRow}>
                                <div className={styles.itemNumber}>#{index + 1}</div>
                                <div className={styles.productName}>{item.item_name || item.product_name}</div>
                                <div className={styles.itemId}>{item.item_id || item.product_id}</div>
                                <div className={styles.quantity}>{item.quantity || 1}</div>
                                <div className={styles.price}>{formatPrice(item.price || item.product_price)}</div>
                              </div>
                            ))}
                          </div>
                        );
                      })()
                    ) : (
                      (() => {
                        const items = extractItems(selectedEvent.parameters || {});
                        
                        if (items.length === 0) {
                          return <div className={styles.noData}>No eCommerce data available</div>;
                        }
                        
                        return (
                          <div className={styles.itemsTable}>
                            <div className={styles.itemsHeader}>
                              <div className={styles.itemNumber}>#</div>
                              <div className={styles.productName}>PRODUCT NAME</div>
                              <div className={styles.itemId}>ITEM ID</div>
                              <div className={styles.quantity}>QTY</div>
                              <div className={styles.price}>PRICE</div>
                            </div>
                            {items.map((item, index) => (
                              <div key={index} className={styles.itemRow}>
                                <div className={styles.itemNumber}>#{index + 1}</div>
                                <div className={styles.productName}>{item.item_name || item.product_name}</div>
                                <div className={styles.itemId}>{item.item_id || item.product_id}</div>
                                <div className={styles.quantity}>{item.quantity || 1}</div>
                                <div className={styles.price}>{formatPrice(item.price || item.product_price)}</div>
                              </div>
                            ))}
                          </div>
                        );
                      })()
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={styles.noEventSelected}>
              <p>No event selected</p>
              <p>Select an event from the list to view details</p>
            </div>
          )}
        </div>

        <div className={styles.screenshotPanel}>
          <div className={styles.screenshotControls}>
            <button 
              className={styles.retakeButton}
              onClick={handleRetakeScreenshot}
              disabled={!selectedEvent || screenshotStatus === 'capturing'}
            >
              {screenshotStatus === 'capturing' ? 'Capturing...' : 'Retake Screenshot'}
            </button>
            <button 
              className={styles.deleteButton}
              onClick={handleDeleteScreenshot}
              disabled={!selectedEvent || !selectedScreenshot}
            >
              Delete Screenshot
            </button>
          </div>
          
          <div className={styles.screenshotContainer}>
            {selectedScreenshot ? (
              <>
                {selectedScreenshot.dataUrl ? (
                  <div className={styles.screenshotWrapper}>
                    <img 
                      src={selectedScreenshot.dataUrl} 
                      alt="Event Screenshot"
                      className={styles.screenshot}
                    />
                    <div className={styles.screenshotInfo}>
                      <span>{selectedScreenshot.width} x {selectedScreenshot.height}</span>
                      <span>{new Date(selectedScreenshot.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ) : (
                  <div className={styles.loading}>Loading screenshot...</div>
                )}
              </>
            ) : (
              <div className={styles.noScreenshot}>
                <p>No screenshot available</p>
                <p>Select an event to view or capture a screenshot</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}