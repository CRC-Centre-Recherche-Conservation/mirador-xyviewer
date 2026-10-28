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
  IiifService,
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
  /** Optional: properties the normalizer does not model, copied onto the output as-is. */
  extraProperties?(a: Record<string, unknown>): Record<string, unknown>;
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

/** v3 annotation keys the normalizer rebuilds itself; every other key is preserved. */
const V3_MODELED_KEYS = new Set(['id', 'type', 'motivation', 'label', 'body', 'target', 'metadata', 'seeAlso']);

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
  extraProperties: (a) =>
    Object.fromEntries(Object.entries(a).filter(([key]) => !V3_MODELED_KEYS.has(key) && key !== '__proto__')),
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
  // A Map keeps producer-controlled language tags (`constructor`, `__proto__`) off the prototype chain.
  const out = new Map<string, string[]>();
  const add = (lang: string, v: string) => {
    const list = out.get(lang);
    if (list) list.push(v);
    else out.set(lang, [v]);
  };
  for (const entry of entries) {
    // Per IIIF Presentation 2.1, an array member may be a bare string (no
    // language) or a `{ @value, @language }` object — including mixed arrays.
    if (typeof entry === 'string') {
      add('none', entry);
      continue;
    }
    if (!isObject(entry) || typeof entry['@value'] !== 'string') continue;
    const lang = typeof entry['@language'] === 'string' && entry['@language'] ? entry['@language'] : 'none';
    add(lang, entry['@value']);
  }
  return Object.fromEntries(out) as LocalizedString;
}

/** Strip a namespace prefix: `ns:Foo` → `Foo`, `http://www.w3.org/ns/oa#Foo` → `Foo`. */
const stripPrefix = (type: string): string =>
  type.replace(/^https?:\/\/www\.w3\.org\/ns\/oa#/, '').replace(/^[A-Za-z][\w.-]*:(?!\/)/, '') || type;

/** Strip only the Open Annotation namespace (`oa:x` / `…/ns/oa#x`); other prefixes such as `sc:` stay. */
const stripOa = (v: string): string => v.replace(/^(?:oa:|https?:\/\/www\.w3\.org\/ns\/oa#)/, '') || v;

/** String value of a JSON-LD reference: a string, or an object's `@id` / `id`. */
const refId = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v;
  if (!isObject(v)) return undefined;
  const id = v['@id'] ?? v.id;
  return typeof id === 'string' ? id : undefined;
};

/** Normalized localized map from any localized value (strings become `{ none: [s] }`). */
const toLocalizedMap = (v: unknown): LocalizedString | undefined => {
  const loc = v2ValueToLocalized(v as LocalizedStringV2 | undefined);
  return loc === undefined ? undefined : asLocalized(loc);
};

/** `purpose` / `oa:hasPurpose` / `hasPurpose` (string or `{@id|id}`, one or many) → oa:-free purpose. */
function mapPurpose(raw: Record<string, unknown>): string | string[] | undefined {
  const value = raw.purpose ?? raw['oa:hasPurpose'] ?? raw.hasPurpose;
  const purposes = toArray(value).map(refId).filter((p): p is string => !!p).map(stripOa);
  if (purposes.length === 0) return undefined;
  return Array.isArray(value) ? purposes : purposes[0];
}

/** Annotation `motivation` (string, `{@id|id}` or array) with a leading `oa:` removed; `sc:painting` is kept. */
function mapMotivation(raw: unknown): string | string[] | undefined {
  const values = toArray(raw).map(refId).filter((m): m is string => !!m).map(stripOa);
  if (values.length === 0) return undefined;
  return Array.isArray(raw) ? values : values[0];
}

/** Keys the Dataset / Textual builders translate themselves (never copied through verbatim). */
const BODY_HANDLED_KEYS = new Set([
  '@id', '@type', 'label', 'format', 'service', 'license',
  'purpose', 'oa:hasPurpose', 'hasPurpose',
]);

/** Dataset body that keeps every key the wire object carries beyond the explicit ones (e.g. `xyReading`). */
function buildDataset(
  raw: Record<string, unknown>,
  id: string | undefined,
  base: Record<string, unknown>,
  format: string | undefined,
  purpose: string | string[] | undefined
): AnnotationBody {
  // Object.fromEntries defines own properties, so a `__proto__` key cannot swap the prototype.
  const rest: Record<string, unknown> = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !BODY_HANDLED_KEYS.has(key) && key !== '__proto__')
  );
  if (!Object.prototype.hasOwnProperty.call(rest, 'rights') && typeof raw.license === 'string') rest.rights = raw.license;
  return {
    ...rest,
    type: 'Dataset',
    id: id ?? '',
    ...base,
    ...(purpose ? { purpose } : {}),
    format: format ?? '',
  } as AnnotationBody;
}

