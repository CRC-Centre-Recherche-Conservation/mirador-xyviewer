/**
 * MetadataFiltersPlugin
 * Mirador plugin for filtering annotations by metadata
 */

import React, { useState, useCallback, useMemo, forwardRef, useEffect, useRef } from 'react';
import { connect } from 'react-redux';
import { Rnd } from 'react-rnd';
import { Box, IconButton, Tooltip, Badge, Paper, Typography } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import CloseIcon from '@mui/icons-material/Close';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { MetadataFiltersPanel } from '../components/MetadataFiltersPanel';
import { filtersStore } from '../state/filtersStore';
import type { MiradorState, MiradorPlugin } from '../types/mirador';
import type { IIIFAnnotation, LocalizedString } from '../types/iiif';

/** Plugin component props */
interface MetadataFiltersPluginProps {
  /** Inner ref for positioning */
  innerRef?: React.Ref<HTMLDivElement>;
  /** Window ID */
  windowId: string;
  /** Canvas ID */
  canvasId?: string;
  /** Whether filters are enabled */
  filtersEnabled?: boolean;
  /** Annotation resources */
  annotationResources: Record<string, IIIFAnnotation>;
}

/** Default window size */
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 400;

/**
 * Extract metadata from annotation resources for filtering
 */
function extractAnnotationsWithMetadata(
  annotationResources: Record<string, IIIFAnnotation>
): Array<{
  id: string;
  metadata?: Array<{
    label: LocalizedString;
    value: LocalizedString;
  }>;
}> {
  return Object.values(annotationResources).map(annotation => ({
    id: annotation.id,
    metadata: annotation.metadata,
  }));
}

/**
 * Metadata Filters Plugin Component
 * Adds a filter button and draggable/resizable panel to the viewer
 */
