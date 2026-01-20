/**
 * ImageComparisonSlider
 * A slider component for comparing two IIIF images with synchronized OpenSeadragon viewers
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Box, Typography, FormControl, InputLabel, Select, MenuItem, IconButton, Paper } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import CloseIcon from '@mui/icons-material/Close';
import CompareIcon from '@mui/icons-material/Compare';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import OpenSeadragon from 'openseadragon';

/** Canvas info extracted from manifest */
export interface CanvasInfo {
  id: string;
  label: string;
  imageUrl: string;
  thumbnailUrl?: string;
}

export interface ImageComparisonSliderProps {
  /** List of available canvases from the manifest */
  canvases: CanvasInfo[];
  /** Current canvas ID (used as default selection) */
  currentCanvasId?: string;
  /** Callback when closed */
  onClose?: () => void;
  /** Window ID for unique keys */
  windowId: string;
}

/**
 * Convert image URL to IIIF tile source
 */
function getIIIFTileSource(imageUrl: string): string {
  if (imageUrl.includes('/full/')) {
    const baseUrl = imageUrl.split('/full/')[0];
    return `${baseUrl}/info.json`;
  }
  if (imageUrl.endsWith('info.json')) {
    return imageUrl;
  }
  return `${imageUrl}/info.json`;
}