/** v2 `oa:SpecificResource` body (`full` string or object) → normalized SpecificResource, or undefined without an id. */
function mapSpecificResourceBody(
  raw: Record<string, unknown>,
  base: Record<string, unknown>,
  purpose: string | string[] | undefined
): AnnotationBody | undefined {
  const full = raw.full ?? raw.source ?? raw['oa:hasSource'] ?? raw.hasSource;
  const id = refId(full);
  if (!id) return undefined;
  const fullType = isObject(full) ? (full['@type'] ?? full.type) : undefined;
  const source = typeof fullType === 'string' ? { id, type: stripPrefix(fullType) } : id;
  const label = base.label ?? (isObject(full) ? toLocalizedMap(full.label) : undefined);
  const selector = selectorField(raw.selector ?? raw['oa:hasSelector'] ?? raw.hasSelector);
  return {
    type: 'SpecificResource',
    source,
    ...(selector ? { selector } : {}),
    ...base,
    ...(label ? { label } : {}),
    ...(purpose ? { purpose } : {}),
  } as AnnotationBody;
}

/** v2 `resource` object (or already-v3 body) → normalized AnnotationBody. Never throws; undefined = drop. */
function mapBody(raw: unknown): AnnotationBody | undefined {
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
  const rawLabel = v2ValueToLocalized(raw.label as LocalizedStringV2 | undefined);
  const label = rawLabel && typeof rawLabel !== 'string' ? rawLabel : undefined;
  const purpose = mapPurpose(raw);

  const base: { format?: string; label?: LocalizedString; service?: IiifService | IiifService[] } = {};
  if (format) base.format = format;
  if (label) base.label = label;
  // Preserve a declared IIIF service (e.g. an Auth service) — needed for token resolution.
  if (raw.service !== undefined) base.service = raw.service as IiifService | IiifService[];

  // Bare v3 `@type` passes through unchanged.
  if (rawType === 'Dataset' || rawType === 'Manifest' || rawType === 'TextualBody') {
    return { ...raw, type: rawType, ...(id ? { id } : {}), ...base } as AnnotationBody;
  }

  // Explicit @type wins over format/chars heuristics.
  if (rawType === 'dctypes:Dataset') return buildDataset(raw, id, base, format, purpose);
  if (rawType === 'sc:Manifest') {
    return { type: 'Manifest', id: id ?? '', ...base };
  }
  if (rawType && stripPrefix(rawType) === 'SpecificResource') {
    return mapSpecificResourceBody(raw, base, purpose);
  }
  if (rawType && TEXTUAL_TYPES.has(rawType)) {
    // OA → WADM: an oa:Tag is a TextualBody with purpose "tagging" (Mirador's tag list keys on it).
    const p = purpose ?? (rawType === 'oa:Tag' ? 'tagging' : undefined);
    return { type: 'TextualBody', value: chars ?? '', ...base, ...textLang(raw), ...(p ? { purpose: p } : {}) };
  }

  // Heuristics when @type is absent or unknown.
  if (chars !== undefined) {
    return { type: 'TextualBody', value: chars, ...base, ...textLang(raw), ...(purpose ? { purpose } : {}) };
  }
  if (format === 'application/ld+json') {
    return { type: 'Manifest', id: id ?? '', ...base };
  }
  if (format && DATASET_MIMES.has(format)) return buildDataset(raw, id, base, format, purpose);

  // Unknown namespaced @type → strip prefix into `type`, copy @id → id.
  return { type: rawType ? stripPrefix(rawType) : 'Unknown', ...(id ? { id } : {}), ...base } as AnnotationBody;
}

