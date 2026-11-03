/**
 * Pure logic of the point markers: which annotations are points, which markers are shown,
 * their size, and the host configuration. A point is decided from selectors alone.
 */

import { isCssColour, parseXYWH, pointOf, POINT_SIZE_THRESHOLD, type PointShape } from '../utils/annotationSelectors';
import type { HiddenLookup, OverlayAnnotationList, OverlayResource } from './overlayChain';

export interface PointMarkerColors {
  default?: string;
  hovered?: string;
  selected?: string;
}

/** Host configuration (`config.scientificAnnotations.pointMarkers`), validated. */
export interface PointMarkerConfig {
  /** Smallest marker diameter in screen px. */
  minSize: number;
  /** Diameter of a hovered or selected marker. */
  hoverSize: number;
  /** Largest marker diameter at rest. */
  maxSize: number;
  /** Smallest pointer target. */
  hitSize: number;
  /** Markers drawn per window; hovered and selected ones always are. */
  maxMarkers: number;
  /** Override of `theme.palette.annotations.*.strokeStyle`. */
  colors: PointMarkerColors;
}

export const DEFAULT_POINT_MARKER_CONFIG: PointMarkerConfig = {
  minSize: 12,
  hoverSize: 18,
  maxSize: 48,
  hitSize: 20,
  maxMarkers: 2000,
  colors: {},
};

const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** Host value → usable configuration: numbers clamped, colours kept only when plain CSS colours. */
export function resolvePointMarkerConfig(raw: unknown): PointMarkerConfig {
  const d = DEFAULT_POINT_MARKER_CONFIG;
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const minSize = num(o.minSize, d.minSize, 4, 64);
  const colorsIn = (typeof o.colors === 'object' && o.colors !== null ? o.colors : {}) as Record<string, unknown>;
  const colors: PointMarkerColors = {};
  for (const key of ['default', 'hovered', 'selected'] as const) {
    if (isCssColour(colorsIn[key])) colors[key] = (colorsIn[key] as string).trim();
  }
  return {
    minSize,
    hoverSize: num(o.hoverSize, Math.max(d.hoverSize, minSize), minSize, 96),
    maxSize: num(o.maxSize, Math.max(d.maxSize, minSize), minSize, 128),
    hitSize: num(o.hitSize, d.hitSize, 8, 96),
    maxMarkers: Math.round(num(o.maxMarkers, d.maxMarkers, 1, 10_000)),
    colors,
  };
}

/** A point annotation found in Mirador's lists. */
export interface PointResource {
  id: string;
  /** Canvas the point is on. */
  canvasId: string;
  point: PointShape;
  /** The Mirador annotation item, for titles. */
  resource: OverlayResource;
}

/** Identity of a marker: ids may repeat across canvases. */
export const markerKey = (id: string, canvasId: string): string => `${canvasId}\n${id}`;

/** Point of a Mirador annotation item (`selector` is a list, or the target string). */
function pointOfResource(res: OverlayResource & { selector?: unknown }): PointShape | null {
  const sel = res.selector;
  if (typeof sel === 'string') {
    const c = parseXYWH(sel.split('#')[1] ?? '');
    return c && c.w <= POINT_SIZE_THRESHOLD && c.h <= POINT_SIZE_THRESHOLD
      ? pointOf({ type: 'FragmentSelector', value: `xywh=${c.x},${c.y},${c.w},${c.h}` })
      : null;
  }
  return Array.isArray(sel) ? pointOf(sel) : null;
}

/** A malformed selector is an area, not an error. */
function safePointOf(res: OverlayResource): PointShape | null {
  try {
    return pointOfResource(res);
  } catch {
    return null;
  }
}

/**
 * Splits Mirador's lists into the areas Mirador keeps drawing and the points drawn as markers.
 * A changed list is a prototype-linked copy (Mirador's list methods keep working); the input
 * array itself is returned as `areas` when it holds no point.
 */
