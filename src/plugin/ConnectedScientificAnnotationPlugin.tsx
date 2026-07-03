/**
 * ConnectedScientificAnnotationPlugin
 * Redux-connected version of the scientific annotation plugin
 *
 * This plugin properly integrates with Mirador's Redux store to:
 * - Dispatch addWindow actions for Manifest bodies
 * - Access annotation state
 * - Handle selection/hover states
 * - Apply metadata filters
 */

import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { addWindow as miradorAddWindow } from 'mirador';
import { Box, Typography, MenuItem, ListItemText } from '@mui/material';
import { AnnotationBodyRenderer } from '../components/AnnotationBodyRenderer';
import { MetadataDisplay } from '../components/MetadataDisplay';
import { filtersStore } from '../state/filtersStore';
import { normalizeAnnotationResources } from '../utils/annotationNormalizer';
import type {
  AnnotationBody,
  IIIFAnnotation,
} from '../types/iiif';
import type { SpectrumData } from '../types/dataset';
import type { MiradorState, MiradorPlugin } from '../types/mirador';
import type { Dispatch, AnyAction } from 'redux';

/** Banner shown on an annotation surfaced only because it is selected while filtered out. */
const FILTER_HIDDEN_BADGE = 'Shown because selected — hidden by the metadata filter';

/**
 * Check if body is a scientific type (Manifest or Dataset)
 * @internal Exposed for tests; not part of the public API.
 */
export function isScientificBodyType(type: string | undefined): boolean {
  return type === 'Manifest' || type === 'Dataset';
}

/**
 * Check if annotation has scientific body
 * @internal Exposed for tests; not part of the public API.
 */
export function hasScientificBody(body: unknown): boolean {
  if (!body) return false;
  const bodies = Array.isArray(body) ? body : [body];
  return bodies.some(b => isScientificBodyType((b as AnnotationBody).type));
}

/**
 * Check if annotation has metadata that should be displayed
 * @internal Exposed for tests; not part of the public API.
 */
export function hasMetadata(annotation: IIIFAnnotation | undefined): boolean {
  if (!annotation) return false;
  return Array.isArray(annotation.metadata) && annotation.metadata.length > 0;
}

/**
 * Check if annotation should use custom rendering (scientific body OR has metadata)
 * @internal Exposed for tests; not part of the public API.
 */
export function shouldUseCustomRendering(annotation: IIIFAnnotation | undefined): boolean {
  if (!annotation) return false;
  return hasScientificBody(annotation.body) || hasMetadata(annotation);
}

/**
 * Annotations to render: the filter-visible ones, plus the currently-selected
 * annotation even when the metadata filter has hidden it — so selecting it (via
 * search hit, canvas click, or deep link) still surfaces its body.
 * @internal Exposed for tests; not part of the public API.
 */
export function computeVisibleAnnotations<T extends { id: string }>(
  annotations: T[],
  hiddenAnnotationIds: Set<string>,
  selectedAnnotationId: string | undefined,
): T[] {
  return annotations.filter(
    (ann) => !hiddenAnnotationIds.has(ann.id) || ann.id === selectedAnnotationId,
  );
}

/**
 * True when an annotation is shown ONLY because it is selected while the metadata
 * filter would otherwise hide it (drives the "hidden by filter" badge).
 * @internal Exposed for tests; not part of the public API.
 */
export function shownOnlyBecauseSelected(
  id: string,
  hiddenAnnotationIds: Set<string>,
  selectedAnnotationId: string | undefined,
): boolean {
  return hiddenAnnotationIds.has(id) && id === selectedAnnotationId;
}

/**
 * Plugin wrapper component props
 */
interface TargetProps {
  annotations?: Array<{
    id: string;
    content: string;
    tags: string[];
    targetId: string;
  }>;
  windowId: string;
  canvasId?: string;
  selectedAnnotationId?: string;
  hoveredAnnotationIds?: string[];
  selectAnnotation: (windowId: string, annotationId: string) => void;
  deselectAnnotation: (windowId: string, annotationId: string) => void;
  hoverAnnotation: (windowId: string, annotationIds: string[]) => void;
  containerRef?: React.RefObject<HTMLElement>;
}

interface PluginWrapperProps {
  targetProps: TargetProps;
  TargetComponent: React.ComponentType<TargetProps>;
  // Connected props
  dispatch: (action: unknown) => void;
  addWindow: (config: { manifestId: string }) => unknown;
  annotationResources: Record<string, IIIFAnnotation>;
}

/**
 * Main plugin component that wraps CanvasAnnotations
 */
