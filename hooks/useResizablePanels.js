import { useState, useRef, useCallback } from 'react';

export default function useResizablePanels({ startTransition }) {
  // State for panel resizing
  const [leftPanelWidth, setLeftPanelWidth] = useState(375); // Default width for events list
  const [rightPanelWidth, setRightPanelWidth] = useState(300); // Default width for screenshot panel
  const [isResizing, setIsResizing] = useState(null); // null, 'left', or 'right'
  
  const containerRef = useRef(null);
  const eventsListRef = useRef(null);
  const detailsPanelRef = useRef(null);
  const screenshotPanelRef = useRef(null);

  // Start resize
  const startResize = (divider) => (e) => {
    e.preventDefault();
    setIsResizing(divider);
  };

  // Update the handleResize callback to use startTransition
  const handleResize = useCallback((e) => {
    if (!isResizing || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const mouseX = e.clientX - containerRect.left;

    startTransition(() => {
      if (isResizing === 'left') {
        const newWidth = Math.max(250, Math.min(mouseX, containerWidth - rightPanelWidth - 100));
        setLeftPanelWidth(newWidth);
      } else if (isResizing === 'right') {
        const newWidth = Math.max(200, Math.min(containerWidth - mouseX, containerWidth - leftPanelWidth - 100));
        setRightPanelWidth(newWidth);
      }
    });
  }, [isResizing, rightPanelWidth, leftPanelWidth, startTransition]);

  // Stop resize
  const stopResize = useCallback(() => {
    setIsResizing(null);
  }, []);

  return {
    leftPanelWidth,
    rightPanelWidth,
    isResizing,
    containerRef,
    eventsListRef,
    detailsPanelRef,
    screenshotPanelRef,
    startResize,
    handleResize,
    stopResize
  };
} 