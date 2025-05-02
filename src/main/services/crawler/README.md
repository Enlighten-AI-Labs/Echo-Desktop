# AI-Powered App Crawler

This module provides intelligent app crawling capabilities using Google's Gemini API.

## Setup

1. Install required dependencies:
   ```
   npm install dotenv sharp @google/generative-ai --save
   ```

2. Ensure Tesseract OCR is installed on your system:
   - **macOS**: `brew install tesseract`
   - **Linux**: `sudo apt-get install tesseract-ocr`
   - **Windows**: Download from [Tesseract GitHub](https://github.com/UB-Mannheim/tesseract/wiki)

3. Create a `.env.local` file in the project root with your Gemini API key:
   ```
   # Echo Desktop Environment Variables
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
   
   You can get your API key from: https://makersuite.google.com/app/apikey

## Usage

1. In the App Crawler UI, select "AI" as the crawling mode.
2. Enter a prompt to guide the AI's decision-making process.
3. Start crawling.

## How It Works

1. The crawler captures UI hierarchy (XML) and screenshots of each screen.
2. For each clickable element, it:
   - Extracts the image section containing the element
   - Performs OCR on the element image
   - Extracts the element's XML data
3. All this information is sent to the Gemini API with your prompt.
4. Gemini scores each element based on how likely it is to be useful for your testing goals.
5. The crawler clicks elements in order of their scores (highest first).

## Example Prompts

- "Focus on login and registration flows"
- "Explore settings and configuration options"
- "Find buttons that allow adding new content"
- "Test payment and checkout functionality" 