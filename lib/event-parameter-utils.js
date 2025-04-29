import { isEcommerceParameter } from './beacon-utils';

// Helper function to separate eCommerce parameters from general parameters
function separateParameters(parameters) {
  if (!parameters) return { ecommerce: {}, general: {} };
  
  const ecommerce = {};
  const general = {};
  
  // Handle both direct parameters and nested params object
  const allParams = parameters.params ? { ...parameters, ...parameters.params } : parameters;
  
  Object.entries(allParams).forEach(([key, value]) => {
    // Skip the 'params' object itself since we've already merged it
    if (key === 'params') return;
    
    // Clean the key name by removing analytics suffixes
    const cleanKey = key.replace(/\([^)]+\)/g, '').trim();
    
    if (isEcommerceParameter(cleanKey)) {
      ecommerce[cleanKey] = value;
    } else {
      general[cleanKey] = value;
    }
  });
  
  return { ecommerce, general };
}

// Helper function to extract items from parameters
function extractItems(parameters) {
  if (!parameters) return [];
  
  // Handle both direct parameters and nested params object
  const allParams = parameters.params ? { ...parameters, ...parameters.params } : parameters;
  
  // For GA4 items array
  if (allParams.items) {
    // If items is already an array of objects
    if (Array.isArray(allParams.items)) {
      return allParams.items.map(item => ({
        // Required Parameters
        item_id: item.item_id || 'N/A',
        item_name: item.item_name || 'Unknown Item',

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
        currency: item.currency || parameters.currency || 'USD',
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

        // Any other custom parameters
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
  }
  
  // For individual item parameters (legacy or single-item events)
  const itemData = {
    item_id: allParams.item_id || allParams.product_id || 'N/A',
    item_name: allParams.item_name || allParams.product_name || 'Unknown Item',
    price: parseFloat(allParams.price || allParams.product_price) || 0,
    quantity: parseInt(allParams.quantity || allParams.product_quantity) || 1,
    item_brand: allParams.item_brand || allParams.product_brand || null,
    item_variant: allParams.item_variant || allParams.product_variant || null,
    item_category: allParams.item_category || allParams.product_category || null,
    item_category2: allParams.item_category2 || null,
    item_category3: allParams.item_category3 || null,
    item_category4: allParams.item_category4 || null,
    item_category5: allParams.item_category5 || null,
    item_list_id: allParams.item_list_id || allParams.product_list_id || null,
    item_list_name: allParams.item_list_name || allParams.product_list_name || null,
    affiliation: allParams.affiliation || null,
    currency: allParams.currency || 'USD',
    discount: parseFloat(allParams.discount) || 0,
    coupon: allParams.coupon || null,
    item_location_id: allParams.item_location_id || null,
    index: parseInt(allParams.index) || null,
    item_calories: allParams.item_calories || null,
    item_discounted: typeof allParams.item_discounted === 'boolean' ? allParams.item_discounted : null,
    item_customized: typeof allParams.item_customized === 'boolean' ? allParams.item_customized : null,
    item_customization_amount: parseFloat(allParams.item_customization_amount) || 0,
    in_stock: typeof allParams.in_stock === 'boolean' ? allParams.in_stock : null,
    size: allParams.size || null,
    color: allParams.color || null,
    material: allParams.material || null,
    weight: allParams.weight || null,
    shipping_class: allParams.shipping_class || null
  };

  // If we have at least a name or ID, create an item
  if (itemData.item_name || itemData.item_id) {
    return [itemData];
  }
  
  return [];
}

// Helper function to format price
function formatPrice(price) {
  if (typeof price === 'number') {
    return price.toFixed(2);
  }
  return price;
}

export {
  separateParameters,
  extractItems,
  formatPrice
}; 