export function splitPointResources<T extends OverlayAnnotationList>(
  lists: T[],
): { areas: T[]; points: PointResource[] } {
  const points: PointResource[] = [];
  if (!Array.isArray(lists)) return { areas: lists, points };
  const seen = new Set<string>();
  let changed = false;
  const areas = lists.map((list) => {
    const resources = list?.resources;
    if (!Array.isArray(resources)) return list;
    const kept = resources.filter((res) => {
      const id = res?.id;
      const point = typeof id === 'string' && res.targetId ? safePointOf(res) : null;
      if (!point) return true;
      // A repeated id on the same canvas is one marker.
      const key = markerKey(id as string, res.targetId as string);
      if (!seen.has(key)) {
        seen.add(key);
        points.push({ id: id as string, canvasId: res.targetId as string, point, resource: res });
      }
      return false;
    });
    if (kept.length === resources.length) return list;
    changed = true;
    return Object.create(list, { resources: { value: kept, enumerable: true } }) as T;
  });
  return { areas: changed ? areas : lists, points };
}

export type MarkerState = 'default' | 'hovered' | 'selected';

export interface PointMarker {
  id: string;
  canvasId: string;
  point: PointShape;
  state: MarkerState;
  resource: OverlayResource;
  /** Drawn transparent but still hit-tested, like Mirador's non-highlighted annotations. */
  invisible?: boolean;
}

export interface PointMarkersInput {
  points: PointResource[];
  /** Canvases shown by the window; empty means all. */
  visibleCanvasIds?: string[];
  /** Ids hidden by the metadata filter, per canvas. */
  hiddenFor?: HiddenLookup;
  hovered: string[];
  selected?: string | null;
  /** Mirador's `highlightAllAnnotations`: when false, resting markers are invisible hit areas. */
  highlightAll: boolean;
  /** Mirador's `drawAnnotations` (annotations panel open or forced): when false nothing is drawn. */
  drawAnnotations?: boolean;
  maxMarkers?: number;
}

/**
 * Markers to render: visible canvases, filter and highlight rules applied, selected one
 * first-class. Without `highlightAll` the resting ones are invisible hit areas, so canvas
 * hover reveals them as in Mirador.
 */
export function computePointMarkers(input: PointMarkersInput): PointMarker[] {
  const { points, hovered, selected, highlightAll } = input;
  if (input.drawAnnotations === false) return [];
  const visible = input.visibleCanvasIds?.length ? new Set(input.visibleCanvasIds) : undefined;
  const hoveredSet = new Set(hovered);
  const max = input.maxMarkers ?? DEFAULT_POINT_MARKER_CONFIG.maxMarkers;

  const active: PointMarker[] = [];
  const rest: PointMarker[] = [];
  const seen = new Set<string>();
  for (const p of points) {
    const key = markerKey(p.id, p.canvasId);
    if (seen.has(key)) continue;
    seen.add(key);
    if (visible && !visible.has(p.canvasId)) continue;
    const state: MarkerState = p.id === selected ? 'selected' : hoveredSet.has(p.id) ? 'hovered' : 'default';
    // A selected annotation stays visible whatever the filter says.
    if (state !== 'selected' && input.hiddenFor?.(p.canvasId)?.has(p.id)) continue;
    const marker: PointMarker = { id: p.id, canvasId: p.canvasId, point: p.point, state, resource: p.resource };
    if (state === 'default' && !highlightAll) marker.invisible = true;
    (state === 'default' ? rest : active).push(marker);
  }
  return active.concat(rest.slice(0, Math.max(0, max - active.length)));
}

/**
 * Marker diameter in screen px: the point's own size, kept between `minSize` and `maxSize`;
 * hovered and selected markers are never smaller than `hoverSize`.
 */
export function markerSize(
  r: number,
  pxPerCanvasPx: number | undefined,
  cfg: PointMarkerConfig,
  state: MarkerState = 'default',
): number {
  const own = pxPerCanvasPx && Number.isFinite(pxPerCanvasPx) ? 2 * r * pxPerCanvasPx : cfg.minSize;
  const size = Math.min(cfg.maxSize, Math.max(cfg.minSize, own));
  return state === 'default' ? size : Math.max(size, cfg.hoverSize);
}
