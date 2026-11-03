/**
 * LinkedZonesOverlay
 *
 * Numbered badges on the canvas for the zones a classification links to, shown while its card is
 * hovered or selected. The numbers are the row numbers of LinkedAnnotationList (both come from
 * buildLinkRows). Badges are positioned from the target selectors, never redraw the zones, and
 * are rendered into the OpenSeadragon canvas of the window: decorative (aria-hidden), the list
 * carries the information.
 */

import React, { useContext, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { ReactReduxContext } from 'react-redux';
import { OSDReferences, getCurrentCanvasWorld } from 'mirador';
import type { IIIFAnnotation } from '../types/iiif';
import { buildClassificationView, classificationKind } from '../utils/classificationModel';
import { baseAnnotationId, buildLinkRows, listedIdsByBase, type LinkIndex } from '../utils/linkIndex';
import { annotationBounds, type Box } from './viewportFraming';

/** Badge diameter in screen pixels (independent of the zoom). */
export const BADGE_SIZE = 22;

export interface ZoneBadge {
  /** Row number in the list. */
  n: number;
  /** Id of the zone as listed on its canvas (one badge per target of a multi-target annotation). */
  annotationId: string;
  canvasId: string;
  /** Zone bounds in canvas pixels. */
  box: Box;
}

export interface ZoneBadgeInput {
  canvasId?: string;
  /** Canvases shown by the window (two in book view). */
  visibleCanvasIds?: string[];
  index: LinkIndex;
  /** Ids listed on `canvasId`. */
  canvasAnnotationIds: string[];
  /** Normalized annotations of `canvasId`, by listed id. */
  annotationResources: Record<string, IIIFAnnotation>;
  /** Ids hidden by the metadata filter (their zone is not drawn). */
  hiddenIds?: Set<string>;
  hoveredIds: string[];
  selectedId?: string | null;
  prefs: string[];
}

/**
 * Badges for the linked zones of the hovered card, else of the selected one. Only zones on a
 * visible canvas are numbered; the numbers still follow the full list (zones elsewhere keep a gap).
 */
export function computeZoneBadges(input: ZoneBadgeInput): ZoneBadge[] {
  const { canvasId, index, canvasAnnotationIds, annotationResources, hiddenIds, prefs } = input;
  if (!canvasId) return [];
  const visible = new Set(input.visibleCanvasIds?.length ? input.visibleCanvasIds : [canvasId]);

  const rowsOf = (owner: IIIFAnnotation) => {
    const view = buildClassificationView(owner, prefs);
    if (view.related.length === 0) return undefined;
    return buildLinkRows(view.related, { index, canvasId, canvasAnnotationIds, prefs, hiddenIds });
  };
  const ownerOf = (id: string | null | undefined) => {
    const owner = id ? annotationResources[id] : undefined;
    return owner && classificationKind(owner.motivation) ? owner : undefined;
  };

  // Hovering a row of the selected card's list must not hand the numbering to that row's target.
  const selected = ownerOf(input.selectedId);
  const selectedRows = selected ? rowsOf(selected) : undefined;
  const listed = new Set((selectedRows ?? []).map((r) => r.targetId));
  const onlyListRows = input.hoveredIds.length > 0 && input.hoveredIds.every((h) => listed.has(baseAnnotationId(h)));
  const candidates = onlyListRows ? [input.selectedId] : [...input.hoveredIds, input.selectedId];

  for (const id of candidates) {
    const owner = ownerOf(id);
    if (!owner) continue;
    const rows = owner === selected ? selectedRows : rowsOf(owner);
    if (!rows) continue;

    const listedHere = listedIdsByBase(canvasAnnotationIds);
    const badges: ZoneBadge[] = [];
    for (const row of rows) {
      if (row.hiddenByFilter || !row.annotationId) continue;
      if (row.kind !== 'here' && !(row.kind === 'other' && row.canvasId && visible.has(row.canvasId))) continue;
      const entry = index.entries.get(row.targetId);
      const zoneCanvas = row.kind === 'here' ? canvasId : row.canvasId!;
      const ids = row.kind === 'here' ? (listedHere.get(row.targetId) ?? [row.annotationId]) : entry?.ids ?? [row.annotationId];
      for (const zoneId of ids) {
        if (hiddenIds?.has(zoneId)) continue;
        const resource = (row.kind === 'here' ? annotationResources[zoneId] : undefined) ?? entry?.resources[zoneId] ?? entry?.resource;
        const box = annotationBounds(resource);
        if (box) badges.push({ n: row.n, annotationId: zoneId, canvasId: zoneCanvas, box });
      }
    }
    return badges;
  }
  return [];
}

interface OSDPointLike {
  x: number;
  y: number;
}

interface OSDViewportLike {
  viewportToViewerElementCoordinates: (point: OSDPointLike) => OSDPointLike;
  getCenter?: (current?: boolean) => OSDPointLike;
  getFlip?: () => boolean;
  getContainerSize?: () => OSDPointLike;
}

interface OSDViewerLike {
  viewport?: OSDViewportLike;
  canvas?: HTMLElement;
  addHandler: (event: string, handler: () => void) => void;
  removeHandler: (event: string, handler: () => void) => void;
}

interface WorldLike {
  canvasIds?: string[];
  canvasToWorldCoordinates: (canvasId: string) => number[];
  canvasScale?: (canvasId: string) => number;
}

/** The window's OpenSeadragon viewer, when it exists (Mirador keeps it in a ref per window). */
function viewerOf(windowId: string): OSDViewerLike | undefined {
  try {
    const viewer = (OSDReferences.get(windowId) as { current?: OSDViewerLike } | undefined)?.current;
    return viewer?.canvas && viewer.viewport ? viewer : undefined;
  } catch {
    return undefined;
  }
}

/** Viewer element pixel of a world point; OpenSeadragon needs its own Point class. */
function toPixel(viewport: OSDViewportLike, x: number, y: number): OSDPointLike | undefined {
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

const STYLE = `
.xyviewer-zone-badge{position:absolute;box-sizing:border-box;width:${BADGE_SIZE}px;height:${BADGE_SIZE}px;margin:-${BADGE_SIZE / 2}px 0 0 -${BADGE_SIZE / 2}px;border-radius:50%;
background:#111;color:#fff;border:2px solid #fff;box-shadow:0 0 0 1px #000,0 1px 4px rgba(0,0,0,.6);
font:700 12px/${BADGE_SIZE - 4}px sans-serif;text-align:center;pointer-events:none;user-select:none}
@media (prefers-reduced-motion:no-preference){.xyviewer-zone-badge{animation:xyviewer-zone-badge-in .15s ease-out}}
@keyframes xyviewer-zone-badge-in{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
`;

export interface LinkedZonesOverlayProps {
  windowId?: string;
  badges: ZoneBadge[];
}

export const LinkedZonesOverlay: React.FC<LinkedZonesOverlayProps> = ({ windowId, badges }) => {
  const store = useContext(ReactReduxContext)?.store;
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<OSDViewerLike | undefined>(() => (windowId ? viewerOf(windowId) : undefined));
  const wanted = badges.length > 0 && !!windowId;

  // Mirador fills the viewer ref after render: re-read it (also when the viewer was replaced).
  useEffect(() => {
    if (!wanted || !windowId) return undefined;
    const current = viewerOf(windowId);
    if (current !== viewer) {
      setViewer(current);
      return undefined;
    }
    if (viewer) return undefined;
    const id = requestAnimationFrame(() => setViewer(viewerOf(windowId)));
    return () => cancelAnimationFrame(id);
  }, [wanted, windowId, viewer]);

  useEffect(() => {
    const container = containerRef.current;
    if (!wanted || !viewer?.viewport || !container || !windowId) return undefined;
    const place = () => {
      let world: WorldLike | undefined;
      try {
        world = getCurrentCanvasWorld(store?.getState(), { windowId }) as WorldLike | undefined;
      } catch {
        world = undefined;
      }
      const children = container.children;
      badges.forEach((badge, i) => {
        const el = children[i] as HTMLElement | undefined;
        if (!el) return;
        const origin = world?.canvasIds?.includes(badge.canvasId) ? world.canvasToWorldCoordinates(badge.canvasId) : undefined;
        const scale = world?.canvasScale?.(badge.canvasId) ?? 1;
        const px = origin && toPixel(viewer.viewport!, origin[0] + badge.box[0] * scale, origin[1] + badge.box[1] * scale);
        el.style.display = px ? '' : 'none';
        if (px) {
          el.style.left = `${px.x}px`;
          el.style.top = `${px.y}px`;
        }
      });
    };
    place();
    viewer.addHandler('update-viewport', place);
    viewer.addHandler('flip', place);
    viewer.addHandler('rotate', place);
    return () => {
      viewer.removeHandler('update-viewport', place);
      viewer.removeHandler('flip', place);
      viewer.removeHandler('rotate', place);
    };
  }, [viewer, badges, store, windowId, wanted]);

  if (!wanted || !viewer?.canvas) return null;
  return ReactDOM.createPortal(
    <>
    <style>{STYLE}</style>
    <div ref={containerRef} aria-hidden="true" data-xyviewer-zone-badges style={{ position: 'absolute', top: 0, left: 0, zIndex: 999, pointerEvents: 'none' }}>
      {badges.map((b) => (
        <div key={`${b.annotationId}`} className="xyviewer-zone-badge">
          {b.n}
        </div>
      ))}
    </div>
    </>,
    viewer.canvas,
  );
};

export default LinkedZonesOverlay;
