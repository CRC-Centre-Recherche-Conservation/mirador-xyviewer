/**
 * PointMarkersOverlay
 *
 * Point annotations as DOM markers above the OpenSeadragon canvas (portaled into
 * `viewer.canvas`, placed like the zone badges). Mirador's canvas drawing of a point is a
 * 1 px circle a few screen pixels wide, so the markers replace it: sized in screen pixels,
 * with a hover/selected look. Decorative (aria-hidden): the cards and rows stay the
 * accessible surface.
 */

import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { markerSize, type MarkerState, type PointMarker, type PointMarkerConfig } from './pointMarkers';
import { useViewerPlacement } from './viewerPlacement';

/** Marker colours per state. */
export type MarkerColors = Record<MarkerState, string>;

const RING: Record<MarkerState, number> = { default: 2, hovered: 3, selected: 3 };
const Z: Record<MarkerState, number> = { default: 0, hovered: 2, selected: 1 };

const STYLE = `
.xyviewer-point-marker__dot{display:block;box-sizing:border-box;border-radius:50%;width:var(--xyviewer-d);height:var(--xyviewer-d);border-style:solid;border-color:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.65)}
@media (prefers-reduced-motion:no-preference){.xyviewer-point-marker__dot{transition:width .12s,height .12s,background-color .12s,border-width .12s}}
`;

/** Mouse and pointer events the marker keeps from OpenSeadragon (wheel is left alone so zoom works). */
const SWALLOWED = ['pointerdown', 'pointerup', 'pointermove', 'mousemove', 'click', 'dblclick'] as const;

interface MarkerDotProps {
  marker: PointMarker;
  color: string;
  title?: string;
  onHover: (id: string | null) => void;
  onToggle: (id: string) => void;
}

/** Native listeners: React would see these events only on the canvas, after OpenSeadragon has. */
const MarkerDot: React.FC<MarkerDotProps> = ({ marker, color, title, onHover, onToggle }) => {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ id: marker.id, onHover, onToggle });
  latest.current = { id: marker.id, onHover, onToggle };

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const stop = (e: Event) => e.stopPropagation();
    const enter = () => latest.current.onHover(latest.current.id);
    const leave = () => latest.current.onHover(null);
    const click = (e: Event) => {
      e.stopPropagation();
      latest.current.onToggle(latest.current.id);
    };
    for (const type of SWALLOWED) if (type !== 'click') el.addEventListener(type, stop);
    el.addEventListener('click', click);
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    return () => {
      for (const type of SWALLOWED) if (type !== 'click') el.removeEventListener(type, stop);
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
      style={{
        position: 'absolute',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        cursor: 'pointer',
        zIndex: Z[marker.state],
      }}
    >
      <span
        className="xyviewer-point-marker__dot"
        style={{ background: color, borderWidth: RING[marker.state] }}
      />
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wanted = markers.length > 0 && !!windowId;

  const viewer = useViewerPlacement(
    windowId,
    wanted,
    ({ pixelOf, pxPerCanvasPx }) => {
      const container = containerRef.current;
      if (!container) return;
      markers.forEach((m, i) => {
        const el = container.children[i] as HTMLElement | undefined;
        if (!el) return;
        const px = pixelOf(m.canvasId, m.point.x, m.point.y);
        el.style.display = px ? 'flex' : 'none';
        if (!px) return;
        const d = markerSize(m.point.r, pxPerCanvasPx(m.canvasId), config, m.state);
        const hit = Math.max(config.hitSize, d);
        el.style.left = `${px.x - hit / 2}px`;
        el.style.top = `${px.y - hit / 2}px`;
        el.style.width = `${hit}px`;
        el.style.height = `${hit}px`;
        el.style.setProperty('--xyviewer-d', `${d}px`);
      });
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
            key={m.id}
            marker={m}
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
