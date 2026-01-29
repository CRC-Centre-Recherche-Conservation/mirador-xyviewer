/**
 * SelectionHighlightPlugin
 *
 * Adds visual feedback when an annotation is selected:
 * 1. Zoom/pan to center the selected annotation
 * 2. Animated pulse effect around the annotation
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import ReactDOM from 'react-dom';
import type { MiradorPlugin } from '../types/mirador';

/** Default point radius (matches annotationTransformer.ts) */
const DEFAULT_POINT_RADIUS = 12;

/** Animation duration in milliseconds */
const PULSE_DURATION = 2000;

/** Number of pulse rings */
const PULSE_RING_COUNT = 3;

/** Maximum display size for the highlight animation in pixels */
const MAX_HIGHLIGHT_SIZE = 100;

/** Minimum display size for the highlight animation in pixels */
const MIN_HIGHLIGHT_SIZE = 50;

/**
 * Mirador AnnotationItem structure (from AnnotationItem.js)
 * These are getters, not plain properties
 */
interface AnnotationResource {
  id: string;
  targetId: string;
  // These are getters that return computed values
  fragmentSelector?: [number, number, number, number] | null;
  svgSelector?: { value: string; type: string } | null;
}

/**
 * Mirador AnnotationPage structure (from AnnotationPage.js)
 */
interface AnnotationList {
  id: string;
  resources: AnnotationResource[];
}

// OpenSeadragon types
interface OSDPoint {
  x: number;
  y: number;
}

interface OSDRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OSDViewport {
  getZoom: (current?: boolean) => number;
  getMaxZoom: () => number;
  // OSD provides multiple coordinate conversion methods
  imageToViewportCoordinates: (point: OSDPoint | number, y?: number) => OSDPoint;
  viewportToViewerElementCoordinates: (point: OSDPoint) => OSDPoint;
  fitBounds: (rect: OSDRect, immediately?: boolean) => void;
  fitBoundsWithConstraints: (rect: OSDRect, immediately?: boolean) => void;
  getContainerSize: () => OSDPoint;
}

interface OSDViewer {
  viewport: OSDViewport;
  canvas?: HTMLElement;
  element?: HTMLElement;
  container?: HTMLElement;
  addHandler: (event: string, handler: () => void) => void;
  removeHandler: (event: string, handler: () => void) => void;
}

interface CanvasWorld {
  canvasIds: string[];
  contentResourceToWorldCoordinates: (resource: unknown) => [number, number, number, number];
}

interface TargetProps {
  windowId: string;
  annotations?: AnnotationList[];
  selectedAnnotationId?: string | null;
  viewer?: OSDViewer | null;
  canvasWorld?: CanvasWorld;
}

interface PluginWrapperProps {
  targetProps: TargetProps;
  TargetComponent: React.ComponentType<TargetProps>;
}

/**
 * Extract coordinates from an annotation resource
 * Returns [x, y, width, height] in canvas/image coordinates
 *
 * Note: fragmentSelector and svgSelector are getters in Mirador's AnnotationItem class
 */
function getAnnotationBounds(resource: AnnotationResource): [number, number, number, number] | null {
  // Try fragment selector first: [x, y, width, height]
  // The getter returns null if not present
  const fragment = resource.fragmentSelector;
  if (fragment && Array.isArray(fragment) && fragment.length === 4) {
    return fragment as [number, number, number, number];
  }

  // Try SVG selector: parse the SVG path to extract center point
  const svg = resource.svgSelector;
  if (svg && svg.value) {
    const svgString = svg.value;
    // Extract the M (move to) command which contains the center x,y
    // SVG path format: "M x y-radius A ..."
    const moveMatch = svgString.match(/M\s*([\d.]+)\s+([\d.]+)/);
    if (moveMatch) {
      const x = parseFloat(moveMatch[1]);
      // The y coordinate in the path is y-radius, so we need to add back the radius
      // to get the center point
      const yMinusRadius = parseFloat(moveMatch[2]);

      // Try to extract radius from the arc command
      const arcMatch = svgString.match(/A\s*([\d.]+)\s+([\d.]+)/);
      const radius = arcMatch ? parseFloat(arcMatch[1]) : DEFAULT_POINT_RADIUS;

      const y = yMinusRadius + radius;

      // Return bounds as [x, y, width, height] centered on the point
      const size = radius * 2;
      return [x - radius, y - radius, size, size];
    }
  }

  return null;
}

/**
 * Get center point of bounds
 */
function getBoundsCenter(bounds: [number, number, number, number]): { x: number; y: number } {
  const [x, y, w, h] = bounds;
  return { x: x + w / 2, y: y + h / 2 };
}

/**
 * Find annotation resource by ID across all annotation lists
 * In Mirador, annotations is an array of AnnotationPage objects,
 * each with a `resources` property containing AnnotationItem objects
 */
function findAnnotationResource(annotations: AnnotationList[], annotationId: string): AnnotationResource | null {
  if (!annotations || !Array.isArray(annotations)) {
    return null;
  }

  for (const list of annotations) {
    // list.resources contains AnnotationItem instances
    const resources = list.resources;
    if (!resources || !Array.isArray(resources)) {
      continue;
    }

    for (const resource of resources) {
      // resource.id is a getter in AnnotationItem
      if (resource.id === annotationId) {
        return resource;
      }
    }
  }
  return null;
}

/**
 * Pulse animation overlay component
 * Renders inside the OSD viewer container
 */
