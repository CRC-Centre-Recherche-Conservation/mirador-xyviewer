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

/** Base body interface */
interface BaseBody {
  id?: string;
  format?: string;
  label?: LocalizedString;
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
}

/** Case 3: TextualBody - static text content */
export interface TextualBody extends BaseBody {
  type: 'TextualBody';
  value: string;
  format?: 'text/plain' | 'text/html' | string;
  language?: string;
}

/** Union of all supported body types (normalized model == v3). */
export type AnnotationBodyV3 = ManifestBody | DatasetBody | TextualBody;
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
  source?: string;
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

/** Helper to normalize body to array */
export function normalizeBody(body: AnnotationBody | AnnotationBody[]): AnnotationBody[] {
  return Array.isArray(body) ? body : [body];
}
