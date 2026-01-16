/**
 * ConnectedScientificAnnotationPlugin
 * Redux-connected version of the scientific annotation plugin
 *
 * This plugin properly integrates with Mirador's Redux store to:
 * - Dispatch addWindow actions for Manifest bodies
 * - Access annotation state
 * - Handle selection/hover states
 */

import React, { useCallback, useMemo } from 'react';
import { connect } from 'react-redux';
import { addWindow as miradorAddWindow } from 'mirador';
import { Box, Typography, MenuItem, ListItemText } from '@mui/material';
import { AnnotationBodyRenderer } from '../components/AnnotationBodyRenderer';
import { MetadataDisplay } from '../components/MetadataDisplay';
import type {
  AnnotationBody,
  IIIFAnnotation,
  LocalizedString,
} from '../types/iiif';
import type { SpectrumData } from '../types/dataset';
import type { MiradorState, MiradorPlugin } from '../types/mirador';

/**
 * Check if body is a scientific type (Manifest or Dataset)
 */
function isScientificBodyType(type: string | undefined): boolean {
  return type === 'Manifest' || type === 'Dataset';
}

/**
 * Check if annotation has scientific body
 */
function hasScientificBody(body: unknown): boolean {
  if (!body) return false;
  const bodies = Array.isArray(body) ? body : [body];
  return bodies.some(b => isScientificBodyType((b as AnnotationBody).type));
}

/**
 * Plugin wrapper component props
 */
interface PluginWrapperProps {
  targetProps: {
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
    selectAnnotation: (windowId: string, canvasId: string, annotationId: string) => void;
    deselectAnnotation: (windowId: string, canvasId: string) => void;
    hoverAnnotation: (windowId: string, annotationIds: string[]) => void;
    containerRef?: React.RefObject<HTMLElement>;
  };
  TargetComponent: React.ComponentType<unknown>;
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
  } = targetProps;

  // Determine if we have any scientific annotations that need custom rendering
  const scientificAnnotationIds = useMemo(() => {
    const ids = new Set<string>();
    annotations.forEach(ann => {
      const resource = annotationResources[ann.id];
      if (resource && hasScientificBody(resource.body)) {
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

  // Handle annotation click
  const handleAnnotationClick = useCallback((annotationId: string) => {
    if (!canvasId) return;

    if (selectedAnnotationId === annotationId) {
      deselectAnnotation(windowId, canvasId);
    } else {
      selectAnnotation(windowId, canvasId, annotationId);
    }
  }, [windowId, canvasId, selectedAnnotationId, selectAnnotation, deselectAnnotation]);

  // If no scientific annotations, render original component
  if (scientificAnnotationIds.size === 0) {
    return <TargetComponent {...targetProps} />;
  }

  // Render mixed annotations - scientific ones custom, others default
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {annotations.map((annotation) => {
        const resource = annotationResources[annotation.id];
        const isScientific = scientificAnnotationIds.has(annotation.id);
        const isSelected = selectedAnnotationId === annotation.id;
        const isHovered = hoveredAnnotationIds.includes(annotation.id);

        if (!isScientific) {
          // Render default annotation
          return (
            <MenuItem
              key={annotation.id}
              component="li"
              onClick={() => handleAnnotationClick(annotation.id)}
              selected={isSelected}
              sx={{
                bgcolor: isHovered && !isSelected ? 'action.hover' : undefined,
              }}
            >
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

        return (
          <Box
            key={annotation.id}
            component="li"
            onClick={() => handleAnnotationClick(annotation.id)}
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
            {/* Metadata */}
            <MetadataDisplay label={label} metadata={metadata} annotationId={annotationId} compact />

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
 */
function mapStateToProps(state: MiradorState, { targetProps }: { targetProps: { windowId: string } }) {
  const { windowId } = targetProps;

  // Get window to find canvas
  const window = state.windows?.[windowId];
  const canvasId = window?.canvasId;

  // Get annotation resources for this canvas
  const annotationResources: Record<string, IIIFAnnotation> = {};

  if (canvasId && state.annotations?.[canvasId]) {
    const canvasAnnotations = state.annotations[canvasId];
    for (const [resourceId, resourceData] of Object.entries(canvasAnnotations)) {
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

  return {
    annotationResources,
  };
}

/**
 * Map dispatch to props - provide Mirador actions
 */
function mapDispatchToProps(dispatch: (action: unknown) => void) {
  return {
    dispatch,
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

export default scientificAnnotationPlugin;