const MetadataFiltersPluginComponent = forwardRef<HTMLDivElement, MetadataFiltersPluginProps>(
  function MetadataFiltersPluginComponent(
    {
      windowId,
      canvasId,
      filtersEnabled = true,
      annotationResources,
    },
    ref
  ) {
    const [isOpen, setIsOpen] = useState(false);
    const [hiddenCount, setHiddenCount] = useState(0);
    const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const viewerRef = useRef<HTMLDivElement>(null);

    // Extract annotations with metadata
    const annotationsWithMetadata = useMemo(
      () => extractAnnotationsWithMetadata(annotationResources),
      [annotationResources]
    );

    // Check if there are any annotations with metadata
    const hasMetadata = useMemo(
      () => annotationsWithMetadata.some(a => a.metadata && a.metadata.length > 0),
      [annotationsWithMetadata]
    );

    // Initialize filters when we have metadata (handles lazy loading)
    useEffect(() => {
      if (windowId && canvasId && hasMetadata) {
        // Initialize only if not already done for this window+canvas
        if (!filtersStore.hasFiltersInitialized(windowId, canvasId)) {
          filtersStore.initializeFromAnnotations(windowId, canvasId, annotationsWithMetadata, false);
        }
        setHiddenCount(filtersStore.getHiddenAnnotationIds(windowId, canvasId).size);
      }
    }, [windowId, canvasId, hasMetadata, annotationsWithMetadata]);

    // Re-initialize when canvas changes
    const prevCanvasIdRef = useRef<string | undefined>(undefined);
    useEffect(() => {
      if (canvasId && prevCanvasIdRef.current && canvasId !== prevCanvasIdRef.current) {
        // Canvas changed - reset hidden count, filters will be initialized when metadata loads
        setHiddenCount(0);
      }
      prevCanvasIdRef.current = canvasId;
    }, [canvasId]);

    // Subscribe to filter changes
    useEffect(() => {
      if (!windowId || !canvasId) return;
      const unsubscribe = filtersStore.subscribe((event) => {
        if (event.windowId === windowId && event.canvasId === canvasId) {
          setHiddenCount(filtersStore.getHiddenAnnotationIds(windowId, canvasId).size);
        }
      });
      return unsubscribe;
    }, [windowId, canvasId]);

    const handleToggleFilters = useCallback(() => {
      setIsOpen(prev => !prev);
    }, []);

    const handleCloseFilters = useCallback(() => {
      setIsOpen(false);
    }, []);

    const handleFiltersChange = useCallback((hiddenIds: Set<string>) => {
      setHiddenCount(hiddenIds.size);
    }, []);

    const handleResetAll = useCallback(() => {
      if (windowId && canvasId) {
        filtersStore.resetAll(windowId, canvasId);
        setHiddenCount(0);
      }
    }, [windowId, canvasId]);

    // Calculate initial position (above the button, aligned to the right)
    const getInitialPosition = useCallback(() => {
      if (buttonRef.current && viewerRef.current) {
        const buttonRect = buttonRef.current.getBoundingClientRect();
        const viewerRect = viewerRef.current.getBoundingClientRect();

        // Position above the button, right-aligned
        const x = viewerRect.width - size.width - 20; // 20px from right edge
        const y = buttonRect.top - viewerRect.top - size.height - 10; // 10px above button

        return {
          x: Math.max(10, x),
          y: Math.max(10, y),
        };
      }
      // Fallback position
      return { x: 20, y: 20 };
    }, [size.width, size.height]);

    const hasActiveFilters = hiddenCount > 0;

    // Don't render if disabled
    if (!filtersEnabled) {
      return <Box ref={ref} sx={{ position: 'static' }} />;
    }

    // Show button even without metadata (grayed out)
    const buttonDisabled = !hasMetadata;

    // Get initial position when opening
    const initialPosition = isOpen ? getInitialPosition() : { x: 0, y: 0 };

    return (
      <Box ref={ref} sx={{ position: 'static' }}>
        {/* Container for bounds reference */}
        <Box
          ref={viewerRef}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
          }}
        />

        {/* Filter button */}
        <Tooltip title={buttonDisabled ? "No metadata available" : "Filter annotations by metadata"}>
          <span>
            <IconButton
              ref={buttonRef}
              onClick={handleToggleFilters}
              disabled={buttonDisabled}
              sx={{
                position: 'absolute',
                bottom: 160,
                right: 20,
                zIndex: 999,
                bgcolor: isOpen ? 'primary.main' : hasActiveFilters ? 'warning.main' : 'rgba(0,0,0,0.6)',
                color: 'white',
                '&:hover': {
                  bgcolor: isOpen ? 'primary.dark' : hasActiveFilters ? 'warning.dark' : 'rgba(0,0,0,0.8)',
                },
                '&.Mui-disabled': {
                  bgcolor: 'rgba(0,0,0,0.3)',
                  color: 'rgba(255,255,255,0.5)',
                },
              }}
              aria-label="Filter annotations"
              aria-expanded={isOpen}
            >
              <Badge
                badgeContent={hasActiveFilters ? hiddenCount : 0}
                color="error"
                max={99}
              >
                <FilterListIcon />
              </Badge>
            </IconButton>
          </span>
        </Tooltip>

        {/* Draggable/Resizable filter window */}
        {isOpen && canvasId && (
          <Rnd
            key={`${windowId}-${canvasId}`}
            default={{
              x: initialPosition.x,
              y: initialPosition.y,
              width: size.width,
              height: size.height,
            }}
            size={{ width: size.width, height: size.height }}
            minWidth={280}
            minHeight={250}
            maxWidth={600}
            maxHeight={700}
            onResizeStop={(_e, _direction, elementRef) => {
              setSize({
                width: elementRef.offsetWidth,
                height: elementRef.offsetHeight,
              });
            }}
            dragHandleClassName="filter-window-drag-handle"
            enableResizing={{
              top: false,
              right: true,
              bottom: true,
              left: false,
              topRight: false,
              bottomRight: true,
              bottomLeft: false,
              topLeft: false,
            }}
            style={{
              position: 'absolute',
              zIndex: 1001,
            }}
          >
            <Paper
              elevation={8}
              sx={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: 1,
              }}
            >
              {/* Window header - drag handle */}
              <Box
                className="filter-window-drag-handle"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  p: 1,
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  cursor: 'move',
                  userSelect: 'none',
                }}
              >
                <DragIndicatorIcon sx={{ mr: 0.5, opacity: 0.7 }} fontSize="small" />
                <FilterListIcon sx={{ mr: 1 }} fontSize="small" />
                <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600 }}>
                  Filters
                </Typography>
                {hasActiveFilters && (
                  <Box
                    sx={{
                      px: 1,
                      py: 0.25,
                      mr: 1,
                      bgcolor: 'warning.main',
                      borderRadius: 1,
                      fontSize: '0.75rem',
                    }}
                  >
                    {hiddenCount} hidden
                  </Box>
                )}
                {hasActiveFilters && (
                  <Tooltip title="Reset all filters">
                    <IconButton
                      size="small"
                      onClick={handleResetAll}
                      sx={{ color: 'inherit', mr: 0.5 }}
                    >
                      <RestartAltIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <IconButton
                  size="small"
                  onClick={handleCloseFilters}
                  sx={{ color: 'inherit' }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>

              {/* Filter content */}
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                <MetadataFiltersPanel
                  windowId={windowId}
                  canvasId={canvasId}
                  annotations={annotationsWithMetadata}
                  onFiltersChange={handleFiltersChange}
                  onClose={handleCloseFilters}
                  embedded
                />
              </Box>

              {/* Resize handle indicator */}
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 2,
                  right: 2,
                  width: 12,
                  height: 12,
                  cursor: 'se-resize',
                  opacity: 0.5,
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    bottom: 2,
                    right: 2,
                    width: 8,
                    height: 8,
                    borderRight: '2px solid',
                    borderBottom: '2px solid',
                    borderColor: 'text.secondary',
                  },
                }}
              />
            </Paper>
          </Rnd>
        )}
      </Box>
    );
  }
);

