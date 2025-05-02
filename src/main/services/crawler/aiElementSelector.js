/**
 * AI Element Selector module - Uses Google Gemini to intelligently select elements to click
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const dotenv = require('dotenv');
const sharp = require('sharp');

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Initialize Gemini API
const API_KEY = process.env.GEMINI_API_KEY;
let genAI = null;

// Logging function that doesn't create circular dependencies
function log(message, type = 'info', logger = null) {
  // Always log to console
  if (type === 'error') {
    console.error(`[AI Selector] ${message}`);
  } else {
    console.log(`[AI Selector] ${message}`);
  }
  
  // If a logger function was passed, use it
  if (logger && typeof logger === 'function') {
    logger(message, type);
  }
}

/**
 * Initialize the Gemini API
 * @returns {boolean} Success indicator
 */
function initGeminiAPI(logger = null) {
  try {
    if (!API_KEY) {
      log('Gemini API key not found in .env.local', 'error', logger);
      return false;
    }
    
    genAI = new GoogleGenerativeAI(API_KEY);
    return true;
  } catch (error) {
    log(`Error initializing Gemini API: ${error.message}`, 'error', logger);
    return false;
  }
}

/**
 * Extract image section for a UI element
 * @param {string} screenshotBase64 Base64 encoded screenshot
 * @param {Object} bounds Element bounds {left, top, right, bottom}
 * @param {Function} logger Optional logging function
 * @returns {Promise<string>} Base64 encoded cropped image
 */
async function extractElementImageSection(screenshotBase64, bounds, logger = null) {
  try {
    // Decode base64 to buffer
    const imageBuffer = Buffer.from(screenshotBase64, 'base64');
    
    // Use sharp to crop the image
    const { left, top, right, bottom } = bounds;
    const width = right - left;
    const height = bottom - top;
    
    // Add some padding around the element for context (20px on each side)
    const paddedLeft = Math.max(0, left - 20);
    const paddedTop = Math.max(0, top - 20);
    const paddedWidth = Math.min(width + 40, 2000); // Limit maximum width
    const paddedHeight = Math.min(height + 40, 2000); // Limit maximum height
    
    const croppedImageBuffer = await sharp(imageBuffer)
      .extract({
        left: paddedLeft,
        top: paddedTop,
        width: paddedWidth,
        height: paddedHeight
      })
      .toBuffer();
    
    // Convert back to base64
    return croppedImageBuffer.toString('base64');
  } catch (error) {
    log(`Error extracting element image section: ${error.message}`, 'error', logger);
    return null;
  }
}

/**
 * Perform OCR on an image
 * @param {string} imageBase64 Base64 encoded image
 * @param {Function} logger Optional logging function
 * @returns {Promise<string>} OCR result text
 */
async function performOCR(imageBase64, logger = null) {
  try {
    // Create a temporary file for the image
    const tempImagePath = path.join(process.cwd(), `temp_ocr_${Date.now()}.png`);
    fs.writeFileSync(tempImagePath, Buffer.from(imageBase64, 'base64'));
    
    // Use Tesseract OCR (must be installed on the system)
    const { stdout } = await execPromise(`tesseract "${tempImagePath}" stdout`);
    
    // Clean up temporary file
    fs.unlinkSync(tempImagePath);
    
    return stdout.trim();
  } catch (error) {
    log(`OCR error: ${error.message}`, 'warning', logger);
    return '';
  }
}

/**
 * Prepare elements with additional information for AI analysis
 * @param {Array} elements UI elements from the crawler
 * @param {string} screenshotBase64 Full screenshot as base64
 * @param {string} uiHierarchy Full UI hierarchy XML
 * @param {Function} logger Optional logging function
 * @returns {Promise<Array>} Elements with additional AI-friendly information
 */
