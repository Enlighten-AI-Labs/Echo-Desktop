export function parseLogcatParameters(message) {
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

export function extractItems(parameters) {
  if (!parameters) return [];
  
  // Handle both direct parameters and nested params object
  const allParams = parameters.params ? { ...parameters, ...parameters.params } : parameters;
  
  // For logcat items array
  if (allParams.items) {
    // If items is already an array of objects
    if (Array.isArray(allParams.items)) {
      return allParams.items.map(item => ({
        item_id: item.item_id || item.id || 'N/A',
        item_name: item.item_name || item.name || 'Unknown Item',
        quantity: parseInt(item.quantity) || 1,
        price: parseFloat(item.price || item.value) || 0
      }));
    }
    
    // If items is a string that needs to be parsed
    if (typeof allParams.items === 'string') {
      try {
        // Clean up the string and try to parse it
        const cleanItemsStr = allParams.items.replace(/^\[|\]$/g, '');
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
  Object.entries(allParams).forEach(([key, value]) => {
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
} 