const ScientificAnnotationPluginComponent: React.FC<PluginWrapperProps> = ({
  targetProps,
  TargetComponent,
  dispatch,
  addWindow,
  annotationResources,
}) => {
  const {
    annotations = [],
    windowId,
    canvasId,
    selectedAnnotationId,
    hoveredAnnotationIds = [],
    selectAnnotation,
    deselectAnnotation,
    hoverAnnotation,
  } = targetProps;

  // Refs for scrolling to annotations
  const annotationRefs = useRef<Map<string, HTMLElement>>(new Map());

  // State for hidden annotations (from filters - only when metadataFiltersPlugin is used)
  const [hiddenAnnotationIds, setHiddenAnnotationIds] = useState<Set<string>>(new Set());

  // Subscribe to filter changes (only applies when metadataFiltersPlugin initializes filters)
  useEffect(() => {
    if (!windowId || !canvasId) return;
    const unsubscribe = filtersStore.subscribe((event) => {
      if (event.windowId === windowId && event.canvasId === canvasId && (event.type === 'update-hidden' || event.type === 'init')) {
        // Only apply filters if they were explicitly initialized by metadataFiltersPlugin
        if (filtersStore.hasFiltersInitialized(windowId, canvasId)) {
          setHiddenAnnotationIds(new Set(filtersStore.getHiddenAnnotationIds(windowId, canvasId)));
        }
      }
    });
    // Get initial hidden annotations only if filters are initialized
    if (filtersStore.hasFiltersInitialized(windowId, canvasId)) {
      setHiddenAnnotationIds(new Set(filtersStore.getHiddenAnnotationIds(windowId, canvasId)));
    }
    return unsubscribe;
  }, [windowId, canvasId]);

  // Handle hover on annotation to highlight SVG zone
  const handleAnnotationHover = useCallback((annotationId: string | null) => {
    if (!hoverAnnotation) return;
    hoverAnnotation(windowId, annotationId ? [annotationId] : []);
  }, [windowId, hoverAnnotation]);

  // Scroll to selected annotation when selection changes (e.g., from clicking SVG on canvas)
  useEffect(() => {
    if (selectedAnnotationId) {
      const element = annotationRefs.current.get(selectedAnnotationId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedAnnotationId]);

  // Determine if we have any annotations that need custom rendering
  // (scientific body OR has metadata)
  const customRenderingIds = useMemo(() => {
    const ids = new Set<string>();
    annotations.forEach(ann => {
      const resource = annotationResources[ann.id];
      if (resource && shouldUseCustomRendering(resource)) {
        ids.add(ann.id);
      }
    });
    return ids;
  }, [annotations, annotationResources]);

  // Spectrum data callbacks
  const handleDataLoaded = useCallback((id: string, data: SpectrumData) => {
    console.debug('[XYViewer] Spectrum loaded:', id, data.points.length, 'points');
  }, []);

  const handleVisibilityChange = useCallback((id: string, visible: boolean) => {
    console.debug('[XYViewer] Visibility changed:', id, visible);
  }, []);

  // Handle annotation click - triggers selection which updates Redux state
  // Note: Mirador's selectAnnotation takes (windowId, annotationId) - no canvasId needed
  const handleAnnotationClick = useCallback((annotationId: string) => {
    if (selectedAnnotationId === annotationId) {
      deselectAnnotation(windowId, annotationId);
    } else {
      selectAnnotation(windowId, annotationId);
    }
  }, [windowId, selectedAnnotationId, selectAnnotation, deselectAnnotation]);

  // Filter annotations, but keep the selected one even if the filter hid it.
  const visibleAnnotations = useMemo(
    () => computeVisibleAnnotations(annotations, hiddenAnnotationIds, selectedAnnotationId),
    [annotations, hiddenAnnotationIds, selectedAnnotationId],
  );

  // If no scientific annotations and no hidden annotations, render original component
  if (customRenderingIds.size === 0 && hiddenAnnotationIds.size === 0) {
    return <TargetComponent {...targetProps} />;
  }

  // Render mixed annotations - scientific ones custom, others default
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {visibleAnnotations.map((annotation) => {
        const resource = annotationResources[annotation.id];
        const isScientific = customRenderingIds.has(annotation.id);
        const isSelected = selectedAnnotationId === annotation.id;
        const isHovered = hoveredAnnotationIds.includes(annotation.id);
        const showFilterBadge = shownOnlyBecauseSelected(
          annotation.id,
          hiddenAnnotationIds,
          selectedAnnotationId,
        );

        if (!isScientific) {
          // Render default annotation
          return (
            <MenuItem
              key={annotation.id}
              component="li"
              ref={(el: HTMLLIElement | null) => {
                if (el) annotationRefs.current.set(annotation.id, el);
                else annotationRefs.current.delete(annotation.id);
              }}
              onClick={() => handleAnnotationClick(annotation.id)}
              onMouseEnter={() => handleAnnotationHover(annotation.id)}
              onMouseLeave={() => handleAnnotationHover(null)}
              selected={isSelected}
              sx={{
                bgcolor: isHovered && !isSelected ? 'action.hover' : undefined,
              }}
            >
              {showFilterBadge && (
                <Typography
                  variant="caption"
                  role="note"
                  sx={{ display: 'block', mb: 0.5, color: 'warning.main' }}
                >
                  {FILTER_HIDDEN_BADGE}
                </Typography>
              )}
              <ListItemText
                primary={
                  <Typography
                    variant="body2"
                    dangerouslySetInnerHTML={{ __html: annotation.content }}
                  />
                }
              />
            </MenuItem>
          );
        }

        // Render scientific annotation
        const body = resource?.body as AnnotationBody | AnnotationBody[] | undefined;
        const label = resource?.label;
        const metadata = resource?.metadata;
        const annotationId = resource?.id;
        const seeAlso = resource?.seeAlso;

        return (
          <Box
            key={annotation.id}
            component="li"
            ref={(el: HTMLLIElement | null) => {
              if (el) annotationRefs.current.set(annotation.id, el);
              else annotationRefs.current.delete(annotation.id);
            }}
            onClick={() => handleAnnotationClick(annotation.id)}
            onMouseEnter={() => handleAnnotationHover(annotation.id)}
            onMouseLeave={() => handleAnnotationHover(null)}
            sx={{
              p: 1.5,
              cursor: 'pointer',
              bgcolor: isSelected
                ? 'action.selected'
                : isHovered
                  ? 'action.hover'
                  : 'transparent',
              borderBottom: '1px solid',
              borderColor: 'divider',
              '&:hover': {
                bgcolor: isSelected ? 'action.selected' : 'action.hover',
              },
            }}
          >
            {showFilterBadge && (
              <Typography
                variant="caption"
                role="note"
                sx={{ display: 'block', mb: 0.5, color: 'warning.main' }}
              >
                {FILTER_HIDDEN_BADGE}
              </Typography>
            )}
            {/* Metadata */}
            <MetadataDisplay label={label} metadata={metadata} annotationId={annotationId} seeAlso={seeAlso} compact />

            {/* Body renderer */}
            {body && (
              <AnnotationBodyRenderer
                body={body}
                annotationLabel={label}
                dispatch={dispatch}
                addWindow={addWindow}
                isActive={isSelected}
                onDataLoaded={handleDataLoaded}
                onVisibilityChange={handleVisibilityChange}
              />
            )}

            {/* Tags */}
            {annotation.tags.length > 0 && (
              <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {annotation.tags.map((tag, idx) => (
                  <Typography
                    key={idx}
                    variant="caption"
                    sx={{
                      px: 0.75,
                      py: 0.25,
                      bgcolor: 'action.hover',
                      borderRadius: 1,
                    }}
                  >
                    {tag}
                  </Typography>
                ))}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

/**
 * Map state to props - extract annotation resources from Mirador state
 * @internal Exposed for tests; not part of the public API.
 */
export function mapStateToProps(state: MiradorState, { targetProps }: { targetProps: { windowId: string } }) {
  const { windowId } = targetProps;

  // Get window to find canvas
  const window = state.windows?.[windowId];
  const canvasId = window?.canvasId;

  // Normalize annotation resources for this canvas (handles both v2 and v3).
  const annotationResources: Record<string, IIIFAnnotation> = normalizeAnnotationResources(
    canvasId ? state.annotations?.[canvasId] : undefined
  );

  return {
    annotationResources,
  };
}

/**
 * Map dispatch to props - provide Mirador actions
 */
function mapDispatchToProps(dispatch: Dispatch<AnyAction>) {
  return {
    dispatch: dispatch as (action: unknown) => void,
    addWindow: (config: { manifestId: string }) => {
      // Use Mirador's addWindow action creator (thunk)
      // The thunk expects manifestId to be passed directly in the config
      return miradorAddWindow({ manifestId: config.manifestId });
    },
  };
}

/**
 * Connected plugin component
 */
export const ConnectedScientificAnnotationPlugin = connect(
  mapStateToProps,
  mapDispatchToProps
)(ScientificAnnotationPluginComponent);

/**
 * Plugin definition for Mirador
 */
export const scientificAnnotationPlugin: MiradorPlugin = {
  target: 'CanvasAnnotations',
  mode: 'wrap',
  name: 'ScientificAnnotationPlugin',
  component: ConnectedScientificAnnotationPlugin as unknown as React.ComponentType<{
    targetProps: Record<string, unknown>;
    TargetComponent: React.ComponentType<unknown>;
  }>,
  mapStateToProps: mapStateToProps as MiradorPlugin['mapStateToProps'],
  mapDispatchToProps: mapDispatchToProps as unknown as MiradorPlugin['mapDispatchToProps'],
};

/** @internal Exposed for tests; not part of the public API. */
export { ScientificAnnotationPluginComponent };

export default scientificAnnotationPlugin;
