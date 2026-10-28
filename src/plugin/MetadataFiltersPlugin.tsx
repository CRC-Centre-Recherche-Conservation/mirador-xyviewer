/**
 * MetadataFiltersPlugin
 * Mirador plugin for filtering annotations by their body terms and metadata
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
import { filtersStore, hasFacets, type FilterableAnnotation } from '../state/filtersStore';
import { sanitizeLabels } from '../utils/annotationLabels';
import { resolvePreferredLanguages } from '../utils/localization';
import { normalizeAnnotationResources } from '../utils/annotationNormalizer';
import type { MiradorState, MiradorPlugin, AnnotationBodyLabels } from '../types/mirador';
import type { IIIFAnnotation } from '../types/iiif';
import { containPlugin } from './containPlugin';
import { metadataFilterOverlayPlugin } from './MetadataFilterOverlayPlugin';

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
  /** Mirador config language (reader's language for IIIF language maps) */
  language?: string;
  /** UI string overrides from `config.scientificAnnotations.labels` */
  labels?: AnnotationBodyLabels;
  /** `config.scientificAnnotations.hiddenFilterGroups` */
  hiddenFilterGroups?: string[];
}

/** Default window size */
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 400;

/**
 * What the filters read from the annotation resources: metadata and bodies.
 * @internal Exposed for tests; not part of the public API.
 */
export function extractAnnotationsWithMetadata(
  annotationResources: Record<string, IIIFAnnotation>
): FilterableAnnotation[] {
  return Object.values(annotationResources).map(annotation => ({
    id: annotation.id,
    metadata: annotation.metadata,
    body: annotation.body,
  }));
}

/**
 * Metadata Filters Plugin Component
 * Adds a filter button and draggable/resizable panel to the viewer
 */
export const MetadataFiltersPluginComponent = forwardRef<HTMLDivElement, MetadataFiltersPluginProps>(
  function MetadataFiltersPluginComponent(
    {
      windowId,
      canvasId,
      filtersEnabled = true,
      annotationResources,
      language,
      labels,
      hiddenFilterGroups,
    },
    ref
  ) {
    const [isOpen, setIsOpen] = useState(false);
    const [hiddenCount, setHiddenCount] = useState(0);
    const [hasFilterable, setHasFilterable] = useState(false);
    const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const viewerRef = useRef<HTMLDivElement>(null);

    // Extract annotations with metadata and bodies
    const annotationsWithMetadata = useMemo(
      () => extractAnnotationsWithMetadata(annotationResources),
      [annotationResources]
    );

    // Anything to filter on (metadata or controlled body terms) is worth building the groups for.
    const mayFilter = useMemo(
      () => annotationsWithMetadata.some(hasFacets),
      [annotationsWithMetadata]
    );
    const filterOptions = useMemo(() => ({ labels, hiddenGroups: hiddenFilterGroups }), [labels, hiddenFilterGroups]);

    // Reader's language preferences; filter keys depend on them
    const prefs = useMemo(() => resolvePreferredLanguages(language), [language]);

    // Sync the badge from the store on canvas change; a canvas not yet initialized reads 0.
    useEffect(() => {
      setHiddenCount(
        windowId && canvasId ? filtersStore.getHiddenAnnotationIds(windowId, canvasId).size : 0
      );
    }, [windowId, canvasId]);

    // Initialize filters when there is something to filter (handles lazy loading). The store
    // skips work when already initialized with the same prefs and options, and rebuilds
    // (resetting the selection) when the language or the options changed.
    useEffect(() => {
      if (windowId && canvasId && mayFilter) {
        filtersStore.initializeFromAnnotations(windowId, canvasId, annotationsWithMetadata, false, prefs, filterOptions);
        setHiddenCount(filtersStore.getHiddenAnnotationIds(windowId, canvasId).size);
        // Host-hidden groups can leave nothing to filter on.
        setHasFilterable(filtersStore.getGroups(windowId, canvasId).length > 0);
      } else {
        setHasFilterable(false);
      }
    }, [windowId, canvasId, mayFilter, annotationsWithMetadata, prefs, filterOptions]);

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
    const buttonDisabled = !hasFilterable;

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
          {/* The span (needed so the tooltip works on a disabled button) carries the
              absolute positioning, so the tooltip anchors to the button's real spot. */}
          <span style={{ position: 'absolute', bottom: 160, right: 20, zIndex: 999 }}>
            <IconButton
              ref={buttonRef}
              onClick={handleToggleFilters}
              disabled={buttonDisabled}
              sx={{
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
              aria-label={hasActiveFilters ? `Filter annotations (${hiddenCount} hidden)` : 'Filter annotations'}
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
                  labels={labels}
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

const hiddenCache = new WeakMap<object, string[]>();

/** The host's group names as a stable array (strings only). */
function hiddenGroups(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  let list = hiddenCache.get(raw);
  if (!list) {
    list = raw.filter((g): g is string => typeof g === 'string' && g !== '');
    hiddenCache.set(raw, list);
  }
  return list;
}

/**
 * Map Mirador state to props
 * @internal Exposed for tests; not part of the public API.
 */
export function mapStateToProps(
  state: MiradorState,
  { windowId }: { windowId: string }
): Partial<MetadataFiltersPluginProps> {
  const window = state.windows?.[windowId];
  const canvasId = window?.canvasId;

  // Normalize annotation resources for this canvas (handles both v2 and v3).
  const annotationResources: Record<string, IIIFAnnotation> = normalizeAnnotationResources(
    canvasId ? state.annotations?.[canvasId] : undefined
  );

  // Get window config
  const filtersEnabled = window?.filtersEnabled !== false;

  return {
    canvasId,
    filtersEnabled,
    annotationResources,
    language: state.config?.language,
    labels: sanitizeLabels(state.config?.scientificAnnotations?.labels),
    hiddenFilterGroups: hiddenGroups(state.config?.scientificAnnotations?.hiddenFilterGroups),
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

/** Filter button and panel (OpenSeadragonViewer target). */
const metadataFiltersPanelPlugin: MiradorPlugin = containPlugin({
  target: 'OpenSeadragonViewer',
  mode: 'add',
  name: 'MetadataFiltersPlugin',
  component: ConnectedMetadataFiltersPlugin as unknown as React.ComponentType<{
    targetProps: Record<string, unknown>;
    TargetComponent: React.ComponentType<unknown>;
  }>,
  mapStateToProps: mapStateToProps as unknown as MiradorPlugin['mapStateToProps'],
});

/**
 * Plugin definition for Mirador: the filter button/panel plus the canvas overlay that
 * hides filtered shapes. An array (one Mirador plugin per target): hosts spread it
 * (`[...metadataFiltersPlugin]`); unspread only works through `Mirador.viewer`.
 */
export const metadataFiltersPlugin: MiradorPlugin[] = [
  metadataFiltersPanelPlugin,
  metadataFilterOverlayPlugin,
];

export default metadataFiltersPlugin;