const PulseOverlay: React.FC<{
  bounds: [number, number, number, number];
  viewer: OSDViewer;
  onComplete: () => void;
}> = ({ bounds, viewer, onComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete();
    }, PULSE_DURATION);

    return () => clearTimeout(timer);
  }, [onComplete]);

  // Update position on viewport changes
  useEffect(() => {
    if (!containerRef.current || !viewer?.viewport) return;

    const updatePosition = () => {
      if (!containerRef.current || !viewer?.viewport) return;

      const center = getBoundsCenter(bounds);

      // Convert image coordinates to viewport coordinates, then to viewer element coordinates
      // This is the standard OSD coordinate conversion pipeline
      const viewportPoint = viewer.viewport.imageToViewportCoordinates(center.x, center.y);
      const viewerPoint = viewer.viewport.viewportToViewerElementCoordinates(viewportPoint);

      // Fixed display size - clamped between MIN and MAX to avoid huge highlights on large annotations
      const displaySize = Math.min(MAX_HIGHLIGHT_SIZE, Math.max(MIN_HIGHLIGHT_SIZE, 80));

      containerRef.current.style.left = `${viewerPoint.x - displaySize / 2}px`;
      containerRef.current.style.top = `${viewerPoint.y - displaySize / 2}px`;
      containerRef.current.style.width = `${displaySize}px`;
      containerRef.current.style.height = `${displaySize}px`;
    };

    updatePosition();

    // Listen for OSD viewport updates
    const handleUpdate = () => updatePosition();
    viewer.addHandler('update-viewport', handleUpdate);
    viewer.addHandler('animation', handleUpdate);

    // Initial position updates during animation
    const interval = setInterval(updatePosition, 16);
    const timeout = setTimeout(() => clearInterval(interval), PULSE_DURATION);

    return () => {
      viewer.removeHandler('update-viewport', handleUpdate);
      viewer.removeHandler('animation', handleUpdate);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [bounds, viewer]);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      {/* Multiple concentric pulse rings */}
      {Array.from({ length: PULSE_RING_COUNT }).map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            border: '3px solid #ff6b35',
            boxShadow: '0 0 10px rgba(255, 107, 53, 0.5)',
            transform: 'translate(-50%, -50%)',
            animation: `xyviewer-pulse-ring ${PULSE_DURATION / 1000}s ease-out ${i * 0.15}s forwards`,
            opacity: 0,
          }}
        />
      ))}
      {/* Center highlight */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '40%',
          height: '40%',
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 107, 53, 0.5)',
          boxShadow: '0 0 20px rgba(255, 107, 53, 0.7)',
          transform: 'translate(-50%, -50%)',
          animation: `xyviewer-pulse-center ${PULSE_DURATION / 1000}s ease-out forwards`,
        }}
      />
      {/* Inject CSS animation */}
      <style>{`
        @keyframes xyviewer-pulse-ring {
          0% {
            transform: translate(-50%, -50%) scale(0.3);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(2.5);
            opacity: 0;
          }
        }
        @keyframes xyviewer-pulse-center {
          0% {
            transform: translate(-50%, -50%) scale(0.8);
            opacity: 1;
          }
          30% {
            transform: translate(-50%, -50%) scale(1.3);
            opacity: 0.9;
          }
          100% {
            transform: translate(-50%, -50%) scale(0.5);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

/**
 * Main plugin component that wraps AnnotationsOverlay
 */
const SelectionHighlightPluginComponent: React.FC<PluginWrapperProps> = ({
  targetProps,
  TargetComponent,
}) => {
  const { annotations = [], selectedAnnotationId, viewer } = targetProps;

  const [pulseTarget, setPulseTarget] = useState<{
    bounds: [number, number, number, number];
    key: number;
  } | null>(null);

  const prevSelectedIdRef = useRef<string | null | undefined>(undefined);
  const pulseKeyRef = useRef(0);

  // Handle selection change - triggered when user clicks on annotation in the list
  useEffect(() => {
    // Only trigger on new selection (not deselection, and not same annotation)
    if (
      selectedAnnotationId &&
      selectedAnnotationId !== prevSelectedIdRef.current
    ) {
      const resource = findAnnotationResource(annotations, selectedAnnotationId);

      if (resource) {
        const bounds = getAnnotationBounds(resource);

        if (bounds) {
          // Trigger pulse animation
          pulseKeyRef.current += 1;
          setPulseTarget({ bounds, key: pulseKeyRef.current });
        }
      }
    }

    prevSelectedIdRef.current = selectedAnnotationId;
  }, [selectedAnnotationId, annotations]);

  const handlePulseComplete = useCallback(() => {
    setPulseTarget(null);
  }, []);

  // Render pulse overlay in the viewer's canvas container via portal
  const pulseOverlay = pulseTarget && viewer?.canvas ? ReactDOM.createPortal(
    <PulseOverlay
      key={pulseTarget.key}
      bounds={pulseTarget.bounds}
      viewer={viewer}
      onComplete={handlePulseComplete}
    />,
    viewer.canvas
  ) : null;

  return (
    <>
      <TargetComponent {...targetProps} />
      {pulseOverlay}
    </>
  );
};

/**
 * Plugin definition for Mirador
 * Wraps AnnotationsOverlay to intercept selection changes and add visual feedback
 */
export const selectionHighlightPlugin: MiradorPlugin = {
  target: 'AnnotationsOverlay',
  mode: 'wrap',
  name: 'SelectionHighlightPlugin',
  component: SelectionHighlightPluginComponent as unknown as React.ComponentType<{
    targetProps: Record<string, unknown>;
    TargetComponent: React.ComponentType<unknown>;
  }>,
};

export { SelectionHighlightPluginComponent as ConnectedSelectionHighlightPlugin };

export default selectionHighlightPlugin;
