/**
 * SelectionHighlightPlugin
 *
 * Adds visual feedback when an annotation is selected: an animated pulse around
 * the selected region. The selection is resolved against both the canvas
 * annotation lists and Mirador's Content Search hit annotations, so clicking a
 * search result pulses its region too. (No zoom/pan is performed.)
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import ReactDOM from 'react-dom';
import type { MiradorPlugin } from '../types/mirador';
import { MAX_SVG_LENGTH, extractNumbers, parsePoint, parseXYWH, svgAttr } from '../utils/annotationSelectors';
import { containPlugin } from './containPlugin';

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
  svgSelector?: { value: string; type?: string } | null;
  /** Selector list (getter); read for selectors Mirador's other getters do not expose. */
  selector?: unknown;
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
  searchAnnotations?: AnnotationList[];
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
 * @internal Exposed for tests; not part of the public API.
 */
export function getAnnotationBounds(resource: AnnotationResource): [number, number, number, number] | null {
  // Fragment first: [x, y, width, height]. Mirador's getter yields NaN for `pixel:` /
  // `percent:` values, so pixel ones are re-read from the selector list.
  const fragment = resource.fragmentSelector;
  if (fragment && Array.isArray(fragment) && fragment.length === 4 && fragment.every(Number.isFinite)) {
    return fragment as [number, number, number, number];
  }
  const selectors = (Array.isArray(resource.selector) ? resource.selector : []) as Record<string, unknown>[];
  for (const s of selectors) {
    if (s?.type === 'FragmentSelector' && typeof s.value === 'string') {
      const c = parseXYWH(s.value);
      if (c) return [c.x, c.y, c.w, c.h];
    }
  }

  const svg = resource.svgSelector;
  if (svg && typeof svg.value === 'string') {
    const bounds = svgBounds(svg.value);
    if (bounds) return bounds;
  }

  // PointSelector not (yet) turned into a circle, e.g. an embedded page over the budget or injected without the manifest pass.
  for (const s of selectors) {
    const p = parsePoint(s);
    if (p) {
      const size = DEFAULT_POINT_RADIUS * 2;
      return [p.x - DEFAULT_POINT_RADIUS, p.y - DEFAULT_POINT_RADIUS, size, size];
    }
  }

  return null;
}

type Point = [number, number];

/** Bounding box [x, y, w, h] of points, or null when there are none (single pass: no spread limit). */
function boxOf(points: Point[]): [number, number, number, number] | null {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX - minX, maxY - minY];
}

/** Coordinate budget per SVG: beyond it the box is computed from what was read. */
const MAX_POINTS = 50_000;

/** Numbers per segment of each path command (arcs: only the end point is used). */
const PATH_ARITY: Record<string, number> = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7 };

