/**
 * IIIF Presentation API v3 Types for Scientific Annotations
 */

/** Localized string as per IIIF v3 */
export interface LocalizedString {
  [language: string]: string[];
}

/** Metadata entry for IIIF resources */
export interface MetadataEntry {
  label: LocalizedString;
  value: LocalizedString;
}

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

/** Union type for all supported body types */
export type AnnotationBody = ManifestBody | DatasetBody | TextualBody;

/** Annotation target (simplified) */
export interface AnnotationTarget {
  id?: string;
  type?: string;
  source?: string;
  selector?: unknown;
}

/** SeeAlso reference to external resources */
export interface SeeAlsoEntry {
  id: string;
  type?: string;
  label?: LocalizedString;
  format?: string;
  profile?: string;
}

/** IIIF v3 Annotation */
export interface IIIFAnnotation {
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

/** Type guards */
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
