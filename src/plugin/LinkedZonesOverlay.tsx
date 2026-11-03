/**
 * LinkedZonesOverlay
 *
 * Numbered badges on the canvas for the zones a classification links to, shown only at
 * navigation moments (canvasEmphasisStore). They sit beside the zone: top-right of a point
 * marker, outside the top-left corner of an area. The numbers are the row numbers of LinkedAnnotationList (both come from
 * buildLinkRows). Badges are positioned from the target selectors, never redraw the zones, and
 * are rendered into the OpenSeadragon canvas of the window: decorative (aria-hidden), the list
 * carries the information.
 */

import React, { useRef } from 'react';
import ReactDOM from 'react-dom';
import type { IIIFAnnotation } from '../types/iiif';
import { buildClassificationView, classificationKind } from '../utils/classificationModel';
import { baseAnnotationId, buildLinkRows, listedIdsByBase, type LinkIndex } from '../utils/linkIndex';
import { pointOf, type PointShape } from '../utils/annotationSelectors';
import { annotationBounds, type Box } from './viewportFraming';
import { DEFAULT_POINT_MARKER_CONFIG, markerSize, type PointMarkerConfig } from './pointMarkers';
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
  /** Set when the zone is a point annotation (drawn as a marker): the badge goes beside it. */
  point?: PointShape;
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
  /** What the panel emphasises; nothing is numbered without it. */
  emphasis?: { ownerId: string; rows: 'all' | readonly number[] };
  prefs: string[];
}

/**
 * Badges for the linked zones of the emphasised classification (see canvasEmphasisStore), all
 * rows or the listed ones. Only zones on a visible canvas are numbered; the numbers still follow
 * the full list (zones elsewhere keep a gap).
 */
export function computeZoneBadges(input: ZoneBadgeInput): ZoneBadge[] {
  const { canvasId, index, canvasAnnotationIds, annotationResources, hiddenIds, prefs, emphasis } = input;
  if (!canvasId || !emphasis) return [];
  const visible = new Set(input.visibleCanvasIds?.length ? input.visibleCanvasIds : [canvasId]);

  // After a cross-canvas move the owner is no longer on this canvas: the link index still has it.
  const owner = annotationResources[emphasis.ownerId] ?? index.entries.get(baseAnnotationId(emphasis.ownerId))?.resource;
  if (!owner || !classificationKind(owner.motivation)) return [];
  const view = buildClassificationView(owner, prefs);
  if (view.related.length === 0) return [];
  const rows = buildLinkRows(view.related, { index, canvasId, canvasAnnotationIds, prefs, hiddenIds });

  const listedHere = listedIdsByBase(canvasAnnotationIds);
  const badges: ZoneBadge[] = [];
  for (const row of rows) {
    if (emphasis.rows !== 'all' && !emphasis.rows.includes(row.n)) continue;
    if (row.hiddenByFilter || !row.annotationId) continue;
    if (row.kind !== 'here' && !(row.kind === 'other' && row.canvasId && visible.has(row.canvasId))) continue;
    const entry = index.entries.get(row.targetId);
    const zoneCanvas = row.kind === 'here' ? canvasId : row.canvasId!;
    const ids = row.kind === 'here' ? (listedHere.get(row.targetId) ?? [row.annotationId]) : entry?.ids ?? [row.annotationId];
    for (const zoneId of ids) {
      if (hiddenIds?.has(zoneId)) continue;
      const resource = (row.kind === 'here' ? annotationResources[zoneId] : undefined) ?? entry?.resources[zoneId] ?? entry?.resource;
      const box = annotationBounds(resource);
      if (!box) continue;
      const point = pointOfAnnotation(resource);
      badges.push({ n: row.n, annotationId: zoneId, canvasId: zoneCanvas, box, ...(point && { point }) });
    }
  }
  return badges;
}

/** Point of a normalized annotation's target (a marker, not an area), null for an area. */
function pointOfAnnotation(resource: IIIFAnnotation | undefined): PointShape | null {
  const target = resource?.target;
  if (!target) return null;
  if (typeof target === 'string') {
    const frag = target.split('#')[1];
    return frag ? pointOf({ type: 'FragmentSelector', value: frag }) : null;
  }
  try {
    return pointOf((target as { selector?: unknown }).selector);
  } catch {
    return null;
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
  /** Marker sizes, to clear a point marker; the defaults apply when the host sets none. */
  pointConfig?: PointMarkerConfig;
}

/** Gap between a marker and its badge. */
const MARKER_GAP = 2;

export const LinkedZonesOverlay: React.FC<LinkedZonesOverlayProps> = ({ windowId, badges, pointConfig = DEFAULT_POINT_MARKER_CONFIG }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wanted = badges.length > 0 && !!windowId;

  const viewer = useViewerPlacement(
    windowId,
    wanted,
    ({ pixelOf, pxPerCanvasPx }) => {
      const container = containerRef.current;
      if (!container) return;
      const children = container.children;
      badges.forEach((badge, i) => {
        const el = children[i] as HTMLElement | undefined;
        if (!el) return;
        const { point } = badge;
        const px = point ? pixelOf(badge.canvasId, point.x, point.y) : pixelOf(badge.canvasId, badge.box[0], badge.box[1]);
        el.style.display = px ? '' : 'none';
        if (!px) return;
        let dx = -BADGE_SIZE / 2;
        let dy = -BADGE_SIZE / 2;
        if (point) {
          // Marker radius in its largest (hovered) state; Mirador's own circle when no marker plugin.
          const scale = pxPerCanvasPx(badge.canvasId);
          const radius = Math.max(markerSize(point.r, scale, pointConfig, 'hovered'), scale ? Math.min(pointConfig.maxSize, 2 * point.r * scale) : 0) / 2;
          dx = dy = radius + BADGE_SIZE / 2 + MARKER_GAP;
          dy = -dy;
        }
        el.style.left = `${px.x + dx}px`;
        el.style.top = `${px.y + dy}px`;
      });
    },
    [badges, pointConfig],
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
