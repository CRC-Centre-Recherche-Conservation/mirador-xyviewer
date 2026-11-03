/**
 * Display normalisation of target selectors (WADM §4.2 arrays, PointSelector,
 * SVG polygons, `pixel:` fragments). Version-blind: it runs on the normalized
 * model, so it knows nothing about v2/v3 wire formats. Shared by the fetch
 * postprocessor and the panel path; idempotent, never throws.
 */

/** Default radius for point markers in pixels */
export const DEFAULT_POINT_RADIUS = 12;

/** Threshold to consider an annotation as a point */
export const POINT_SIZE_THRESHOLD = 5;

/** Default colours of the plugin's shapes (circle markers and rebuilt polygons) */
const DEFAULT_STROKE = '#1a73e8';
const DEFAULT_STROKE_WIDTH = 2;

/** Display style of closed areas; areas are stroke-only unless the producer styled them. */
export interface AreaStyle {
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
}

type Selector = Record<string, unknown>;

const isObject = (v: unknown): v is Selector => typeof v === 'object' && v !== null && !Array.isArray(v);

const NUMBER = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g;

/** All numbers in a string, in order. */
export function extractNumbers(s: string): number[] {
  return (s.match(NUMBER) ?? []).map(Number).filter(Number.isFinite);
}

/**
 * Pixel region of a media-fragment value (`xywh=x,y,w,h`, optionally `pixel:`
 * prefixed, optionally combined with other parts such as `&t=`). `percent:`
 * cannot be resolved without the canvas size, so it yields null.
 */
export function parseXYWH(value: string): { x: number; y: number; w: number; h: number } | null {
  if (typeof value !== 'string') return null;
  const part = value.replace(/^#/, '').split('&').find((p) => p.startsWith('xywh='));
  if (!part) return null;
  const nums = part.slice(5).replace(/^pixel:/, '').split(',');
  if (nums.length !== 4 || !nums.every((n) => /^\d+(\.\d+)?$/.test(n))) return null;
  const [x, y, w, h] = nums.map(Number);
  return { x, y, w, h };
}

/** Circle marker as the plugin's own path form (also what bounds parsing expects). */
export function createCircleSvgSelector(x: number, y: number, radius: number = DEFAULT_POINT_RADIUS): Selector {
  return {
    type: 'SvgSelector',
    value: `<svg xmlns="http://www.w3.org/2000/svg"><path d="M ${x} ${y - radius} A ${radius} ${radius} 0 1 1 ${x} ${y + radius} A ${radius} ${radius} 0 1 1 ${x} ${y - radius}" fill="rgba(26, 115, 232, 0.3)" stroke="${DEFAULT_STROKE}" stroke-width="${DEFAULT_STROKE_WIDTH}"/></svg>`,
  };
}

/** PointSelector coordinates (numbers or numeric strings), else null. */
export function parsePoint(selector: unknown): { x: number; y: number } | null {
  if (!isObject(selector) || selector.type !== 'PointSelector') return null;
  const x = typeof selector.x === 'string' && selector.x.trim() ? Number(selector.x) : selector.x;
  const y = typeof selector.y === 'string' && selector.y.trim() ? Number(selector.y) : selector.y;
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)
    ? { x, y }
    : null;
}

/** Longest SvgSelector value we parse; larger ones are treated as malformed. */
export const MAX_SVG_LENGTH = 256_000;

