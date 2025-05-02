// Data for AI prompt journey templates organized by vertical

const verticalPrompts = {
  'QSR': [
    { 
      name: 'Login Flow', 
      description: 'Test user authentication and account access.', 
      prompt: '1. Navigate to the login screen by looking for a profile icon, account button, or "Sign In" text.\n2. Look for username/email and password fields.\n3. Enter test credentials in the appropriate fields.\n4. Look for and tap the login or submit button.\n5. Verify successful login by checking for account information, personalized greeting, or profile details.\n6. If an error occurs, capture the error message.\n7. Check for persistence of login state when revisiting the app.\n8. Look for logout option and verify it functions correctly.'
    },
    {
      "name": "Loyalty Redemption",
      "description": "Test rewards program functionality and point redemption with comprehensive validation.",
      "prompt": "1. Check if already logged in. If not, find and click login buttons (look for \"Sign In\", \"Log In\", \"Access Account\").\n\n2. Find and navigate to the loyalty section by:\n   - Looking for navigation items with keywords: \"Rewards\", \"Loyalty\", \"Points\", \"Members\", \"Benefits\"\n   - Checking header menus, footer menus, hamburger menus, and account sections\n   - Clicking on the most relevant option\n\n3. Find and observe the points balance display (typically shown as a number with \"points\", \"balance\", etc.)\n\n4. Locate and click into the rewards catalog or marketplace section\n\n5. Browse available rewards and select one that is within the current point balance\n\n6. Click on a reward to view its details\n\n7. Find and click the redemption button (variations: \"Redeem\", \"Get Reward\", \"Use Points\")\n\n8. On the confirmation dialog/screen:\n   - Observe the reward details displayed\n   - Click the primary confirmation button to proceed\n\n9. After redemption completes, navigate back to the main loyalty page to view updated point balance\n\n10. Find and click on order history or redemption history (look for \"History\", \"Past Redemptions\", \"Activity\")\n\n11. Locate the recent redemption in the history list\n\n12. Navigate to active or available rewards section (\"My Rewards\", \"Active Rewards\")\n\n13. Find and click on the recently redeemed reward\n\n14. Look for and click button to display barcode/QR code (\"View Barcode\", \"Show Code\", \"Redeem In-Store\")\n\n15. Return to rewards catalog and attempt to redeem a reward requiring more points than currently available\n\n16. Navigate back to active rewards and try to access the same reward again to check for multiple use restrictions"
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
};

export default verticalPrompts; 