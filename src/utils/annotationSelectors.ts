/**
 * Display normalisation of target selectors (WADM §4.2 arrays, PointSelector,
 * SVG polygons, `pixel:` fragments). Version-blind: it runs on the normalized
 * model, so it knows nothing about v2/v3 wire formats. Shared by the fetch
 * postprocessor and the panel path; idempotent, never throws.
 */

/** Default radius for point markers in pixels */
export const DEFAULT_POINT_RADIUS = 12;

/** Threshold to consider an annotation as a point */
const POINT_SIZE_THRESHOLD = 5;

/** Same look as the circle markers, reused for rebuilt polygons */
const SHAPE_STYLE = 'stroke="#1a73e8" stroke-width="2"';
const FILL = 'fill="rgba(26, 115, 232, 0.3)"';

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
    value: `<svg xmlns="http://www.w3.org/2000/svg"><path d="M ${x} ${y - radius} A ${radius} ${radius} 0 1 1 ${x} ${y + radius} A ${radius} ${radius} 0 1 1 ${x} ${y - radius}" ${FILL} ${SHAPE_STYLE}/></svg>`,
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
const COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*[\d.%\s,]+\)|[a-z]+)$/i;

/** Producer colour when it is a plain colour token, else the plugin default. */
function colour(tag: string, name: string, fallback: string): string {
  const v = svgAttr(tag, name)?.trim();
  return v && COLOR.test(v) ? v : fallback;
}

/**
 * Rebuild `<polygon>`/`<polyline>` as a single `<path>` from parsed numbers only
 * (producer markup is never passed through). Returns the new value, null when
 * malformed, or undefined when the SVG must stay untouched (no polygon/polyline,
 * or other shapes alongside that a rebuild would lose).
 */
function rebuildPolygons(svg: string): string | null | undefined {
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

  // Look comes from the first shape's plain colour tokens (an outline-only
  // `fill="none"` stays outline-only); anything else gets the plugin default.
  const first = tags[0][0];
  const fill = colour(first, 'fill', closedOnly ? 'rgba(26, 115, 232, 0.3)' : 'none');
  const stroke = colour(first, 'stroke', '#1a73e8');
  const width = Number(svgAttr(first, 'stroke-width'));
  const strokeWidth = Number.isFinite(width) && width > 0 && width <= 100 ? width : 2;
  return `<svg xmlns="http://www.w3.org/2000/svg"><path d="${subpaths.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/></svg>`;
}

/** Selector list → display-ready list (a new array only when something changed). */
function normalizeSelectorList(list: unknown[], radius: number): { out: unknown[]; changed: boolean } {
  let changed = false;
  const out: unknown[] = [];

  for (const sel of list) {
    if (!isObject(sel)) {
      out.push(sel);
      continue;
    }
    if (sel.type === 'SvgSelector' && typeof sel.value === 'string') {
      const rebuilt = rebuildPolygons(sel.value);
      if (rebuilt === undefined) out.push(sel);
      else {
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
export function normalizeTargetSelector(annotation: Record<string, unknown>, radius: number = DEFAULT_POINT_RADIUS): void {
  const target = annotation.target;
  if (!isObject(target) || target.selector === undefined || target.selector === null) return;

  const list = Array.isArray(target.selector) ? target.selector : [target.selector];
  const { out, changed } = normalizeSelectorList(list, radius);
  if (!changed) return;

  // Replace the target (never mutate it): it may still be shared with Mirador's store.
  const { selector: _old, ...rest } = target;
  void _old;
  annotation.target =
    out.length === 0 ? rest : { ...rest, selector: out.length === 1 && !Array.isArray(target.selector) ? out[0] : out };
}
