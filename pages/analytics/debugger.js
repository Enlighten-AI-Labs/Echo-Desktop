import { useEffect, useState, useRef, useCallback } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import AnalyticsDebugger from '@/components/analytics/AnalyticsDebugger';
import styles from '@/styles/pages/debugger.module.css';
import LogEntry from '@/components/common/LogEntry';

// Dynamically import ReactFlow to avoid SSR issues
const ReactFlow = dynamic(
  () => import('@xyflow/react').then((mod) => mod.default),
  { ssr: false, loading: () => <div className={styles.flowLoading}>Loading Flow Chart...</div> }
);

// Also dynamically import the other components
const { MiniMap, Controls, Background, MarkerType } = dynamic(
  () => import('@xyflow/react'),
  { ssr: false }
);

import '@xyflow/react/dist/style.css';

// Helper function to beautify XML (copied from app-crawler.js)
function beautifyXml(xml) {
  if (!xml) return '';
  
  // Replace self-closing tags to make them more readable
  let formatted = xml.replace(/<([a-zA-Z0-9_.-]+)([^>]*)\/>/g, '<$1$2></$1>');
  
  // Create proper indentation
  let indent = '';
  let result = '';
  const lines = formatted.split(/>\s*</);
  
  if (lines.length) {
    // Add back the > and < characters
    result = lines[0];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if this is a closing tag
      if (line.match(/^\/\w/)) {
        indent = indent.substring(2);
      }
      
      result += '>\n' + indent + '<' + line;
      
      // Check if this is not a closing tag and not a self-closing tag
      if (!line.match(/^\//) && !line.match(/\/$/)) {
        indent += '  ';
      }
    }
  }
  
  return result.trim();
}

// Create a utility function for auto-collapse thresholds
const MIN_PANEL_WIDTH = 20; // Minimum percentage width for a panel before it should auto-collapse

