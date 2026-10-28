/**
 * IIIF Content State 1.0: input parsing and target extraction.
 *
 * Pure, synchronous and never throwing: malformed input yields `invalid` inputs
 * or warnings, never an exception. Nothing here touches the DOM or injects HTML;
 * SVG selectors are scanned as text. Network access (following URIs) lives in
 * `services/contentStateResolver`.
 */

import { isValidUrl } from './security';

/** Maximum size of a content state (encoded or not), in characters. */
export const CONTENT_STATE_MAX_BYTES = 1_000_000;

/** Maximum number of targets kept from one content state. */
export const CONTENT_STATE_MAX_TARGETS = 20;

/** Maximum nesting followed inside one JSON document. */
const MAX_NODE_DEPTH = 6;

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/** A region of a canvas: canvas pixels, or percentages (0-100) of the canvas. */
export interface ContentStateRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  unit: 'pixel' | 'percent';
}

/** One thing to show: a manifest (or collection), optionally at a canvas and region. */
export interface ContentStateTarget {
  manifestId?: string;
  collectionId?: string;
  canvasId?: string;
  rangeId?: string;
  region?: ContentStateRegion;
  /** Set when the content state itself was a manifest document with embedded canvases. */
  manifestJson?: Record<string, unknown>;
}

/** A target that still needs its URI dereferenced to be understood. */
export interface ContentStateDraft extends ContentStateTarget {
  followId?: string;
}

/** What the user supplied, classified. */
export type ContentStateInput =
  | { kind: 'uri'; uri: string }
  | { kind: 'json'; json: unknown }
  | { kind: 'invalid'; reason: string };

/** Fully resolved content state. */
export interface ContentStateResult {
  targets: ContentStateTarget[];
  warnings: string[];
}

