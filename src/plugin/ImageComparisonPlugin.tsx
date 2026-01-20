/**
 * ImageComparisonPlugin
 * Mirador plugin for comparing images within the same manifest
 */

import React, { useState, forwardRef } from 'react';
import { connect } from 'react-redux';
import { updateWindow as miradorUpdateWindow } from 'mirador';
import { Box, IconButton, Tooltip } from '@mui/material';
import CompareIcon from '@mui/icons-material/Compare';
import { ImageComparisonSlider, type CanvasInfo } from '../components/ImageComparisonSlider';
import type { MiradorState, MiradorPlugin } from '../types/mirador';
import type { LocalizedString } from '../types/iiif';
import { getLocalizedString } from '../utils/localization';

/**
 * Extract image URL from IIIF canvas
 */
function extractImageUrl(canvas: IIIFCanvas): string | null {
  // IIIF Presentation 3.0
  if (canvas.items) {
    for (const page of canvas.items) {
      if (page.items) {
        for (const annotation of page.items) {
          if (annotation.body) {
            const body = annotation.body;
            if (typeof body === 'object' && 'id' in body) {
              return body.id as string;
            }
            if (Array.isArray(body) && body[0]?.id) {
              return body[0].id;
            }
          }
        }
      }
    }
  }
  // IIIF Presentation 2.0
  if (canvas.images) {
    for (const image of canvas.images) {
      if (image.resource) {
        if (typeof image.resource === 'string') {
          return image.resource;
        }
        if (image.resource['@id']) {
          return image.resource['@id'];
        }
        if (image.resource.id) {
          return image.resource.id;
        }
      }
    }
  }
  return null;
}

/**
 * Extract thumbnail URL from IIIF canvas
 */
function extractThumbnailUrl(canvas: IIIFCanvas): string | null {
  if (canvas.thumbnail) {
    if (typeof canvas.thumbnail === 'string') {
      return canvas.thumbnail;
    }
    if (Array.isArray(canvas.thumbnail) && canvas.thumbnail[0]) {
      const thumb = canvas.thumbnail[0];
      if (typeof thumb === 'string') {
        return thumb;
      }
      return thumb.id || thumb['@id'] || null;
    }
    if (typeof canvas.thumbnail === 'object' && !Array.isArray(canvas.thumbnail)) {
      return canvas.thumbnail.id || canvas.thumbnail['@id'] || null;
    }
  }
  return null;
}

/** IIIF Canvas type (simplified) */
interface IIIFCanvas {
  id?: string;
  '@id'?: string;
  label?: LocalizedString | string;
  items?: Array<{
    items?: Array<{
      body?: { id?: string } | Array<{ id?: string }>;
    }>;
  }>;
  images?: Array<{
    resource?: string | { '@id'?: string; id?: string };
  }>;
  thumbnail?: string | Array<string | { id?: string; '@id'?: string }> | { id?: string; '@id'?: string };
}

/** IIIF Manifest type (simplified) */
interface IIIFManifest {
  items?: IIIFCanvas[];
  sequences?: Array<{ canvases?: IIIFCanvas[] }>;
}

/**
 * Extract canvases from manifest
 */
function extractCanvases(manifest: IIIFManifest | null | undefined): CanvasInfo[] {
  if (!manifest) return [];

  const canvases: CanvasInfo[] = [];

  // IIIF Presentation 3.0
  if (manifest.items) {
    manifest.items.forEach((canvas, index) => {
      const id = canvas.id || canvas['@id'] || `canvas-${index}`;
      const imageUrl = extractImageUrl(canvas);
      if (imageUrl) {
        canvases.push({
          id,
          label: getCanvasLabel(canvas.label, index),
          imageUrl,
          thumbnailUrl: extractThumbnailUrl(canvas) || undefined,
        });
      }
    });
  }

  // IIIF Presentation 2.0
  if (manifest.sequences) {
    manifest.sequences.forEach((sequence) => {
      if (sequence.canvases) {
        sequence.canvases.forEach((canvas, index) => {
          const id = canvas.id || canvas['@id'] || `canvas-${index}`;
          const imageUrl = extractImageUrl(canvas);
          if (imageUrl) {
            canvases.push({
              id,
              label: getCanvasLabel(canvas.label, index),
              imageUrl,
              thumbnailUrl: extractThumbnailUrl(canvas) || undefined,
            });
          }
        });
      }
    });
  }

  return canvases;
}

/**
 * Get canvas label as string
 */
function getCanvasLabel(label: LocalizedString | string | undefined, index: number): string {
  if (!label) return `Image ${index + 1}`;
  if (typeof label === 'string') return label;
  return getLocalizedString(label) || `Image ${index + 1}`;
}

