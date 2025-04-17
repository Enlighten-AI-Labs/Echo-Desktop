import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import styles from '@/styles/AppCrawler.module.css';
import dynamic from 'next/dynamic';
import LogEntry from '@/components/LogEntry';

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

// Helper function to beautify XML
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

export default function AppCrawlerPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [packageName, setPackageName] = useState('');
  const [crawlStatus, setCrawlStatus] = useState('idle'); // idle, running, completed, error
  const [crawlProgress, setCrawlProgress] = useState(0);
  const [screens, setScreens] = useState([]);
  const [currentScreen, setCurrentScreen] = useState(null);
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);
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
    stayInApp: true // New setting to ensure crawler stays within the app
  });
  
  useEffect(() => {
    // Get query parameters when the page loads
    if (router.isReady) {
      const { deviceId, packageName } = router.query;
      if (deviceId) setDeviceId(deviceId);
      if (packageName) setPackageName(packageName);
    }
  }, [router.isReady, router.query]);
  
  useEffect(() => {
    // Wait for router to be ready
    if (router.isReady) {
      // Redirect to the new debugger page with the same query parameters
      router.replace({
        pathname: '/debugger',
        query: router.query
      });
    }
  }, [router.isReady, router.query]);
  
  // Scroll to bottom of logs when new logs are added
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);
  
  // Auto-collapse settings when crawl starts
  useEffect(() => {
    if (crawlStatus === 'running') {
      setShowConfig(false);
    }
  }, [crawlStatus]);
  
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
  
  const handleBack = () => {
    router.push('/debugger');
  };
  
  const handleDeviceSetup = () => {
    const query = {};
    if (deviceId) query.deviceId = deviceId;
    if (packageName) query.packageName = packageName;
    router.push({
      pathname: '/device-setup',
      query
    });
  };

  const handleSplitScreenView = () => {
    const query = {};
    if (deviceId) query.deviceId = deviceId;
    if (packageName) query.packageName = packageName;
    router.push({
      pathname: '/debugger',
      query
    });
  };

  const handleSettingsChange = (setting, value) => {
    setCrawlSettings(prev => ({
      ...prev,
      [setting]: value
    }));
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
      setLogs([]);
      setFlowNodes([]);
      setFlowEdges([]);
      setFlowReady(false);
      
      // Call the API to start crawling
      await window.api.crawler.startCrawling(deviceId, packageName, crawlSettings);
      
      // The actual crawling will be handled by the main process
      // which will emit progress events that we'll listen for
    } catch (error) {
      console.error('Failed to start crawling:', error);
      setCrawlStatus('error');
    }
  };
  
  const stopCrawl = async () => {
    try {
      await window.api.crawler.stopCrawling();
      setCrawlStatus('completed');
    } catch (error) {
      console.error('Failed to stop crawling:', error);
    }
  };
  
  // Format timestamp to human-readable time
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  
  // Set up event listeners for crawl progress
  useEffect(() => {
    if (!window.api?.crawler) return;
    
    const handleProgress = (progress) => {
      setCrawlProgress(progress.percentage);
    };
    
    const handleNewScreen = (screen) => {
      setScreens(prev => [...prev, screen]);
      setCurrentScreen(screen);
    };
    
    const handleCrawlComplete = () => {
      setCrawlStatus('completed');
      setCrawlProgress(100);
    };
    
    const handleCrawlError = (error) => {
      console.error('Crawl error:', error);
      setCrawlStatus('error');
    };
    
    const handleLog = (logEntry) => {
      setLogs(prev => [...prev, logEntry]);
    };
    
    // Subscribe to events
    window.api.crawler.onProgress(handleProgress);
    window.api.crawler.onNewScreen(handleNewScreen);
    window.api.crawler.onComplete(handleCrawlComplete);
    window.api.crawler.onError(handleCrawlError);
    window.api.crawler.onLog(handleLog);
    
    // Load any existing logs when component mounts
    const loadExistingLogs = async () => {
      try {
        const existingLogs = await window.api.crawler.getLogs();
        if (existingLogs && existingLogs.length > 0) {
          setLogs(existingLogs);
        }
      } catch (error) {
        console.error('Error loading existing logs:', error);
      }
    };
    
    loadExistingLogs();
    
    // Cleanup
    return () => {
      window.api.crawler.removeAllListeners();
    };
  }, []);

  // Custom node component for React Flow
  const CustomNode = ({ data }) => {
    return (
      <div className={styles.flowNode}>
        <div className={styles.flowNodeHeader}>{data.label}</div>
        <div className={styles.flowNodeActivity}>{data.activity}</div>
        {data.imageUrl && (
          <div className={styles.flowNodeImage}>
            <img src={data.imageUrl} alt={data.label} width="150" />
          </div>
        )}
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
  
  // Return a simple loading screen while redirecting
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      background: '#262628',
      color: '#ffffff'
    }}>
      Redirecting to unified Debugger...
    </div>
  );
} 