async function prepareElementsForAI(elements, screenshotBase64, uiHierarchy, logger = null) {
  log('Preparing elements for AI analysis', 'info', logger);
  
  const enhancedElements = [];
  
  // Process only clickable elements or those that might be interactive
  const interactableElements = elements.filter(element => {
    return element.clickable || 
           element.class.includes('Button') || 
           element.class.includes('EditText') || 
           element.class.includes('CheckBox') || 
           element.class.includes('Switch') || 
           element.class.includes('Spinner') ||
           (element.class.includes('View') && element.resourceId.includes('btn'));
  });
  
  log(`Found ${interactableElements.length} potentially interactable elements`, 'info', logger);
  
  // Extract XML context for each element - process in batches to reduce logging
  let processedCount = 0;
  
  for (let i = 0; i < interactableElements.length; i++) {
    const element = interactableElements[i];
    
    try {
      // Extract image section
      const elementImageBase64 = await extractElementImageSection(
        screenshotBase64, 
        element.bounds,
        logger
      );
      
      // Perform OCR on the element image
      let ocrText = '';
      if (elementImageBase64) {
        ocrText = await performOCR(elementImageBase64, logger);
      }
      
      // Find element's XML in the hierarchy
      let elementXml = '';
      // Simple matching based on bounds
      const { left, top, right, bottom } = element.bounds;
      const boundsStr = `bounds="\\[${left},${top}\\]\\[${right},${bottom}\\]"`;
      const elementRegex = new RegExp(`<node[^>]*${boundsStr}[^>]*>`, 'g');
      const xmlMatch = uiHierarchy.match(elementRegex);
      
      if (xmlMatch && xmlMatch.length > 0) {
        elementXml = xmlMatch[0];
      }
      
      enhancedElements.push({
        ...element,
        elementImage: elementImageBase64,
        ocrText,
        elementXml,
        aiScore: 0, // Will be filled in by the AI
      });
      
      processedCount++;
    } catch (error) {
      log(`Error processing element: ${error.message}`, 'error', logger);
    }
  }
  
  // Log completion summary instead of details for each element
  log(`Processed ${processedCount}/${interactableElements.length} elements with OCR and XML extraction`, 'info', logger);
  
  return enhancedElements;
}

/**
 * Format history data for Gemini prompt
 * @param {Array} history The exploration history
 * @returns {string} Formatted history text
 */
function formatHistoryForPrompt(history) {
  if (!history || history.length === 0) {
    return "No exploration history available yet.";
  }
  
  // Get the last 20 actions (most recent history) to avoid making the prompt too large
  const recentHistory = history.slice(-20);
  
  // Format the history entries
  const formattedEntries = recentHistory.map((entry, index) => {
    const screenInfo = `Screen: ${entry.screen.activity}`;
    const elementInfo = entry.element ? 
      `Element: ${entry.element.class}${entry.element.text ? ` "${entry.element.text}"` : ''}` : 
      'No element';
    
    return `${index + 1}. [${entry.action}] ${screenInfo} - ${elementInfo} (${entry.result})`;
  });
  
  return formattedEntries.join('\n');
}

/**
 * Create summary statistics from history
 * @param {Array} history The exploration history
 * @returns {Object} Summary statistics
 */
function getHistorySummary(history) {
  if (!history || history.length === 0) {
    return {
      screensVisited: 0,
      elementsClicked: 0,
      uniqueActivities: [],
      commonElementTypes: []
    };
  }
  
  // Count visited screens
  const uniqueScreens = new Set();
  
  // Count activities
  const activities = {};
  
  // Count clicked elements by type
  const elementTypes = {};
  
  // Process history entries
  history.forEach(entry => {
    // Track unique screens
    if (entry.screen && entry.screen.id) {
      uniqueScreens.add(entry.screen.id);
    }
    
    // Track activities
    if (entry.screen && entry.screen.activity) {
      const activity = entry.screen.activity;
      activities[activity] = (activities[activity] || 0) + 1;
    }
    
    // Track element types
    if (entry.element && entry.element.class && entry.action === 'click') {
      const elemType = entry.element.class;
      elementTypes[elemType] = (elementTypes[elemType] || 0) + 1;
    }
  });
  
  // Get sorted activities by frequency
  const sortedActivities = Object.entries(activities)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 5); // Top 5
  
  // Get sorted element types by frequency
  const sortedElementTypes = Object.entries(elementTypes)
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type)
    .slice(0, 5); // Top 5
  
  return {
    screensVisited: uniqueScreens.size,
    elementsClicked: Object.values(elementTypes).reduce((sum, count) => sum + count, 0),
    uniqueActivities: sortedActivities,
    commonElementTypes: sortedElementTypes
  };
}

