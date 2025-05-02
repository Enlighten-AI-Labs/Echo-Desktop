/**
 * Element Selector module - handles AI-based element selection
 * This is a legacy module that forwards to the new AI implementation
 */
const { prioritizeElementsByAI } = require('./aiElementSelector');

/**
 * Prioritize elements based on AI prompt
 * @param {Array} elements List of UI elements
 * @param {string} aiPrompt AI prompt for prioritization
 * @returns {Array} Prioritized list of elements
 * @deprecated Use prioritizeElementsByAI from aiElementSelector module instead
 */
function prioritizeElementsByAiPrompt(elements, aiPrompt) {
  console.log('WARNING: prioritizeElementsByAiPrompt is deprecated, using fallback implementation');
  console.log('Please update your code to use prioritizeElementsByAI from aiElementSelector module');
  
  // In a real implementation, this would use actual AI integration
  // For now, we'll use a simple heuristic based on the prompt text
  
  if (!aiPrompt || aiPrompt.trim() === '') {
    // If no prompt provided, return elements as-is
    return elements;
  }
  
  const prompt = aiPrompt.toLowerCase();
  
  // Score each element based on relevance to prompt
  const scoredElements = elements.map(element => {
    const text = (element.text || '').toLowerCase();
    const resourceId = (element.resourceId || '').toLowerCase();
    const className = (element.class || '').toLowerCase();
    
    let score = 0;
    
    // Check text content
    if (text && text !== '') {
      // Direct match
      if (text === prompt) {
        score += 100;
      }
      // Contains prompt
      else if (text.includes(prompt)) {
        score += 50;
      }
      // Prompt contains text
      else if (prompt.includes(text)) {
        score += 30;
      }
      
      // Split words and check for keyword matches
      const textWords = text.split(/\s+/);
      const promptWords = prompt.split(/\s+/);
      
      for (const word of promptWords) {
        if (word.length > 3 && textWords.includes(word)) {
          score += 10;
        }
      }
    }
    
    // Check resource ID
    if (resourceId && resourceId !== '') {
      // Id contains keywords from prompt
      const promptWords = prompt.split(/\s+/);
      for (const word of promptWords) {
        if (word.length > 3 && resourceId.includes(word)) {
          score += 15;
        }
      }
    }
    
    // Prioritize certain element types based on prompt
    if (prompt.includes('login') || prompt.includes('sign in')) {
      if (resourceId.includes('login') || resourceId.includes('signin') || text.includes('login') || text.includes('sign in')) {
        score += 40;
      }
      if (className.includes('button')) {
        score += 20;
      }
      if (className.includes('edittext')) {
        score += 10;
      }
    }
    
    if (prompt.includes('search')) {
      if (resourceId.includes('search') || text.includes('search')) {
        score += 40;
      }
      if (className.includes('edittext')) {
        score += 20;
      }
    }
    
    if (prompt.includes('next') || prompt.includes('continue')) {
      if (text.includes('next') || text.includes('continue') || resourceId.includes('next') || resourceId.includes('continue')) {
        score += 40;
      }
      if (className.includes('button')) {
        score += 20;
      }
    }
    
    // Prioritize buttons generally
    if (className.includes('button')) {
      score += 5;
    }
    
    return {
      element,
      score
    };
  });
  
  // Sort by score (highest first)
  scoredElements.sort((a, b) => b.score - a.score);
  
  // Return just the elements in priority order
  return scoredElements.map(item => item.element);
}

module.exports = {
  prioritizeElementsByAiPrompt,
  // Also export the new AI function for backward compatibility
  prioritizeElementsByAI
}; 