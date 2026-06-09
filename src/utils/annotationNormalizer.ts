/**
 * IIIF annotation normalizer.
 *
 * The single module that knows about IIIF wire shapes. It converts any
 * recognized IIIF annotation container into the normalized model — IIIF
 * Presentation 3 / W3C Web Annotation (`AnnotationPage` / `items` / `id` /
 * `body` / `target`), the canonical target. Everything downstream only ever
 * sees this normalized model.
 *
 * Architecture: version handling is open, not a closed `v2`/`v3` enum. An
 * ordered REGISTRY of {@link AnnotationAdapter}s recognizes a container and
 * READS its fields uniformly; mappers then TRANSLATE those raw values into the
 * normalized model. Supporting a new IIIF version (or a vendor quirk) is a
 * matter of appending/registering one more adapter — no branching is added
 * anywhere else, and no `@id`/`@type`/`resource`/`on`/`sc:`/`oa:`/`dctypes:`/
 * `resources` knowledge lives outside this file.
 */

import type {
  AnnotationBody,
  AnnotationTarget,
  AnnotationV3,
  LocalizedString,
  LocalizedStringV2,
  MetadataEntry,
  SeeAlsoEntry,
} from '../types/iiif';

/** Open dataset MIME types that imply a Dataset body even without an explicit `@type`. */
const DATASET_MIMES = new Set([
  'text/csv',
  'text/plain',
  'text/tab-separated-values',
  'text/txt',
  'application/octet-stream',
]);

/** v2 `@type` values that map to a TextualBody. */
const TEXTUAL_TYPES = new Set([
  'cnt:ContentAsText',
  'dctypes:Text',
  'oa:Tag',
  'oa:SemanticTag',
]);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/* -------------------------------------------------------------------------- */
/* Adapter registry — open set of IIIF formats                                */
/* -------------------------------------------------------------------------- */

/**
 * Pluggable reader for one IIIF annotation format.
 *
 * An adapter does two version-specific things only: it RECOGNIZES a container
 * ({@link matches}) and READS its raw fields uniformly. It performs NO
 * translation — the version-agnostic mappers below turn the raw values into the
 * normalized model. To support a new IIIF version, implement this interface and
 * append it to {@link ANNOTATION_ADAPTERS} (or {@link registerAnnotationAdapter}).
 */
export interface AnnotationAdapter {
  /** Stable id for diagnostics, e.g. 'iiif-presentation-3'. */
  readonly name: string;
  /** Recognize a container for this IIIF format — by `@context` (preferred), else structure. */
  matches(page: Record<string, unknown>): boolean;
  /** Raw annotation objects out of the container. */
  listAnnotations(page: Record<string, unknown>): unknown[];
  // Field readers (raw → raw, no translation).
  id(a: Record<string, unknown>): string | undefined;
  motivation(a: Record<string, unknown>): unknown;
  bodies(a: Record<string, unknown>): unknown[];
  target(a: Record<string, unknown>): unknown;
  label(a: Record<string, unknown>): unknown;
  metadata(a: Record<string, unknown>): unknown;
  seeAlso(a: Record<string, unknown>): unknown;
}