/** Plugin component props */
interface ImageComparisonPluginProps {
  /** Inner ref for positioning */
  innerRef?: React.Ref<HTMLDivElement>;
  /** Window ID */
  windowId: string;
  /** Whether comparison is enabled */
  imageComparisonEnabled?: boolean;
  /** Whether comparison panel is open */
  imageComparisonOpen?: boolean;
  /** Current canvas ID */
  canvasId?: string;
  /** Canvases extracted from manifest */
  canvases?: CanvasInfo[];
  /** Update window action */
  updateWindow?: (windowId: string, payload: Record<string, unknown>) => void;
}

/**
 * Image Comparison Plugin Component
 * Adds a comparison button and slider overlay to OpenSeadragon viewer
 */
const ImageComparisonPluginComponent = forwardRef<HTMLDivElement, ImageComparisonPluginProps>(
  function ImageComparisonPluginComponent(
    {
      windowId,
      imageComparisonEnabled = true,
      imageComparisonOpen = false,
      canvasId,
      canvases = [],
      updateWindow,
    },
    ref
  ) {
    // Local state for when not using Redux
    const [localOpen, setLocalOpen] = useState(false);
    const isOpen = imageComparisonOpen || localOpen;

    const handleToggle = () => {
      if (updateWindow) {
        updateWindow(windowId, { imageComparisonOpen: !isOpen });
      } else {
        setLocalOpen(!localOpen);
      }
    };

    const handleClose = () => {
      if (updateWindow) {
        updateWindow(windowId, { imageComparisonOpen: false });
      } else {
        setLocalOpen(false);
      }
    };

    // Don't render if not enough canvases
    if (!imageComparisonEnabled || canvases.length < 2) {
      return <Box ref={ref} sx={{ position: 'static' }} />;
    }

    return (
      <Box ref={ref} sx={{ position: 'static' }}>
        {/* Comparison button */}
        <Tooltip title="Comparer les images">
          <IconButton
            onClick={handleToggle}
            sx={{
              position: 'absolute',
              top: 8,
              left: 8,
              zIndex: 999,
              bgcolor: isOpen ? 'primary.main' : 'rgba(0,0,0,0.6)',
              color: 'white',
              '&:hover': {
                bgcolor: isOpen ? 'primary.dark' : 'rgba(0,0,0,0.8)',
              },
            }}
            aria-label="Comparer les images"
            aria-expanded={isOpen}
          >
            <CompareIcon />
          </IconButton>
        </Tooltip>

        {/* Comparison slider overlay */}
        {isOpen && (
          <ImageComparisonSlider
            canvases={canvases}
            currentCanvasId={canvasId}
            onClose={handleClose}
            windowId={windowId}
          />
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
): Partial<ImageComparisonPluginProps> {
  const window = state.windows?.[windowId];
  const manifestId = window?.manifestId;
  const canvasId = window?.canvasId;

  // Get manifest JSON
  const manifestData = manifestId ? state.manifests?.[manifestId] : null;
  const manifest = manifestData?.json as IIIFManifest | undefined;

  // Extract canvases
  const canvases = extractCanvases(manifest);

  // Get window config with safe boolean extraction
  const imageComparisonEnabled = window?.imageComparisonEnabled !== false;
  const imageComparisonOpen = window?.imageComparisonOpen === true;

  return {
    canvasId,
    canvases,
    imageComparisonEnabled,
    imageComparisonOpen,
  };
}

/**
 * Map dispatch to props
 */
const mapDispatchToProps = {
  updateWindow: miradorUpdateWindow,
};

/**
 * Connected plugin component
 */
export const ConnectedImageComparisonPlugin = connect(
  mapStateToProps,
  mapDispatchToProps,
  null,
  { forwardRef: true }
)(ImageComparisonPluginComponent as React.ComponentType<ImageComparisonPluginProps>);

/**
 * Plugin definition for Mirador
 */
export const imageComparisonPlugin: MiradorPlugin = {
  target: 'OpenSeadragonViewer',
  mode: 'add',
  name: 'ImageComparisonPlugin',
  component: ConnectedImageComparisonPlugin as unknown as React.ComponentType<{
    targetProps: Record<string, unknown>;
    TargetComponent: React.ComponentType<unknown>;
  }>,
  mapStateToProps: mapStateToProps as unknown as MiradorPlugin['mapStateToProps'],
  mapDispatchToProps: mapDispatchToProps as unknown as MiradorPlugin['mapDispatchToProps'],
};

export default imageComparisonPlugin;
