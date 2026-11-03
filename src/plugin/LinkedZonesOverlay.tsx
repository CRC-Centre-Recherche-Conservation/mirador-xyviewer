/**
 * LinkedZonesOverlay
 *
 * Numbered badges on the canvas for the zones a classification links to, shown while its card is
 * hovered or selected. The numbers are the row numbers of LinkedAnnotationList (both come from
 * buildLinkRows). Badges are positioned from the target selectors, never redraw the zones, and
 * are rendered into the OpenSeadragon canvas of the window: decorative (aria-hidden), the list
 * carries the information.
 */

import React, { useRef } from 'react';
import ReactDOM from 'react-dom';
import type { IIIFAnnotation } from '../types/iiif';
import { buildClassificationView, classificationKind } from '../utils/classificationModel';
import { baseAnnotationId, buildLinkRows, listedIdsByBase, type LinkIndex } from '../utils/linkIndex';
import { annotationBounds, type Box } from './viewportFraming';
import { useViewerPlacement } from './viewerPlacement';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const wanted = badges.length > 0 && !!windowId;

  const viewer = useViewerPlacement(
    windowId,
    wanted,
    ({ pixelOf }) => {
      const container = containerRef.current;
      if (!container) return;
      const children = container.children;
      badges.forEach((badge, i) => {
        const el = children[i] as HTMLElement | undefined;
        if (!el) return;
        const px = pixelOf(badge.canvasId, badge.box[0], badge.box[1]);
        el.style.display = px ? '' : 'none';
        if (px) {
          el.style.left = `${px.x}px`;
          el.style.top = `${px.y}px`;
        }
      });
    },
    [badges],
  );

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
