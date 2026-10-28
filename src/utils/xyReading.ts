/**
 * xyReading validator.
 *
 * The input is untrusted remote JSON: every key is checked, unknown keys are
 * dropped, lists are capped and an invalid part is discarded rather than thrown.
 */

import type {
  XyReading,
  XyColumn,
  XyColumnRole,
  XyCorrection,
  XyDialect,
  XyDerivedFrom,
  XyXAxis,
  XyYAxis,
} from '../types/xyReading';
import type { LocalizedString } from '../types/iiif';
import { isValidUrl } from './security';

export const XY_MAX_COLUMNS = 256;
export const XY_MAX_COLUMN_INDEX = 1023;
export const XY_MAX_Y_AXES = 256;
export const XY_MAX_CORRECTIONS = 16;
export const XY_MAX_HEADER_ROWS = 100;
export const XY_DEFAULT_EPSILON = 1e-12;

const MAX_LABEL_LANGUAGES = 32;
const MAX_LABEL_VALUES = 8;
const MAX_STRING = 512;
const MAX_URL = 2048;
const MAX_DEPTH = 2;

const ROLES: readonly XyColumnRole[] = ['x', 'yLeft', 'yRight', 'reference', 'dark', 'ignore'];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** IIIF language map: keeps string values only, bounded. */
function parseLabel(v: unknown): LocalizedString | undefined {
  if (!isObject(v)) return undefined;
  const out: LocalizedString = {};
  let count = 0;
  for (const key of Object.keys(v)) {
    if (count >= MAX_LABEL_LANGUAGES) break;
    if (key === '__proto__' || key.length > 64) continue;
    const values = v[key];
    if (!Array.isArray(values)) continue;
    const strings = values
      .filter((s): s is string => typeof s === 'string' && s !== '')
      .slice(0, MAX_LABEL_VALUES)
      .map((s) => s.slice(0, MAX_STRING));
    if (strings.length === 0) continue;
    out[key] = strings;
    count++;
  }
  return count > 0 ? out : undefined;
}

/** Normalized encoding name when TextDecoder supports it. */
function parseEncoding(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const name = v.trim().toLowerCase();
  if (name.length === 0 || name.length > 32) return undefined;
  if (name === 'utf-8' || name === 'utf8') return 'utf-8';
  try {
    new TextDecoder(name);
    return name;
  } catch {
    return undefined;
  }
}

