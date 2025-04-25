# Refactoring Plan: Converting Routes to Components

## Overview
This plan outlines the process to convert our application from a multi-route architecture to a single-page application with conditional component rendering. This will eliminate routing issues while maintaining functionality.

## Completed Steps
### ✅ Step 1: Identify All Routes
- `/dashboard.js` - Main dashboard
- `/debugger.js` - Debugger interface
- `/device-setup.js` - Device setup page
- `/mitmproxy-logs.js` - Mitmproxy logs view
- `/app-crawler.js` - App crawler (redirecting to debugger)
- `/index.js` - Main entry point/login

### ✅ Step 2: Create Main App Container
1. Added state management system in `_app.js`:
   ```jsx
   // Current view state management
   const [currentView, setCurrentView] = useState('dashboard');
   const [viewParams, setViewParams] = useState({});
   ```

2. Created navigation functions to replace router:
   ```jsx
   const navigateTo = (view, params = {}) => {
     setCurrentView(view);
     setViewParams(params);
   };
   ```

3. Added navigation context to make it available throughout the app

### ✅ Step 3: Convert Routes to Components
1. Renamed components and updated navigation:
   - `Dashboard` → `DashboardView`
   - `DebuggerPage` → `DebuggerView`
   - `DeviceSetup` → `DeviceSetupView`
   - `MitmproxyLogsPage` → `MitmproxyLogsView`
   - `AppCrawlerPage` → `AppCrawlerView`

2. Implemented component structure in _app.js:
   ```jsx
   {currentView === 'dashboard' && <DashboardView navigateTo={navigateTo} />}
   {currentView === 'debugger' && <DebuggerView navigateTo={navigateTo} params={viewParams} />}
   {currentView === 'deviceSetup' && <DeviceSetupView navigateTo={navigateTo} params={viewParams} />}
   ```

### ✅ Step 4-6: Refactor Individual Components
1. Updated Dashboard.js, Debugger.js, Device-setup.js, and Mitmproxy-logs.js
2. Removed router-specific code from each component
3. Replaced router.push() calls with navigateTo()
4. Updated URL parameter handling to use props instead of router.query

### ✅ Step 7: Implement URL Parameter Handling
1. Created parameter-passing mechanism between components:
   ```jsx
   // Get parameters from props instead of URL
   const { deviceId, packageName, tab } = params || {};
   ```

### ✅ Step 8: Update Data Flow Between Components
1. Ensured all data passed via URL parameters is now properly passed via props

### ✅ Step 9: Clean Up Navigation References
1. Replaced all instances of:
   - `router.push`
   - `useRouter`
   - `router.query` 
   - `Link` components from Next.js

### ✅ Step 10: Add Basic Browser History Support
1. Implemented history tracking:
   ```jsx
   const [viewHistory, setViewHistory] = useState([]);
   
   const navigateTo = (view, params = {}) => {
     setViewHistory([...viewHistory, { view: currentView, params: viewParams }]);
     setCurrentView(view);
     setViewParams(params);
   };
   
   const goBack = () => {
     if (viewHistory.length > 0) {
       const prevView = viewHistory.pop();
       setCurrentView(prevView.view);
       setViewParams(prevView.params);
       setViewHistory([...viewHistory]);
     }
   };
   ```

### ✅ Step 11: Set Component-Based Navigation as Default
1. Modified _app.js to use the component-based approach by default:
   - Removed conditional check for `NEXT_PUBLIC_USE_ROUTES`
   - Added all component routes to the renderView function
   - Set 'home' as the default initial view

## Remaining Tasks

1. Check for any remaining files with router references:
   - Component folders with imported useRouter
   - Any other pages in /pages directory
   
2. Test all navigation flows to ensure they work correctly:
   - Login → Dashboard
   - Dashboard → Debugger
   - Debugger → Device Setup
   - Debugger → Mitmproxy Logs
   - Back navigation

3. Create a test plan for validating all previously working functionality:
   - Device connection
   - App selection
   - Analytics capture
   - Log viewing
   - Settings changes
   
4. Consider optimizing re-renders in the main app container:
   - Wrap views in React.memo() if necessary
   - Memoize callbacks and dependent state

## Testing Strategy
1. Test each component individually
2. Test navigation flows between components
3. Verify data passing works correctly
4. Ensure all functionality from the original routes works in the component version

## Implementation Order
1. Create main app container with navigation system
2. Convert Dashboard component
3. Convert Debugger component
4. Convert Device Setup component
5. Test and debug navigation flows
6. Clean up any remaining router references 