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

// Store the latest AI analysis for frontend display
let latestAnalysis = {
  timestamp: null,
  progressSummary: null,
  nextSteps: [],
  topElements: []
};

// Keep track of recently clicked elements to detect patterns
const RECENT_CLICKS_MEMORY = 5;
let recentlyClickedElements = [];

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
 * Add an element to the recently clicked tracking
 * @param {Object} element Element that was clicked
 */
function trackClickedElement(element) {
  if (!element || !element.buttonHash) return;
  
  // Add to the front of the array
  recentlyClickedElements.unshift(element.buttonHash);
  
  // Keep only the most recent elements
  if (recentlyClickedElements.length > RECENT_CLICKS_MEMORY) {
    recentlyClickedElements = recentlyClickedElements.slice(0, RECENT_CLICKS_MEMORY);
  }
}

/**
 * Reset the recently clicked elements tracking
 */
function resetClickedElementsTracking() {
  recentlyClickedElements = [];
}

/**
 * Detect if clicking this element would create a repetitive pattern
 * @param {Object} element Element to check
 * @returns {Object} Pattern detection result {isPattern: boolean, patternType: string, penaltyFactor: number}
 */
function detectRepetitivePattern(element) {
  if (!element || !element.buttonHash || recentlyClickedElements.length === 0) {
    return { isPattern: false, patternType: 'none', penaltyFactor: 1 };
  }
  
  const result = { 
    isPattern: false, 
    patternType: 'none', 
    penaltyFactor: 1 
  };
  
  // Case 1: Same button twice in a row
  if (element.buttonHash === recentlyClickedElements[0]) {
    result.isPattern = true;
    result.patternType = 'immediate_repeat';
    result.penaltyFactor = 0.2; // 80% reduction in score
  }
  
  // Case 2: A-B-A pattern
  else if (recentlyClickedElements.length >= 2 && 
          element.buttonHash === recentlyClickedElements[1]) {
    result.isPattern = true;
    result.patternType = 'alternating';
    result.penaltyFactor = 0.3; // 70% reduction in score
  }
  
  // Case 3: A-B-C-A cycle (returning to a button clicked 3 steps ago)
  else if (recentlyClickedElements.length >= 3 && 
          element.buttonHash === recentlyClickedElements[2]) {
    result.isPattern = true;
    result.patternType = 'short_cycle';
    result.penaltyFactor = 0.4; // 60% reduction in score
  }
  
  // Case 4: Clicked in the last few steps but not in a specific pattern
  else if (recentlyClickedElements.includes(element.buttonHash)) {
    result.isPattern = true;
    result.patternType = 'recent_repeat';
    result.penaltyFactor = 0.5; // 50% reduction in score
  }
  
  return result;
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
 * Get the latest AI analysis for display
 * @returns {Object} Latest analysis data
 */
function getLatestAnalysis() {
  return latestAnalysis;
}

/**
 * Extract progress information from AI prompt
 * @param {string} aiPrompt User's prompt
 * @returns {Object} Progress data
 */
function extractProgressFromPrompt(aiPrompt) {
  if (!aiPrompt) {
    return {
      type: 'unknown',
      steps: [],
      currentStep: 0
    };
  }
  
  // Try to parse the steps from a numbered list format
  const lines = aiPrompt.split('\n');
  const steps = [];
  let promptType = 'general';
  
  // Extract title if in brackets
  const titleMatch = aiPrompt.match(/^\s*\[(.*?)\]/);
  if (titleMatch) {
    promptType = titleMatch[1];
  }
  
  // Look for numbered steps
  for (const line of lines) {
    // Check for numbered step pattern (1. Step description)
    const stepMatch = line.match(/^\s*(\d+)\.\s*(.*?)$/);
    if (stepMatch) {
      steps.push(stepMatch[2].trim());
    }
  }
  
  return {
    type: promptType,
    steps: steps,
    currentStep: 0 // Will be calculated based on history
  };
}

/**
 * Calculate current progress step based on history
 * @param {Array} history Exploration history
 * @param {Object} progressData Progress data with steps
 * @returns {Object} Updated progress data with currentStep
 */
function calculateCurrentStep(history, progressData) {
  if (!history || history.length === 0 || !progressData.steps || progressData.steps.length === 0) {
    return progressData;
  }
  
  const result = { ...progressData };
  
  // Start at step 1 if we have actions (not step 0)
  let currentStep = history.length > 0 ? 1 : 0;
  
  // Use a decay factor to gradually reduce the likelihood of staying on early steps
  // This helps prevent getting stuck on step 1
  const ACTIONS_DECAY_THRESHOLD = 5; // After this many actions, start decaying early step matches
  
  // Extract keywords from each step
  const stepKeywords = progressData.steps.map(step => {
    // Extract important keywords from each step
    const words = step.toLowerCase().split(/\s+/);
    return words.filter(word => 
      word.length > 3 && 
      !['and', 'the', 'for', 'with', 'this', 'that', 'then', 'all', 'each'].includes(word)
    );
  });
  
  // Get click actions and screen visits
  const allActions = history.filter(entry => 
    entry.action === 'click' || entry.action === 'visit' || entry.action === 'revisit'
  );
  
  // For step progress, use recent history more heavily
  const recentActions = allActions.slice(-10);
  
  if (allActions.length > 0) {
    // Track step keyword matches with confidence scores
    const stepMatches = new Array(progressData.steps.length).fill(0);
    
    // Analyze each action for keyword matches to steps
    allActions.forEach((entry, actionIndex) => {
      // Get text from element and screen
      const elementText = (entry.element && entry.element.text) ? 
        entry.element.text.toLowerCase() : '';
      
      const screenName = (entry.screen && entry.screen.activity) ?
        entry.screen.activity.toLowerCase() : '';
      
      // Decay factor reduces the weight of matches for earlier actions if we have many actions
      // This helps us "move on" from early steps if we've performed many actions
      const decayFactor = allActions.length > ACTIONS_DECAY_THRESHOLD ? 
        Math.min(1, (actionIndex + 1) / allActions.length) : 1;
      
      // Recent actions get higher weight (recency bias)
      const recencyBoost = actionIndex >= allActions.length - 3 ? 1.5 : 1.0;
      
      // Check for keyword matches against each step
      stepKeywords.forEach((keywords, stepIndex) => {
        // Apply diminishing returns for repeated matches to the same step
        // This prevents us from getting stuck on early steps
        const diminishingFactor = stepMatches[stepIndex] > 0 ? 
          1 / (1 + Math.log(1 + stepMatches[stepIndex])) : 1;
        
        let matched = false;
        // Check if any keywords match
        keywords.forEach(keyword => {
          if (elementText.includes(keyword) || screenName.includes(keyword)) {
            matched = true;
            // Add score with all modifiers applied
            stepMatches[stepIndex] += 1 * decayFactor * recencyBoost * diminishingFactor;
          }
        });
      });
    });
    
    // Find the highest scoring step that's not the first one, with bonus for step sequence
    let maxScore = stepMatches[0];
    let maxStep = 0;
    
    for (let i = 1; i < stepMatches.length; i++) {
      // Add sequential bonus - we prefer steps in order
      const sequentialBonus = (i === maxStep + 1) ? 0.5 : 0;
      const adjustedScore = stepMatches[i] + sequentialBonus;
      
      // If this step has a significant score and is higher than current max, select it
      if (adjustedScore > 0.5 && adjustedScore >= maxScore) {
        maxScore = adjustedScore;
        maxStep = i;
      }
    }
    
    // Move to next step if we've performed many actions (3x the steps we have)
    // This prevents getting stuck if step detection isn't perfect
    if (allActions.length > progressData.steps.length * 3 && maxStep === 0) {
      maxStep = Math.min(1, progressData.steps.length - 1);
    }
    
    // Force progress after substantial activity
    if (allActions.length > 15 && maxStep < 2 && progressData.steps.length > 2) {
      maxStep = 2; // Move to at least step 2 after significant activity
    }
    
    // Determine current step (1-based indexing for display)
    currentStep = maxStep + 1;
  }
  
  // Never exceed the total steps available
  currentStep = Math.min(currentStep, progressData.steps.length);
  
  result.currentStep = currentStep;
  return result;
}

/**
 * Generate next steps based on progress
 * @param {Object} progressData Progress data
 * @returns {Array} Next steps to display
 */
function generateNextSteps(progressData) {
  if (!progressData || !progressData.steps || progressData.steps.length === 0) {
    return ["Explore the application according to the prompt"];
  }
  
  const { currentStep, steps } = progressData;
  
  // If not started or all steps completed
  if (currentStep === 0) {
    return ["Start by " + steps[0].toLowerCase()];
  }
  
  if (currentStep >= steps.length) {
    return ["All steps completed", "Verify the results", "Try additional edge cases"];
  }
  
  // Return current and next steps
  const nextSteps = [];
  
  // Current step (in progress)
  nextSteps.push(`Current: ${steps[currentStep - 1]}`);
  
  // Next step
  if (currentStep < steps.length) {
    nextSteps.push(`Next: ${steps[currentStep]}`);
  }
  
  // Add one more future step if available
  if (currentStep + 1 < steps.length) {
    nextSteps.push(`Then: ${steps[currentStep + 1]}`);
  }
  
  return nextSteps;
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
    log(`Analyzing ${enhancedElements.length} elements with Gemini AI using model: gemini-2.5-flash-preview-04-17`, 'info', logger);
    
    // Create a model instance
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-04-17" });
    
    // Get history summary to guide decision making
    const historySummary = getHistorySummary(history);
    
    // Extract progress information from prompt
    const progressData = extractProgressFromPrompt(aiPrompt);
    
    // Calculate current step based on history
    const updatedProgressData = calculateCurrentStep(history, progressData);
    
    // Generate next steps based on progress
    const nextSteps = generateNextSteps(updatedProgressData);
    
    // Format recent history for the prompt
    const formattedHistory = formatHistoryForPrompt(history);
    
    // Get the current step description
    const currentStepDescription = updatedProgressData.currentStep > 0 && updatedProgressData.currentStep <= updatedProgressData.steps.length
      ? updatedProgressData.steps[updatedProgressData.currentStep - 1]
      : "Explore the application";
    
    // Include information about recently clicked elements to avoid patterns
    let recentClicksInfo = "";
    if (recentlyClickedElements.length > 0) {
      recentClicksInfo = "\nRECENTLY CLICKED ELEMENTS:\n";
      recentlyClickedElements.forEach((hash, idx) => {
        // Find elements in history with this hash
        const matchingHistoryEntries = history.filter(entry => 
          entry.element && entry.element.hash === hash
        ).slice(-1);
        
        if (matchingHistoryEntries.length > 0) {
          const entry = matchingHistoryEntries[0];
          recentClicksInfo += `${idx+1}. Element: ${entry.element.class} "${entry.element.text || ''}" (hash: ${hash})\n`;
        } else {
          recentClicksInfo += `${idx+1}. Element hash: ${hash}\n`;
        }
      });
    }
    
    // Prepare a comprehensive prompt for Gemini with stronger focus on current step
    let userPrompt = `
    You are an AI assistant helping to test a mobile app by intelligently selecting UI elements to click.
    
    USER INSTRUCTIONS: ${aiPrompt}
    
    YOUR CURRENT TASK: ${currentStepDescription}
    
    CURRENT PROGRESS:
    - Testing type: ${updatedProgressData.type}
    - Current step: ${updatedProgressData.currentStep} of ${updatedProgressData.steps.length}
    
    ====== IMPORTANT ======
    Your ONLY objective right now is to identify elements that will help complete the current step.
    AVOID REPETITIVE PATTERNS: Do NOT recommend elements that:
    - Were just clicked in the previous action
    - Would create an alternating A-B-A pattern
    - Would create a cycle of repeatedly visiting the same screens
    Choose elements that move the testing forward to new screens and states.
    =====================
    
    Exploration history summary:
    - Screens visited: ${historySummary.screensVisited}
    - Elements clicked: ${historySummary.elementsClicked}
    - Most frequent activities: ${historySummary.uniqueActivities.join(', ') || 'None yet'}
    ${recentClicksInfo}
    
    Recent actions:
    ${formattedHistory}
    
    I will provide information about clickable elements on the current screen.
    For each element, analyze:
    1. The element class and resource ID
    2. OCR text from the element's region
    3. The element's XML attributes
    
    Your task is to rank each element from 0-100 based SOLELY on:
    - How likely clicking it will help COMPLETE THE CURRENT STEP: "${currentStepDescription}"
    - Elements that have clear text/labels matching the current step should receive highest scores
    - Elements that have been tried multiple times already should receive lower scores
    - AVOID elements that would create repetitive patterns of interaction
    
    For each element, provide a JSON object with:
    - score: Number from 0-100
    - reasoning: Brief explanation focused on how this relates to the CURRENT step
    
    RESPOND WITH VALID JSON ARRAY OF OBJECTS, ONE PER ELEMENT. Example:
    [
      {"elementIndex": 0, "score": 85, "reasoning": "This appears to be directly related to the current step"},
      {"elementIndex": 1, "score": 30, "reasoning": "Unlikely to help with the current step"}
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
      const baseScore = elementScore ? elementScore.score : 0;
      
      // Check for repetitive patterns and apply penalties
      const patternCheck = detectRepetitivePattern(element);
      let finalScore = baseScore;
      let reasoning = elementScore ? elementScore.reasoning : 'No reasoning provided';
      
      // Apply pattern penalty if detected
      if (patternCheck.isPattern) {
        finalScore = Math.round(baseScore * patternCheck.penaltyFactor);
        reasoning += ` (${patternCheck.patternType} pattern detected, score reduced)`;
        
        if (logger) {
          logger(`Reduced score for element ${element.buttonHash} due to ${patternCheck.patternType} pattern`, 'info');
        }
      }
      
      return {
        ...element,
        aiScore: finalScore,
        aiReasoning: reasoning,
        patternDetected: patternCheck.isPattern ? patternCheck.patternType : null
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
    
    // Store the analysis results for frontend display
    latestAnalysis = {
      timestamp: Date.now(),
      progressSummary: {
        type: updatedProgressData.type,
        currentStep: updatedProgressData.currentStep,
        totalSteps: updatedProgressData.steps.length,
        progressPercent: updatedProgressData.steps.length ? 
          Math.round((updatedProgressData.currentStep / updatedProgressData.steps.length) * 100) : 0
      },
      nextSteps: nextSteps,
      topElements: topElements.map(el => ({
        class: el.class,
        text: el.text || el.ocrText || '',
        score: el.aiScore,
        reasoning: el.aiReasoning
      }))
    };
    
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
    
    // Update recently clicked elements from history
    if (explorationHistory && explorationHistory.length > 0) {
      // Look for the most recent click actions
      const recentClicks = explorationHistory
        .filter(entry => entry.action === 'click' && entry.element && entry.element.hash)
        .slice(-RECENT_CLICKS_MEMORY);
      
      // Reset tracking
      resetClickedElementsTracking();
      
      // Add each recent click to tracking in order (most recent first)
      for (let i = recentClicks.length - 1; i >= 0; i--) {
        const element = {
          buttonHash: recentClicks[i].element.hash
        };
        trackClickedElement(element);
      }
      
      if (recentlyClickedElements.length > 0 && logger) {
        logger(`Tracking ${recentlyClickedElements.length} recently clicked elements to avoid repetitive patterns`, 'info');
      }
    }
    
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
  initGeminiAPI,
  getLatestAnalysis,
  trackClickedElement,
  resetClickedElementsTracking
};