const toArray = (v: unknown): unknown[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

/**
 * True if the JSON-LD `@context` (a string or an array of strings) contains a
 * fragment. Per IIIF, `@context` is the authoritative version declaration; the
 * adapters use it first and fall back to structure only when it is absent.
 */
const contextIncludes = (page: Record<string, unknown>, fragment: string): boolean => {
  const ctx = page['@context'];
  if (typeof ctx === 'string') return ctx.includes(fragment);
  return Array.isArray(ctx) && ctx.some((c) => typeof c === 'string' && c.includes(fragment));
};

/**
 * IIIF Presentation 3 / W3C Web Annotation: `AnnotationPage` with `items`, each
 * `Annotation` carrying `id` / `body` / `target` (the normalized model itself).
 * Declared by the Presentation 3 or W3C Web Annotation `@context`.
 */
const presentation3Adapter: AnnotationAdapter = {
  name: 'iiif-presentation-3',
  matches: (page) =>
    contextIncludes(page, '/presentation/3/') ||
    contextIncludes(page, 'w3.org/ns/anno') ||
    Array.isArray(page.items) ||
    page.type === 'AnnotationPage',
  listAnnotations: (page) => (Array.isArray(page.items) ? page.items : []),
  id: (a) => (typeof a.id === 'string' ? a.id : undefined),
  motivation: (a) => a.motivation,
  bodies: (a) => toArray(a.body),
  target: (a) => a.target,
  label: (a) => a.label,
  metadata: (a) => a.metadata,
  seeAlso: (a) => a.seeAlso,
};

/**
 * IIIF Presentation 2 / Open Annotation: `sc:AnnotationList` with `resources`,
 * each `oa:Annotation` carrying `@id` / `resource` / `on` (Open Annotation
 * terms). Declared by the Presentation 2 `@context`. Translated to the Web
 * Annotation model by the mappers below.
 */
const presentation2Adapter: AnnotationAdapter = {
  name: 'iiif-presentation-2',
  matches: (page) =>
    contextIncludes(page, '/presentation/2/') ||
    page['@type'] === 'sc:AnnotationList' ||
    Array.isArray(page.resources),
  listAnnotations: (page) => (Array.isArray(page.resources) ? page.resources : []),
  id: (a) => (typeof a['@id'] === 'string' ? a['@id'] : undefined),
  motivation: (a) => a.motivation,
  bodies: (a) => toArray(a.resource),
  target: (a) => a.on,
  label: (a) => a.label,
  metadata: (a) => a.metadata,
  seeAlso: (a) => a.seeAlso,
};

/** Ordered registry — first match wins. Add a version by appending an adapter. */
export const ANNOTATION_ADAPTERS: AnnotationAdapter[] = [
  presentation3Adapter,
  presentation2Adapter,
];

/** Register a new IIIF version adapter at runtime (prepended so it can take priority). */
export function registerAnnotationAdapter(adapter: AnnotationAdapter): void {
  ANNOTATION_ADAPTERS.unshift(adapter);
}

/** Pick the first registered adapter that recognizes this container, if any. */
export function adapterFor(json: unknown): AnnotationAdapter | undefined {
  if (!isObject(json)) return undefined;
  return ANNOTATION_ADAPTERS.find((adapter) => adapter.matches(json));
}

/* -------------------------------------------------------------------------- */
/* Mappers — TRANSLATE v2 values into the normalized model                    */
/* -------------------------------------------------------------------------- */

/** True if `v` is already a normalized v3 LocalizedString map (`{ lang: string[] }`). */
const isLocalizedMap = (v: Record<string, unknown>): v is LocalizedString =>
  Object.values(v).every((arr) => Array.isArray(arr));

/** v2 localized value → normalized LocalizedString (plain strings / v3 maps pass through). */
export function v2ValueToLocalized(
  value: LocalizedStringV2 | LocalizedString | undefined
): LocalizedString | string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  // Already a normalized LocalizedString map (v3 passthrough).
  if (!Array.isArray(value) && isLocalizedMap(value)) return value as LocalizedString;

  const entries = Array.isArray(value) ? value : [value];
  const out: LocalizedString = {};
  for (const entry of entries) {
    if (!isObject(entry) || typeof entry['@value'] !== 'string') continue;
    const lang = typeof entry['@language'] === 'string' && entry['@language'] ? entry['@language'] : 'none';
    (out[lang] ||= []).push(entry['@value']);
  }
  return out;
}

/** Strip a namespace prefix: `ns:Foo` → `Foo`. */
const stripPrefix = (type: string): string => type.split(':').pop() || type;

