/**
 * PointMarkersOverlay
 *
 * Point annotations as DOM markers above the OpenSeadragon canvas (portaled into
 * `viewer.canvas`). Mirador's canvas drawing of a point is a
 * 1 px circle a few screen pixels wide, so the markers replace it: sized in screen pixels,
 * as a tinted lens with a hover glow and a selected halo. Decorative (aria-hidden): the cards and rows stay the
 * accessible surface. A drag that starts on a marker pans the image; a press without movement
 * selects the marker only.
 */

import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { markerFootprint, markerKey, markerSize, type MarkerState, type PointMarker, type PointMarkerConfig } from './pointMarkers';
import { panByPixels, useViewerPlacement } from './viewerPlacement';

/** Marker colours per state. */
export type MarkerColors = Record<MarkerState, string>;

const Z: Record<MarkerState, number> = { default: 0, hovered: 2, selected: 1 };

/**
 * Lens look: translucent tint inside a thin stroke (colour = `--xyviewer-c`, inner diameter =
 * `--xyviewer-d`); hovered grows slightly with a soft glow, selected adds a halo. Browsers
 * without `color-mix` keep a visible untinted stroke with a plain shadow.
 */
const STYLE = `
[data-xyviewer-point-marker]{--xyviewer-sw:1.5px;--xyviewer-tint:18%}
[data-xyviewer-point-marker="hovered"],
[data-xyviewer-point-marker="selected"]{--xyviewer-sw:2px;--xyviewer-tint:22%}
.xyviewer-point-marker__dot{position:relative;display:block;box-sizing:content-box;border-radius:50%;
  width:var(--xyviewer-d);height:var(--xyviewer-d);
  border:var(--xyviewer-sw) solid var(--xyviewer-c);
  background:transparent;background-clip:padding-box;
  box-shadow:0 0 2px rgba(0,0,0,.5)}
[data-xyviewer-point-marker="hovered"] .xyviewer-point-marker__dot{
  box-shadow:0 0 6px 1px var(--xyviewer-c),0 0 2px 3px rgba(0,0,0,.25)}
[data-xyviewer-point-marker="selected"] .xyviewer-point-marker__dot{
  box-shadow:0 0 0 3px var(--xyviewer-c),0 0 2px 3px rgba(0,0,0,.3)}
@supports (background:color-mix(in srgb,red 10%,transparent)){
.xyviewer-point-marker__dot{
  background:color-mix(in srgb,var(--xyviewer-c) var(--xyviewer-tint),transparent);background-clip:padding-box}
[data-xyviewer-point-marker="hovered"] .xyviewer-point-marker__dot{
  box-shadow:0 0 0 3px color-mix(in srgb,var(--xyviewer-c) 28%,transparent),0 0 8px 1px color-mix(in srgb,var(--xyviewer-c) 70%,transparent),0 0 2px 3px rgba(0,0,0,.25)}
[data-xyviewer-point-marker="selected"] .xyviewer-point-marker__dot{
  box-shadow:0 0 0 3px color-mix(in srgb,var(--xyviewer-c) 45%,transparent),0 0 6px 3px color-mix(in srgb,var(--xyviewer-c) 55%,transparent),0 0 2px 3px rgba(0,0,0,.3)}
}
@media (prefers-reduced-motion:no-preference){.xyviewer-point-marker__dot{transition:width .15s,height .15s,border-color .15s,border-width .15s,background-color .15s,box-shadow .15s}}
`;

/** Movement (px) before a press on a marker becomes a pan instead of a click. */
const DRAG_THRESHOLD = 4;
/** Minimum delay (ms) between two re-assertions of the marker's hover. */
const REASSERT_MS = 50;

interface MarkerDotProps {
  marker: PointMarker;
  color: string;
  title?: string;
  /** Ids Mirador currently holds as hovered. */
  hoveredIds: string[];
  onHover: (id: string | null) => void;
  onToggle: (id: string) => void;
  /** Pans the image by a screen-pixel delta (a drag that started on the marker). */
  onPan: (dx: number, dy: number) => void;
  /** The drag ended: the viewport settles within its constraints. */
  onPanEnd: () => void;
}

/**
 * Native listeners: React would see these events only on the canvas, after OpenSeadragon has.
 * The pointer events stay on the marker, so it pans the image itself when dragged; a press
 * without movement is a click that selects the marker and nothing under it.
 */