// Rename to DebuggerView and accept navigateTo and params as props
export default function DebuggerView({ navigateTo, params }) {
  // Replace router with params
  // const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [packageName, setPackageName] = useState('');
  const [splitRatio, setSplitRatio] = useState(0); // Start with 0 since left panel is collapsed
  const [isResizing, setIsResizing] = useState(false);
  const [startX, setStartX] = useState(0);
  const containerRef = useRef(null);
  const dividerRef = useRef(null);
  
  // New state variables for collapsible panels
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(true); // Start with App Crawler collapsed
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [previousSplitRatio, setPreviousSplitRatio] = useState(50); // Save previous split ratio when collapsing
  const [lastResizeTime, setLastResizeTime] = useState(0);
  const currentSplitRatio = useRef(0); // Use ref to track current ratio without re-renders
  
  // Track if we're in an animation transition
  const [isAnimating, setIsAnimating] = useState(false);

  // App Crawler State
  const [crawlStatus, setCrawlStatus] = useState('idle'); // idle, running, completed, error
  const [crawlProgress, setCrawlProgress] = useState(0);
  const [screens, setScreens] = useState([]);
  const [currentScreen, setCurrentScreen] = useState(null);
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);
  const logsRef = useRef([]); // Reference to maintain logs across renders
  const [showConfig, setShowConfig] = useState(true);
  const [viewType, setViewType] = useState('grid'); // 'grid', 'list', 'flow'
  const [flowNodes, setFlowNodes] = useState([]);
  const [flowEdges, setFlowEdges] = useState([]);
  const [flowReady, setFlowReady] = useState(false);
  const [showFlow, setShowFlow] = useState(false);
  const [showXmlPopup, setShowXmlPopup] = useState(false);
  
  const [crawlSettings, setCrawlSettings] = useState({
    maxScreens: 20,
    screenDelay: 1000, // ms between actions
    ignoreElements: ['android.widget.ImageView'], // Element types to ignore for interaction
    stayInApp: true,
    mode: 'random', // 'random', 'orderly', or 'ai'
    aiPrompt: '' // Prompt for AI-powered crawling
  });
  
  // New state variables for vertical split
  const [verticalSplitRatio, setVerticalSplitRatio] = useState(40); // Start with 40% for settings
  const [isVerticalResizing, setIsVerticalResizing] = useState(false);
  const [startY, setStartY] = useState(0);
  const leftPanelRef = useRef(null);
  
  // New state for AI prompt modal
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  // New state variables for three-step AI modal workflow
  const [aiModalStep, setAiModalStep] = useState(1); // 1: Vertical, 2: Journey, 3: Prompt
  const [selectedVertical, setSelectedVertical] = useState(null);
  const [selectedJourney, setSelectedJourney] = useState(null);
  const [selectedJourneys, setSelectedJourneys] = useState([]);
  const [verticalPrompts, setVerticalPrompts] = useState({
    // Vertical name: [{ name, description, prompt }]
    'QSR': [
      { 
        name: 'Login Flow', 
        description: 'Test user authentication and account access.', 
        prompt: '1. Navigate to the login screen by looking for a profile icon, account button, or "Sign In" text.\n2. Look for username/email and password fields.\n3. Enter test credentials in the appropriate fields.\n4. Look for and tap the login or submit button.\n5. Verify successful login by checking for account information, personalized greeting, or profile details.\n6. If an error occurs, capture the error message.\n7. Check for persistence of login state when revisiting the app.\n8. Look for logout option and verify it functions correctly.'
      },
      { 
        name: 'Loyalty Redemption', 
        description: 'Test rewards program functionality and point redemption.', 
        prompt: '1. Navigate to the loyalty or rewards section of the app.\n2. Check for point balance and available rewards.\n3. Select a reward to redeem and proceed to the redemption flow.\n4. Verify the confirmation dialog or screen appears with reward details.\n5. Complete the redemption process and check for confirmation.\n6. Verify the updated point balance after redemption.\n7. Look for redemption history or active rewards section.\n8. Check the functionality of reward barcode or QR code generation.'
      },
      { 
        name: 'Menu Browsing & Cart Addition', 
        description: 'Test product browsing and shopping cart functionality.', 
        prompt: '1. Navigate to the menu or product browsing section.\n2. Browse different categories of products.\n3. Select a product and view its details.\n4. Check for customization options and modifiers.\n5. Add the product to cart with selected options.\n6. Add multiple items to cart from different categories.\n7. Open the cart and verify all items are correctly added with proper options.\n8. Test increasing/decreasing item quantity in the cart.\n9. Try removing items from the cart.'
      },
      { 
        name: 'Checkout Flow', 
        description: 'Test payment process and order confirmation.', 
        prompt: '1. Add several items to the cart.\n2. Navigate to checkout or cart summary.\n3. Check for delivery/pickup options and select one.\n4. Enter or select a delivery address if applicable.\n5. Check for time selection options.\n6. Review order details including subtotal, tax, and total.\n7. Select a payment method or enter payment information.\n8. Check for promo code or discount functionality.\n9. Proceed to order confirmation and verify the order summary.\n10. Check for order tracking information or status.'
      },
      { 
        name: 'Mobile Order Pickup', 
        description: 'Test pickup process and location-based services.', 
        prompt: '1. Add items to cart and proceed to checkout.\n2. Select "Pickup" as the fulfillment method.\n3. Check for store/location selection functionality.\n4. Test location services integration if available.\n5. Select pickup time or check for ASAP option.\n6. Complete checkout process for pickup order.\n7. Check for order confirmation with pickup details.\n8. Look for functionality to indicate arrival at store (curbside notification).\n9. Test order status tracking features.'
      },
      { 
        name: 'Full Regression Test', 
        description: 'Comprehensive testing of all core app functions.', 
        prompt: 'Perform a complete exploration of the QSR application focusing on the following user flows:\n\n1. Account Creation and Login\n   - Sign-up process with form validation\n   - Login with credentials\n   - Password reset functionality\n   - Biometric authentication if available\n\n2. Menu Navigation and Ordering\n   - Category browsing\n   - Item detail viewing\n   - Customization options\n   - Special requests handling\n   - Add-on/upsell functionality\n   - Cart management\n\n3. Location Services\n   - Store finder functionality\n   - Location permissions handling\n   - Store favorites or recents\n   - Store-specific menu variations\n\n4. Checkout Process\n   - Pickup vs. delivery selection\n   - Address entry and validation\n   - Scheduled order timing\n   - Payment method management\n   - Order review and confirmation\n\n5. Loyalty Program\n   - Points display and history\n   - Reward redemption\n   - Special offers access\n   - Membership tier status\n\n6. Order History and Reordering\n   - Past order display\n   - Reorder functionality\n   - Order tracking\n   - Order status notifications'
      }
    ],
    'Retail & E-Commerce': [
      { 
        name: 'Product Search & Filtering', 
        description: 'Test search functionality and product filtering.', 
        prompt: '1. Locate and tap the search bar.\n2. Enter search terms for various products.\n3. Examine search results for relevance.\n4. Test filtering options (price, ratings, categories).\n5. Sort results using different criteria.\n6. Test auto-complete suggestions if available.\n7. Try searching by product code or SKU.\n8. Check for "No results" state with invalid search terms.'
      },
      { 
        name: 'Product Details & Reviews', 
        description: 'Test product detail pages and review functionality.', 
        prompt: '1. Select a product from search results or category listings.\n2. Verify product information (images, description, price).\n3. Check for size/variant selection options.\n4. Test product image gallery and zoom functionality.\n5. Browse product reviews and ratings.\n6. Test "Add to Favorites/Wishlist" functionality.\n7. Look for "Share Product" options.\n8. Check for related/recommended products section.'
      },
      { 
        name: 'Cart & Checkout', 
        description: 'Test shopping cart and purchase process.', 
        prompt: '1. Add multiple products to cart.\n2. Navigate to cart and verify all items.\n3. Test quantity adjustments and removals.\n4. Check for saved/wishlist items integration.\n5. Proceed to checkout and verify shipping options.\n6. Enter shipping address or select from saved addresses.\n7. Test payment method selection and entry.\n8. Check for order summary and total calculation.\n9. Verify order confirmation and receipt.'
      },
      { 
        name: 'Product Discovery & Search', 
        description: 'Test product browsing and search functionality.', 
        prompt: '1. Navigate to the main product browsing interface.\n2. Test category navigation by selecting various departments or categories.\n3. Use the search bar to search for specific products.\n4. Test filters (price, rating, brand, etc.).\n5. Test sort functionality (price high/low, newest, etc.).\n6. Verify product images load correctly.\n7. Check for availability indicators.\n8. Test pagination or infinite scroll functionality.\n9. Verify recently viewed products appear if feature exists.'
      },
      { 
        name: 'Checkout Process', 
        description: 'Test the complete checkout and payment flow.', 
        prompt: '1. Navigate to shopping cart after adding items.\n2. Verify all items, quantities, and variants are correct.\n3. Test quantity modification and item removal.\n4. Look for and apply promotional codes.\n5. Proceed to checkout.\n6. Test guest checkout if available.\n7. Enter or select shipping address.\n8. Select shipping method and verify cost updates.\n9. Enter or select payment method.\n10. Review order summary including tax and shipping.\n11. Complete purchase.\n12. Verify order confirmation page with order number.\n13. Check for email confirmation.'
      },
      { 
        name: 'Account Management', 
        description: 'Test user account settings and preferences.', 
        prompt: '1. Navigate to account settings or profile section.\n2. Verify personal information is displayed correctly.\n3. Test updating contact information.\n4. Check order history functionality.\n5. Verify saved addresses can be viewed, edited, and deleted.\n6. Test payment method management.\n7. Check notification preferences settings.\n8. Verify wishlist items persist and display correctly.\n9. Test account password change functionality if available.'
      },
      { 
        name: 'Returns/Exchange Process', 
        description: 'Test product return and exchange workflows.', 
        prompt: '1. Navigate to order history section.\n2. Select a recent order.\n3. Look for return or exchange option.\n4. Select items to return and specify reason.\n5. Test return method selection (mail, in-store).\n6. Complete return authorization process.\n7. Verify return confirmation and tracking information.\n8. Check for refund status information.\n9. Test return label printing if applicable.'
      }
    ],
    'Financial Services': [
      { 
        name: 'Account Dashboard', 
        description: 'Test account overview and balance information.', 
        prompt: '1. Log in to the financial app.\n2. Navigate to the main dashboard or account overview.\n3. Check for account balances and recent transactions.\n4. Test account switching functionality for multiple accounts.\n5. Verify data visualization elements (graphs, charts).\n6. Check for alerts or notifications section.\n7. Test quick action buttons (transfer, deposit, pay).\n8. Verify account details and settings access.'
      },
      { 
        name: 'Money Transfer', 
        description: 'Test funds transfer between accounts or to other users.', 
        prompt: '1. Navigate to the transfer section.\n2. Test internal transfers between owned accounts.\n3. Attempt to add a new recipient for external transfers.\n4. Test the recipient selection interface.\n5. Enter transfer amount and verify any limits.\n6. Add a note or memo to the transfer.\n7. Review transfer details before confirmation.\n8. Verify confirmation and receipt options.\n9. Check transfer history for the completed transaction.'
      },
      { 
        name: 'Bill Payment', 
        description: 'Test bill payment functionality and scheduling.', 
        prompt: '1. Navigate to bill pay section.\n2. Check for saved billers or add a new biller.\n3. Select a biller and enter payment amount.\n4. Test scheduling options for future payments.\n5. Set up a recurring payment if available.\n6. Review payment details before confirming.\n7. Check for confirmation and receipt.\n8. Verify payment history and status tracking.'
      },
      { 
        name: 'Account Authentication', 
        description: 'Test all login methods and security features.', 
        prompt: '1. Open the app and look for login screen.\n2. Test username/password login with valid credentials.\n3. Test biometric authentication if available (fingerprint, face ID).\n4. Check for two-factor authentication flow.\n5. Test "Remember Me" functionality if available.\n6. Verify error handling for incorrect credentials.\n7. Test "Forgot Password" flow.\n8. Verify session timeout and re-authentication.\n9. Test quick-access PIN functionality if available.'
      },
      { 
        name: 'Account Dashboard', 
        description: 'Test main account overview and functionality.', 
        prompt: '1. After login, verify account dashboard loads correctly.\n2. Check that account balances display correctly for all accounts.\n3. Verify recent transactions appear and display correctly.\n4. Test account selector/switcher if multiple accounts exist.\n5. Check for alerts or notifications.\n6. Test quick action buttons (transfer, pay, deposit).\n7. Verify charts or graphs load correctly if applicable.\n8. Test refresh/pull to update functionality.\n9. Check spending insights or budget features if available.'
      },
      { 
        name: 'Fund Transfer', 
        description: 'Test money movement between accounts and to recipients.', 
        prompt: '1. Navigate to transfer section.\n2. Test transfer between own accounts.\n3. Test transfer to existing external recipients.\n4. Test adding new recipient functionality.\n5. Verify amount entry and validation.\n6. Test scheduling future transfers.\n7. Test recurring transfer setup.\n8. Complete transfer and verify confirmation.\n9. Check for transfer limits and warnings.\n10. Verify transfer appears in pending transactions.\n11. Test transfer cancellation if available.'
      },
      { 
        name: 'Mobile Check Deposit', 
        description: 'Test check deposit using device camera.', 
        prompt: '1. Navigate to deposit or check deposit section.\n2. Select account for deposit.\n3. Enter check amount.\n4. Test camera access for check front image capture.\n5. Test camera access for check back image capture.\n6. Verify image quality detection and feedback.\n7. Confirm deposit details.\n8. Verify deposit confirmation and processing time information.\n9. Check deposit history and status.\n10. Verify deposit appears in pending transactions.'
      }
    ],
    'Travel & Hospitality': [
      { 
        name: 'Search & Booking', 
        description: 'Test travel search and reservation process.', 
        prompt: '1. Navigate to the search section.\n2. Enter destination and dates.\n3. Test filters for accommodation/flight options.\n4. Examine search results for relevance and sorting.\n5. Select an option and check detailed information.\n6. Test room/seat selection process.\n7. Enter traveler information.\n8. Add any extras or special requests.\n9. Review booking summary.\n10. Test payment process and confirmation.'
      },
      { 
        name: 'Itinerary Management', 
        description: 'Test trip management and modification functionality.', 
        prompt: '1. Access the trips or bookings section.\n2. Check for upcoming and past reservations.\n3. Select a booking to view detailed itinerary.\n4. Test modification options (dates, rooms, seats).\n5. Attempt to add extras to an existing booking.\n6. Check cancellation policy and process.\n7. Verify any change fees or refund information.\n8. Test sharing itinerary functionality.\n9. Check for booking confirmation resending.'
      },
      { 
        name: 'Check-in Flow', 
        description: 'Test digital check-in process and documents.', 
        prompt: '1. Navigate to an upcoming reservation.\n2. Locate and initiate the check-in process.\n3. Verify timing restrictions (if applicable).\n4. Complete required check-in information.\n5. Test document upload if needed (ID, passport).\n6. Check for seat/room selection or upgrade options.\n7. Complete any payment for extras.\n8. Verify digital key or boarding pass generation.\n9. Test save to wallet functionality if available.'
      },
      { 
        name: 'Search & Discovery', 
        description: 'Test travel planning and destination exploration.', 
        prompt: '1. Navigate to search interface.\n2. Test location search functionality (hotels, destinations, airports).\n3. Test date selection interface for check-in/check-out or departure/return.\n4. Test guest/passenger count selection.\n5. Test search filters (price range, ratings, amenities).\n6. Verify search results display correctly.\n7. Test map view if available.\n8. Test sorting options (price, rating, distance).\n9. Check for special offers or promotions display.\n10. Verify saved searches functionality if available.'
      },
      { 
        name: 'Booking Flow', 
        description: 'Test complete reservation and payment process.', 
        prompt: '1. Select a hotel/flight/rental from search results.\n2. Verify details page displays correctly (room types, flight details, car classes).\n3. Select specific options (room type, seat selection, car type).\n4. Add additional services if available (breakfast, insurance, wifi).\n5. Proceed to guest/passenger information.\n6. Enter required traveler details.\n7. Enter or select payment information.\n8. Review booking summary.\n9. Complete booking process.\n10. Verify booking confirmation with reference number.\n11. Check for email confirmation.'
      },
      { 
        name: 'Loyalty Program Interaction', 
        description: 'Test rewards program functionality and benefits.', 
        prompt: '1. Navigate to loyalty program section.\n2. Verify points/miles balance displays correctly.\n3. Check account status and tier information.\n4. Test points/miles redemption process.\n5. Verify redemption options display correctly.\n6. Test points/miles history functionality.\n7. Check for special member offers.\n8. Verify membership card or QR code display.\n9. Test linking reservations to loyalty account.\n10. Check expiration information for points/status.'
      }
    ],
    'Healthcare & Pharma': [
      { 
        name: 'Appointment Booking', 
        description: 'Test medical appointment scheduling process.', 
        prompt: '1. Navigate to appointment booking section.\n2. Test provider search functionality.\n3. Select provider and view available time slots.\n4. Choose appointment type or reason for visit.\n5. Select date and time for appointment.\n6. Enter any required pre-appointment information.\n7. Verify insurance information section.\n8. Complete booking and check for confirmation.\n9. Test appointment modification and cancellation.'
      },
      { 
        name: 'Medication Management', 
        description: 'Test prescription management and reminders.', 
        prompt: '1. Navigate to medications or pharmacy section.\n2. Check current prescription list.\n3. Test adding a new medication manually.\n4. Set up medication reminders and schedules.\n5. Test refill request functionality.\n6. Check prescription history and details.\n7. Verify medication information and instructions.\n8. Test pharmacy location finder if available.'
      },
      { 
        name: 'Telehealth Session', 
        description: 'Test virtual healthcare appointment flow.', 
        prompt: '1. Schedule a telehealth appointment.\n2. Navigate to upcoming appointments.\n3. Test pre-appointment checklist or requirements.\n4. Check waiting room functionality.\n5. Test camera and microphone permissions.\n6. Verify connection quality indicators.\n7. Test chat or messaging during session.\n8. Check post-appointment summary and follow-ups.\n9. Verify prescription or referral generation if applicable.'
      },
      { 
        name: 'Health Records Access', 
        description: 'Test medical records and lab results viewing.', 
        prompt: '1. Navigate to medical records or health section.\n2. Verify test results display correctly.\n3. Test filtering by date or result type.\n4. Check for detailed result view functionality.\n5. Verify vitals history and trends if available.\n6. Test immunization record access.\n7. Check for document upload functionality if available.\n8. Test document download or sharing options.\n9. Verify visit summaries are accessible.\n10. Test printing functionality if available.'
      },
      { 
        name: 'Insurance Verification', 
        description: 'Test insurance coverage and eligibility checking.', 
        prompt: '1. Navigate to insurance or billing section.\n2. Verify insurance information displays correctly.\n3. Test adding or updating insurance information.\n4. Check for coverage verification functionality.\n5. Test cost estimate tools if available.\n6. Verify copay or patient responsibility information.\n7. Check for prior authorization status if applicable.\n8. Test payment functionality for outstanding balances.\n9. Verify explanation of benefits access if available.\n10. Check for insurance card image upload or display.'
      }
    ],
    'Media & Entertainment': [
      { 
        name: 'Content Discovery', 
        description: 'Test search and recommendations functionality.', 
        prompt: '1. Explore the home screen for featured content.\n2. Test search functionality with various terms.\n3. Check category browsing and filtering.\n4. Examine recommendation algorithms.\n5. Test "Continue Watching" or "Listen Later" sections.\n6. Check for personalized content suggestions.\n7. Verify trending or popular content sections.\n8. Test genre-based exploration.\n9. Check for new releases or recently added content.'
      },
      { 
        name: 'Media Playback', 
        description: 'Test streaming and playback controls.', 
        prompt: '1. Select content item to play.\n2. Verify playback starts correctly.\n3. Test play/pause functionality.\n4. Check seeking/scrubbing through content.\n5. Test volume controls.\n6. Verify quality settings and adjustments.\n7. Test full-screen mode.\n8. Check for subtitle/caption options.\n9. Test playback speed adjustments if available.\n10. Verify auto-play for next episode functionality.'
      },
      { 
        name: 'Playlist & Library Management', 
        description: 'Test content organization and library features.', 
        prompt: '1. Navigate to library or saved content section.\n2. Test adding content to watchlist/library.\n3. Create a new playlist or collection.\n4. Add items to the created playlist.\n5. Test reordering items in playlist.\n6. Remove items from playlists.\n7. Check for download functionality for offline viewing.\n8. Test sharing playlists with others.\n9. Verify recently played/watched history.'
      },
      { 
        name: 'Subscription Management', 
        description: 'Test subscription plans and payment functionality.', 
        prompt: '1. Navigate to account or subscription section.\n2. Verify current plan information displays correctly.\n3. Test plan change or upgrade options.\n4. Check for promotional offers.\n5. Verify billing information and history.\n6. Test payment method management.\n7. Check for subscription cancellation process.\n8. Verify renewal date information.\n9. Test family or profile management if available.\n10. Check for subscription-specific content access.'
      },
      { 
        name: 'User Profile Management', 
        description: 'Test user profiles and personalization features.', 
        prompt: '1. Navigate to profile section.\n2. Check for profile selection if multiple profiles exist.\n3. Test profile creation process.\n4. Verify profile editing functionality.\n5. Test content preferences or personalization settings.\n6. Check for parental controls or restrictions.\n7. Test viewing history access.\n8. Verify ratings or reviews submitted.\n9. Test profile image change if available.\n10. Check language preferences setting.'
      },
      { 
        name: 'Content Downloading', 
        description: 'Test offline viewing and download management.', 
        prompt: '1. Navigate to content for download.\n2. Look for download button or option.\n3. Test initiating download process.\n4. Verify download progress indicator.\n5. Check for download quality options.\n6. Test download cancellation.\n7. Navigate to downloaded content section.\n8. Verify offline playback of downloaded content.\n9. Test download expiration information.\n10. Check for auto-download settings for series.\n11. Verify storage usage information.'
      }
    ],
    'Telecommunications': [
      { 
        name: 'Account Management', 
        description: 'Test account settings and service management.', 
        prompt: '1. Log in to the telecom app.\n2. View account overview and summary.\n3. Check current plan details and usage.\n4. Test viewing and downloading bills.\n5. Navigate to payment history section.\n6. Test adding or changing payment methods.\n7. Verify account settings modification.\n8. Check for user profile management.\n9. Test notification preferences settings.'
      },
      { 
        name: 'Plan Management', 
        description: 'Test service plan browsing and changes.', 
        prompt: '1. Navigate to plans or services section.\n2. View current plan details and features.\n3. Browse available plan options.\n4. Compare current plan with alternatives.\n5. Select a new plan and view changes/differences.\n6. Check for add-ons or extras available.\n7. Test the plan change simulation/cart process.\n8. Verify confirmation and effective date of changes.\n9. Check for contract details and terms.'
      },
      { 
        name: 'Support & Troubleshooting', 
        description: 'Test customer support and service diagnostics.', 
        prompt: '1. Navigate to help or support section.\n2. Test service status checker.\n3. Check for known outages in your area.\n4. Try the automated troubleshooting tools.\n5. Test device diagnostic tools if available.\n6. Navigate to FAQs and self-help resources.\n7. Check for live chat support options.\n8. Test support ticket submission.\n9. Verify callback or appointment scheduling for technical support.'
      },
      { 
        name: 'Usage Monitoring', 
        description: 'Test data and service usage tracking features.', 
        prompt: '1. Navigate to usage or data section.\n2. Verify current billing cycle dates.\n3. Check that data usage displays correctly with visual indicators.\n4. Test talk time/minutes usage display.\n5. Verify messaging usage information.\n6. Check for usage alerts or threshold settings.\n7. Test usage history by billing cycle.\n8. Verify usage by line or device if multiple lines exist.\n9. Check for detailed usage breakdown (roaming, international).\n10. Test data speed or throttling information if applicable.'
      },
      { 
        name: 'Device Management', 
        description: 'Test device settings and upgrade functionality.', 
        prompt: '1. Navigate to devices section.\n2. Verify current devices display correctly.\n3. Check for device payment or installment information.\n4. Test upgrade eligibility verification.\n5. Verify trade-in options if available.\n6. Check for device insurance management.\n7. Test device settings or features management.\n8. Verify IMEI or device identification information.\n9. Check for SIM card management options.\n10. Test device activation process if applicable.'
      }
    ],
    'Insurance': [
      { 
        name: 'Policy Management', 
        description: 'Test insurance policy details and documents.', 
        prompt: '1. Log in to the insurance app.\n2. View policy overview and coverage details.\n3. Check policy documents and ID cards.\n4. Test downloading or sharing insurance cards.\n5. Verify coverage limits and deductibles display.\n6. Navigate to policy holders and beneficiaries section.\n7. Test policy document search functionality.\n8. Check for policy renewal information.\n9. Verify premium payment history and schedule.'
      },
      { 
        name: 'Claims Processing', 
        description: 'Test claim submission and tracking workflow.', 
        prompt: '1. Navigate to claims section.\n2. Start a new claim submission process.\n3. Test incident details entry forms.\n4. Try uploading photos or documents for the claim.\n5. Complete all required claim information.\n6. Submit the claim and verify confirmation.\n7. Check claim status tracking functionality.\n8. Test adding additional information to an existing claim.\n9. Verify claim history and details access.'
      },
      { 
        name: 'Quote & Application', 
        description: 'Test new insurance quote and application process.', 
        prompt: '1. Navigate to quotes or new policy section.\n2. Select insurance type to quote.\n3. Complete the required personal information.\n4. Enter coverage details and preferences.\n5. Test the quote calculation process.\n6. Check for coverage customization options.\n7. Verify discount application where eligible.\n8. Test the application submission process.\n9. Check for required document uploads.\n10. Verify confirmation and next steps information.'
      },
      { 
        name: 'Quote Generation', 
        description: 'Test insurance quote calculator and comparison tools.', 
        prompt: '1. Navigate to quote or new policy section.\n2. Select insurance type (auto, home, life, etc.).\n3. Enter required personal information.\n4. Test specific insurance type information entry (vehicle, property details).\n5. Verify coverage options selection.\n6. Test discount identification questions.\n7. Check for premium calculation and display.\n8. Verify quote summary with coverage details.\n9. Test quote saving functionality.\n10. Check for quote comparison tools.\n11. Verify quote retrieval with reference number.'
      },
      { 
        name: 'Payment Process', 
        description: 'Test premium payment methods and billing options.', 
        prompt: '1. Navigate to billing or payments section.\n2. Verify current balance and due date.\n3. Test one-time payment functionality.\n4. Check for payment method management.\n5. Test autopay enrollment and management.\n6. Verify payment history.\n7. Check for installment plan options.\n8. Test payment confirmation and receipts.\n9. Verify late payment information if applicable.\n10. Check for payment reminders setup.'
      },
      { 
        name: 'Beneficiary Management', 
        description: 'Test insurance beneficiary setup and modification.', 
        prompt: '1. Navigate to policy details for life or retirement products.\n2. Verify current beneficiary information.\n3. Test adding new beneficiary.\n4. Check for beneficiary percentage allocation.\n5. Test modifying existing beneficiary information.\n6. Verify primary vs. contingent designations.\n7. Check for beneficiary confirmation process.\n8. Test document upload for beneficiary verification if required.\n9. Verify effective date of beneficiary changes.\n10. Check for notification of beneficiary changes.'
      }
    ]
  });

  useEffect(() => {
    // Get query parameters when the component loads
    // Replace router.isReady and router.query with params
    if (params) {
      const { deviceId, packageName, tab } = params;
      if (deviceId) setDeviceId(deviceId);
      if (packageName) setPackageName(packageName);
    }
  }, [params]);

  // Handle resize functionality
  const startResize = (e) => {
    setIsAnimating(false); // Turn off animations during manual resize
    setIsResizing(true);
    setStartX(e.clientX);
    // Initialize the current ratio
    currentSplitRatio.current = splitRatio;
  };

  const stopResize = () => {
    setIsResizing(false);
    
    // Update state with final value from ref
    setSplitRatio(currentSplitRatio.current);
    
    // Check if we should auto-collapse panels after resizing
    if (currentSplitRatio.current < MIN_PANEL_WIDTH) {
      // Left panel is too small, auto-collapse it
      setIsAnimating(true); // Enable animations for auto-collapse
      setPreviousSplitRatio(MIN_PANEL_WIDTH);
      setSplitRatio(0);
      setTimeout(() => {
        setLeftPanelCollapsed(true);
        setIsAnimating(false); // Disable animations after transition
      }, 50);
    } else if (currentSplitRatio.current > (100 - MIN_PANEL_WIDTH)) {
      // Right panel is too small, auto-collapse it
      setIsAnimating(true); // Enable animations for auto-collapse
      setPreviousSplitRatio(100 - MIN_PANEL_WIDTH);
      setSplitRatio(100);
      setTimeout(() => {
        setRightPanelCollapsed(true);
        setIsAnimating(false); // Disable animations after transition
      }, 50);
    }
  };

  // Throttled resize function - animations disabled during resize
  const resize = useCallback((e) => {
    if (isResizing && containerRef.current) {
      const now = Date.now();
      // Store value in ref for smoother tracking
      const containerWidth = containerRef.current.offsetWidth;
      currentSplitRatio.current = ((e.clientX / containerWidth) * 100);
      
      // Only update state every 16ms (approx 60fps) for smoother performance
      if (now - lastResizeTime > 16) {
        setSplitRatio(currentSplitRatio.current);
        setLastResizeTime(now);
      }
      
      // Make sure panels are expanded when resizing
      if (leftPanelCollapsed) {
        setLeftPanelCollapsed(false);
      }
      if (rightPanelCollapsed) {
        setRightPanelCollapsed(false);
      }
    }
  }, [isResizing, lastResizeTime, leftPanelCollapsed, rightPanelCollapsed]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResize);
    }
    
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResize);
    };
  }, [isResizing, resize, stopResize]);

  const handleBack = () => {
    // Replace router.push('/dashboard');
    navigateTo('dashboard');
  };
  
  const handleViewLogs = () => {
    // Replace router.push('/mitmproxy-logs');
    navigateTo('mitmproxy-logs');
  };
  
  const handleSetupDevice = () => {
    // Build params object for navigation
    const deviceSetupParams = {};
    if (deviceId) deviceSetupParams.deviceId = deviceId;
    if (packageName) deviceSetupParams.packageName = packageName;
    deviceSetupParams.tab = 'unified';
    
    // Replace router.push
    navigateTo('device-setup', deviceSetupParams);
  };

  // App Crawler Functions
  const handleSettingsChange = (setting, value) => {
    setCrawlSettings(prev => {
      const newSettings = {
        ...prev,
        [setting]: value
      };
      
      // If mode is changed to AI, show the prompt modal if no prompt is set yet
      if (setting === 'mode' && value === 'ai' && !prev.aiPrompt.trim()) {
        setShowAiPrompt(true);
      }
      
      return newSettings;
    });
  };
  
  const handleAiPromptSave = (prompt) => {
    // If we have a selected vertical and journeys, include that in the prompt
    let finalPrompt = prompt;
    
    if (selectedVertical && selectedJourneys.length > 0) {
      const verticalName = selectedVertical;
      let journeyNames = selectedJourneys.map(journey => journey.name).join(", ");
      
      // If using a combined prompt approach
      if (selectedJourneys.length > 1) {
        const combinedPrompt = selectedJourneys.map(journey => {
          return `[${journey.name}]\n${journey.prompt}`;
        }).join('\n\n');
        
        finalPrompt = `[${verticalName} - Multiple Journeys: ${journeyNames}]\n\n${combinedPrompt}`;
      } else if (selectedJourneys.length === 1) {
        // Single journey case
        finalPrompt = `[${verticalName} - ${selectedJourneys[0].name}]\n\n${finalPrompt}`;
      }
    }
    
    setCrawlSettings(prev => ({
      ...prev,
      aiPrompt: finalPrompt
    }));
    setShowAiPrompt(false);
    
    // Reset the step and selections for next time
    setAiModalStep(1);
    setSelectedVertical(null);
    setSelectedJourney(null);
    setSelectedJourneys([]);
  };
  
  const handleAiPromptCancel = () => {
    // If canceling from the modal with no prompt, revert to random mode
    if (showAiPrompt && !crawlSettings.aiPrompt.trim()) {
      setCrawlSettings(prev => ({
        ...prev,
        mode: 'random'
      }));
    }
    setShowAiPrompt(false);
    
    // Reset the step and selections
    setAiModalStep(1);
    setSelectedVertical(null);
    setSelectedJourney(null);
    setSelectedJourneys([]);
  };
  
  // New handlers for the three-step workflow
  const handleNextStep = () => {
    if (aiModalStep === 2 && selectedJourneys.length === 0) {
      // Don't advance if no journeys are selected
      return;
    }
    setAiModalStep(prev => Math.min(prev + 1, 3));
  };

  const handlePrevStep = () => {
    setAiModalStep(prev => Math.max(prev - 1, 1));
  };

  const handleSelectVertical = (vertical) => {
    setSelectedVertical(vertical);
    // Automatically go to next step
    setAiModalStep(2);
    // Clear previous selections when changing vertical
    setSelectedJourneys([]);
  };

  const handleSelectJourney = (journey) => {
    // For single selection mode (keeping for backward compatibility)
    setSelectedJourney(journey);
    
    // For multi-select: toggle selection
    setSelectedJourneys(prev => {
      const isAlreadySelected = prev.some(j => j.name === journey.name);
      
      if (isAlreadySelected) {
        return prev.filter(j => j.name !== journey.name);
      } else {
        return [...prev, journey];
      }
    });
    
    // Only auto-advance to step 3 when clicking View Prompt for a single journey
    if (selectedJourneys.length === 0) {
      setAiModalStep(3);
      
      // Update prompt value without saving to settings yet
      setCrawlSettings(prev => ({
        ...prev,
        aiPrompt: journey.prompt
      }));
    }
  };
  
  const toggleConfig = () => {
    setShowConfig(prev => !prev);
  };
  
  const startCrawl = async () => {
    if (!deviceId || !packageName) {
      alert('Please select a device and app first');
      return;
    }
    
    try {
      setCrawlStatus('running');
      setCrawlProgress(0);
      setScreens([]);
      setCurrentScreen(null);
      
      // Clear previous logs and add a starting log
      const startLog = {
        type: 'info',
        timestamp: Date.now(),
        message: `Starting crawler for ${packageName} on device ${deviceId}...`
      };
      logsRef.current = [startLog];
      setLogs([startLog]);
      
      setFlowNodes([]);
      setFlowEdges([]);
      setFlowReady(false);
      
      // Call the API to start crawling
      await window.api.crawler.startCrawling(deviceId, packageName, crawlSettings);
      
      // Add another log after crawling is initiated
      const initiatedLog = {
        type: 'info',
        timestamp: Date.now(),
        message: 'Crawler initiated. Waiting for first screen...'
      };
      logsRef.current = [...logsRef.current, initiatedLog];
      setLogs([...logsRef.current]);
    } catch (error) {
      console.error('Failed to start crawling:', error);
      setCrawlStatus('error');
      
      // Add error log
      const errorLog = {
        type: 'error',
        timestamp: Date.now(),
        message: `Failed to start crawling: ${error.message || 'Unknown error'}`
      };
      logsRef.current = [...logsRef.current, errorLog];
      setLogs([...logsRef.current]);
    }
  };
  
  const stopCrawl = async () => {
    try {
      // Add stopping log
      const stoppingLog = {
        type: 'warning',
        timestamp: Date.now(),
        message: 'Stopping crawler...'
      };
      logsRef.current = [...logsRef.current, stoppingLog];
      setLogs([...logsRef.current]);
      
      await window.api.crawler.stopCrawling();
      setCrawlStatus('completed');
      
      // Add stopped log
      const stoppedLog = {
        type: 'info',
        timestamp: Date.now(),
        message: 'Crawler stopped.'
      };
      logsRef.current = [...logsRef.current, stoppedLog];
      setLogs([...logsRef.current]);
    } catch (error) {
      console.error('Failed to stop crawling:', error);
      
      // Add error log
      const errorLog = {
        type: 'error',
        timestamp: Date.now(),
        message: `Failed to stop crawling: ${error.message || 'Unknown error'}`
      };
      logsRef.current = [...logsRef.current, errorLog];
      setLogs([...logsRef.current]);
    }
  };
  
  // Format timestamp to human-readable time
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Effect to update flow data whenever screens change
  useEffect(() => {
    if (screens.length > 0) {
      try {
        // Create nodes based on screens
        const nodes = screens.map((screen, index) => ({
          id: `screen-${index}`,
          data: { 
            label: `Screen ${index + 1}`,
            activity: screen.activityName.split('.').pop(),
            imageUrl: `data:image/png;base64,${screen.screenshot}`
          },
          position: { 
            x: 250 * (index % 3), 
            y: 200 * Math.floor(index / 3) 
          }
        }));
        
        // Create edges connecting sequential screens
        const edges = [];
        for (let i = 0; i < screens.length - 1; i++) {
          edges.push({
            id: `edge-${i}`,
            source: `screen-${i}`,
            target: `screen-${i + 1}`,
            style: { stroke: '#aaa' },
            type: 'smoothstep',
            label: `→`,
            animated: true
          });
        }
        
        setFlowNodes(nodes);
        setFlowEdges(edges);
        setFlowReady(true);
      } catch (error) {
        console.error('Error creating flow data:', error);
      }
    }
  }, [screens]);
  
  // Set up event listeners for crawl progress
  useEffect(() => {
    // Safe check for API availability
    if (typeof window === 'undefined' || !window.api || !window.api.crawler) {
      console.warn('Crawler API not available');
      return;
    }
    
    const handleProgress = (progress) => {
      setCrawlProgress(progress.percentage);
    };
    
    const handleNewScreen = (screen) => {
      setScreens(prev => [...prev, screen]);
      setCurrentScreen(screen);
      
      // Add a log entry when a new screen is captured
      const logEntry = {
        type: 'success',
        timestamp: Date.now(),
        message: `Captured screen: ${screen.activityName}`
      };
      logsRef.current = [...logsRef.current, logEntry];
      setLogs([...logsRef.current]);
    };
    
    const handleCrawlComplete = () => {
      setCrawlStatus('completed');
      setCrawlProgress(100);
      
      // Add a log entry when crawling completes
      const logEntry = {
        type: 'success',
        timestamp: Date.now(),
        message: 'Crawling completed.'
      };
      logsRef.current = [...logsRef.current, logEntry];
      setLogs([...logsRef.current]);
    };
    
    const handleCrawlError = (error) => {
      console.error('Crawl error:', error);
      setCrawlStatus('error');
      
      // Add a log entry when an error occurs
      const logEntry = {
        type: 'error',
        timestamp: Date.now(),
        message: `Error: ${error.message || 'Unknown error occurred'}`
      };
      logsRef.current = [...logsRef.current, logEntry];
      setLogs([...logsRef.current]);
    };
    
    const handleLog = (logEntry) => {
      // Ensure we're adding to the reference first, then updating the state
      logsRef.current = [...logsRef.current, logEntry];
      setLogs([...logsRef.current]);
    };
    
    // Safely subscribe to events with try/catch
    try {
      if (typeof window.api.crawler.onProgress === 'function')
        window.api.crawler.onProgress(handleProgress);
      
      if (typeof window.api.crawler.onNewScreen === 'function')
        window.api.crawler.onNewScreen(handleNewScreen);
      
      if (typeof window.api.crawler.onComplete === 'function')
        window.api.crawler.onComplete(handleCrawlComplete);
      
      if (typeof window.api.crawler.onError === 'function')
        window.api.crawler.onError(handleCrawlError);
      
      if (typeof window.api.crawler.onLog === 'function')
        window.api.crawler.onLog(handleLog);
    } catch (error) {
      console.error('Error setting up crawler event listeners:', error);
    }
    
    // Load any existing logs when component mounts
    const loadExistingLogs = async () => {
      try {
        if (typeof window.api.crawler.getLogs === 'function') {
          const existingLogs = await window.api.crawler.getLogs();
          if (existingLogs && existingLogs.length > 0) {
            logsRef.current = existingLogs;
            setLogs(existingLogs);
          } else {
            // Add an initial log entry
            const initialLog = {
              type: 'info',
              timestamp: Date.now(),
              message: 'Split Screen Debugger initialized. Ready to start crawling.'
            };
            logsRef.current = [initialLog];
            setLogs([initialLog]);
          }
        }
      } catch (error) {
        console.error('Failed to load existing logs:', error);
        // Still add an initial log even if loading fails
        const initialLog = {
          type: 'info',
          timestamp: Date.now(),
          message: 'Split Screen Debugger initialized. Ready to start crawling.'
        };
        logsRef.current = [initialLog];
        setLogs([initialLog]);
      }
    };
    
    loadExistingLogs();
    
    return () => {
      // Safely unsubscribe when component unmounts
      try {
        if (typeof window.api.crawler.removeAllListeners === 'function') {
          window.api.crawler.removeAllListeners();
        }
      } catch (error) {
        console.error('Error removing crawler event listeners:', error);
      }
    };
  }, []);
  
  // Custom node for ReactFlow
  const CustomNode = ({ data }) => {
    return (
      <div className={styles.flowNode}>
        <div className={styles.flowNodeHeader}>
          <div className={styles.flowNodeActivity}>{data.activity}</div>
          {data.label}
        </div>
        <div className={styles.flowNodeImage}>
          <img src={data.imageUrl} alt={data.activity} />
        </div>
      </div>
    );
  };
  
  // Prepare the nodeTypes object only when the Flow is about to be rendered
  const getNodeTypes = () => {
    return {
      default: CustomNode
    };
  };
  
  // Initialize ReactFlow when the Flow tab is selected
  useEffect(() => {
    if (viewType === 'flow') {
      setShowFlow(true);
    }
  }, [viewType]);
  
  // Toggle XML popup
  const toggleXmlPopup = () => {
    setShowXmlPopup(!showXmlPopup);
  };
  
  // Close popup if Escape key is pressed
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape' && showXmlPopup) {
        setShowXmlPopup(false);
      }
    };
    
    window.addEventListener('keydown', handleEscKey);
    return () => {
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [showXmlPopup]);
  
  // Prevent scrolling when popup is open
  useEffect(() => {
    if (showXmlPopup) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showXmlPopup]);

  // New functions to handle panel collapse/expand with better performance
  const toggleLeftPanel = () => {
    // Enable animation for collapse/expand operations
    setIsAnimating(true);
    
    if (leftPanelCollapsed) {
      // Expanding left panel - first show the panel
      setLeftPanelCollapsed(false);
      // Then set width in the next frame for animation
      requestAnimationFrame(() => {
        setSplitRatio(previousSplitRatio);
        
        // Disable animations after transition completes
        setTimeout(() => {
          setIsAnimating(false);
        }, 250); // slightly longer than the CSS transition
      });
      setRightPanelCollapsed(false);
    } else {
      // Collapsing left panel - first set width to 0
      setPreviousSplitRatio(splitRatio);
      setSplitRatio(0);
      // Use requestAnimationFrame instead of setTimeout for better performance
      requestAnimationFrame(() => {
        // Add a small delay to let animation finish 
        setTimeout(() => {
          setLeftPanelCollapsed(true);
          setIsAnimating(false); // Disable animations after transition
        }, 200);
      });
      setRightPanelCollapsed(false);
    }
  };

  const toggleRightPanel = () => {
    // Enable animation for collapse/expand operations
    setIsAnimating(true);
    
    if (rightPanelCollapsed) {
      // Expanding right panel - first show the panel
      setRightPanelCollapsed(false);
      // Then set width in the next frame for animation
      requestAnimationFrame(() => {
        setSplitRatio(previousSplitRatio);
        
        // Disable animations after transition completes
        setTimeout(() => {
          setIsAnimating(false);
        }, 250); // slightly longer than the CSS transition
      });
      setLeftPanelCollapsed(false);
    } else {
      // Collapsing right panel - first set width to 100
      setPreviousSplitRatio(splitRatio);
      setSplitRatio(100);
      // Use requestAnimationFrame instead of setTimeout for better performance
      requestAnimationFrame(() => {
        // Add a small delay to let animation finish
        setTimeout(() => {
          setRightPanelCollapsed(true);
          setIsAnimating(false); // Disable animations after transition
        }, 200);
      });
      setLeftPanelCollapsed(false);
    }
  };

  // Scroll to bottom of logs when new logs are added
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Auto-collapse settings when crawl starts
  useEffect(() => {
    if (crawlStatus === 'running') {
      setLeftPanelCollapsed(false);
      setRightPanelCollapsed(false);
      setSplitRatio(50);
    }
  }, [crawlStatus]);

  // Add vertical resize handlers
  const startVerticalResize = (e) => {
    setIsVerticalResizing(true);
    setStartY(e.clientY);
  };

  const stopVerticalResize = () => {
    setIsVerticalResizing(false);
  };

  const verticalResize = useCallback((e) => {
    if (isVerticalResizing && leftPanelRef.current) {
      const containerHeight = leftPanelRef.current.offsetHeight;
      const newRatio = ((e.clientY / containerHeight) * 100);
      setVerticalSplitRatio(Math.min(Math.max(newRatio, 20), 80)); // Keep ratio between 20% and 80%
    }
  }, [isVerticalResizing]);

  // Add vertical resize effect
  useEffect(() => {
    if (isVerticalResizing) {
      window.addEventListener('mousemove', verticalResize);
      window.addEventListener('mouseup', stopVerticalResize);
    }
    
    return () => {
      window.removeEventListener('mousemove', verticalResize);
      window.removeEventListener('mouseup', stopVerticalResize);
    };
  }, [isVerticalResizing, verticalResize]);

  return (
    <>
      <Head>
        <title>Debugger | Echo Desktop</title>
        <meta name="description" content="Echo Desktop Debugger" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button 
              className={styles.backButton}
              onClick={handleBack}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Back to Dashboard
            </button>
            <h1 className={styles.pageTitle}>App Debugger & Crawler</h1>
          </div>
          <div className={styles.headerButtons}>
            <button 
              className={styles.viewLogsButton}
              onClick={() => navigateTo('export', { deviceId, packageName })}
            >
              Export Data
            </button>
            <button 
              className={styles.viewLogsButton}
              onClick={handleSetupDevice}
            >
              Setup Device
            </button>
            <button 
              className={styles.viewLogsButton}
              onClick={handleViewLogs}
            >
              Network
            </button>
          </div>
        </div>
        
        <div ref={containerRef} className={styles.splitContainer}>
          {/* App Crawler Panel */}
          <div 
            className={`${styles.panel} ${isAnimating ? styles.animatedPanel : ''}`} 
            style={{ 
              width: `${splitRatio}%`,
              display: leftPanelCollapsed ? 'none' : 'flex',
              opacity: leftPanelCollapsed ? 0 : 1,
              marginRight: rightPanelCollapsed ? '20px' : '0px'
            }}>
            <div className={styles.panelHeader}>
              <h2>App Crawler</h2>
              <div className={styles.headerControls}>
                <div className={styles.crawlControls}>
                  {crawlStatus === 'idle' || crawlStatus === 'completed' || crawlStatus === 'error' ? (
                    <button 
                      className={styles.startButton}
                      onClick={startCrawl}
                      disabled={!deviceId || !packageName}
                    >
                      Start Crawling
                    </button>
                  ) : (
                    <button 
                      className={styles.stopButton}
                      onClick={stopCrawl}
                    >
                      Stop Crawling
                    </button>
                  )}
                </div>
                <button
                  className={styles.collapseButton}
                  onClick={toggleLeftPanel}
                  title={leftPanelCollapsed ? "Expand panel" : "Collapse panel"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d={leftPanelCollapsed ? "M13 5l7 7-7 7M5 5l7 7-7 7" : "M11 5l-7 7 7 7M19 5l-7 7 7 7"} />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className={styles.appCrawlerContent}>
              <div className={styles.leftPanel}>
                <div className={`${styles.settingsPanel} ${showConfig ? '' : styles.settingsPanelCollapsed}`}>
                  <div className={styles.settingsHeader}>
                    <h2>Crawler Settings</h2>
                    <button 
                      className={styles.toggleButton}
                      onClick={toggleConfig}
                    >
                      {showConfig ? 'Hide' : 'Show'} Settings
                    </button>
                  </div>
                  
                  {showConfig && (
                    <>
                      <div className={styles.settingItem}>
                        <label>Max Screens to Capture</label>
                        <input 
                          type="number" 
                          value={crawlSettings.maxScreens}
                          onChange={(e) => handleSettingsChange('maxScreens', parseInt(e.target.value))}
                          min="1"
                          max="100"
                        />
                      </div>
                      
                      <div className={styles.settingItem}>
                        <label>Delay Between Actions (ms)</label>
                        <input 
                          type="number" 
                          value={crawlSettings.screenDelay}
                          onChange={(e) => handleSettingsChange('screenDelay', parseInt(e.target.value))}
                          min="500"
                          max="5000"
                          step="100"
                        />
                      </div>
                      
                      <div className={styles.settingItem}>
                        <label>Mode</label>
                        <select
                          value={crawlSettings.mode}
                          onChange={(e) => handleSettingsChange('mode', e.target.value)}
                        >
                          <option value="random">Random</option>
                          <option value="orderly">Orderly</option>
                          <option value="ai">AI</option>
                        </select>
                      </div>
                      
                      {crawlSettings.mode === 'ai' && (
                        <div className={styles.settingItem}>
                          <label>AI Prompt</label>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input 
                              type="text" 
                              value={crawlSettings.aiPrompt}
                              onChange={(e) => handleSettingsChange('aiPrompt', e.target.value)}
                              placeholder="Enter instructions for the AI crawler..."
                              style={{ flex: 1 }}
                            />
                            <button 
                              className={styles.toggleButton}
                              onClick={() => setShowAiPrompt(true)}
                              title="Edit in larger window"
                              style={{ flexShrink: 0 }}
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                      )}
                      
                      <div className={styles.deviceInfo}>
                        <p><strong>Device ID:</strong> {deviceId || 'Not selected'}</p>
                        <p><strong>Package Name:</strong> {packageName || 'Not selected'}</p>
                      </div>
                    </>
                  )}
                </div>
                
                <div className={styles.logsPanel}>
                  <div className={styles.logsHeader}>
                    <h2>Crawler Logs</h2>
                    <button 
                      className={styles.clearLogsButton}
                      onClick={() => {
                        setLogs([]);
                        logsRef.current = [];
                      }}
                    >
                      Clear Logs
                    </button>
                  </div>
                  
                  <div className={styles.logsContainer}>
                    {logs.length > 0 ? (
                      <>
                        {logs.map((log, index) => (
                          <LogEntry key={`${log.timestamp}-${index}`} log={log} />
                        ))}
                        <div ref={logsEndRef} className={styles.logsEndRef} />
                      </>
                    ) : (
                      <div className={styles.emptyLogs}>No logs yet</div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className={styles.rightPanel}>
                {crawlStatus === 'running' && (
                  <div className={styles.progressBar}>
                    <div 
                      className={styles.progressFill}
                      style={{ width: `${crawlProgress}%` }}
                    />
                    <span>{crawlProgress}% complete</span>
                  </div>
                )}
                
                {screens.length > 0 && (
                  <div className={styles.viewToggle}>
                    <button
                      className={`${styles.viewToggleButton} ${viewType === 'flow' ? styles.activeView : ''}`}
                      onClick={() => setViewType('flow')}
                      title="Flow Chart View"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <path d="M10 7h4M17 8v8M7 17h7" />
                      </svg>
                      Flow
                    </button>
                    <button
                      className={`${styles.viewToggleButton} ${viewType === 'grid' ? styles.activeView : ''}`}
                      onClick={() => setViewType('grid')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                      </svg>
                      Grid
                    </button>
                    <button
                      className={`${styles.viewToggleButton} ${viewType === 'list' ? styles.activeView : ''}`}
                      onClick={() => setViewType('list')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" />
                        <line x1="3" y1="12" x2="3.01" y2="12" />
                        <line x1="3" y1="18" x2="3.01" y2="18" />
                      </svg>
                      List
                    </button>
                  </div>
                )}
                
                {screens.length > 0 ? (
                  <>
                    {viewType === 'flow' && showFlow && flowReady ? (
                      <div className={styles.flowView}>
                        <ReactFlow
                          nodes={flowNodes}
                          edges={flowEdges}
                          nodeTypes={getNodeTypes()}
                          fitView
                        >
                          <Controls />
                          <Background color="#aaa" gap={16} />
                        </ReactFlow>
                      </div>
                    ) : viewType === 'grid' ? (
                      <div className={styles.gridView}>
                        {screens.map((screen, index) => (
                          <div 
                            key={index}
                            className={`${styles.gridItem} ${currentScreen === screen ? styles.activeGridItem : ''}`}
                            onClick={() => setCurrentScreen(screen)}
                          >
                            <div className={styles.gridImage}>
                              <img 
                                src={`data:image/png;base64,${screen.screenshot}`}
                                alt={`Screenshot of ${screen.activityName}`}
                              />
                            </div>
                            <div className={styles.gridInfo}>
                              <span>Screen {index + 1}</span>
                              <span>{screen.activityName.split('.').pop()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.listContainer}>
                        <div className={styles.screenList}>
                          {screens.map((screen, index) => (
                            <div 
                              key={index}
                              className={`${styles.screenItem} ${currentScreen === screen ? styles.activeScreen : ''}`}
                              onClick={() => setCurrentScreen(screen)}
                            >
                              <span>Screen {index + 1}</span>
                              <span>{screen.activityName.split('.').pop()}</span>
                            </div>
                          ))}
                        </div>
                        
                        <div className={styles.screenPreview}>
                          {currentScreen && (
                            <>
                              <div className={styles.screenImage}>
                                <img 
                                  src={`data:image/png;base64,${currentScreen.screenshot}`}
                                  alt={`Screenshot of ${currentScreen.activityName}`}
                                />
                              </div>
                              
                              <div className={styles.screenDetails}>
                                <h3>Screen Details</h3>
                                <p><strong>Activity:</strong> {currentScreen.activityName}</p>
                                <p><strong>Elements:</strong> {currentScreen.elementCount}</p>
                                <p><strong>Clickable:</strong> {currentScreen.clickableCount}</p>
                                
                                {currentScreen.xml && (
                                  <div className={styles.xmlViewer}>
                                    <h4>
                                      UI Structure (XML)
                                      <button 
                                        className={styles.expandButton}
                                        onClick={toggleXmlPopup}
                                        title="Expand XML View"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                                        </svg>
                                      </button>
                                    </h4>
                                    <div className={styles.xmlContent}>
                                      <pre>{beautifyXml(currentScreen.xml).substring(0, 2000)}...</pre>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    {crawlStatus === 'idle' && (
                      <p>Configure settings and click 'Start Crawling' to begin</p>
                    )}
                    {crawlStatus === 'running' && (
                      <p>Crawling in progress... waiting for first screen</p>
                    )}
                    {crawlStatus === 'error' && (
                      <p>An error occurred during crawling. Please check console for details.</p>
                    )}
                    {crawlStatus === 'completed' && screens.length === 0 && (
                      <p>Crawl completed but no screens were captured.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Resizable Divider - Only show when neither panel is collapsed */}
          {!leftPanelCollapsed && !rightPanelCollapsed && (
            <div 
              ref={dividerRef}
              className={styles.divider}
              onMouseDown={startResize}
            >
              <div className={styles.dividerHandle}></div>
            </div>
          )}
          
          {/* Analytics Debugger Panel */}
          <div 
            className={`${styles.panel} ${isAnimating ? styles.animatedPanel : ''}`} 
            style={{ 
              width: `${rightPanelCollapsed ? 0 : (leftPanelCollapsed ? 100 : 100 - splitRatio)}%`,
              display: rightPanelCollapsed ? 'none' : 'flex',
              opacity: rightPanelCollapsed ? 0 : 1,
              marginLeft: leftPanelCollapsed ? '20px' : '0px'
            }}>
            
            <div className={styles.analyticsDebuggerContent}>
                <AnalyticsDebugger
                  deviceId={deviceId}
                  packageName={packageName}
                  show={true}
                />
            </div>
          </div>
          
          {/* Panel expand buttons that appear when panels are collapsed */}
          {leftPanelCollapsed && (
            <div className={styles.leftExpandButtonContainer} onClick={toggleLeftPanel}>
              <button className={styles.expandPanelButton} title="Expand App Crawler panel">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 5l7 7-7 7M13 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
          
          {rightPanelCollapsed && (
            <div className={styles.rightExpandButtonContainer} onClick={toggleRightPanel}>
              <button className={styles.expandPanelButton} title="Expand Analytics Debugger panel">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 5l-7 7 7 7M19 5l-7 7 7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* XML Popup */}
      {showXmlPopup && currentScreen && currentScreen.xml && (
        <div className={styles.xmlPopupOverlay} onClick={toggleXmlPopup}>
          <div className={styles.xmlPopup} onClick={e => e.stopPropagation()}>
            <div className={styles.xmlPopupHeader}>
              <h3>UI Structure XML</h3>
              <span className={styles.xmlPopupInfo}>
                {currentScreen.activityName}
              </span>
              <button 
                className={styles.xmlPopupClose}
                onClick={toggleXmlPopup}
                title="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className={styles.xmlPopupContent}>
              <pre>{beautifyXml(currentScreen.xml)}</pre>
            </div>
          </div>
        </div>
      )}
      
      {/* AI Prompt Modal */}
      {showAiPrompt && (
        <div className={styles.aiPromptModal} onClick={handleAiPromptCancel}>
          <div className={styles.aiPromptContent} onClick={e => e.stopPropagation()}>
            <div className={styles.aiPromptHeader}>
              <h3>AI-Powered Crawling</h3>
              <button 
                className={styles.aiPromptClose}
                onClick={handleAiPromptCancel}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            
            {/* Step indicator */}
            <div className={styles.stepIndicator}>
              <div className={`${styles.step} ${aiModalStep === 1 ? styles.activeStep : ''}`}>
                <div className={styles.stepNumber}>1</div>
                <span>Select Vertical</span>
              </div>
              <div className={styles.stepDivider}></div>
              <div className={`${styles.step} ${aiModalStep === 2 ? styles.activeStep : ''}`}>
                <div className={styles.stepNumber}>2</div>
                <span>Select Journey</span>
              </div>
              <div className={styles.stepDivider}></div>
              <div className={`${styles.step} ${aiModalStep === 3 ? styles.activeStep : ''}`}>
                <div className={styles.stepNumber}>3</div>
                <span>Review Prompt</span>
              </div>
            </div>
            
            {/* Step 1: Select Industry Vertical */}
            {aiModalStep === 1 && (
              <div className={styles.verticalSelectionStep}>
                <h3>Select a Vertical</h3>
                <p>Choose the industry vertical that best matches your app.</p>
                
                <div className={styles.verticalGrid}>
                  {/* QSR Vertical */}
                  <div 
                    className={`${styles.verticalItem} ${selectedVertical === 'QSR' ? styles.selectedVertical : ''}`}
                    onClick={() => handleSelectVertical('QSR')}
                  >
                    <div className={styles.verticalIcon}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="32" height="32" fill="currentColor">
                        <path d="M61.1 224C45 224 32 211 32 194.9c0-1.9 .2-3.7 .6-5.6C37.9 168.3 78.8 32 256 32s218.1 136.3 223.4 157.3c.5 1.9 .6 3.7 .6 5.6c0 16.1-13 29.1-29.1 29.1H61.1zM144 128a16 16 0 1 0 -32 0 16 16 0 1 0 32 0zm240 16a16 16 0 1 0 0-32 16 16 0 1 0 0 32zM272 96a16 16 0 1 0 -32 0 16 16 0 1 0 32 0zM16 304c0-26.5 21.5-48 48-48H448c26.5 0 48 21.5 48 48s-21.5 48-48 48H64c-26.5 0-48-21.5-48-48zm16 96c0-8.8 7.2-16 16-16H464c8.8 0 16 7.2 16 16v16c0 35.3-28.7 64-64 64H96c-35.3 0-64-28.7-64-64V400z"/>
                      </svg>
                    </div>
                    <div className={styles.verticalLabel}>QSR</div>
                    <div className={styles.verticalDescription}>Quick Service Restaurants</div>
                  </div>
                  
                  {/* Retail & E-Commerce */}
                  <div 
                    className={`${styles.verticalItem} ${selectedVertical === 'Retail & E-Commerce' ? styles.selectedVertical : ''}`}
                    onClick={() => handleSelectVertical('Retail & E-Commerce')}
                  >
                    <div className={styles.verticalIcon}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="32" height="32" fill="currentColor">
                        <path d="M160 112c0-35.3 28.7-64 64-64s64 28.7 64 64v48H160V112zm-48 48H48c-26.5 0-48 21.5-48 48V416c0 53 43 96 96 96H352c53 0 96-43 96-96V208c0-26.5-21.5-48-48-48H336V112C336 50.1 285.9 0 224 0S112 50.1 112 112v48zm24 48a24 24 0 1 1 0 48 24 24 0 1 1 0-48zm152 24a24 24 0 1 1 48 0 24 24 0 1 1 -48 0z"/>
                      </svg>
                    </div>
                    <div className={styles.verticalLabel}>Retail & E-Commerce</div>
                    <div className={styles.verticalDescription}>Online and physical stores</div>
                  </div>
                  
                  {/* Financial Services */}
                  <div 
                    className={`${styles.verticalItem} ${selectedVertical === 'Financial Services' ? styles.selectedVertical : ''}`}
                    onClick={() => handleSelectVertical('Financial Services')}
                  >
                    <div className={styles.verticalIcon}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" width="32" height="32" fill="currentColor">
                        <path d="M64 64C28.7 64 0 92.7 0 128V384c0 35.3 28.7 64 64 64H512c35.3 0 64-28.7 64-64V128c0-35.3-28.7-64-64-64H64zm64 320H64V320c35.3 0 64 28.7 64 64zM64 192V128h64c0 35.3-28.7 64-64 64zM448 384c0-35.3 28.7-64 64-64v64H448zm64-192c-35.3 0-64-28.7-64-64h64v64zM288 160a96 96 0 1 1 0 192 96 96 0 1 1 0-192z"/>
                      </svg>
                    </div>
                    <div className={styles.verticalLabel}>Financial Services</div>
                    <div className={styles.verticalDescription}>Banking, investing, payments</div>
                  </div>
                  
                  {/* Travel & Hospitality */}
                  <div 
                    className={`${styles.verticalItem} ${selectedVertical === 'Travel & Hospitality' ? styles.selectedVertical : ''}`}
                    onClick={() => handleSelectVertical('Travel & Hospitality')}
                  >
                    <div className={styles.verticalIcon}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" width="32" height="32" fill="currentColor">
                        <path d="M482.3 192c34.2 0 93.7 29 93.7 64c0 36-59.5 64-93.7 64l-116.6 0L265.2 495.9c-5.7 10-16.3 16.1-27.8 16.1l-56.2 0c-10.6 0-18.3-10.2-15.4-20.4l49-171.6L112 320 68.8 377.6c-3 4-7.8 6.4-12.8 6.4l-42 0c-7.8 0-14-6.3-14-14c0-1.3 .2-2.6 .5-3.9L32 256 .5 145.9c-.4-1.3-.5-2.6-.5-3.9c0-7.8 6.3-14 14-14l42 0c5 0 9.8 2.4 12.8 6.4L112 192l102.9 0-49-171.6C162.9 10.2 170.6 0 181.2 0l56.2 0c11.5 0 22.1 6.2 27.8 16.1L365.7 192l116.6 0z"/>
                      </svg>
                    </div>
                    <div className={styles.verticalLabel}>Travel & Hospitality</div>
                    <div className={styles.verticalDescription}>Hotels, airlines, booking</div>
                  </div>
                  
                  {/* Healthcare & Pharma */}
                  <div 
                    className={`${styles.verticalItem} ${selectedVertical === 'Healthcare & Pharma' ? styles.selectedVertical : ''}`}
                    onClick={() => handleSelectVertical('Healthcare & Pharma')}
                  >
                    <div className={styles.verticalIcon}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" width="32" height="32" fill="currentColor">
                        <path d="M48 0C21.5 0 0 21.5 0 48V368c0 26.5 21.5 48 48 48H128c0 35.3 28.7 64 64 64s64-28.7 64-64H320c0 35.3 28.7 64 64 64s64-28.7 64-64h80c26.5 0 48-21.5 48-48V48c0-26.5-21.5-48-48-48H48zM192 416a32 32 0 1 1 0 64 32 32 0 1 1 0-64zm160 0a32 32 0 1 1 0 64 32 32 0 1 1 0-64zM48 48H528c0 26.5-21.5 48-48 48H96C69.5 96 48 74.5 48 48zM96 128H528V368c0 8.8-7.2 16-16 16H480c-8.8 0-16-7.2-16-16V352c0-17.7-14.3-32-32-32s-32 14.3-32 32v16c0 8.8-7.2 16-16 16H192c-8.8 0-16-7.2-16-16V352c0-17.7-14.3-32-32-32s-32 14.3-32 32v16c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V128zm32 88v48c0 13.3 10.7 24 24 24h80c13.3 0 24-10.7 24-24V216c0-13.3-10.7-24-24-24H152c-13.3 0-24 10.7-24 24zm136-24h80c13.3 0 24 10.7 24 24v48c0 13.3-10.7 24-24 24H264c-13.3 0-24-10.7-24-24V216c0-13.3 10.7-24 24-24z"/>
                      </svg>
                    </div>
                    <div className={styles.verticalLabel}>Healthcare & Pharma</div>
                    <div className={styles.verticalDescription}>Medical services and apps</div>
                  </div>
                  
                  {/* Media & Entertainment */}
                  <div 
                    className={`${styles.verticalItem} ${selectedVertical === 'Media & Entertainment' ? styles.selectedVertical : ''}`}
                    onClick={() => handleSelectVertical('Media & Entertainment')}
                  >
                    <div className={styles.verticalIcon}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width="32" height="32" fill="currentColor">
                        <path d="M64 64V352H576V64H64zM0 64C0 28.7 28.7 0 64 0H576c35.3 0 64 28.7 64 64V352c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V64zM128 448H512c17.7 0 32 14.3 32 32s-14.3 32-32 32H128c-17.7 0-32-14.3-32-32s14.3-32 32-32z"/>
                      </svg>
                    </div>
                    <div className={styles.verticalLabel}>Media & Entertainment</div>
                    <div className={styles.verticalDescription}>Streaming, content, games</div>
                  </div>
                  
                  {/* Telecommunications */}
                  <div 
                    className={`${styles.verticalItem} ${selectedVertical === 'Telecommunications' ? styles.selectedVertical : ''}`}
                    onClick={() => handleSelectVertical('Telecommunications')}
                  >
                    <div className={styles.verticalIcon}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="32" height="32" fill="currentColor">
                        <path d="M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64C0 311.4 200.6 512 448 512c18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2.1-46.3 11.6L304.7 368C234.3 334.7 177.3 277.7 144 207.3L193.3 167c13.7-11.2 18.4-30 11.6-46.3l-40-96z"/>
                      </svg>
                    </div>
                    <div className={styles.verticalLabel}>Telecommunications</div>
                    <div className={styles.verticalDescription}>Mobile carriers, services</div>
                  </div>
                  
                  {/* Insurance */}
                  <div 
                    className={`${styles.verticalItem} ${selectedVertical === 'Insurance' ? styles.selectedVertical : ''}`}
                    onClick={() => handleSelectVertical('Insurance')}
                  >
                    <div className={styles.verticalIcon}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="32" height="32" fill="currentColor">
                        <path d="M256 0c4.6 0 9.2 1 13.4 2.9L457.7 82.8c22 9.3 38.4 31 38.3 57.2c-.5 99.2-41.3 280.7-213.6 363.2c-16.7 8-36.1 8-52.8 0C57.3 420.7 16.5 239.2 16 140c-.1-26.2 16.3-47.9 38.3-57.2L242.7 2.9C246.8 1 251.4 0 256 0zm0 66.8V444.8C394 378 431.1 230.1 432 141.4L256 66.8l0 0z"/>
                      </svg>
                    </div>
                    <div className={styles.verticalLabel}>Insurance</div>
                    <div className={styles.verticalDescription}>Auto, home, life coverage</div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Step 2: Select Journey */}
            {aiModalStep === 2 && selectedVertical && (
              <div className={styles.journeySelectionStep}>
                <h3>Select {selectedVertical} Journey</h3>
                <p>Select one or more journeys you want the AI to focus on.</p>
                
                <div className={styles.journeyList}>
                  {verticalPrompts[selectedVertical] && verticalPrompts[selectedVertical].map((journey, index) => (
                    <div 
                      key={index}
                      className={`${styles.journeyItem} ${selectedJourneys.some(j => j.name === journey.name) ? styles.selectedJourney : ''}`}
                      onClick={() => {
                        // Toggle selection of this journey in the array
                        setSelectedJourneys(prev => {
                          const isAlreadySelected = prev.some(j => j.name === journey.name);
                          
                          if (isAlreadySelected) {
                            return prev.filter(j => j.name !== journey.name);
                          } else {
                            return [...prev, journey];
                          }
                        });
                      }}
                    >
                      <div className={styles.journeyHeader}>
                        <div className={styles.journeyName}>{journey.name}</div>
                        <button 
                          className={styles.viewPromptButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedJourney(journey);
                            setSelectedJourneys([journey]);
                            setAiModalStep(3);
                            
                            // Update the prompt with this journey's content
                            setCrawlSettings(prev => ({
                              ...prev,
                              aiPrompt: journey.prompt
                            }));
                          }}
                        >
                          View Prompt
                        </button>
                      </div>
                      <div className={styles.journeyDescription}>{journey.description}</div>
                    </div>
                  ))}
                  
                  {(!verticalPrompts[selectedVertical] || verticalPrompts[selectedVertical].length === 0) && (
                    <div className={styles.emptyJourneyList}>
                      <p>No journeys available for this vertical yet. Please go back and select a different vertical.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Step 3: Review and Edit Prompt */}
            {aiModalStep === 3 && selectedJourneys.length > 0 && (
              <div className={styles.promptEditorStep}>
                <h3>Review and Edit Prompt</h3>
                <p>Review the AI crawler instructions or make any necessary adjustments.</p>
                
                {selectedJourneys.length > 1 ? (
                  <div className={styles.multiJourneyPrompt}>
                    <div className={styles.selectedJourneysHeader}>
                      <span>Selected Journeys:</span> 
                      <span className={styles.journeyCount}>{selectedJourneys.length}</span>
                    </div>
                    <div className={styles.selectedJourneysList}>
                      {selectedJourneys.map((journey, index) => (
                        <div key={index} className={styles.selectedJourneyItem}>
                          <span>{journey.name}</span>
                          <button 
                            className={styles.removeJourneyButton}
                            onClick={() => {
                              setSelectedJourneys(prev => 
                                prev.filter(j => j.name !== journey.name)
                              );
                              
                              // If removing the last journey, go back to step 2
                              if (selectedJourneys.length === 1) {
                                setAiModalStep(2);
                              } else {
                                // Update the combined prompt
                                const remainingJourneys = selectedJourneys.filter(j => j.name !== journey.name);
                                const combinedPrompt = remainingJourneys.map(j => {
                                  return `[${j.name}]\n${j.prompt}`;
                                }).join('\n\n');
                                
                                setCrawlSettings(prev => ({
                                  ...prev,
                                  aiPrompt: combinedPrompt
                                }));
                              }
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className={styles.singleJourneyHeader}>
                    <span>Selected Journey:</span>
                    <span className={styles.journeyName}>{selectedJourneys[0]?.name}</span>
                  </div>
                )}
                
                <textarea
                  className={styles.aiPromptTextarea}
                  value={crawlSettings.aiPrompt}
                  onChange={(e) => handleSettingsChange('aiPrompt', e.target.value)}
                  placeholder="Enter your instructions for the AI..."
                />
              </div>
            )}
            
            {/* Navigation Footer */}
            <div className={styles.aiPromptButtons}>
              <button 
                className={`${styles.aiPromptButton} ${styles.cancel}`}
                onClick={handleAiPromptCancel}
              >
                Cancel
              </button>
              
              {aiModalStep > 1 && (
                <button 
                  className={`${styles.aiPromptButton} ${styles.back}`}
                  onClick={handlePrevStep}
                >
                  ← Back
                </button>
              )}
              
              {aiModalStep === 3 ? (
                <button 
                  className={`${styles.aiPromptButton} ${styles.apply}`}
                  onClick={() => handleAiPromptSave(crawlSettings.aiPrompt)}
                  disabled={!crawlSettings.aiPrompt.trim()}
                >
                  Apply
                </button>
              ) : (
                <button 
                  className={`${styles.aiPromptButton} ${styles.next}`}
                  onClick={() => {
                    if (aiModalStep === 2 && selectedJourneys.length > 0) {
                      // Prepare combined prompt for multiple journeys
                      const combinedPrompt = selectedJourneys.map(journey => {
                        return `[${journey.name}]\n${journey.prompt}`;
                      }).join('\n\n');
                      
                      setCrawlSettings(prev => ({
                        ...prev,
                        aiPrompt: combinedPrompt
                      }));
                      
                      // If only one journey is selected, set it as the selectedJourney as well
                      if (selectedJourneys.length === 1) {
                        setSelectedJourney(selectedJourneys[0]);
                      } else {
                        setSelectedJourney(null); // Clear single selection when multiple are selected
                      }
                    }
                    handleNextStep();
                  }}
                  disabled={
                    (aiModalStep === 1 && !selectedVertical) || 
                    (aiModalStep === 2 && selectedJourneys.length === 0)
                  }
                >
                  {aiModalStep === 2 ? `Next (${selectedJourneys.length} selected) →` : 'Next →'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
} 