const textLang = (raw: Record<string, unknown>): { language?: string } =>
  typeof raw.language === 'string' ? { language: raw.language } : {};

/** Nested oa:Choice levels followed (real data uses one); deeper input is dropped, not recursed. */
const MAX_CHOICE_DEPTH = 4;

/** Selector types Mirador reads `.value.match` on without a guard. */
const VALUE_SELECTORS = new Set(['FragmentSelector', 'SvgSelector']);

/**
 * Selector(s) of any shape → flat list of normalized selectors. `oa:Choice` becomes
 * `[default, ...item]`; prefixes are stripped; Fragment/Svg selectors without a
 * string `value` are dropped.
 */
function mapSelector(raw: unknown, depth = 0): Record<string, unknown>[] {
  return toArray(raw).flatMap((sel): Record<string, unknown>[] => {
    if (!isObject(sel)) return [];
    const rawType = sel['@type'] ?? sel.type;
    const declared = typeof rawType === 'string' ? stripPrefix(rawType) : undefined;
    if (declared === 'Choice') {
      if (depth >= MAX_CHOICE_DEPTH) return [];
      return [
        ...mapSelector(sel.default ?? sel['oa:default'], depth + 1),
        ...mapSelector(sel.item ?? sel['oa:item'] ?? sel.items, depth + 1),
      ];
    }
    const { chars, ...rest } = sel;
    delete rest['@id'];
    delete rest['@type'];
    delete rest['@context'];
    const value = typeof sel.value === 'string' ? sel.value : typeof chars === 'string' ? chars : undefined;
    const type =
      declared ?? (value !== undefined && value.trimStart().startsWith('<svg') ? 'SvgSelector' : 'FragmentSelector');
    if (VALUE_SELECTORS.has(type) && value === undefined) return [];
    return [{ ...rest, type, ...(value !== undefined ? { value } : {}) }];
  });
}

