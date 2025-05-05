import { parseLogcatParameters } from './ga4-analytics-parser';
import { parseAdobeAnalyticsBeacon } from './adobe-analytics-parser';

function generateBeaconId(event) {
  // Return early if the event already has a beacon ID
  if (event.beaconId) {
    console.log('Using existing beacon ID:', event.beaconId);
    return event.beaconId;
  }

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

function cleanEventName(name) {
  return name?.replace(/\([^)]+\)/g, '').trim();
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

function generateEventId(event) {
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
}

// Add this helper function before the UnifiedAnalyticsDebugger component
function getScreenName(event) {
  if (event.source === 'logcat') {
    if (event.message?.includes('/b/ss/')) {
      return event.pageName || 'Unknown Page';
    }
    const params = parseLogcatParameters(event.message);
    return params?.ga_screen || 'Unknown Page';
  }
  
  if (event.analyticsType === 'adobe') {
    return event.pageName || 'Unknown Page';
  }
  
  return event.parameters?.ga_screen || event.parameters?.screen_name || 'Unknown Page';
}

// Add this helper function to group consecutive events by screen
function groupEventsByScreen(events) {
  const groups = {};
  let currentScreenName = null;
  let currentGroupId = 0;
  const screenGroupCounts = new Map();
  
  // First pass: count total groups per screen
  events.forEach(event => {
    const screenName = getScreenName(event);
    if (screenName !== currentScreenName) {
      currentGroupId++;
      currentScreenName = screenName;
      screenGroupCounts.set(screenName, (screenGroupCounts.get(screenName) || 0) + 1);
    }
  });
  
  // Reset for second pass
  currentScreenName = null;
  currentGroupId = 0;
  
  // Second pass: create groups with reversed numbers
  events.forEach(event => {
    const screenName = getScreenName(event);
    
    // If this is a new screen or first event, create a new group
    if (screenName !== currentScreenName) {
      currentGroupId++;
      currentScreenName = screenName;
    }
    
    const totalGroups = screenGroupCounts.get(screenName);
    const reversedGroupId = totalGroups - currentGroupId + 1;
    
    // Create a unique group key that includes both screen name and group ID
    const groupKey = `${screenName}-group${currentGroupId}`;
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push({
      ...event,
      groupId: reversedGroupId,
      totalGroups,
      screenName // Add screen name to each event for easier access
    });
  });
  
  return groups;
}

// Helper function to identify eCommerce parameters
function isEcommerceParameter(key) {
  // Special case handling for flag_value and similar parameters - ensure these are never classified as ecommerce
  if (['flag_value', 'flag_id', 'flag_name', 'feature_platform'].includes(key.toLowerCase())) {
    return false;
  }
  
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
}

export {
  generateBeaconId,
  cleanEventName,
  determineSection,
  determineElement,
  determineAdobeSection,
  determineAdobeElement,
  generateEventId,
  getScreenName,
  groupEventsByScreen,
  isEcommerceParameter
}; 