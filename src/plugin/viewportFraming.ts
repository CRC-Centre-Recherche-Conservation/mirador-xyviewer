/**
 * Canvas-space geometry for linked annotations: zone bounds, union framing and the
 * "is it in view" test. Viewport units follow Mirador: the world is in canvas pixels and
 * zoom is 1 / visible world width (about 0.0005 for a 2000 px wide view).
 */

import type { IIIFAnnotation } from '../types/iiif';
import { parsePoint, parseXYWH, DEFAULT_POINT_RADIUS } from '../utils/annotationSelectors';
import { svgBounds } from './SelectionHighlightPlugin';

export type Box = [number, number, number, number];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Canvas bounds [x, y, w, h] of a normalized annotation's target, null when it has no region. */
export function annotationBounds(resource: IIIFAnnotation | undefined): Box | null {
  const target = resource?.target;
  if (!target) return null;
  if (typeof target === 'string') {
    const c = parseXYWH(target.split('#')[1] ?? '');
    return c ? [c.x, c.y, c.w, c.h] : null;
  }
  const raw = (target as { selector?: unknown }).selector;
  const selectors = ([raw ?? []].flat() as unknown[]).filter(isObject);
  for (const s of selectors) {
    if (s.type === 'SvgSelector' && typeof s.value === 'string') {
      const b = svgBounds(s.value);
      if (b) return b;
    }
  }
  for (const s of selectors) {
    if (s.type === 'FragmentSelector' && typeof s.value === 'string') {
      const c = parseXYWH(s.value);
      if (c) return [c.x, c.y, c.w, c.h];
    }
  }
  for (const s of selectors) {
    const p = parsePoint(s);
    if (p) return [p.x - DEFAULT_POINT_RADIUS, p.y - DEFAULT_POINT_RADIUS, DEFAULT_POINT_RADIUS * 2, DEFAULT_POINT_RADIUS * 2];
  }
  return null;
}

export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x1 = Math.min(...boxes.map((b) => b[0]));
  const y1 = Math.min(...boxes.map((b) => b[1]));
  const x2 = Math.max(...boxes.map((b) => b[0] + b[2]));
  const y2 = Math.max(...boxes.map((b) => b[1] + b[3]));
  return [x1, y1, x2 - x1, y2 - y1];
}

/** Where the canvas sits in Mirador's world (canvas pixels; non-zero in book view). */
export interface WorldOffset {
  x: number;
  y: number;
}

/** Mirador viewport: `x`/`y` is the view centre in world pixels, `zoom` is 1 / visible world width. */
export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

/** Viewport that shows `box` with `margin` (fraction of its size) on each side. */
export function frameBox(box: Box, offset: WorldOffset, aspect: number, margin = 0.1): ViewportState {
  const w = box[2] * (1 + 2 * margin);
  const h = box[3] * (1 + 2 * margin);
  const visibleWidth = Math.max(w, h * aspect);
  return {
    x: offset.x + box[0] + box[2] / 2,
    y: offset.y + box[1] + box[3] / 2,
    zoom: visibleWidth > 0 ? 1 / visibleWidth : 1,
  };
}

/** The viewport moved (zoom kept) to centre `box`, or null when `box` is already fully in view. */
export function panIfOutOfView(box: Box, offset: WorldOffset, view: ViewportState, aspect: number): ViewportState | null {
  if (!(view.zoom > 0) || !(aspect > 0)) return null;
  const halfW = 1 / view.zoom / 2;
  const halfH = halfW / aspect;
  const x1 = offset.x + box[0];
  const y1 = offset.y + box[1];
  const inside =
    x1 >= view.x - halfW && x1 + box[2] <= view.x + halfW && y1 >= view.y - halfH && y1 + box[3] <= view.y + halfH;
  if (inside) return null;
  return { x: x1 + box[2] / 2, y: y1 + box[3] / 2, zoom: view.zoom };
}