export const ImageComparisonSlider: React.FC<ImageComparisonSliderProps> = ({
  canvases,
  currentCanvasId,
  onClose,
  windowId,
}) => {
  const getDefaultIndex = (offset: number): string => {
    if (currentCanvasId) {
      const currentIndex = canvases.findIndex(c => c.id === currentCanvasId);
      if (currentIndex >= 0) {
        const targetIndex = currentIndex + offset;
        if (targetIndex >= 0 && targetIndex < canvases.length) {
          return canvases[targetIndex].id;
        }
      }
    }
    return canvases[Math.min(offset, canvases.length - 1)]?.id || '';
  };

  const [leftCanvasId, setLeftCanvasId] = useState<string>(getDefaultIndex(0));
  const [rightCanvasId, setRightCanvasId] = useState<string>(getDefaultIndex(1));
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [isDragging, setIsDragging] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const leftViewerRef = useRef<HTMLDivElement>(null);
  const rightViewerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leftOsdRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rightOsdRef = useRef<any>(null);
  const isSyncingRef = useRef(false);

  const leftCanvas = canvases.find(c => c.id === leftCanvasId);
  const rightCanvas = canvases.find(c => c.id === rightCanvasId);

  const handleLeftChange = (event: SelectChangeEvent<string>) => {
    setLeftCanvasId(event.target.value);
  };

  const handleRightChange = (event: SelectChangeEvent<string>) => {
    setRightCanvasId(event.target.value);
  };

  // Synchronize viewers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syncViewers = useCallback((source: any, target: any) => {
    if (isSyncingRef.current || !source?.viewport || !target?.viewport) return;
    isSyncingRef.current = true;

    try {
      const center = source.viewport.getCenter();
      const zoom = source.viewport.getZoom();
      target.viewport.zoomTo(zoom, undefined, true);
      target.viewport.panTo(center, true);
    } catch (e) {
      // Ignore sync errors
    }

    // Reset sync flag after a short delay
    setTimeout(() => {
      isSyncingRef.current = false;
    }, 50);
  }, []);

  // Initialize OpenSeadragon viewers
  useEffect(() => {
    if (!leftViewerRef.current || !rightViewerRef.current) return;
    if (!leftCanvas || !rightCanvas) return;

    setIsReady(false);

    // Destroy existing viewers
    if (leftOsdRef.current) {
      try { leftOsdRef.current.destroy(); } catch (e) { /* ignore */ }
      leftOsdRef.current = null;
    }
    if (rightOsdRef.current) {
      try { rightOsdRef.current.destroy(); } catch (e) { /* ignore */ }
      rightOsdRef.current = null;
    }

    const commonOptions = {
      showNavigationControl: false,
      showNavigator: false,
      showFullPageControl: false,
      showHomeControl: false,
      showZoomControl: false,
      gestureSettingsMouse: {
        clickToZoom: false,
        dblClickToZoom: true,
        scrollToZoom: true,
      },
      gestureSettingsTouch: {
        pinchToZoom: true,
        flickEnabled: true,
        flickMinSpeed: 120,
        flickMomentum: 0.25,
      },
      animationTime: 0.2,
      springStiffness: 15,
      visibilityRatio: 0.5,
      constrainDuringPan: false,
      minZoomLevel: 0.1,
      maxZoomLevel: 30,
      crossOriginPolicy: 'Anonymous',
      immediateRender: true,
      preload: true,
    };

    // Create left viewer
    leftOsdRef.current = OpenSeadragon({
      ...commonOptions,
      element: leftViewerRef.current,
      tileSources: getIIIFTileSource(leftCanvas.imageUrl),
    });

    // Create right viewer
    rightOsdRef.current = OpenSeadragon({
      ...commonOptions,
      element: rightViewerRef.current,
      tileSources: getIIIFTileSource(rightCanvas.imageUrl),
    });

    // Set up synchronization
    let leftReady = false;
    let rightReady = false;

    const setupSync = () => {
      if (!leftOsdRef.current || !rightOsdRef.current) return;

      const syncLeftToRight = () => syncViewers(leftOsdRef.current, rightOsdRef.current);
      const syncRightToLeft = () => syncViewers(rightOsdRef.current, leftOsdRef.current);

      leftOsdRef.current.addHandler('zoom', syncLeftToRight);
      leftOsdRef.current.addHandler('pan', syncLeftToRight);
      leftOsdRef.current.addHandler('animation', syncLeftToRight);

      rightOsdRef.current.addHandler('zoom', syncRightToLeft);
      rightOsdRef.current.addHandler('pan', syncRightToLeft);
      rightOsdRef.current.addHandler('animation', syncRightToLeft);

      setIsReady(true);
    };

    leftOsdRef.current.addOnceHandler('open', () => {
      leftReady = true;
      if (rightReady) setupSync();
    });

    rightOsdRef.current.addOnceHandler('open', () => {
      rightReady = true;
      if (leftReady) setupSync();
    });

    return () => {
      if (leftOsdRef.current) {
        try { leftOsdRef.current.destroy(); } catch (e) { /* ignore */ }
        leftOsdRef.current = null;
      }
      if (rightOsdRef.current) {
        try { rightOsdRef.current.destroy(); } catch (e) { /* ignore */ }
        rightOsdRef.current = null;
      }
    };
  }, [leftCanvas?.imageUrl, rightCanvas?.imageUrl, syncViewers]);

  // Handle slider dragging
  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const x = clientX - rect.left;
    const percentage = Math.max(5, Math.min(95, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleMouseMove);
      document.addEventListener('touchend', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleMouseMove);
        document.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (canvases.length < 2) {
    return (
      <Paper sx={{ p: 2, m: 1 }}>
        <Typography color="text.secondary">
          At least 2 images are required for comparison.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={4}
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#000',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          p: 1,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          flexWrap: 'wrap',
        }}
      >
        <CompareIcon color="primary" />
        <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
          Comparison
        </Typography>

        <FormControl size="small" sx={{ minWidth: 180, flex: 1 }}>
          <InputLabel id={`${windowId}-left-label`}>Left</InputLabel>
          <Select
            labelId={`${windowId}-left-label`}
            value={leftCanvasId}
            label="Left"
            onChange={handleLeftChange}
            size="small"
          >
            {canvases.map((canvas) => (
              <MenuItem key={canvas.id} value={canvas.id}>
                {canvas.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180, flex: 1 }}>
          <InputLabel id={`${windowId}-right-label`}>Right</InputLabel>
          <Select
            labelId={`${windowId}-right-label`}
            value={rightCanvasId}
            label="Right"
            onChange={handleRightChange}
            size="small"
          >
            {canvases.map((canvas) => (
              <MenuItem key={canvas.id} value={canvas.id}>
                {canvas.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <IconButton onClick={onClose} size="small" aria-label="Close">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Comparison area */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          bgcolor: '#1a1a1a',
        }}
      >
        {/* Loading indicator */}
        {!isReady && (
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 20,
              color: 'white',
            }}
          >
            <Typography>Loading...</Typography>
          </Box>
        )}

        {/* Right viewer (full width, behind) */}
        <Box
          ref={rightViewerRef}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 1,
          }}
        />

        {/* Left viewer (clipped) */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`,
            zIndex: 2,
            pointerEvents: isDragging ? 'none' : 'auto',
          }}
        >
          <Box
            ref={leftViewerRef}
            sx={{
              width: '100%',
              height: '100%',
            }}
          />
        </Box>

        {/* Slider handle */}
        <Box
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          sx={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${sliderPosition}%`,
            transform: 'translateX(-50%)',
            width: 4,
            bgcolor: 'white',
            cursor: 'ew-resize',
            zIndex: 10,
            boxShadow: '0 0 10px rgba(0,0,0,0.5)',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 44,
              height: 44,
              borderRadius: '50%',
              bgcolor: 'white',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            },
            '&::after': {
              content: '"◂▸"',
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#333',
              fontWeight: 'bold',
              fontSize: 16,
              letterSpacing: -2,
            },
          }}
        />

        {/* Labels */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            bgcolor: 'rgba(0,0,0,0.75)',
            color: 'white',
            px: 1.5,
            py: 0.5,
            borderRadius: 1,
            maxWidth: `calc(${sliderPosition}% - 40px)`,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            zIndex: 15,
            fontSize: 12,
          }}
        >
          {leftCanvas?.label}
        </Box>
        <Box
          sx={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            bgcolor: 'rgba(0,0,0,0.75)',
            color: 'white',
            px: 1.5,
            py: 0.5,
            borderRadius: 1,
            maxWidth: `calc(${100 - sliderPosition}% - 40px)`,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            zIndex: 15,
            fontSize: 12,
          }}
        >
          {rightCanvas?.label}
        </Box>
      </Box>
    </Paper>
  );
};

export default ImageComparisonSlider;