/** Value of a quoted attribute in one tag's text (anchored on whitespace, so `width` never hits `stroke-width`). */
export function svgAttr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(String.raw`\s${name}\s*=\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? (m[1] ?? m[2]) : undefined;
}

const POLY_TAG = /<(polygon|polyline)\b[^<>]*>/gi;
const ANY_SHAPE = /<(?:path|circle|ellipse|rect|line|polygon|polyline)\b/gi;
const N = String.raw`([-+]?(?:\d+(?:\.\d*)?|\.\d+))`;
const SEP = String.raw`[\s,]+`;
/** The plugin's own marker: `M x y A r r 0 1 1 x y+2r A r r 0 1 1 x y` (two equal arcs back to the start). */
const MARKER_PATH = new RegExp(
  String.raw`^\s*M\s*${N}${SEP}${N}\s*A\s*${N}${SEP}${N}\s+0\s+1\s+1\s+${N}${SEP}${N}\s*A\s*${N}${SEP}${N}\s+0\s+1\s+1\s+${N}${SEP}${N}\s*$`
);

const LONE_MOVE = new RegExp(String.raw`^\s*M\s*${N}${SEP}${N}\s*$`);

/** Circle marker [x, y, w, h] when `d` is exactly the plugin's marker path (or a lone `M x y`, read as a point). */
export function markerBounds(d: string): [number, number, number, number] | null {
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

/** A point read from selectors: centre and radius in canvas pixels. */
export interface PointShape {
  x: number;
  y: number;
  r: number;
}

/** Point described by one SVG value: the plugin's marker path, a lone `M x y`, or a single circle. */
function svgPoint(svg: string): (PointShape & { styled: boolean; circle: boolean }) | null {
  if (svg.length > MAX_SVG_LENGTH || svg.includes('<!') || /transform\s*=/i.test(svg)) return null;
  const shapes = [...svg.matchAll(ANY_SHAPE)];
  if (shapes.length !== 1) return null;
  const tag = svg.slice(shapes[0].index).match(/^<[^<>]*>/)?.[0] ?? '';
  const styled = ['fill', 'stroke', 'style', 'class'].some((a) => svgAttr(tag, a) !== undefined);
  if (shapes[0][0].toLowerCase() === '<path') {
    const box = markerBounds(svgAttr(tag, 'd') ?? '');
    return box ? { x: box[0] + box[2] / 2, y: box[1] + box[3] / 2, r: box[2] / 2, styled, circle: false } : null;
  }
  if (shapes[0][0].toLowerCase() !== '<circle') return null;
  const [x, y, r] = ['cx', 'cy', 'r'].map((n) => Number(svgAttr(tag, n)));
  const ok = [x, y, r].every(Number.isFinite) && svgAttr(tag, 'r')?.trim() !== '' && r > 0;
  return ok ? { x, y, r, styled, circle: true } : null;
}

const asList = (selectors: unknown): Selector[] => ([selectors ?? []].flat() as unknown[]).filter(isObject);

/**
 * Point described by a target's selectors, else null. Decided from the selectors alone: a
 * PointSelector, a tiny `xywh`, the plugin's marker path, a lone `M x y` or an unstyled
 * single circle. An SvgSelector decides on its own (a polygon next to a PointSelector is an area).
 */
export function pointOf(selectors: unknown): PointShape | null {
  const list = asList(selectors);
  const svg = list.find((s) => s.type === 'SvgSelector');
  if (svg) {
    const p = typeof svg.value === 'string' ? svgPoint(svg.value) : null;
    // Only a plain circle or the marker path: a styled circle is an area the producer drew.
    return p && !(p.circle && p.styled) ? { x: p.x, y: p.y, r: p.r } : null;
  }
  for (const s of list) {
    const p = parsePoint(s);
    if (p) return { ...p, r: DEFAULT_POINT_RADIUS };
  }
  for (const s of list) {
    if (s.type !== 'FragmentSelector' || typeof s.value !== 'string') continue;
    const c = parseXYWH(s.value);
    if (c && c.w <= POINT_SIZE_THRESHOLD && c.h <= POINT_SIZE_THRESHOLD) {
      return { x: c.x + c.w / 2, y: c.y + c.h / 2, r: DEFAULT_POINT_RADIUS };
    }
  }
  return null;
}

const COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\(\s*[\d.%\s,/a-z-]+\)|[a-z]+)$/i;

/** True for a plain CSS colour token (hex, rgb(a), hsl(a), keyword): nothing that could carry `url(`, `;` or `{`. */
export function isCssColour(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && COLOR.test(value.trim()) && !/url|var|expression/i.test(value);
}

/** Producer colour when it is a plain colour token, else the plugin default. */
function colour(tag: string, name: string, fallback: string): string {
  const v = svgAttr(tag, name)?.trim();
  return v && isCssColour(v) ? v : fallback;
}

/** Valid parts of a host area style (colour tokens, width in (0, 100]); anything else is dropped. */
export function sanitizeAreaStyle(style: unknown): AreaStyle {
  if (!isObject(style)) return {};
  const out: AreaStyle = {};
  if (isCssColour(style.stroke)) out.stroke = style.stroke.trim();
  if (isCssColour(style.fill)) out.fill = style.fill.trim();
  const w = style.strokeWidth;
  if (typeof w === 'number' && Number.isFinite(w) && w > 0 && w <= 100) out.strokeWidth = w;
  return out;
}

/** Display options of the selector pass. */
export interface SelectorDisplayOptions {
  /** Radius of circles made from points. */
  pointRadius?: number;
  /** Look of closed areas without producer colours. */
  areaStyle?: AreaStyle;
}

/**
 * Rebuild `<polygon>`/`<polyline>` as a single `<path>` from parsed numbers only
 * (producer markup is never passed through). Returns the new value, null when
 * malformed, or undefined when the SVG must stay untouched (no polygon/polyline,
 * or other shapes alongside that a rebuild would lose).
 */
function rebuildPolygons(svg: string, area: AreaStyle = {}): string | null | undefined {
  // Comments, CDATA and declarations (`<!`) can hide or fake shapes: leave such SVGs untouched.
  if (svg.includes('<!')) return undefined;
  const tags = [...svg.matchAll(POLY_TAG)];
  if (tags.length === 0) return undefined;
  if (svg.length > MAX_SVG_LENGTH) return null;
  if ((svg.match(ANY_SHAPE) ?? []).length !== tags.length) return undefined;

  const subpaths: string[] = [];
  let closedOnly = true;
  for (const m of tags) {
    const closed = m[1].toLowerCase() === 'polygon';
    const raw = svgAttr(m[0], 'points');
    if (raw === undefined || !/^[\s,0-9eE+\-.]*$/.test(raw)) return null;
    const nums = extractNumbers(raw);
    if (nums.length % 2 !== 0 || nums.length < (closed ? 6 : 4)) return null;
    let d = `M ${nums[0]} ${nums[1]}`;
    for (let i = 2; i < nums.length; i += 2) d += ` L ${nums[i]} ${nums[i + 1]}`;
    subpaths.push(closed ? `${d} Z` : d);
    closedOnly &&= closed;
  }

  // Look comes from the first shape's plain colour tokens; anything else gets the
  // plugin default (stroke only, so areas never hide the points under them).
  const first = tags[0][0];
  const fill = colour(first, 'fill', closedOnly ? (area.fill ?? 'none') : 'none');
  const stroke = colour(first, 'stroke', area.stroke ?? DEFAULT_STROKE);
  const width = Number(svgAttr(first, 'stroke-width'));
  const strokeWidth = Number.isFinite(width) && width > 0 && width <= 100 ? width : (area.strokeWidth ?? DEFAULT_STROKE_WIDTH);
  return `<svg xmlns="http://www.w3.org/2000/svg"><path d="${subpaths.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/></svg>`;
}

/** Selector list → display-ready list (a new array only when something changed). */
function normalizeSelectorList(list: unknown[], radius: number, area?: AreaStyle): { out: unknown[]; changed: boolean } {
  let changed = false;
  const out: unknown[] = [];

  for (const sel of list) {
    if (!isObject(sel)) {
      out.push(sel);
      continue;
    }
    if (sel.type === 'SvgSelector' && typeof sel.value === 'string') {
      const rebuilt = rebuildPolygons(sel.value, area);
      if (rebuilt === undefined) {
        // Unstyled producer circle / marker path: Mirador would stroke it black at 1 px.
        const p = svgPoint(sel.value);
        if (p && !p.styled) {
          out.push(createCircleSvgSelector(p.x, p.y, p.r));
          changed = true;
        } else out.push(sel);
      } else {
        changed = true;
        if (rebuilt !== null) out.push({ ...sel, value: rebuilt });
      }
      continue;
    }
    if (sel.type === 'FragmentSelector' && typeof sel.value === 'string') {
      const canonical = sel.value.replace(/(^|[#&])xywh=pixel:/, '$1xywh=');
      if (canonical !== sel.value) {
        changed = true;
        out.push({ ...sel, value: canonical });
        continue;
      }
    }
    out.push(sel);
  }

  const hasSvg = out.some((s) => isObject(s) && s.type === 'SvgSelector');
  if (!hasSvg) {
    const point = out.map(parsePoint).find((p) => p !== null);
    if (point) {
      out.push(createCircleSvgSelector(point.x, point.y, radius));
      changed = true;
    } else {
      // A tiny xywh stands for a point: replace it with a circle, or append the circle
      // when the value carries other parts (`&t=`) that must survive.
      for (const [i, s] of out.entries()) {
        if (!isObject(s) || s.type !== 'FragmentSelector' || typeof s.value !== 'string') continue;
        const c = parseXYWH(s.value);
        if (c && c.w <= POINT_SIZE_THRESHOLD && c.h <= POINT_SIZE_THRESHOLD) {
          const circle = createCircleSvgSelector(c.x + c.w / 2, c.y + c.h / 2, radius);
          if (/^#?xywh=[^&]*$/.test(s.value)) out[i] = circle;
          else out.push(circle);
          changed = true;
          break;
        }
      }
    }
  }
  return { out, changed };
}

/**
 * Normalize the target selector(s) of one annotation for display (replaces the
 * annotation's target, only when something changes). A single selector stays an
 * object, several stay an array.
 */
export function normalizeTargetSelector(
  annotation: Record<string, unknown>,
  options: number | SelectorDisplayOptions = DEFAULT_POINT_RADIUS,
): void {
  const opts: SelectorDisplayOptions = typeof options === 'number' ? { pointRadius: options } : options;
  const radius = opts.pointRadius ?? DEFAULT_POINT_RADIUS;
  const target = annotation.target;
  if (!isObject(target) || target.selector === undefined || target.selector === null) return;

  const list = Array.isArray(target.selector) ? target.selector : [target.selector];
  const { out, changed } = normalizeSelectorList(list, radius, opts.areaStyle);
  if (!changed) return;

  // Replace the target (never mutate it): it may still be shared with Mirador's store.
  const { selector: _old, ...rest } = target;
  void _old;
  annotation.target =
    out.length === 0 ? rest : { ...rest, selector: out.length === 1 && !Array.isArray(target.selector) ? out[0] : out };
}
