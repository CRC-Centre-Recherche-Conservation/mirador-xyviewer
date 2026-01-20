/**
 * ImageComparisonSlider
 * A slider component for comparing two IIIF images side by side
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Box, Slider, Typography, FormControl, InputLabel, Select, MenuItem, IconButton, Paper } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import CloseIcon from '@mui/icons-material/Close';
import CompareIcon from '@mui/icons-material/Compare';

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
 * Get IIIF image URL at full/max size
 * Uses 'max' for IIIF 2.1+ or 'full' for older versions
 */
function getImageUrl(baseUrl: string): string {
  // Check if it's already a IIIF Image API URL
  if (baseUrl.includes('/full/')) {
    // Replace size parameter with 'max' to get native resolution without upscaling
    return baseUrl.replace(/\/full\/[^/]+\//, '/full/max/');
  }
  // Try to construct IIIF URL
  if (baseUrl.includes('info.json')) {
    return baseUrl.replace('/info.json', '/full/max/0/default.jpg');
  }
  return baseUrl;
}

export const ImageComparisonSlider: React.FC<ImageComparisonSliderProps> = ({
  canvases,
  currentCanvasId,
  onClose,
  windowId,
}) => {
  // Default to first two canvases or current canvas
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
  const containerRef = useRef<HTMLDivElement>(null);

  const leftCanvas = canvases.find(c => c.id === leftCanvasId);
  const rightCanvas = canvases.find(c => c.id === rightCanvasId);

  const handleLeftChange = (event: SelectChangeEvent<string>) => {
    setLeftCanvasId(event.target.value);
  };

  const handleRightChange = (event: SelectChangeEvent<string>) => {
    setRightCanvasId(event.target.value);
  };

  const handleSliderChange = (_event: Event, newValue: number | number[]) => {
    setSliderPosition(newValue as number);
  };

  // Mouse/touch drag handling for the comparison divider
  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove);
      window.addEventListener('touchend', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleMouseMove);
        window.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (canvases.length < 2) {
    return (
      <Paper sx={{ p: 2, m: 1 }}>
        <Typography color="text.secondary">
          Au moins 2 images sont nécessaires pour la comparaison.
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
        bgcolor: 'background.paper',
      }}
    >
      {/* Header with dropdowns */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          p: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          flexWrap: 'wrap',
        }}
      >
        <CompareIcon color="primary" />
        <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
          Comparaison d'images
        </Typography>

        <FormControl size="small" sx={{ minWidth: 200, flex: 1 }}>
          <InputLabel id={`${windowId}-left-label`}>Image gauche</InputLabel>
          <Select
            labelId={`${windowId}-left-label`}
            value={leftCanvasId}
            label="Image gauche"
            onChange={handleLeftChange}
          >
            {canvases.map((canvas) => (
              <MenuItem key={canvas.id} value={canvas.id}>
                {canvas.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 200, flex: 1 }}>
          <InputLabel id={`${windowId}-right-label`}>Image droite</InputLabel>
          <Select
            labelId={`${windowId}-right-label`}
            value={rightCanvasId}
            label="Image droite"
            onChange={handleRightChange}
          >
            {canvases.map((canvas) => (
              <MenuItem key={canvas.id} value={canvas.id}>
                {canvas.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <IconButton onClick={onClose} size="small" aria-label="Fermer la comparaison">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Image comparison area */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          cursor: isDragging ? 'ew-resize' : 'default',
          userSelect: 'none',
        }}
      >
        {/* Right image (background) */}
        {rightCanvas && (
          <Box
            component="img"
            src={getImageUrl(rightCanvas.imageUrl)}
            alt={rightCanvas.label}
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        )}

        {/* Left image (clipped) */}
        {leftCanvas && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`,
            }}
          >
            <Box
              component="img"
              src={getImageUrl(leftCanvas.imageUrl)}
              alt={leftCanvas.label}
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          </Box>
        )}

        {/* Divider line */}
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
            bgcolor: 'primary.main',
            cursor: 'ew-resize',
            zIndex: 10,
            '&::before': {
              content: '""',
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 32,
              height: 32,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              border: '2px solid white',
              boxShadow: 2,
            },
            '&::after': {
              content: '"⟨ ⟩"',
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'white',
              fontWeight: 'bold',
              fontSize: 12,
              letterSpacing: 2,
            },
          }}
        />

        {/* Labels */}
        <Typography
          variant="caption"
          sx={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            bgcolor: 'rgba(0,0,0,0.6)',
            color: 'white',
            px: 1,
            py: 0.5,
            borderRadius: 1,
            maxWidth: `calc(${sliderPosition}% - 20px)`,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {leftCanvas?.label}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            bgcolor: 'rgba(0,0,0,0.6)',
            color: 'white',
            px: 1,
            py: 0.5,
            borderRadius: 1,
            maxWidth: `calc(${100 - sliderPosition}% - 20px)`,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {rightCanvas?.label}
        </Typography>
      </Box>
    </Paper>
  );
};

export default ImageComparisonSlider;
