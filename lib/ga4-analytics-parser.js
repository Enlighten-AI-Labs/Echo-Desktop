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

    // Parse items array if present
    let items = [];
    try {
      if (eventParams.items) {
        items = eventParams.items.map(item => ({
          // Required Parameters
          item_id: item.item_id || null,
          item_name: item.item_name || null,

          // Standard Item Parameters
          price: parseFloat(item.price) || 0,
          quantity: parseInt(item.quantity) || 1,
          item_brand: item.item_brand || null,
          item_variant: item.item_variant || null,
          item_category: item.item_category || null,
          item_category2: item.item_category2 || null,
          item_category3: item.item_category3 || null,
          item_category4: item.item_category4 || null,
          item_category5: item.item_category5 || null,
          item_list_id: item.item_list_id || null,
          item_list_name: item.item_list_name || null,
          affiliation: item.affiliation || null,
          currency: item.currency || eventParams.currency || null,
          discount: parseFloat(item.discount) || 0,
          coupon: item.coupon || null,
          item_location_id: item.item_location_id || null,
          index: parseInt(item.index) || null,

          // Additional Parameters
          item_calories: item.item_calories || null,
          item_discounted: typeof item.item_discounted === 'boolean' ? item.item_discounted : null,
          item_customized: typeof item.item_customized === 'boolean' ? item.item_customized : null,
          item_customization_amount: parseFloat(item.item_customization_amount) || 0,

          // Custom Parameters
          in_stock: typeof item.in_stock === 'boolean' ? item.in_stock : null,
          size: item.size || null,
          color: item.color || null,
          material: item.material || null,
          weight: item.weight || null,
          shipping_class: item.shipping_class || null,

          // Capture any other custom parameters
          custom_attributes: Object.entries(item)
            .filter(([key]) => ![ 
              'item_id', 'item_name', 'price', 'quantity', 'item_brand', 'item_variant',
              'item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5',
              'item_list_id', 'item_list_name', 'affiliation', 'currency', 'discount', 'coupon',
              'item_location_id', 'index', 'item_calories', 'item_discounted', 'item_customized',
              'item_customization_amount', 'in_stock', 'size', 'color', 'material', 'weight',
              'shipping_class'
            ].includes(key))
            .reduce((acc, [key, value]) => {
              acc[key] = value;
              return acc;
            }, {})
        }));
      }
    } catch (e) {
      console.error('Error parsing items array:', e);
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
        ...eventParams,
        items // Add parsed items array to parameters
      },
      events: [{
        name: params.get('en') || eventParams._en || 'page_view',
        params: {
          ...eventParams,
          items // Include parsed items in event params
        }
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
          
          // Check for numeric values
          if (/^-?\d+$/.test(cleanValue)) {
            cleanValue = parseInt(cleanValue, 10);
          } else if (/^-?\d*\.\d+$/.test(cleanValue)) {
            cleanValue = parseFloat(cleanValue);
          } 
          // Check for boolean values - properly handle 'true' and 'false' strings
          else if (cleanValue.toLowerCase() === 'true') {
            cleanValue = true;
          } else if (cleanValue.toLowerCase() === 'false') {
            cleanValue = false;
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

export { parseGA4Beacon, cleanEventName, parseLogcatParameters }; 