/**
 * IIIF Presentation API Types for Scientific Annotations
 *
 * This file models BOTH IIIF Presentation v2 (2.0 / 2.1) and v3 wire shapes,
 * normalized to the unversioned (v3-aliased) model at the loader/postprocessor
 * boundaries (`src/utils/annotationNormalizer.ts`).
 *
 * Naming convention: each concept has explicit `…V2` (raw v2 wire) and `…V3`
 * (raw v3 wire) types sharing the same base noun; the bare/unversioned name is
 * the normalized model and is an alias to the V3 shape. Everything downstream
 * (renderers, type guards, metadata display, localization) only ever sees the
 * unversioned/v3 shapes.
 */

/* -------------------------------------------------------------------------- */
/* Localized strings                                                          */
/* -------------------------------------------------------------------------- */

/** Localized string as per IIIF v3 (also the normalized model). */
export interface LocalizedString {
  [language: string]: string[];
}

/**
 * Raw v2 localized value. Per IIIF Presentation 2.1, this may be a plain string,
 * a single `{ @value, @language }` object, or an array mixing bare strings and
 * such objects.
 */
export type LocalizedStringV2 =
  | string
  | { '@value': string; '@language'?: string }
  | Array<string | { '@value': string; '@language'?: string }>;

/* -------------------------------------------------------------------------- */
/* Metadata                                                                   */
/* -------------------------------------------------------------------------- */

/** Metadata entry (normalized model == v3). */
export interface MetadataEntryV3 {
  label: LocalizedString;
  value: LocalizedString;
}
export type MetadataEntry = MetadataEntryV3;

/** Raw v2 metadata entry. */
export interface MetadataEntryV2 {
  label: LocalizedStringV2;
  value: LocalizedStringV2;
}

/* -------------------------------------------------------------------------- */
/* Body                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A IIIF `service` block (e.g. an Auth access/token service), loosely typed across
 * the v2 (`@id`) and v3 (`id`) wire shapes. Preserved verbatim through normalization
 * so consumers (e.g. IIIF Auth token resolution) can read the declared services.
 */
export interface IiifService {
  '@id'?: string;
  id?: string;
  '@context'?: string | string[];
  '@type'?: string;
  type?: string;
  profile?: string | string[];
  service?: IiifService | IiifService[];
  [key: string]: unknown;
}

/** Base body interface */
interface BaseBody {
  id?: string;
  format?: string;
  label?: LocalizedString;
  /** Declared IIIF service(s) on the resource, e.g. an Auth service. */
  service?: IiifService | IiifService[];
  /** Web Annotation purpose(s), e.g. `classifying`, `describing`, `linking`. */
  purpose?: string | string[];
}

/** Case 1: Manifest body - linked IIIF Manifest */
export interface ManifestBody extends BaseBody {
  type: 'Manifest';
  id: string;
  format?: 'application/ld+json' | string;
}

/** Case 2: Dataset body - CSV/TSV spectral data */
export interface DatasetBody extends BaseBody {
  type: 'Dataset';
  id: string;
  format: 'text/csv' | 'text/plain' | 'text/tab-separated-values' | string;
  /** Optional advisory `xyReading` extension; untrusted, validate with `parseXyReading`. */
  xyReading?: unknown;
}

/** Case 3: TextualBody - static text content */
export interface TextualBody extends BaseBody {
  type: 'TextualBody';
  value: string;
  format?: 'text/plain' | 'text/html' | string;
  language?: string;
}

/** Case 4: SpecificResource - a reference to another resource (concept, annotation, ...) */
export interface SpecificResourceBody extends BaseBody {
  type: 'SpecificResource';
  source: string | { id: string; type?: string; label?: LocalizedString };
  /** Region of the source (normalized selector or list of selectors). */
  selector?: unknown;
}

/** Case 5: Choice (WADM §4.3, IIIF cookbook 0346) - alternatives of which one is shown. */
export interface ChoiceBody extends BaseBody {
  type: 'Choice';
  items: AnnotationBody[];
}

/** Union of all supported body types (normalized model == v3). */
export type AnnotationBodyV3 =
  | ManifestBody
  | DatasetBody
  | TextualBody
  | SpecificResourceBody
  | ChoiceBody;
export type AnnotationBody = AnnotationBodyV3;