/** One selector stays an object, several become an array, none → undefined. */
const selectorField = (raw: unknown): Record<string, unknown> | Record<string, unknown>[] | undefined => {
  const list = mapSelector(raw);
  return list.length === 0 ? undefined : list.length === 1 ? list[0] : list;
};

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
    // Already a v3 target object (uses `source`, not the v2 `full`): keep it, normalizing selectors.
    if (raw.full === undefined && ('source' in raw || 'type' in raw)) {
      if (raw.selector === undefined) return raw as AnnotationTarget;
      const { selector: rawSelector, ...rest } = raw;
      const selector = selectorField(rawSelector);
      return { ...rest, ...(selector ? { selector } : {}) } as AnnotationTarget;
    }
    const full = raw.full ?? raw['oa:hasSource'] ?? raw.hasSource;
    const fullId = refId(full);
    const fullType = isObject(full) ? (full['@type'] ?? full.type) : undefined;
    const selector = selectorField(raw.selector ?? raw['oa:hasSelector'] ?? raw.hasSelector);
    return {
      type: 'SpecificResource',
      ...(fullId ? { source: typeof fullType === 'string' ? { id: fullId, type: stripPrefix(fullType) } : fullId } : {}),
      ...(selector ? { selector } : {}),
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
/* Id management — duplicate-id merge + multi-target expand                    */
/* -------------------------------------------------------------------------- */

/**
 * Collapse duplicate-id annotations and split multi-target ones so every output
 * annotation has a UNIQUE id and a SINGLE target.
 *
 * This is the ONE place that owns id management. Both boundaries — the panel
 * (`normalizeAnnotationResources`) and the request postprocessor
 * (`transformPointAnnotations`) — call it, so a duplicate `@id` carrying several
 * regions (e.g. the "Micro Imaging" multi-location case) always expands the same
 * way and the panel's keys line up exactly with the ids Mirador renders on the
 * canvas. Single-target annotations pass through untouched, which makes this
 * idempotent: re-running it on an already-expanded list is a no-op.
 *
 * @param annotations Normalized annotations (may share ids / carry array targets).
 */
export function expandAnnotations(annotations: AnnotationV3[]): AnnotationV3[] {
  // Group by id, preserving first-seen order.
  const groups = new Map<string, AnnotationV3[]>();
  for (const ann of annotations) {
    const group = groups.get(ann.id);
    if (group) group.push(ann);
    else groups.set(ann.id, [ann]);
  }

  const out: AnnotationV3[] = [];
  for (const [id, group] of groups) {
    // Every target this id contributes: duplicate annotations and an
    // already-array-valued target both flatten into one list of single targets.
    const targets = group.flatMap((a) =>
      Array.isArray(a.target) ? (a.target as unknown[]) : [a.target]
    );

    if (targets.length <= 1) {
      // Single region → keep the original id, unwrap a length-1 array target.
      out.push(targets.length === 1 ? { ...group[0], target: targets[0] as AnnotationTarget | string } : group[0]);
      continue;
    }

    // Multiple regions → one annotation per target with a unique id. The
    // `_…` fields record the grouping (parity with the historical v3 expand).
    targets.forEach((target, index) => {
      out.push({
        ...group[0],
        id: `${id}#target-${index}`,
        target: target as AnnotationTarget | string,
        _originalAnnotationId: id,
        _targetIndex: index,
        _totalTargets: targets.length,
      } as AnnotationV3);
    });
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * True if this container is a IIIF Content Search response (search/1 or search/2)
 * rather than a plain annotation page. A search response is structurally an
 * `AnnotationList`/`AnnotationPage` too — so the adapters would happily read it —
 * but it carries search-only data the display pipeline must NOT strip:
 * `hits`/highlighting, pagination (`partOf`/`next`/`startIndex`) and `ignored`.
 * The signals checked here are search-specific; a Presentation annotation page
 * carries none of them. Used to bail out of the destructive postprocessor.
 */
export function isContentSearchResponse(page: unknown): boolean {
  if (!isObject(page)) return false;
  return (
    contextIncludes(page, '/api/search/') ||
    Array.isArray(page.hits) ||
    'ignored' in page
  );
}

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

    const bodies = adapter.bodies(raw).flatMap((b) => mapBody(b) ?? []);
    const targetRaw = adapter.target(raw);
    const target: AnnotationTarget | string = Array.isArray(targetRaw)
      ? // arrays of targets are kept as the postprocessor's multi-target shape
        (targetRaw.map(mapTarget) as unknown as AnnotationTarget)
      : mapTarget(targetRaw);

    const annotation: AnnotationV3 = {
      ...adapter.extraProperties?.(raw),
      id,
      type: 'Annotation',
      body: bodies.length === 1 ? bodies[0] : bodies,
      target,
    };

    const motivation = mapMotivation(adapter.motivation(raw));
    if (motivation !== undefined) annotation.motivation = motivation;

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
 * state, keyed by annotation id. Accepts mixed v2/v3 lists under one canvas and
 * merges them.
 *
 * Duplicate ids are resolved by the shared {@link expandAnnotations} pass — the
 * SAME id management the postprocessor applies — so multi-region annotations
 * (e.g. "Micro Imaging") become distinct `#target-${n}` entries (none dropped)
 * and the keys line up with the ids Mirador renders on the canvas.
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

  const all: AnnotationV3[] = [];
  for (const entry of Object.values(canvasAnnotations)) {
    if (!isObject(entry)) continue;
    all.push(...normalizeAnnotationList(entry.json));
  }

  const out: Record<string, AnnotationV3> = {};
  for (const ann of expandAnnotations(all)) {
    out[ann.id] = ann;
  }

  resourcesCache.set(canvasAnnotations, out);
  return out;
}