/** Absolute points visited by a path `d` (curve control points included: a cheap superset). */
function pathPoints(d: string): Point[] {
  const points: Point[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  for (const m of d.matchAll(/([a-zA-Z])([^a-zA-Z]*)/g)) {
    if (points.length > MAX_POINTS) break;
    const rel = m[1] === m[1].toLowerCase();
    const cmd = m[1].toUpperCase();
    if (cmd === 'Z') {
      cx = sx;
      cy = sy;
      continue;
    }
    const arity = PATH_ARITY[cmd];
    if (!arity) continue;
    const nums = extractNumbers(m[2]);
    for (let i = 0; i + arity <= nums.length; i += arity) {
      const seg = nums.slice(i, i + arity);
      if (cmd === 'H' || cmd === 'V') {
        if (cmd === 'H') cx = rel ? cx + seg[0] : seg[0];
        else cy = rel ? cy + seg[0] : seg[0];
        points.push([cx, cy]);
      } else {
        const pairs = cmd === 'A' ? seg.slice(5) : seg;
        // Arcs bulge beyond their end points: widen by the radii (cheap superset).
        const [rx, ry] = cmd === 'A' ? [Math.abs(seg[0]), Math.abs(seg[1])] : [0, 0];
        for (let j = 0; j < pairs.length; j += 2) {
          const px = rel ? cx + pairs[j] : pairs[j];
          const py = rel ? cy + pairs[j + 1] : pairs[j + 1];
          if (j + 2 >= pairs.length) {
            cx = px;
            cy = py;
          }
          if (rx || ry) points.push([px - rx, py - ry], [px + rx, py + ry]);
          else points.push([px, py]);
        }
      }
      if (cmd === 'M' && i === 0) {
        sx = cx;
        sy = cy;
      }
    }
  }
  return points;
}

const N = String.raw`([-+]?(?:\d+(?:\.\d*)?|\.\d+))`;
const SEP = String.raw`[\s,]+`;
/** The plugin's own marker: `M x y A r r 0 1 1 x y+2r A r r 0 1 1 x y` (two equal arcs back to the start). */
const MARKER_PATH = new RegExp(
  String.raw`^\s*M\s*${N}${SEP}${N}\s*A\s*${N}${SEP}${N}\s+0\s+1\s+1\s+${N}${SEP}${N}\s*A\s*${N}${SEP}${N}\s+0\s+1\s+1\s+${N}${SEP}${N}\s*$`
);

const LONE_MOVE = new RegExp(String.raw`^\s*M\s*${N}${SEP}${N}\s*$`);

/** Circle marker [x, y, w, h] when `d` is exactly the plugin's marker path (or a lone `M x y`, read as a point). */
function markerBounds(d: string): [number, number, number, number] | null {
  const lone = d.length < 100 ? d.match(LONE_MOVE) : null;
  if (lone) return [Number(lone[1]) - DEFAULT_POINT_RADIUS, Number(lone[2]), DEFAULT_POINT_RADIUS * 2, DEFAULT_POINT_RADIUS * 2];
  const m = d.length < 300 ? d.match(MARKER_PATH) : null;
  if (!m) return null;
  const [x, y, rx, ry, x1, y1, rx2, ry2, x2, y2] = m.slice(1).map(Number);
  const r = rx;
  const same = ry === r && rx2 === r && ry2 === r && x1 === x && x2 === x && y2 === y && y1 === y + 2 * r;
  // The path starts at (x, y - r): add the radius back to get the centre.
  return same && r > 0 ? [x - r, y, r * 2, r * 2] : null;
}

/**
 * Bounds of an SVG selector value. The plugin's circle marker is read as a point;
 * any other path, polygon, polyline, circle, ellipse or rect gets the box of all
 * its (signed, decimal) coordinates.
 */
function svgBounds(svg: string): [number, number, number, number] | null {
  if (svg.length > MAX_SVG_LENGTH) return null;
  const attr = svgAttr;
  const num = (tag: string, name: string): number => parseFloat(attr(tag, name) ?? '') || 0;

  const shapes = [...svg.matchAll(/<(path|polygon|polyline|circle|ellipse|rect)\b[^<>]*>/gi)];
  if (shapes.length === 1 && shapes[0][1].toLowerCase() === 'path') {
    const marker = markerBounds(attr(shapes[0][0], 'd') ?? '');
    if (marker) return marker;
  }

  const points: Point[] = [];
  for (const m of shapes) {
    if (points.length > MAX_POINTS) break;
    const tag = m[0];
    // Shapes without their size attribute carry no geometry.
    const sizeAttr = { circle: 'r', ellipse: 'rx', rect: 'width' }[m[1].toLowerCase()];
    if (sizeAttr && attr(tag, sizeAttr) === undefined) continue;
    switch (m[1].toLowerCase()) {
      case 'path':
        points.push(...pathPoints(attr(tag, 'd') ?? ''));
        break;
      case 'polygon':
      case 'polyline': {
        const n = extractNumbers(attr(tag, 'points') ?? '');
        for (let i = 0; i + 1 < n.length; i += 2) points.push([n[i], n[i + 1]]);
        break;
      }
      case 'circle': {
        const [cx, cy, r] = [num(tag, 'cx'), num(tag, 'cy'), num(tag, 'r')];
        points.push([cx - r, cy - r], [cx + r, cy + r]);
        break;
      }
      case 'ellipse': {
        const [cx, cy, rx, ry] = [num(tag, 'cx'), num(tag, 'cy'), num(tag, 'rx'), num(tag, 'ry')];
        points.push([cx - rx, cy - ry], [cx + rx, cy + ry]);
        break;
      }
      default: {
        const [x, y] = [num(tag, 'x'), num(tag, 'y')];
        points.push([x, y], [x + num(tag, 'width'), y + num(tag, 'height')]);
      }
    }
  }
  return boxOf(points);
}

/**
 * Get center point of bounds
 * @internal Exposed for tests; not part of the public API.
 */
export function getBoundsCenter(bounds: [number, number, number, number]): { x: number; y: number } {
  const [x, y, w, h] = bounds;
  return { x: x + w / 2, y: y + h / 2 };
}

/**
 * Find annotation resource by ID across all annotation lists
 * In Mirador, annotations is an array of AnnotationPage objects,
 * each with a `resources` property containing AnnotationItem objects
 * @internal Exposed for tests; not part of the public API.
 */
export function findAnnotationResource(annotations: AnnotationList[], annotationId: string): AnnotationResource | null {
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
 * Resolve the selected annotation's resource, preferring the canvas annotation
 * lists and falling back to Mirador's Content Search hit annotations — so the
 * selection pulse also fires when a search result is clicked.
 * @internal Exposed for tests; not part of the public API.
 */
export function resolveSelectedResource(
  annotations: AnnotationList[],
  searchAnnotations: AnnotationList[],
  annotationId: string,
): AnnotationResource | null {
  return (
    findAnnotationResource(annotations, annotationId) ??
    findAnnotationResource(searchAnnotations, annotationId)
  );
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
  const { annotations = [], searchAnnotations = [], selectedAnnotationId, viewer } = targetProps;

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
      const resource = resolveSelectedResource(annotations, searchAnnotations, selectedAnnotationId);

      if (resource) {
        let bounds: ReturnType<typeof getAnnotationBounds> = null;
        try {
          bounds = getAnnotationBounds(resource);
        } catch {
          // A malformed selector must not take the viewer down.
        }

        if (bounds) {
          // Trigger pulse animation
          pulseKeyRef.current += 1;
          setPulseTarget({ bounds, key: pulseKeyRef.current });
        }
      }
    }

    prevSelectedIdRef.current = selectedAnnotationId;
  }, [selectedAnnotationId, annotations, searchAnnotations]);

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
export const selectionHighlightPlugin: MiradorPlugin = containPlugin({
  target: 'AnnotationsOverlay',
  mode: 'wrap',
  name: 'SelectionHighlightPlugin',
  component: SelectionHighlightPluginComponent as unknown as React.ComponentType<{
    targetProps: Record<string, unknown>;
    TargetComponent: React.ComponentType<unknown>;
  }>,
});

export { SelectionHighlightPluginComponent as ConnectedSelectionHighlightPlugin };

export default selectionHighlightPlugin;
