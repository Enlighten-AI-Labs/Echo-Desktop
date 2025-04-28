import '@/styles/globals.css';
import { useState } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import Head from 'next/head';

// Import all main components that were previously pages
import Dashboard from './dashboard';
import Debugger from './debugger';
import DeviceSetup from './device-setup';
import MitmproxyLogs from './mitmproxy-logs';
import AppCrawler from './app-crawler';
import Export from './export';
import Home from './index';

// Create a navigation context to make it available throughout the app
import { createContext, useContext } from 'react';

export const NavigationContext = createContext();

export function useNavigation() {
  return useContext(NavigationContext);
}

function MyApp({ Component, pageProps }) {
  // View state management
  const [currentView, setCurrentView] = useState('home');
  const [viewParams, setViewParams] = useState({});
  const [viewHistory, setViewHistory] = useState([]);

  // Navigation function to replace router.push
  const navigateTo = (view, params = {}) => {
    // Save current view to history before changing
    setViewHistory([...viewHistory, { view: currentView, params: viewParams }]);
    setCurrentView(view);
    setViewParams(params);
  };

  // Go back function for navigation
  const goBack = () => {
    if (viewHistory.length > 0) {
      const prevState = viewHistory[viewHistory.length - 1];
      setCurrentView(prevState.view);
      setViewParams(prevState.params);
      setViewHistory(viewHistory.slice(0, -1));
    }
  };
  
  // Combine navigation functions into a single object
  const navigationValue = {
    currentView,
    viewParams,
    navigateTo,
    goBack
  };

  // Render the appropriate component based on currentView
  const renderView = () => {
    switch(currentView) {
      case 'home':
        return <Home />;
      case 'dashboard':
        return <Dashboard navigateTo={navigateTo} />;
      case 'debugger':
        return <Debugger navigateTo={navigateTo} params={viewParams} />;
      case 'device-setup':
        return <DeviceSetup navigateTo={navigateTo} params={viewParams} />;
      case 'mitmproxy-logs':
        return <MitmproxyLogs navigateTo={navigateTo} params={viewParams} />;
      case 'app-crawler':
        return <AppCrawler navigateTo={navigateTo} params={viewParams} />;
      case 'export':
        return <Export navigateTo={navigateTo} params={viewParams} />;
      default:
        return <Dashboard navigateTo={navigateTo} />;
    }
  };

  // Use the new component-based navigation approach as the default
  return (
    <AuthProvider>
      <NavigationContext.Provider value={navigationValue}>
        <Head>
          <title>Echo Desktop</title>
          <meta name="description" content="Echo Desktop Application" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        {renderView()}
      </NavigationContext.Provider>
    </AuthProvider>
  );
}

export default MyApp; 