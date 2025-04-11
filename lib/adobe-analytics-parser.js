const parseAdobeAnalyticsBeacon = (url) => {
  try {
    const urlObj = new URL(url);
    
    // Check if this is an Adobe Analytics request
    if (!urlObj.pathname.includes('/b/ss/')) {
      return null;
    }

    // Parse the URL parameters
    const params = {};
    urlObj.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    // Determine if this is a page view (s.t) or link tracking (s.tl) call
    const isLinkTracking = params.pe ? true : false;

    // Extract basic information
    const result = {
      timestamp: new Date().toISOString(),
      type: isLinkTracking ? 's.tl' : 's.t',
      rsid: urlObj.pathname.split('/b/ss/')[1].split('/')[0],
      pageName: params.pageName || '',
      url: params.g || '',
      parameters: {}
    };

    // Add all parameters to the result
    for (const [key, value] of Object.entries(params)) {
      result.parameters[key] = value;
    }

    // Special handling for link tracking
    if (isLinkTracking) {
      result.linkType = params.pe.split(',')[1] || '';
      result.linkName = params.pev2 || '';
    }

    // Special handling for events
    if (params.events) {
      result.events = params.events.split(',').map(event => {
        const [eventName, value] = event.split('=');
        return value ? { name: eventName, value } : { name: eventName };
      });
    }

    // Special handling for products
    if (params.products) {
      result.products = params.products.split(',').map(product => {
        const parts = product.split(';');
        return {
          category: parts[0] || '',
          name: parts[1] || '',
          quantity: parts[2] || '',
          price: parts[3] || '',
          events: parts[4] || '',
          eVars: parts[5] || ''
        };
      });
    }

    // Special handling for eVars, props, and other numbered variables
    const variableTypes = {
      eVar: /^v(\d+)$/,
      prop: /^c(\d+)$/,
      hier: /^h(\d+)$/
    };

    for (const [key, value] of Object.entries(params)) {
      for (const [type, regex] of Object.entries(variableTypes)) {
        const match = key.match(regex);
        if (match) {
          const num = match[1];
          if (!result[`${type}s`]) {
            result[`${type}s`] = {};
          }
          result[`${type}s`][num] = value;
        }
      }
    }

    return result;
  } catch (error) {
    console.error('Error parsing Adobe Analytics beacon:', error);
    return null;
  }
};

module.exports = {
  parseAdobeAnalyticsBeacon
}; 