const MarkerDot: React.FC<MarkerDotProps> = ({ marker, color, title, hoveredIds, onHover, onToggle, onPan, onPanEnd }) => {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ id: marker.id, hoveredIds, onHover, onToggle, onPan, onPanEnd });
  latest.current = { id: marker.id, hoveredIds, onHover, onToggle, onPan, onPanEnd };

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let drag: { pointerId: number; sx: number; sy: number; x: number; y: number; moved: boolean } | null = null;
    let dragged = false;
    let lastAssert = 0;
    const stop = (e: Event) => e.stopPropagation();
    const enter = () => latest.current.onHover(latest.current.id);
    const leave = () => latest.current.onHover(null);
    const down = (e: Event) => {
      e.stopPropagation();
      const m = e as PointerEvent;
      if (m.button !== undefined && m.button !== 0) return;
      dragged = false;
      drag = { pointerId: m.pointerId, sx: m.clientX, sy: m.clientY, x: m.clientX, y: m.clientY, moved: false };
      try {
        el.setPointerCapture?.(m.pointerId);
      } catch {
        // The pointer is gone already.
      }
    };
    const move = (e: Event) => {
      e.stopPropagation();
      const m = e as PointerEvent;
      // Mirador's debounced canvas hover may land after ours with a stale position: take the hover back.
      const now = Date.now();
      const { id, hoveredIds: held } = latest.current;
      if (now - lastAssert >= REASSERT_MS && !(held.length === 1 && held[0] === id)) {
        lastAssert = now;
        latest.current.onHover(id);
      }
      if (!drag || drag.pointerId !== m.pointerId) return;
      if (!drag.moved && Math.hypot(m.clientX - drag.sx, m.clientY - drag.sy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      latest.current.onPan(m.clientX - drag.x, m.clientY - drag.y);
      drag.x = m.clientX;
      drag.y = m.clientY;
    };
    const end = (e: Event) => {
      e.stopPropagation();
      if (!drag) return;
      dragged = drag.moved;
      drag = null;
      if (dragged) latest.current.onPanEnd();
    };
    const click = (e: Event) => {
      e.stopPropagation();
      // The click that ends a drag is not a selection.
      if (dragged) {
        dragged = false;
        return;
      }
      latest.current.onToggle(latest.current.id);
    };
    for (const type of ['mousemove', 'dblclick'] as const) el.addEventListener(type, stop);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('click', click);
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    return () => {
      for (const type of ['mousemove', 'dblclick'] as const) el.removeEventListener(type, stop);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      el.removeEventListener('click', click);
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
    };
  }, []);

  return (
    <div
      ref={ref}
      title={title}
      data-xyviewer-point-marker={marker.state}
      data-xyviewer-marker-key={markerKey(marker.id, marker.canvasId)}
      style={{
        position: 'absolute',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        cursor: 'pointer',
        touchAction: 'none',
        zIndex: Z[marker.state],
        ['--xyviewer-c' as string]: color,
      }}
    >
      <span className="xyviewer-point-marker__dot" style={{ opacity: marker.invisible ? 0 : 1 }} />
    </div>
  );
};

export interface PointMarkersOverlayProps {
  windowId?: string;
  markers: PointMarker[];
  config: PointMarkerConfig;
  colors: MarkerColors;
  /** Hover title of an annotation (shown while hovered). */
  titleOf?: (marker: PointMarker) => string;
  hoverAnnotation: (windowId: string, ids: string[]) => void;
  selectAnnotation: (windowId: string, id: string) => void;
  deselectAnnotation: (windowId: string, id: string) => void;
  selectedAnnotationId?: string | null;
  /** Ids Mirador holds as hovered (a stale canvas hover is overridden while the pointer is on a marker). */
  hoveredAnnotationIds?: string[];
}

export const PointMarkersOverlay: React.FC<PointMarkersOverlayProps> = ({
  windowId,
  markers,
  config,
  colors,
  titleOf,
  hoverAnnotation,
  selectAnnotation,
  deselectAnnotation,
  selectedAnnotationId,
  hoveredAnnotationIds = [],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wanted = markers.length > 0 && !!windowId;

  const viewer = useViewerPlacement(
    windowId,
    wanted,
    ({ pixelOf, pxPerCanvasPx }) => {
      const container = containerRef.current;
      if (!container) return;
      const byKey = new Map(markers.map((m) => [markerKey(m.id, m.canvasId), m]));
      for (const child of Array.from(container.children)) {
        const el = child as HTMLElement;
        const m = byKey.get(el.dataset.xyviewerMarkerKey ?? '');
        if (!m) continue;
        const px = pixelOf(m.canvasId, m.point.x, m.point.y);
        el.style.display = px ? 'flex' : 'none';
        if (!px) continue;
        const d = markerSize(m.point.r, pxPerCanvasPx(m.canvasId), config, m.state);
        const hit = Math.max(config.hitSize, markerFootprint(d, m.state));
        el.style.left = `${px.x - hit / 2}px`;
        el.style.top = `${px.y - hit / 2}px`;
        el.style.width = `${hit}px`;
        el.style.height = `${hit}px`;
        el.style.setProperty('--xyviewer-d', `${d}px`);
      }
    },
    [markers, config],
  );

  if (!wanted || !viewer?.canvas || !windowId) return null;
  return ReactDOM.createPortal(
    <>
      <style>{STYLE}</style>
      <div
        ref={containerRef}
        aria-hidden="true"
        data-xyviewer-point-markers
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 998, pointerEvents: 'none' }}
      >
        {markers.map((m) => (
          <MarkerDot
            key={markerKey(m.id, m.canvasId)}
            marker={m}
            hoveredIds={hoveredAnnotationIds}
            onPan={(dx, dy) => viewer.viewport && panByPixels(viewer.viewport, dx, dy)}
            onPanEnd={() => viewer.viewport?.applyConstraints?.()}
            color={colors[m.state]}
            title={m.state === 'hovered' ? titleOf?.(m) || undefined : undefined}
            onHover={(id) => hoverAnnotation(windowId, id ? [id] : [])}
            onToggle={(id) => (id === selectedAnnotationId ? deselectAnnotation(windowId, id) : selectAnnotation(windowId, id))}
          />
        ))}
      </div>
    </>,
    viewer.canvas,
  );
};

export default PointMarkersOverlay;
