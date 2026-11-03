/**
 * Placement of DOM overlays on the window's OpenSeadragon canvas: finds the viewer, converts
 * canvas pixels to viewer element pixels and re-places on every viewport change.
 */

import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ReactReduxContext } from 'react-redux';
import { OSDReferences, getCurrentCanvasWorld } from 'mirador';

export interface OSDPointLike {
  x: number;
  y: number;
}

export interface OSDViewportLike {
  viewportToViewerElementCoordinates: (point: OSDPointLike) => OSDPointLike;
  getCenter?: (current?: boolean) => OSDPointLike;
  getFlip?: () => boolean;
  getContainerSize?: () => OSDPointLike;
  deltaPointsFromPixels?: (delta: OSDPointLike, current?: boolean) => OSDPointLike;
  panBy?: (delta: OSDPointLike, immediately?: boolean) => void;
  applyConstraints?: () => void;
}

export interface OSDViewerLike {
  viewport?: OSDViewportLike;
  canvas?: HTMLElement;
  addHandler: (event: string, handler: () => void) => void;
  removeHandler: (event: string, handler: () => void) => void;
}

export interface WorldLike {
  canvasIds?: string[];
  canvasToWorldCoordinates: (canvasId: string) => number[];
  /** Absent in older Mirador builds: treated as 1. */
  canvasScale?: (canvasId: string) => number;
}

/** The window's OpenSeadragon viewer, when it exists (Mirador keeps it in a ref per window). */
export function viewerOf(windowId: string): OSDViewerLike | undefined {
  try {
    const viewer = (OSDReferences.get(windowId) as { current?: OSDViewerLike } | undefined)?.current;
    return viewer?.canvas && viewer.viewport ? viewer : undefined;
  } catch {
    return undefined;
  }
}

/** Viewer element pixel of a world point; OpenSeadragon needs its own Point class. */
export function toPixel(viewport: OSDViewportLike, x: number, y: number): OSDPointLike | undefined {
  try {
    // OpenSeadragon needs its own Point (with rotate): clone the prototype of a real one.
    const center = viewport.getCenter?.(true);
    const point = center ? Object.assign(Object.create(Object.getPrototypeOf(center)), { x, y }) : { x, y };
    const p = viewport.viewportToViewerElementCoordinates(point);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return undefined;
    // OpenSeadragon rotates but does not mirror this conversion.
    const width = viewport.getFlip?.() ? viewport.getContainerSize?.().x : undefined;
    return width === undefined ? p : { x: width - p.x, y: p.y };
  } catch {
    return undefined;
  }
}

/** Pans the viewport as if the image were dragged by (dx, dy) screen pixels (OpenSeadragon's own drag-to-pan). */
export function panByPixels(viewport: OSDViewportLike, dx: number, dy: number): void {
  try {
    if (!viewport.deltaPointsFromPixels || !viewport.panBy) return;
    const flip = viewport.getFlip?.() ? -1 : 1;
    const center = viewport.getCenter?.(true);
    const delta = { x: -dx * flip, y: -dy };
    const point = center ? Object.assign(Object.create(Object.getPrototypeOf(center)), delta) : delta;
    viewport.panBy(viewport.deltaPointsFromPixels(point), true);
  } catch {
    // A viewer that cannot pan is left alone.
  }
}

/** Conversions handed to a `place` callback. */
export interface Placement {
  /** Viewer element pixel of a canvas pixel, undefined when the canvas is not in the world. */
  pixelOf: (canvasId: string, x: number, y: number) => OSDPointLike | undefined;
  /** Screen pixels per canvas pixel (zoom included), undefined when unknown. */
  pxPerCanvasPx: (canvasId: string) => number | undefined;
}

/**
 * The window's viewer (re-read after Mirador fills its ref) and a `place` callback run now,
 * and on update-viewport / flip / rotate, while `wanted`. `place` is re-run when `deps` change.
 */
export function useViewerPlacement(
  windowId: string | undefined,
  wanted: boolean,
  place: (placement: Placement) => void,
  deps: readonly unknown[],
): OSDViewerLike | undefined {
  const store = useContext(ReactReduxContext)?.store;
  const [viewer, setViewer] = useState<OSDViewerLike | undefined>(() => (windowId ? viewerOf(windowId) : undefined));
  const placeRef = useRef(place);
  placeRef.current = place;
  const active = wanted && !!windowId;

  // Mirador fills the viewer ref after render: re-read it (also when the viewer was replaced).
  useEffect(() => {
    if (!active || !windowId) return undefined;
    const current = viewerOf(windowId);
    if (current !== viewer) {
      setViewer(current);
      return undefined;
    }
    if (viewer) return undefined;
    const id = requestAnimationFrame(() => setViewer(viewerOf(windowId)));
    return () => cancelAnimationFrame(id);
  }, [active, windowId, viewer]);

  // Layout effect: the first placement lands before paint (no flash at the origin).
  useLayoutEffect(() => {
    if (!active || !viewer?.viewport || !windowId) return undefined;
    const viewport = viewer.viewport;
    const run = () => {
      let world: WorldLike | undefined;
      try {
        world = getCurrentCanvasWorld(store?.getState(), { windowId }) as WorldLike | undefined;
      } catch {
        world = undefined;
      }
      const scaleOf = (canvasId: string) => world?.canvasScale?.(canvasId) ?? 1;
      const pixelOf: Placement['pixelOf'] = (canvasId, x, y) => {
        const origin = world?.canvasIds?.includes(canvasId) ? world.canvasToWorldCoordinates(canvasId) : undefined;
        const scale = scaleOf(canvasId);
        return origin && toPixel(viewport, origin[0] + x * scale, origin[1] + y * scale);
      };
      const pxPerCanvasPx: Placement['pxPerCanvasPx'] = (canvasId) => {
        const a = pixelOf(canvasId, 0, 0);
        const b = pixelOf(canvasId, 1, 0);
        const d = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : NaN;
        return Number.isFinite(d) && d > 0 ? d : undefined;
      };
      placeRef.current({ pixelOf, pxPerCanvasPx });
    };
    run();
    viewer.addHandler('update-viewport', run);
    viewer.addHandler('flip', run);
    viewer.addHandler('rotate', run);
    return () => {
      viewer.removeHandler('update-viewport', run);
      viewer.removeHandler('flip', run);
      viewer.removeHandler('rotate', run);
    };
  }, [viewer, store, windowId, active, ...deps]);

  return viewer;
}