/** Raw v2 annotation body (the `resource` field; arrays handled by the mapper). */
export interface AnnotationBodyV2 {
  '@id'?: string;
  '@type'?: string;
  format?: string;
  /** Inline text content (`cnt:ContentAsText`); such resources may have no `@id`. */
  chars?: string;
  language?: string;
  label?: LocalizedStringV2;
  [key: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Target                                                                     */
/* -------------------------------------------------------------------------- */

/** Annotation target (normalized model == v3). */
export interface AnnotationTargetV3 {
  id?: string;
  type?: string;
  source?: string | { id: string; type?: string; partOf?: unknown };
  selector?: unknown;
}
export type AnnotationTarget = AnnotationTargetV3;

/** Raw v2 target (the `on` field): a fragment string or a specific-resource object. */
export type AnnotationTargetV2 =
  | string
  | {
      full?: string;
      selector?: { '@type'?: string; type?: string; value?: string; chars?: string };
    };

/* -------------------------------------------------------------------------- */
/* seeAlso                                                                     */
/* -------------------------------------------------------------------------- */

/** SeeAlso reference (normalized model == v3). */
export interface SeeAlsoEntryV3 {
  id: string | { url: string; url_label?: string };
  type?: string;
  label?: LocalizedString;
  format?: string;
  profile?: string;
}
export type SeeAlsoEntry = SeeAlsoEntryV3;

/** Raw v2 seeAlso entry. Note `@id` may be a plain URL string OR an object. */
export interface SeeAlsoEntryV2 {
  '@id': string | { url: string; url_label?: string };
  '@type'?: string;
  label?: LocalizedStringV2;
  format?: string;
  profile?: string;
}

/* -------------------------------------------------------------------------- */
/* Annotation                                                                 */
/* -------------------------------------------------------------------------- */

/** IIIF v3 annotation (normalized model). */
export interface AnnotationV3 {
  '@context'?: string | string[];
  id: string;
  type: 'Annotation';
  motivation?: string | string[];
  body: AnnotationBody | AnnotationBody[];
  target: AnnotationTarget | string;
  label?: LocalizedString;
  metadata?: MetadataEntry[];
  seeAlso?: SeeAlsoEntry | SeeAlsoEntry[];
}
export type IIIFAnnotation = AnnotationV3;

/** Raw v2 `oa:Annotation`. */
export interface AnnotationV2 {
  '@context'?: string | string[];
  '@id'?: string;
  '@type'?: 'oa:Annotation' | string;
  motivation?: string | string[];
  /** Single body object or an array of bodies. */
  resource?: AnnotationBodyV2 | AnnotationBodyV2[];
  /** Target: a `<canvasId>#xywh=…` string, a specific-resource object, or an array. */
  on?: AnnotationTargetV2 | AnnotationTargetV2[];
  label?: LocalizedStringV2;
  metadata?: MetadataEntryV2[];
  seeAlso?: SeeAlsoEntryV2 | SeeAlsoEntryV2[];
  [key: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Containers (IIIF names them differently per version)                       */
/* -------------------------------------------------------------------------- */

/** v2 container: `sc:AnnotationList` (resources), vs v3 `AnnotationPage` (items). */
export interface AnnotationListV2 {
  '@type'?: 'sc:AnnotationList';
  '@id'?: string;
  '@context'?: string | string[];
  label?: LocalizedStringV2;
  resources: AnnotationV2[];
  within?: unknown;
}

/** v3 container: `AnnotationPage` (items), vs v2 `sc:AnnotationList` (resources). */
export interface AnnotationPageV3 {
  id?: string;
  type?: 'AnnotationPage';
  items: AnnotationV3[];
}

/* -------------------------------------------------------------------------- */
/* Type guards / helpers (normalized model only)                              */
/* -------------------------------------------------------------------------- */

export function isManifestBody(body: AnnotationBody): body is ManifestBody {
  return body.type === 'Manifest';
}

export function isDatasetBody(body: AnnotationBody): body is DatasetBody {
  return body.type === 'Dataset';
}

export function isTextualBody(body: AnnotationBody): body is TextualBody {
  return body.type === 'TextualBody';
}

export function isSpecificResourceBody(body: AnnotationBody): body is SpecificResourceBody {
  return body.type === 'SpecificResource';
}

export function isChoiceBody(body: AnnotationBody): body is ChoiceBody {
  return body.type === 'Choice' && Array.isArray((body as ChoiceBody).items);
}

/** Purposes of a body, keeping only strings (producer data is untrusted). */
export function stringPurposes(body: { purpose?: unknown }): string[] {
  return [body.purpose ?? []].flat().filter((p): p is string => typeof p === 'string' && p !== '');
}

/** A SpecificResource whose purpose includes `linking` (a pointer to another resource, e.g. evidence). */
export function isLinkingBody(body: AnnotationBody): body is SpecificResourceBody {
  return isSpecificResourceBody(body) && stringPurposes(body).includes('linking');
}

/** BCP47 language tags of a body: `language` may be a string or an array; other values are ignored. */
export function stringLanguages(body: object): string[] {
  return [(body as { language?: unknown }).language ?? []].flat().filter((l): l is string => typeof l === 'string' && l !== '');
}

/** Id of a SpecificResource's source, whether `source` is a string or an object. */
export function srSourceId(body: SpecificResourceBody): string {
  const { source } = body;
  if (typeof source === 'string') return source;
  return typeof source?.id === 'string' ? source.id : '';
}

/** Label of a SpecificResource: its own, else its source's. */
export function srLabel(body: SpecificResourceBody): LocalizedString | undefined {
  if (body.label) return body.label;
  const { source } = body;
  return typeof source === 'object' && source ? source.label : undefined;
}

/** Helper to normalize body to array (absent bodies give an empty list) */
export function normalizeBody(body: AnnotationBody | AnnotationBody[] | null | undefined): AnnotationBody[] {
  if (body == null) return [];
  return Array.isArray(body) ? body : [body];
}