/**
 * Use Gemini to analyze and score elements
 * @param {Array} enhancedElements Elements with added context
 * @param {string} aiPrompt User's prompt for the AI
 * @param {Function} logger Optional logging function
 * @param {Array} history Optional exploration history
 * @returns {Promise<Array>} Elements with AI scores
 */
async function scoreElementsWithGemini(enhancedElements, aiPrompt, logger = null, history = []) {
  // Check if Gemini API is initialized
  if (!genAI) {
    const initialized = initGeminiAPI(logger);
    if (!initialized) {
      log('Failed to initialize Gemini API, using random scoring instead', 'error', logger);
      // Fallback to random scoring
      return enhancedElements.map(el => ({
        ...el,
        aiScore: Math.random(),
        aiReasoning: 'Random fallback score (Gemini API not available)'
      }));
    }
  }
  
  try {
    log(`Analyzing ${enhancedElements.length} elements with Gemini AI using model: gemini-2.0-flash`, 'info', logger);
    
    // Create a model instance
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    
    // Get history summary to guide decision making
    const historySummary = getHistorySummary(history);
    
    // Format recent history for the prompt
    const formattedHistory = formatHistoryForPrompt(history);
    
    // Prepare a comprehensive prompt for Gemini
    let userPrompt = `
    You are an AI assistant helping to test a mobile app by intelligently selecting UI elements to click.
    
    USER INSTRUCTIONS: ${aiPrompt}
    
    EXPLORATION HISTORY:
    - Screens visited: ${historySummary.screensVisited}
    - Elements clicked: ${historySummary.elementsClicked}
    - Most frequent activities: ${historySummary.uniqueActivities.join(', ') || 'None yet'}
    - Most common element types: ${historySummary.commonElementTypes.join(', ') || 'None yet'}
    
    RECENT ACTIONS:
    ${formattedHistory}
    
    I will provide information about clickable elements on the current screen.
    For each element, analyze:
    1. The element class and resource ID
    2. OCR text from the element's region
    3. The element's XML attributes
    
    Your task is to rank each element from 0-100 based on:
    - How likely clicking it will help explore new screens
    - How well it matches the user's instructions
    - Whether the element appears to be a primary navigation or action item
    - How it relates to the exploration history (prefer new paths)
    
    For each element, provide a JSON object with:
    - score: Number from 0-100
    - reasoning: Brief explanation for your score
    
    RESPOND WITH VALID JSON ARRAY OF OBJECTS, ONE PER ELEMENT. Example:
    [
      {"elementIndex": 0, "score": 85, "reasoning": "This appears to be the main login button based on OCR text 'Log In' and its prominence"},
      {"elementIndex": 1, "score": 30, "reasoning": "This is likely just a decorative element with no text or function"}
    ]
    `;
    
    // Add element data to prompt
    userPrompt += "\n\nELEMENTS TO ANALYZE:\n";
    enhancedElements.forEach((element, index) => {
      userPrompt += `
      ELEMENT ${index}:
      Class: ${element.class}
      Resource ID: ${element.resourceId || 'None'}
      Text: ${element.text || 'None'}
      OCR Text: ${element.ocrText || 'None'}
      XML: ${element.elementXml || 'Not available'}
      Bounds: ${JSON.stringify(element.bounds)}
      Clickable: ${element.clickable}
      `;
    });
    
    // Generate content
    log('Sending request to Gemini API...', 'info', logger);
    const result = await model.generateContent(userPrompt);
    const response = await result.response;
    const responseText = response.text();
    
    // Parse the JSON response
    let scores = [];
    try {
      // Extract JSON from the response
      const jsonMatch = responseText.match(/\[\s*\{.*\}\s*\]/s);
      if (jsonMatch) {
        scores = JSON.parse(jsonMatch[0]);
        log('Successfully parsed Gemini API response', 'info', logger);
      } else {
        throw new Error("No valid JSON found in response");
      }
    } catch (parseError) {
      log(`Error parsing Gemini response: ${parseError.message}`, 'error', logger);
      log('Falling back to simple scoring based on text extraction', 'info', logger);
      
      // Try to extract scores using regex as fallback
      const scoreRegex = /ELEMENT\s*(\d+).*score:\s*(\d+)/gi;
      let match;
      while ((match = scoreRegex.exec(responseText)) !== null) {
        scores.push({
          elementIndex: parseInt(match[1]),
          score: parseInt(match[2]),
          reasoning: 'Extracted from text (fallback)'
        });
      }
      
      // If still no scores, use random scoring
      if (scores.length === 0) {
        scores = enhancedElements.map((_, i) => ({
          elementIndex: i,
          score: Math.floor(Math.random() * 100),
          reasoning: 'Random fallback score (parsing failed)'
        }));
      }
    }
    
    // Apply scores to elements
    const scoredElements = enhancedElements.map((element, index) => {
      const elementScore = scores.find(s => s.elementIndex === index);
      return {
        ...element,
        aiScore: elementScore ? elementScore.score : 0,
        aiReasoning: elementScore ? elementScore.reasoning : 'No reasoning provided'
      };
    });
    
    // Log only the top scoring elements
    const topElements = [...scoredElements]
      .sort((a, b) => b.aiScore - a.aiScore)
      .slice(0, 3);
      
    log('🔍 Top elements selected by AI:', 'success', logger);
    topElements.forEach((el, i) => {
      const elementText = el.text || el.ocrText || '';
      const textInfo = elementText ? ` "${elementText}"` : '';
      log(`${i+1}. ${el.class}${textInfo} - Score: ${el.aiScore}`, 'info', logger);
    });
    
    return scoredElements;
  } catch (error) {
    log(`Error using Gemini API: ${error.message}`, 'error', logger);
    
    // Fallback to basic scoring if AI fails
    return enhancedElements.map(el => ({
      ...el,
      aiScore: Math.random() * 100,
      aiReasoning: 'Random fallback score (API error)'
    }));
  }
}