/**
 * Map Mirador state to props
 */
function mapStateToProps(
  state: MiradorState,
  { windowId }: { windowId: string }
): Partial<MetadataFiltersPluginProps> {
  const window = state.windows?.[windowId];
  const canvasId = window?.canvasId;

  // Get annotation resources for this canvas
  const annotationResources: Record<string, IIIFAnnotation> = {};

  if (canvasId && state.annotations?.[canvasId]) {
    const canvasAnnotations = state.annotations[canvasId];
    for (const resourceData of Object.values(canvasAnnotations)) {
      const data = resourceData as { json?: IIIFAnnotation };
      if (data?.json) {
        // Extract individual annotations from the annotation page
        const json = data.json as { items?: IIIFAnnotation[] } | IIIFAnnotation;
        if ('items' in json && Array.isArray(json.items)) {
          json.items.forEach(item => {
            annotationResources[item.id] = item;
          });
        } else if ('id' in json) {
          annotationResources[json.id] = json;
        }
      }
    }
  }

  // Get window config
  const filtersEnabled = window?.filtersEnabled !== false;

  return {
    canvasId,
    filtersEnabled,
    annotationResources,
  };
}

/**
 * Connected plugin component
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ConnectedMetadataFiltersPlugin = (connect as any)(
  mapStateToProps,
  null,
  null,
  { forwardRef: true }
)(MetadataFiltersPluginComponent);

/**
 * Plugin definition for Mirador
 */
export const metadataFiltersPlugin: MiradorPlugin = {
  target: 'OpenSeadragonViewer',
  mode: 'add',
  name: 'MetadataFiltersPlugin',
  component: ConnectedMetadataFiltersPlugin as unknown as React.ComponentType<{
    targetProps: Record<string, unknown>;
    TargetComponent: React.ComponentType<unknown>;
  }>,
  mapStateToProps: mapStateToProps as unknown as MiradorPlugin['mapStateToProps'],
};

export default metadataFiltersPlugin;
