/**
 * Visual State module - handles screen tracking and flowchart data generation
 */

// Arrays to store screen data
let screens = [];
let uniqueScreens = [];

/**
 * Reset screens tracking
 */
function resetScreens() {
  screens = [];
  uniqueScreens = [];
}

/**
 * Add a screen to tracking
 * @param {Object} screen Screen data
 * @returns {number} ID of the added screen
 */
function addScreen(screen) {
  screens.push(screen);
  
  // Check if this is a unique screen
  const existingScreen = uniqueScreens.find(s => s.screenHash === screen.screenHash);
  if (!existingScreen) {
    uniqueScreens.push(screen);
  }
  
  return screen.id;
}

/**
 * Generate flowchart data from the tracked screens
 * @returns {Object} Flowchart data in a format suitable for visualization
 */
function generateFlowchartData() {
  // Create nodes for each unique screen
  const nodes = uniqueScreens.map(screen => {
    return {
      id: screen.id.toString(),
      label: screen.activity.split('/').pop(),
      data: {
        activity: screen.activity,
        screenshot: screen.screenshot,
        timestamp: screen.timestamp
      }
    };
  });
  
  // Create edges between screens
  const edges = [];
  
  // For each screen with a parent, add an edge
  screens.forEach(screen => {
    if (screen.parentScreenId) {
      // Check if this edge already exists to avoid duplicates
      const edgeExists = edges.some(edge => 
        edge.source === screen.parentScreenId.toString() && 
        edge.target === screen.id.toString()
      );
      
      if (!edgeExists) {
        edges.push({
          id: `e${screen.parentScreenId}-${screen.id}`,
          source: screen.parentScreenId.toString(),
          target: screen.id.toString()
        });
      }
    }
  });
  
  return {
    nodes,
    edges
  };
}

/**
 * Get all tracked screens
 * @returns {Array} All tracked screens
 */
function getScreens() {
  return screens;
}

module.exports = {
  screens,
  uniqueScreens,
  resetScreens,
  addScreen,
  generateFlowchartData,
  getScreens
}; 