/** v2 `resource` object (or already-v3 body) → normalized AnnotationBody. Never throws. */
function mapBody(raw: unknown): AnnotationBody {
  if (!isObject(raw)) {
    return { type: 'TextualBody', value: typeof raw === 'string' ? raw : '' };
  }

  // Already a v3 body (bare `type`, no v2 `@type`): pass through unchanged.
  if (typeof raw.type === 'string' && raw['@type'] === undefined) {
    return raw as unknown as AnnotationBody;
  }

  const rawType = typeof raw['@type'] === 'string' ? raw['@type'] : undefined;
  const id = typeof raw['@id'] === 'string' ? raw['@id'] : undefined;
  let format = typeof raw.format === 'string' ? raw.format : undefined;
  if (format === 'text/txt') format = 'text/plain';
  const chars = typeof raw.chars === 'string' ? raw.chars : undefined;
  const label = v2ValueToLocalized(raw.label as LocalizedStringV2 | undefined);

  const base: { format?: string; label?: LocalizedString } = {};
  if (format) base.format = format;
  if (label && typeof label !== 'string') base.label = label;

  // Bare v3 `@type` passes through unchanged.
  if (rawType === 'Dataset' || rawType === 'Manifest' || rawType === 'TextualBody') {
    return { ...raw, type: rawType, ...(id ? { id } : {}), ...base } as AnnotationBody;
  }

  // Explicit @type wins over format/chars heuristics.
  if (rawType === 'dctypes:Dataset') {
    return { type: 'Dataset', id: id ?? '', ...base, format: format ?? '' };
  }
  if (rawType === 'sc:Manifest') {
    return { type: 'Manifest', id: id ?? '', ...base };
  }
  if (rawType && TEXTUAL_TYPES.has(rawType)) {
    return { type: 'TextualBody', value: chars ?? '', ...base, ...textLang(raw) };
  }

  // Heuristics when @type is absent or unknown.
  if (chars !== undefined) {
    return { type: 'TextualBody', value: chars, ...base, ...textLang(raw) };
  }
  if (format === 'application/ld+json') {
    return { type: 'Manifest', id: id ?? '', ...base };
  }
  if (format && DATASET_MIMES.has(format)) {
    return { type: 'Dataset', id: id ?? '', ...base, format };
  }

  // Unknown namespaced @type → strip prefix into `type`, copy @id → id.
  return { type: rawType ? stripPrefix(rawType) : 'Unknown', ...(id ? { id } : {}), ...base } as AnnotationBody;
}

const textLang = (raw: Record<string, unknown>): { language?: string } =>
  typeof raw.language === 'string' ? { language: raw.language } : {};

/** v2 `on` value → normalized AnnotationTarget (or a plain string). */
function mapTarget(raw: unknown): AnnotationTarget | string {
  if (typeof raw === 'string') {
    const hash = raw.indexOf('#');
    if (hash === -1) return raw;
    return {
      type: 'SpecificResource',
      source: raw.slice(0, hash),
      selector: { type: 'FragmentSelector', value: raw.slice(hash + 1) },
    };
  }
  if (isObject(raw)) {
    // Already a v3 target object (uses `source`, not the v2 `full`): pass through.
    if (raw.full === undefined && ('source' in raw || 'type' in raw)) {
      return raw as AnnotationTarget;
    }
    const full = typeof raw.full === 'string' ? raw.full : undefined;
    const selector = isObject(raw.selector) ? raw.selector : undefined;
    const value =
      (typeof selector?.value === 'string' ? selector.value : undefined) ??
      (typeof selector?.chars === 'string' ? selector.chars : undefined);
    return {
      type: 'SpecificResource',
      ...(full ? { source: full } : {}),
      selector: { type: 'FragmentSelector', value: value ?? '' },
    };
  }
  return '';
}

/** v2 `seeAlso` entry (or already-v3 entry) → normalized SeeAlsoEntry. Value of `@id`/`id` preserved. */
function mapSeeAlso(raw: unknown): SeeAlsoEntry {
  if (!isObject(raw)) return { id: typeof raw === 'string' ? raw : '' };
  // Already a v3 entry (bare `id`, no v2 `@id`): pass through unchanged.
  if ('id' in raw && raw['@id'] === undefined) return raw as unknown as SeeAlsoEntry;
  const { '@id': atId, '@type': atType, label, ...rest } = raw;
  const out: SeeAlsoEntry = {
    ...rest,
    id: (atId as SeeAlsoEntry['id']) ?? '',
  };
  if (typeof atType === 'string') out.type = atType;
  const loc = v2ValueToLocalized(label as LocalizedStringV2 | undefined);
  if (loc && typeof loc !== 'string') out.label = loc;
  else if (typeof loc === 'string') out.label = { none: [loc] };
  return out;
}