/** Options for {@link parseContentStateInput}. */
export interface ParseContentStateOptions {
  /** Accept content-state-encoded text (base64url). Default true. */
  allowEncoded?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Encoding (spec §6)                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Decode a content-state-encoded string (base64url without padding of
 * `encodeURIComponent(json)`). Tolerates padding, standard base64 alphabet and
 * legacy base64 of raw UTF-8 JSON. Returns the JSON text, or `null`.
 */
export function decodeContentState(encoded: string): string | null {
  if (typeof encoded !== 'string' || !encoded || encoded.length > CONTENT_STATE_MAX_BYTES) return null;
  // A query string turns '+' into ' '; restore it before dropping line breaks.
  let b64 = encoded.replace(/ /g, '+').replace(/[\r\n\t]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  // Strip padding without a regex (a long '=' run would be quadratic).
  let end = b64.length;
  while (end > 0 && b64[end - 1] === '=') end--;
  if (b64.length - end > 2) return null;
  b64 = b64.slice(0, end);
  if (!/^[A-Za-z0-9+/]+$/.test(b64)) return null;
  while (b64.length % 4) b64 += '=';

  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    return null;
  }

  const candidates: Array<() => string> = [];
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7f]*$/.test(bin)) {
    candidates.push(() => decodeURIComponent(bin), () => bin);
  } else {
    // Non-ASCII bytes: legacy base64 of raw UTF-8 JSON.
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    candidates.push(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  }

  for (const attempt of candidates) {
    try {
      const text = attempt();
      JSON.parse(text);
      return text;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Encode a content state for the `iiif-content` parameter (spec §6). */
export function encodeContentState(json: unknown): string {
  const bytes = new TextEncoder().encode(encodeURIComponent(JSON.stringify(json)));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* -------------------------------------------------------------------------- */
/* Input classification (spec §3)                                              */
/* -------------------------------------------------------------------------- */

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function parseJsonText(text: string): ContentStateInput {
  try {
    const json: unknown = JSON.parse(text);
    if (json && typeof json === 'object') return { kind: 'json', json };
  } catch {
    /* fall through */
  }
  return { kind: 'invalid', reason: 'The text is not valid JSON.' };
}

/**
 * Classify text from a query parameter, paste, drop or file:
 * unencoded JSON, an http(s) URI to fetch, or content-state-encoded text.
 * A link carrying an `iiif-content` parameter is unwrapped.
 */
export function parseContentStateInput(text: string, options: ParseContentStateOptions = {}): ContentStateInput {
  return classify(text, options.allowEncoded ?? true, 0);
}

/** Maximum `iiif-content` links unwrapped one inside another. */
const MAX_UNWRAP_DEPTH = 2;

function classify(text: string, allowEncoded: boolean, unwrapDepth: number): ContentStateInput {
  if (typeof text !== 'string') return { kind: 'invalid', reason: 'No content state provided.' };
  const trimmed = text.trim();
  if (!trimmed) return { kind: 'invalid', reason: 'No content state provided.' };
  if (trimmed.length > CONTENT_STATE_MAX_BYTES) return { kind: 'invalid', reason: 'The content state is too large.' };

  if (trimmed[0] === '{' || trimmed[0] === '[') return parseJsonText(trimmed);

  if (SCHEME.test(trimmed)) {
    if (!isValidUrl(trimmed)) return { kind: 'invalid', reason: 'Only http(s) URIs are accepted.' };
    let embedded: string | null = null;
    try {
      embedded = new URL(trimmed).searchParams.get('iiif-content');
    } catch {
      /* not a URL we can inspect */
    }
    if (embedded) {
      if (unwrapDepth >= MAX_UNWRAP_DEPTH) return { kind: 'invalid', reason: 'Too many nested iiif-content links.' };
      return classify(embedded, true, unwrapDepth + 1);
    }
    return { kind: 'uri', uri: trimmed };
  }

  if (!allowEncoded) return { kind: 'invalid', reason: 'The text is not a content state.' };
  const decoded = decodeContentState(trimmed);
  if (decoded === null) return { kind: 'invalid', reason: 'The text is not a valid content state.' };
  return parseJsonText(decoded);
}

/**
 * Read the content state from a query string. `iiif-content` wins over
 * `manifest` (optionally with `canvas`). Returns `null` when neither is present.
 */
export function parseContentStateQuery(search: string | URLSearchParams): ContentStateInput | null {
  let params: URLSearchParams;
  try {
    params = typeof search === 'string' ? new URLSearchParams(search) : search;
  } catch {
    return null;
  }
  const content = params.get('iiif-content');
  if (content) return parseContentStateInput(content);

  const manifest = params.get('manifest');
  if (!manifest) return null;
  if (!isValidUrl(manifest)) return { kind: 'invalid', reason: 'The manifest parameter must be an http(s) URI.' };
  const canvas = params.get('canvas');
  if (canvas && isValidUrl(canvas)) {
    return {
      kind: 'json',
      json: { id: canvas, type: 'Canvas', partOf: [{ id: manifest, type: 'Manifest' }] },
    };
  }
  return { kind: 'json', json: { id: manifest, type: 'Manifest' } };
}

/**
 * Text carried by a drag-and-drop (spec §3.4): the first URI of `text/uri-list`,
 * else `text/plain`. Returns an empty string when there is none.
 */
export function contentStateTextFromDataTransfer(dt: Pick<DataTransfer, 'getData'> | null | undefined): string {
  if (!dt) return '';
  try {
    const list = dt.getData('text/uri-list');
    const first = list.split(/\r?\n/).find((line) => line.trim() && !line.startsWith('#'));
    if (first) return first.trim();
    return dt.getData('text/plain').trim();
  } catch {
    return '';
  }
}

/* -------------------------------------------------------------------------- */
/* Selectors -> region                                                         */
/* -------------------------------------------------------------------------- */

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;

function num(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.length < 64 && NUMBER.test(value.trim())) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function makeRegion(
  x: number, y: number, width: number, height: number, unit: ContentStateRegion['unit']
): ContentStateRegion | undefined {
  if (x < 0 || y < 0 || width < 0 || height < 0) return undefined;
  if (unit === 'percent' && (x > 100 || y > 100 || width > 100 || height > 100)) return undefined;
  return { x, y, width, height, unit };
}

/** Parse `xywh=[pixel:|percent:]x,y,w,h` (alone or among `&` separated media-fragment parts). */
export function parseXywhFragment(fragment: string): ContentStateRegion | undefined {
  if (typeof fragment !== 'string') return undefined;
  const part = fragment.replace(/^#/, '').split('&').find((p) => p.startsWith('xywh='));
  if (!part) return undefined;
  let value = part.slice(5);
  let unit: ContentStateRegion['unit'] = 'pixel';
  const prefix = /^(pixel|percent):/.exec(value);
  if (prefix) {
    unit = prefix[1] as ContentStateRegion['unit'];
    value = value.slice(prefix[0].length);
  }
  const nums = value.split(',').map(num);
  if (nums.length !== 4 || nums.some((n) => n === undefined)) return undefined;
  const [x, y, w, h] = nums as number[];
  if (w <= 0 || h <= 0) return undefined;
  return makeRegion(x, y, w, h, unit);
}

interface Box { minX: number; minY: number; maxX: number; maxY: number }

function newBox(): Box {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function addPoint(b: Box, x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  b.minX = Math.min(b.minX, x);
  b.minY = Math.min(b.minY, y);
  b.maxX = Math.max(b.maxX, x);
  b.maxY = Math.max(b.maxY, y);
}

/** Maximum SVG selector text scanned. */
const MAX_SVG_CHARS = 65_536;

const ATTR_NAME = /[a-zA-Z_:][-a-zA-Z0-9_:.]*/y;

/** Linear attribute scanner: each position is visited a bounded number of times. */
function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const skipSpace = (from: number) => {
    let k = from;
    while (k < tag.length && /\s/.test(tag[k])) k++;
    return k;
  };
  let i = 0;
  while (i < tag.length) {
    i = skipSpace(i);
    if (i >= tag.length) break;
    ATTR_NAME.lastIndex = i;
    const name = ATTR_NAME.exec(tag);
    if (!name) { i++; continue; }
    let k = skipSpace(i + name[0].length);
    if (tag[k] !== '=') { i = Math.max(i + 1, k); continue; }
    k = skipSpace(k + 1);
    const quote = tag[k];
    if (quote !== '"' && quote !== "'") { i = Math.max(i + 1, k); continue; }
    const close = tag.indexOf(quote, k + 1);
    if (close === -1) break;
    out[name[0]] = tag.slice(k + 1, close);
    i = close + 1;
  }
  return out;
}

const PATH_ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

/** Extend `box` with every point of a path, using the full ellipse of each arc. */
function addPath(box: Box, d: string): void {
  let i = 0;
  const skip = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const readNumber = (): number | undefined => {
    skip();
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(d.slice(i, i + 40));
    if (!m) return undefined;
    i += m[0].length;
    return Number(m[0]);
  };
  const readFlag = (): number | undefined => {
    skip();
    if (d[i] !== '0' && d[i] !== '1') return undefined;
    return Number(d[i++]);
  };

  let cx = 0, cy = 0, sx = 0, sy = 0;
  let cmd = '';
  let guard = 0;
  while (i < d.length && guard++ < 100000) {
    skip();
    if (i >= d.length) break;
    if (/[a-zA-Z]/.test(d[i])) {
      cmd = d[i++];
      if (!(cmd.toLowerCase() in PATH_ARGS)) return;
      if (cmd.toLowerCase() === 'z') { cx = sx; cy = sy; continue; }
    } else if (!cmd || cmd.toLowerCase() === 'z') {
      return;
    }
    const lower = cmd.toLowerCase();
    const rel = cmd !== cmd.toUpperCase();
    const args: number[] = [];
    for (let k = 0; k < PATH_ARGS[lower]; k++) {
      const isFlag = lower === 'a' && (k === 3 || k === 4);
      const v = isFlag ? readFlag() : readNumber();
      if (v === undefined) return;
      args.push(v);
    }
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (lower) {
      case 'm':
      case 'l':
      case 't':
        cx = ox + args[0]; cy = oy + args[1];
        break;
      case 'h': cx = ox + args[0]; break;
      case 'v': cy = oy + args[0]; break;
      case 'c':
        addPoint(box, ox + args[0], oy + args[1]);
        addPoint(box, ox + args[2], oy + args[3]);
        cx = ox + args[4]; cy = oy + args[5];
        break;
      case 's':
      case 'q':
        addPoint(box, ox + args[0], oy + args[1]);
        cx = ox + args[2]; cy = oy + args[3];
        break;
      case 'a': {
        const ex = ox + args[5], ey = oy + args[6];
        addArc(box, cx, cy, args[0], args[1], args[2], args[3], args[4], ex, ey);
        cx = ex; cy = ey;
        break;
      }
    }
    addPoint(box, cx, cy);
    if (lower === 'm') { sx = cx; sy = cy; cmd = rel ? 'l' : 'L'; }
  }
}

/** Add the bounding box of the whole ellipse an arc belongs to (conservative). */
function addArc(
  box: Box, x1: number, y1: number, rxIn: number, ryIn: number, rotDeg: number,
  large: number, sweep: number, x2: number, y2: number
): void {
  let rx = Math.abs(rxIn), ry = Math.abs(ryIn);
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return;
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num2 / den));
  const cxp = (k * rx * y1p) / ry;
  const cyp = (-k * ry * x1p) / rx;
  const ccx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const ccy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const hx = Math.sqrt(rx * rx * cos * cos + ry * ry * sin * sin);
  const hy = Math.sqrt(rx * rx * sin * sin + ry * ry * cos * cos);
  addPoint(box, ccx - hx, ccy - hy);
  addPoint(box, ccx + hx, ccy + hy);
}

/** Bounding box of the shapes in an SVG selector value, from its numbers only. */
export function svgSelectorBounds(svg: string): ContentStateRegion | undefined {
  if (typeof svg !== 'string' || !svg || svg.length > MAX_SVG_CHARS) return undefined;
  const box = newBox();
  const shapeStart = /<\s*(rect|circle|ellipse|line|polygon|polyline|path)\b/iy;
  let pos = 0;
  let gt = -1;
  for (;;) {
    const lt = svg.indexOf('<', pos);
    if (lt === -1) break;
    // Reuse the last '>' while it is still ahead, so '<<<<…' stays linear.
    if (gt < lt) {
      gt = svg.indexOf('>', lt);
      if (gt === -1) break;
    }
    pos = lt + 1;
    shapeStart.lastIndex = lt;
    const m = shapeStart.exec(svg);
    if (!m || m.index + m[0].length > gt) continue;
    pos = gt + 1;
    const a = attrs(svg.slice(m.index + m[0].length, gt));
    const n = (k: string, fallback = 0) => num(a[k]) ?? fallback;
    switch (m[1].toLowerCase()) {
      case 'rect':
        addPoint(box, n('x'), n('y'));
        addPoint(box, n('x') + n('width'), n('y') + n('height'));
        break;
      case 'circle':
        addPoint(box, n('cx') - n('r'), n('cy') - n('r'));
        addPoint(box, n('cx') + n('r'), n('cy') + n('r'));
        break;
      case 'ellipse':
        addPoint(box, n('cx') - n('rx'), n('cy') - n('ry'));
        addPoint(box, n('cx') + n('rx'), n('cy') + n('ry'));
        break;
      case 'line':
        addPoint(box, n('x1'), n('y1'));
        addPoint(box, n('x2'), n('y2'));
        break;
      case 'polygon':
      case 'polyline': {
        const nums = (a.points ?? '').split(/[\s,]+/).filter(Boolean).map(num);
        for (let i = 0; i + 1 < nums.length; i += 2) {
          if (nums[i] !== undefined && nums[i + 1] !== undefined) addPoint(box, nums[i]!, nums[i + 1]!);
        }
        break;
      }
      case 'path':
        if (a.d) addPath(box, a.d);
        break;
    }
  }
  if (!Number.isFinite(box.minX)) return undefined;
  // Shapes (arcs, strokes) may overhang the canvas origin; keep the visible part.
  const x = Math.max(0, box.minX), y = Math.max(0, box.minY);
  return makeRegion(x, y, Math.max(0, box.maxX - x), Math.max(0, box.maxY - y), 'pixel');
}

/** Region described by a single selector object, if it is a supported kind. */
export function selectorRegion(selector: unknown): ContentStateRegion | undefined {
  if (!isObject(selector)) return undefined;
  switch (typeOf(selector)) {
    case 'PointSelector': {
      const x = num(selector.x), y = num(selector.y);
      return x === undefined || y === undefined ? undefined : makeRegion(x, y, 0, 0, 'pixel');
    }
    case 'FragmentSelector':
      return typeof selector.value === 'string' ? parseXywhFragment(selector.value) : undefined;
    case 'SvgSelector':
      return typeof selector.value === 'string' ? svgSelectorBounds(selector.value) : undefined;
    case 'ImageApiSelector': {
      const region = selector.region;
      if (typeof region !== 'string') return undefined;
      const pct = region.startsWith('pct:');
      const nums = (pct ? region.slice(4) : region).split(',').map(num);
      if (nums.length !== 4 || nums.some((n) => n === undefined)) return undefined;
      const [x, y, w, h] = nums as number[];
      return w > 0 && h > 0 ? makeRegion(x, y, w, h, pct ? 'percent' : 'pixel') : undefined;
    }
    default:
      return undefined;
  }
}

function unionRegions(regions: ContentStateRegion[]): ContentStateRegion | undefined {
  // Pixel regions win; percentages are only merged with each other.
  const pixel = regions.filter((r) => r.unit === 'pixel');
  const set = pixel.length ? pixel : regions;
  if (!set.length) return undefined;
  const box = newBox();
  for (const r of set) {
    addPoint(box, r.x, r.y);
    addPoint(box, r.x + r.width, r.y + r.height);
  }
  return {
    x: box.minX, y: box.minY, width: box.maxX - box.minX, height: box.maxY - box.minY, unit: set[0].unit,
  };
}

/* -------------------------------------------------------------------------- */
/* Target extraction (spec §2.2 and §4)                                        */
/* -------------------------------------------------------------------------- */

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function toArray(v: unknown): unknown[] {
  return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
}

function idOf(node: unknown): string | undefined {
  if (typeof node === 'string') return node;
  if (isObject(node)) {
    const id = node.id ?? node['@id'];
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}

/** Resource type without its `sc:`/`oa:` style prefix; first one if several. */
function typeOf(node: unknown): string | undefined {
  if (!isObject(node)) return undefined;
  const raw = node.type ?? node['@type'];
  const t = Array.isArray(raw) ? raw[0] : raw;
  return typeof t === 'string' ? t.replace(/^[a-z]+:/i, '') : undefined;
}

/** Split an id into its http(s) URI and an optional `xywh` fragment. */
function splitId(raw: string | undefined): { id: string; region?: ContentStateRegion } | undefined {
  if (!raw) return undefined;
  const hash = raw.indexOf('#');
  const base = hash === -1 ? raw : raw.slice(0, hash);
  const region = hash === -1 ? undefined : parseXywhFragment(raw.slice(hash));
  // Only an `xywh` fragment is ours to strip; any other fragment stays in the id.
  const id = hash === -1 || region || raw.startsWith('#xywh=', hash) ? base : raw;
  return isValidUrl(id) ? { id, region } : undefined;
}

type PartOf = { manifestId?: string; collectionId?: string };

/** Pick the container (Manifest preferred, else Collection) from a `partOf` value. */
function pickPartOf(partOf: unknown): PartOf {
  let collection: string | undefined;
  let untyped: string | undefined;
  for (const entry of toArray(partOf)) {
    const id = idOf(entry);
    if (!id || !isValidUrl(id)) continue;
    const type = typeOf(entry);
    if (type === 'Manifest') return { manifestId: id };
    if (type === 'Collection') collection ??= id;
    else if (!type) untyped ??= id;
  }
  if (untyped) return { manifestId: untyped };
  return collection ? { collectionId: collection } : {};
}

/** First Canvas found in a Range's embedded items. */
function firstCanvasIn(items: unknown, depth = 0): string | undefined {
  if (depth > 3) return undefined;
  for (const item of toArray(items)) {
    if (typeOf(item) === 'Canvas') {
      const sp = splitId(idOf(item));
      if (sp) return sp.id;
    } else if (isObject(item)) {
      const nested = firstCanvasIn(item.items, depth + 1);
      if (nested) return nested;
    }
  }
  return undefined;
}

interface ExtractContext { warnings: string[] }

function isEmbeddedManifest(node: Record<string, unknown>): boolean {
  return Array.isArray(node.items) || Array.isArray(node.sequences);
}

function extractNode(node: unknown, ctx: ExtractContext, depth: number): ContentStateDraft[] {
  if (depth > MAX_NODE_DEPTH) {
    ctx.warnings.push('Content state is nested too deeply.');
    return [];
  }
  if (Array.isArray(node)) return node.flatMap((n) => extractNode(n, ctx, depth + 1));

  // A bare URI: its kind is only known by dereferencing it.
  if (typeof node === 'string') {
    const sp = splitId(node);
    if (!sp) {
      ctx.warnings.push('Ignored a target that is not an http(s) URI.');
      return [];
    }
    return [{ canvasId: sp.region ? sp.id : undefined, region: sp.region, followId: sp.id }];
  }
  if (!isObject(node)) return [];

  const type = typeOf(node);
  switch (type) {
    case 'Annotation': {
      if (node.target !== undefined) return extractNode(node.target, ctx, depth + 1);
      const sp = splitId(idOf(node));
      if (sp && !node.body) return [{ followId: sp.id }];
      ctx.warnings.push('Annotation has no target.');
      return [];
    }
    case 'SpecificResource':
      return extractSpecificResource(node, ctx, depth);
    case 'Manifest': {
      const sp = splitId(idOf(node));
      if (!sp) return [];
      return [{ manifestId: sp.id, ...(isEmbeddedManifest(node) ? { manifestJson: node } : {}) }];
    }
    case 'Collection': {
      const sp = splitId(idOf(node));
      return sp ? [{ collectionId: sp.id }] : [];
    }
    case 'Canvas':
    case 'Range': {
      const sp = splitId(idOf(node));
      if (!sp) return [];
      const part = pickPartOf(node.partOf);
      const t: ContentStateDraft = { ...part };
      if (type === 'Canvas') {
        t.canvasId = sp.id;
        t.region = sp.region;
      } else {
        t.rangeId = sp.id;
        t.canvasId = firstCanvasIn(node.items);
      }
      if (!part.manifestId && !part.collectionId) t.followId = sp.id;
      return [t];
    }
    default: {
      // Untyped object: with partOf it can only be a canvas-like resource.
      const sp = splitId(idOf(node));
      if (!sp) return [];
      if (node.partOf !== undefined) {
        return [{ canvasId: sp.id, region: sp.region, ...pickPartOf(node.partOf) }];
      }
      return [{ canvasId: sp.region ? sp.id : undefined, region: sp.region, followId: sp.id }];
    }
  }
}

function extractSpecificResource(
  node: Record<string, unknown>, ctx: ExtractContext, depth: number
): ContentStateDraft[] {
  const base = extractNode(node.source, ctx, depth + 1);
  const outer = pickPartOf(node.partOf);
  const region = unionRegions(
    toArray(node.selector).map(selectorRegion).filter((r): r is ContentStateRegion => !!r)
  );
  if (toArray(node.selector).length && !region) ctx.warnings.push('Selector not supported: showing the whole canvas.');

  return base.map((t) => {
    const out: ContentStateDraft = { ...t };
    if (!out.manifestId && !out.collectionId) Object.assign(out, outer);
    if (region && (out.canvasId || out.followId)) {
      out.region = region;
      // A selector on an unresolved URI targets a canvas.
      out.canvasId ??= out.followId;
    }
    if (out.manifestId || out.collectionId) delete out.followId;
    return out;
  });
}

/**
 * Extract targets from a content state document (spec §2.2, §4).
 * Entries with `followId` need their URI dereferenced to be complete; see
 * `resolveContentState`. Never throws.
 */
export function extractContentStateTargets(
  json: unknown
): { targets: ContentStateDraft[]; warnings: string[] } {
  const ctx: ExtractContext = { warnings: [] };
  let targets: ContentStateDraft[] = [];
  try {
    targets = extractNode(json, ctx, 0);
  } catch {
    ctx.warnings.push('The content state could not be read.');
  }
  return { targets: dedupeTargets(targets), warnings: ctx.warnings };
}

/** Drop duplicate targets and cap their number. */
export function dedupeTargets<T extends ContentStateDraft>(targets: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of targets) {
    const key = JSON.stringify([t.manifestId, t.collectionId, t.canvasId, t.rangeId, t.region, t.followId]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= CONTENT_STATE_MAX_TARGETS) break;
  }
  return out;
}

/** Container a dereferenced Canvas/Range document says it belongs to. */
export function partOfFromDocument(doc: unknown): PartOf {
  return isObject(doc) ? pickPartOf(doc.partOf) : {};
}

/* -------------------------------------------------------------------------- */
/* Canvas size and Mirador window configs                                      */
/* -------------------------------------------------------------------------- */

/** Width and height of a canvas in a Presentation 2 or 3 manifest. */
export function findCanvasSize(
  manifest: unknown, canvasId: string
): { width: number; height: number } | undefined {
  if (!isObject(manifest)) return undefined;
  const canvases: unknown[] = [
    ...toArray(manifest.items),
    ...toArray(manifest.sequences).flatMap((s) => (isObject(s) ? toArray(s.canvases) : [])),
  ];
  for (const c of canvases) {
    if (!isObject(c) || idOf(c) !== canvasId) continue;
    const width = num(c.width), height = num(c.height);
    return width && height && width > 0 && height > 0 ? { width, height } : undefined;
  }
  return undefined;
}

/** A Mirador window description (pass to Mirador's `addWindow` or `windows`). */
export interface ContentStateWindowConfig {
  manifestId: string;
  canvasId?: string;
  view?: 'single';
  initialViewerConfig?: { bounds: [number, number, number, number] };
}

/** Options for {@link buildMiradorWindows}. */
export interface BuildWindowsOptions {
  /** Canvas size lookup; needed to place `percent:` regions. */
  canvasSize?: (canvasId: string, target: ContentStateTarget) => { width: number; height: number } | undefined;
  /** Manifest to use for targets that do not name one (e.g. a lone Canvas). */
  defaultManifestId?: string;
  /** Padding around the region, as a fraction of its size. Default 0.1. */
  margin?: number;
}

/** Side of the view used for a point, as a fraction of the larger canvas side. */
const POINT_VIEW_FRACTION = 0.05;
/** Side of the view used for a point when the canvas size is unknown, in pixels. */
const POINT_VIEW_FALLBACK = 100;

/**
 * Viewer bounds `[x, y, width, height]` in canvas pixels for a region, padded.
 * Returns `undefined` for a percent region when the canvas size is unknown.
 */
export function regionToBounds(
  region: ContentStateRegion,
  size?: { width: number; height: number },
  margin = 0.1
): [number, number, number, number] | undefined {
  let { x, y, width, height } = region;
  if (region.unit === 'percent') {
    if (!size) return undefined;
    x = (x / 100) * size.width;
    y = (y / 100) * size.height;
    width = (width / 100) * size.width;
    height = (height / 100) * size.height;
  }
  const minSide = size ? Math.max(size.width, size.height) * POINT_VIEW_FRACTION : POINT_VIEW_FALLBACK;
  const bw = Math.max(width * (1 + 2 * margin), minSide);
  const bh = Math.max(height * (1 + 2 * margin), minSide);
  const cx = x + width / 2;
  const cy = y + height / 2;
  return [Math.max(0, cx - bw / 2), Math.max(0, cy - bh / 2), bw, bh];
}

/**
 * Turn resolved targets into Mirador window configs: one window per target
 * (so a comparison of two canvases opens two windows). Targets without a
 * manifest, and not covered by `defaultManifestId`, are skipped.
 */
export function buildMiradorWindows(
  input: ContentStateResult | ContentStateTarget[],
  options: BuildWindowsOptions = {}
): ContentStateWindowConfig[] {
  const targets = Array.isArray(input) ? input : input.targets;
  const out: ContentStateWindowConfig[] = [];
  for (const t of targets) {
    const manifestId = t.manifestId ?? t.collectionId ?? options.defaultManifestId;
    if (!manifestId) continue;
    const config: ContentStateWindowConfig = { manifestId };
    if (t.canvasId) {
      config.canvasId = t.canvasId;
      if (t.region) {
        const size = options.canvasSize?.(t.canvasId, t);
        const bounds = regionToBounds(t.region, size, options.margin);
        if (bounds) {
          config.view = 'single';
          config.initialViewerConfig = { bounds };
        }
      }
    }
    out.push(config);
  }
  return out;
}