function parseDialect(v: unknown): XyDialect | undefined {
  if (!isObject(v)) return undefined;
  const out: XyDialect = {};
  const d = v.delimiter;
  if (typeof d === 'string' && d.length === 1 && (d === '\t' || /[^\w\s"'\\]/.test(d) || d === ' ')) {
    out.delimiter = d;
  }
  const h = v.headerRowCount;
  if (Number.isInteger(h) && (h as number) >= 0 && (h as number) <= XY_MAX_HEADER_ROWS) {
    out.headerRowCount = h as number;
  }
  const enc = parseEncoding(v.encoding);
  if (enc) out.encoding = enc;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** All-or-nothing: a partial role map could silently mislabel columns. */
function parseColumns(v: unknown): XyColumn[] | undefined {
  if (!Array.isArray(v) || v.length === 0 || v.length > XY_MAX_COLUMNS) return undefined;
  const seen = new Set<number>();
  const out: XyColumn[] = [];
  for (const item of v) {
    if (!isObject(item)) return undefined;
    const { index, role } = item;
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) > XY_MAX_COLUMN_INDEX) {
      return undefined;
    }
    if (typeof role !== 'string' || !ROLES.includes(role as XyColumnRole)) return undefined;
    if (seen.has(index as number)) return undefined;
    seen.add(index as number);
    out.push({ index: index as number, role: role as XyColumnRole });
  }
  return out;
}

function parseXAxis(v: unknown): XyXAxis | undefined {
  if (!isObject(v)) return undefined;
  const out: XyXAxis = {};
  const label = parseLabel(v.label);
  if (label) out.label = label;
  if (typeof v.reversed === 'boolean') out.reversed = v.reversed;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Positional: entries are kept (possibly empty) so index i still maps to measurement i. */
function parseYAxes(v: unknown): XyYAxis[] | undefined {
  if (!Array.isArray(v) || v.length === 0 || v.length > XY_MAX_Y_AXES) return undefined;
  return v.map((item): XyYAxis => {
    if (!isObject(item)) return {};
    const out: XyYAxis = {};
    if (item.axis === 'left' || item.axis === 'right') out.axis = item.axis;
    const label = parseLabel(item.label);
    if (label) out.label = label;
    return out;
  });
}

/** Known correction, or null when the type or an option is not understood. */
function parseCorrection(v: unknown): XyCorrection | null {
  if (!isObject(v) || v.type !== 'reference-normalize') return null;
  if (v.onInvalid !== undefined && v.onInvalid !== 'drop-point') return null;
  if (v.darkDefault !== undefined && !isFiniteNumber(v.darkDefault)) return null;
  if (v.epsilon !== undefined && (!isFiniteNumber(v.epsilon) || v.epsilon < 0)) return null;
  return {
    type: 'reference-normalize',
    darkDefault: (v.darkDefault as number | undefined) ?? 0,
    epsilon: (v.epsilon as number | undefined) ?? XY_DEFAULT_EPSILON,
  };
}

function parseDerivedFrom(v: unknown, depth: number): XyDerivedFrom | undefined {
  if (!isObject(v) || v.type !== 'Dataset') return undefined;
  const id = v.id;
  if (typeof id !== 'string' || id.length > MAX_URL || !/^https?:\/\//i.test(id) || !isValidUrl(id)) {
    return undefined;
  }
  const out: XyDerivedFrom = { id, type: 'Dataset' };
  if (typeof v.format === 'string' && v.format.length <= 128) out.format = v.format;
  const label = parseLabel(v.label);
  if (label) out.label = label;
  const reading = parse(v.xyReading, depth + 1);
  if (reading) out.xyReading = reading;
  return out;
}

function parse(v: unknown, depth: number): XyReading | null {
  if (depth > MAX_DEPTH || !isObject(v) || v.type !== 'XYReading') return null;
  const out: XyReading = { type: 'XYReading' };

  const dialect = parseDialect(v.dialect);
  if (dialect) out.dialect = dialect;
  const columns = parseColumns(v.columns);
  if (columns) out.columns = columns;
  else if (v.columns !== undefined) out.columnsInvalid = true;
  const x = parseXAxis(v.x);
  if (x) out.x = x;
  const y = parseYAxes(v.y);
  if (y) out.y = y;

  if (Array.isArray(v.corrections)) {
    if (v.corrections.length > XY_MAX_CORRECTIONS) {
      out.hasUnsupportedCorrection = true;
    } else {
      const known: XyCorrection[] = [];
      for (const c of v.corrections) {
        const parsed = parseCorrection(c);
        if (parsed) known.push(parsed);
        else out.hasUnsupportedCorrection = true;
      }
      out.corrections = known;
    }
  } else if (v.corrections !== undefined) {
    out.hasUnsupportedCorrection = true;
  }

  // Already-validated readings round-trip.
  if (v.hasUnsupportedCorrection === true) out.hasUnsupportedCorrection = true;

  const derivedFrom = parseDerivedFrom(v.derivedFrom, depth);
  if (derivedFrom) out.derivedFrom = derivedFrom;
  return out;
}

/**
 * Validate an untrusted `xyReading` value. Returns the sanitized reading, or
 * `null` when absent, malformed or of an unknown `type` (callers then read the
 * file the way they always did). Never throws.
 */
export function parseXyReading(value: unknown): XyReading | null {
  try {
    return parse(value, 0);
  } catch {
    return null;
  }
}

/**
 * Ids of the raw files (`derivedFrom`) declared by the readings of an annotation's bodies.
 * These are offered as an authenticated download, so a plain link to the same resource is
 * redundant. For a Choice, `pick` selects the item actually shown (all items when omitted).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rawSourceIds(body: unknown, pick?: (choice: any) => unknown): Set<string> {
  const ids = new Set<string>();
  const visit = (b: unknown, depth: number): void => {
    if (!b || typeof b !== 'object' || depth > 3) return;
    if (Array.isArray(b)) return b.forEach((x) => visit(x, depth + 1));
    const o = b as { type?: unknown; xyReading?: unknown; items?: unknown };
    const id = parseXyReading(o.xyReading)?.derivedFrom?.id;
    if (id && /^https?:\/\//i.test(id)) ids.add(id);
    if (o.items) visit(pick && o.type === 'Choice' ? pick(o) : o.items, depth + 1);
  };
  visit(body, 0);
  return ids;
}
