/**
 * ScientificAnnotationPlugin
 * Mirador 4 plugin that extends annotation panel to handle scientific annotations
 *
 * This plugin wraps the CanvasAnnotations component to intercept annotation rendering
 * and provide specialized handling for Manifest, Dataset, and TextualBody types.
 */

import React, { useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import { AnnotationBodyRenderer } from '../components/AnnotationBodyRenderer';
import { MetadataDisplay } from '../components/MetadataDisplay';
import type {
  AnnotationBody,
  IIIFAnnotation,
  LocalizedString,
} from '../types/iiif';
import type { SpectrumData } from '../types/dataset';
import type { MiradorPlugin } from '../types/mirador';

/**
 * Target component props
 */
interface TargetProps {
  annotations?: Array<{
    id: string;
    content: string;
    tags: string[];
    targetId: string;
    resource?: IIIFAnnotation;
  }>;
  windowId: string;
  selectedAnnotationId?: string;
  hoveredAnnotationIds?: string[];
  [key: string]: unknown;
}

/**
 * Props received by the plugin wrapper
 */
interface PluginWrapperProps {
  /** Original props from target component */
  targetProps: TargetProps;
  /** The original component being wrapped */
  TargetComponent: React.ComponentType<TargetProps>;
}

/**
 * Extract annotation body from resource
 */
function extractBody(resource: IIIFAnnotation | undefined): AnnotationBody | AnnotationBody[] | null {
  if (!resource?.body) return null;
  return resource.body as AnnotationBody | AnnotationBody[];
}

/**
 * Extract label from resource
 */
function extractLabel(resource: IIIFAnnotation | undefined): LocalizedString | undefined {
  return resource?.label;
}

/**
 * Extract metadata from resource
 */
function extractMetadata(resource: IIIFAnnotation | undefined) {
  return resource?.metadata;
}

/**
 * Check if annotation has a scientific body type
 */
function hasScientificBody(resource: IIIFAnnotation | undefined): boolean {
  if (!resource?.body) return false;

  const bodies = Array.isArray(resource.body) ? resource.body : [resource.body];
  return bodies.some(body => {
    const type = (body as AnnotationBody).type;
    return type === 'Manifest' || type === 'Dataset';
  });
}

/**
 * Scientific Annotation Panel Plugin Component
 * Wraps Mirador's CanvasAnnotations to add scientific annotation support
 */
export const ScientificAnnotationPanel: React.FC<PluginWrapperProps> = ({
  targetProps,
  TargetComponent,
}) => {
  const {
    annotations = [],
    windowId,
    selectedAnnotationId,
  } = targetProps;

  // Spectrum data management callbacks
  const handleDataLoaded = useCallback((id: string, data: SpectrumData) => {
    console.debug('[ScientificAnnotationPlugin] Data loaded:', id, data.points.length, 'points');
  }, []);

  const handleVisibilityChange = useCallback((id: string, visible: boolean) => {
    console.debug('[ScientificAnnotationPlugin] Visibility changed:', id, visible);
  }, []);

  // Check if we have any scientific annotations
  const hasScientificAnnotations = annotations.some(ann =>
    hasScientificBody(ann.resource)
  );

  // If no scientific annotations, render original component unchanged
  if (!hasScientificAnnotations) {
    return <TargetComponent {...targetProps} />;
  }

  // Render enhanced annotation panel
  return (
    <Box>
      {/* Render each annotation with scientific support */}
      {annotations.map((annotation) => {
        const body = extractBody(annotation.resource);
        const label = extractLabel(annotation.resource);
        const metadata = extractMetadata(annotation.resource);
        const isSelected = annotation.id === selectedAnnotationId;

        // If no body or not scientific, render default content
        if (!body || !hasScientificBody(annotation.resource)) {
          return (
            <Box
              key={annotation.id}
              sx={{
                p: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: isSelected ? 'action.selected' : 'transparent',
              }}
            >
              <Typography
                variant="body2"
                sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {annotation.content}
              </Typography>
            </Box>
          );
        }

        // Render scientific annotation
        return (
          <ScientificAnnotationItem
            key={annotation.id}
            annotation={annotation}
            body={body}
            label={label}
            metadata={metadata}
            isSelected={isSelected}
            windowId={windowId}
            onDataLoaded={handleDataLoaded}
            onVisibilityChange={handleVisibilityChange}
          />
        );
      })}
    </Box>
  );
};

/**
 * Individual scientific annotation item
 */
interface ScientificAnnotationItemProps {
  annotation: {
    id: string;
    content: string;
    tags: string[];
    targetId: string;
  };
  body: AnnotationBody | AnnotationBody[];
  label?: LocalizedString;
  metadata?: IIIFAnnotation['metadata'];
  isSelected: boolean;
  windowId: string;
  onDataLoaded?: (id: string, data: SpectrumData) => void;
  onVisibilityChange?: (id: string, visible: boolean) => void;
}

const ScientificAnnotationItem: React.FC<ScientificAnnotationItemProps> = ({
  annotation,
  body,
  label,
  metadata,
  isSelected,
  onDataLoaded,
  onVisibilityChange,
}) => {
  // We need access to dispatch and actions - these will be provided via mapDispatchToProps
  // For now, we create placeholder functions
  const dispatch = useCallback((action: unknown) => {
    console.warn('[ScientificAnnotationPlugin] Dispatch not connected:', action);
  }, []);

  const addWindow = useCallback((config: { manifestId: string }) => {
    return { type: 'mirador/ADD_WINDOW', ...config };
  }, []);

  return (
    <Box
      sx={{
        p: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: isSelected ? 'action.selected' : 'transparent',
        '&:hover': {
          bgcolor: isSelected ? 'action.selected' : 'action.hover',
        },
      }}
    >
      {/* Metadata display */}
      <MetadataDisplay label={label} metadata={metadata} compact />

      {/* Body renderer */}
      <AnnotationBodyRenderer
        body={body}
        annotationLabel={label}
        dispatch={dispatch}
        addWindow={addWindow}
        isActive={isSelected}
        onDataLoaded={onDataLoaded}
        onVisibilityChange={onVisibilityChange}
      />

      {/* Tags if present */}
      {annotation.tags.length > 0 && (
        <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {annotation.tags.map((tag, idx) => (
            <Typography
              key={idx}
              variant="caption"
              sx={{
                px: 0.5,
                py: 0.25,
                bgcolor: 'action.hover',
                borderRadius: 0.5,
              }}
            >
              {tag}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
};

/**
 * Plugin definition for Mirador
 */
export const scientificAnnotationPlugin: MiradorPlugin = {
  target: 'CanvasAnnotations',
  mode: 'wrap',
  component: ScientificAnnotationPanel as React.ComponentType<{
    targetProps: Record<string, unknown>;
    TargetComponent: React.ComponentType<unknown>;
  }>,
};

export default scientificAnnotationPlugin;