/** v2 metadata entries → normalized MetadataEntry[]. */
function mapMetadata(raw: unknown): MetadataEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((entry) => {
    const label = isObject(entry) ? v2ValueToLocalized(entry.label as LocalizedStringV2) : undefined;
    const value = isObject(entry) ? v2ValueToLocalized(entry.value as LocalizedStringV2) : undefined;
    return {
      label: asLocalized(label),
      value: asLocalized(value),
    };
  });
}

/** Coerce a normalized localized value into the v3 LocalizedString map shape. */
const asLocalized = (v: LocalizedString | string | undefined): LocalizedString =>
  v === undefined ? {} : typeof v === 'string' ? { none: [v] } : v;

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/** Normalize one raw page/list (any registered IIIF format) into a flat array of normalized annotations. */
export function normalizeAnnotationList(json: unknown): AnnotationV3[] {
  if (!isObject(json)) return [];
  const adapter = adapterFor(json);
  // Unrecognized container shape → graceful empty result, never throws.
  if (!adapter) return [];

  return adapter.listAnnotations(json).flatMap((raw) => {
    if (!isObject(raw)) return [];

    const id = adapter.id(raw);
    if (id === undefined) return [];

    const bodies = adapter.bodies(raw).map(mapBody);
    const targetRaw = adapter.target(raw);
    const target: AnnotationTarget | string = Array.isArray(targetRaw)
      ? // arrays of targets are kept as the postprocessor's multi-target shape
        (targetRaw.map(mapTarget) as unknown as AnnotationTarget)
      : mapTarget(targetRaw);

    const annotation: AnnotationV3 = {
      id,
      type: 'Annotation',
      body: bodies.length === 1 ? bodies[0] : bodies,
      target,
    };

    const motivation = adapter.motivation(raw);
    if (typeof motivation === 'string' || Array.isArray(motivation)) {
      annotation.motivation = motivation as string | string[];
    }

    const label = v2ValueToLocalized(adapter.label(raw) as LocalizedStringV2 | undefined);
    if (label !== undefined) annotation.label = asLocalized(label);

    const metadata = mapMetadata(adapter.metadata(raw));
    if (metadata && metadata.length) annotation.metadata = metadata;

    const seeAlsoRaw = adapter.seeAlso(raw);
    if (seeAlsoRaw !== undefined && seeAlsoRaw !== null) {
      const mapped = Array.isArray(seeAlsoRaw)
        ? seeAlsoRaw.map(mapSeeAlso)
        : mapSeeAlso(seeAlsoRaw);
      annotation.seeAlso = mapped;
    }

    return [annotation];
  });
}

/**
 * Build a map of normalized annotations from Mirador's per-canvas annotation
 * state. Accepts mixed v2/v3 lists under one canvas and merges them.
 *
 * On duplicate id we append `#target-${n}` so NO entry is dropped. Runtime
 * id-alignment with Mirador's `AnnotationItem.id` is guaranteed by the v2-aware
 * postprocessor (plan §4.7, later commit); this suffixing is the standalone
 * safety fallback.
 */
const EMPTY_RESOURCES: Record<string, AnnotationV3> = {};
const resourcesCache = new WeakMap<object, Record<string, AnnotationV3>>();

export function normalizeAnnotationResources(
  canvasAnnotations: Record<string, { json?: unknown }> | undefined
): Record<string, AnnotationV3> {
  if (!isObject(canvasAnnotations)) return EMPTY_RESOURCES;

  // Memoize on the (Redux-stable) per-canvas state object: the same input returns
  // the SAME reference, so the connected mapStateToProps does not produce a fresh
  // object on every unrelated dispatch (avoids needless re-renders).
  const cached = resourcesCache.get(canvasAnnotations);
  if (cached) return cached;

  const out: Record<string, AnnotationV3> = {};
  const seen = new Map<string, number>();

  for (const entry of Object.values(canvasAnnotations)) {
    if (!isObject(entry)) continue;
    for (const ann of normalizeAnnotationList(entry.json)) {
      const count = seen.get(ann.id) ?? 0;
      seen.set(ann.id, count + 1);
      const key = count === 0 ? ann.id : `${ann.id}#target-${count}`;
      out[key] = count === 0 ? ann : { ...ann, id: key };
    }
  }

  resourcesCache.set(canvasAnnotations, out);
  return out;
}