/**
 * Prioritize elements based on AI analysis
 * @param {Array} elements Array of UI elements from the crawler
 * @param {string} aiPrompt User's prompt for the AI
 * @param {string} screenshotBase64 Current screenshot as base64
 * @param {string} uiHierarchy Current UI hierarchy as XML
 * @param {Function} logger Optional logging function
 * @param {Array} explorationHistory Optional exploration history
 * @returns {Promise<Array>} Prioritized elements array
 */
async function prioritizeElementsByAI(elements, aiPrompt, screenshotBase64, uiHierarchy, logger = null, explorationHistory = []) {
  try {
    // Skip AI processing if no elements or missing data
    if (!elements || elements.length === 0 || !screenshotBase64 || !uiHierarchy) {
      log('Missing required data for AI analysis, using default prioritization', 'warning', logger);
      return elements;
    }
    
    log('🤖 Starting AI-powered element prioritization', 'info', logger);
    if (aiPrompt) {
      log(`AI Prompt: "${aiPrompt}"`, 'info', logger);
    }
    
    // Log history size
    if (explorationHistory && explorationHistory.length > 0) {
      log(`Using exploration history with ${explorationHistory.length} entries`, 'info', logger);
    }
    
    // Prepare elements with enhanced information
    const enhancedElements = await prepareElementsForAI(
      elements,
      screenshotBase64,
      uiHierarchy,
      logger
    );
    
    // Use Gemini to score elements
    const scoredElements = await scoreElementsWithGemini(
      enhancedElements,
      aiPrompt,
      logger,
      explorationHistory
    );
    
    // Sort elements by AI score (highest first)
    const prioritizedElements = [...scoredElements]
      .sort((a, b) => b.aiScore - a.aiScore)
      .map(el => ({
        // Return only the original fields plus score
        bounds: el.bounds,
        class: el.class,
        text: el.text,
        resourceId: el.resourceId,
        clickable: el.clickable,
        buttonHash: el.buttonHash,
        aiScore: el.aiScore,
        aiReasoning: el.aiReasoning
      }));
    
    log(`✅ AI prioritization complete, ordered ${prioritizedElements.length} elements by relevance`, 'success', logger);
    return prioritizedElements;
  } catch (error) {
    log(`Error in AI prioritization: ${error.message}`, 'error', logger);
    return elements; // Return original elements on error
  }
}

module.exports = {
  prioritizeElementsByAI,
  initGeminiAPI
}; 