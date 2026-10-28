/**
 * Default UI strings of the annotation cards (English); hosts override them through
 * the `labels` of `config.scientificAnnotations`.
 */

import type { AnnotationBodyLabels } from '../types/mirador';
import type { FacetPurpose } from './termFacets';

type StringLabelKey = Exclude<keyof AnnotationBodyLabels, 'purposes'>;

export const DEFAULT_ANNOTATION_LABELS: Required<Pick<AnnotationBodyLabels, StringLabelKey>> = {
  evidence: 'Evidence',
  evidenceUnavailable: 'This annotation is not on the current canvas',
  classification: 'Classification',
  identification: 'Identification',
  classifiedAs: 'Classified as',
  identifiedAs: 'Identified as',
  assessment: 'Assessment',
  overallAssessment: 'Overall assessment (see text)',
  description: 'Description',
  tags: 'Tags',
  otherTerms: 'Other terms',
  linkedAnnotations: 'Linked annotations',
  linkOnThisPage: 'on this page',
  linkOnCanvas: 'on {canvas}',
  linkCount: '{n} linked annotations',
  linkCountOne: '1 linked annotation',
  linkUnavailable: 'Not available in this viewer',
  goToPage: 'Go to page',
  hiddenByFilter: '(hidden by filter)',
  showAll: 'Show all',
  backTo: 'Back to {title}',
  selectLinked: 'Select linked annotation {n} of {total}: {details}',
  citedBy: 'Cited by',
  linkNavigationFailed: 'The linked annotation could not be opened',
  fullStatement: 'Full statement',
  openReport: 'Open report',
  openVocabulary: 'Open in vocabulary',
  cardMenu: 'Annotation actions',
  copyAnnotationId: 'Copy annotation id',
  openJson: 'Open JSON',
  untitled: 'Untitled annotation',
  applyToLinked: 'Apply to linked annotations',
  filtersFromContent: 'From annotation content',
  filtersFromMetadata: 'From metadata',
  showMore: 'Show {n} more',
  showFewer: 'Show fewer',
  appliesTo: '{n} annotations',
  appliesToOne: '1 annotation',
  expandGroup: 'Expand {name}',
  collapseGroup: 'Collapse {name}',
  selectAllIn: 'Select all: {name}',
  deselectAllIn: 'Deselect all: {name}',
  plusLinked: '+{n} linked',
  filterNone: 'None',
  shownOf: '{shown} of {total} shown',
  shownBecauseLinked: 'shown because linked to {title}',
  filterBy: 'Filter by {term}',
  removeFilter: 'Remove filter: {term}',
  highlightTerm: 'Highlight annotations with this term',
  filterActive: 'filter active',
  filtersEmpty: 'No metadata available for filtering',
};

/** Keys of {@link AnnotationBodyLabels} holding a plain string. */
export const ANNOTATION_LABEL_KEYS = Object.keys(DEFAULT_ANNOTATION_LABELS) as StringLabelKey[];

/** Host labels over the defaults; non-string values are ignored. */
export function resolveLabels(labels?: AnnotationBodyLabels): typeof DEFAULT_ANNOTATION_LABELS {
  const out = { ...DEFAULT_ANNOTATION_LABELS };
  if (!labels) return out;
  for (const key of ANNOTATION_LABEL_KEYS) {
    const v = labels[key];
    if (typeof v === 'string' && v !== '') out[key] = v;
  }
  // Pre-linking keys still honoured when the new one is not set.
  if (typeof labels.linkedAnnotations !== 'string' || labels.linkedAnnotations === '') {
    if (typeof labels.evidence === 'string' && labels.evidence !== '') out.linkedAnnotations = labels.evidence;
  }
  if (typeof labels.linkUnavailable !== 'string' || labels.linkUnavailable === '') {
    if (typeof labels.evidenceUnavailable === 'string' && labels.evidenceUnavailable !== '') {
      out.linkUnavailable = labels.evidenceUnavailable;
    }
  }
  return out;
}

/** Fills `{name}` placeholders of a label template. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(values, k) ? String(values[k]) : m));
}

/** Caption of a term group (card and filter panel): the host's `purposes` entry, else the label key. */
export function termGroupCaption(labels: AnnotationBodyLabels | undefined, purpose: FacetPurpose): string {
  const own = labels?.purposes;
  if (own && Object.prototype.hasOwnProperty.call(own, purpose) && typeof own[purpose] === 'string') return own[purpose];
  const text = resolveLabels(labels);
  switch (purpose) {
    case 'classifying':
      return text.classifiedAs;
    case 'identifying':
      return text.identifiedAs;
    case 'assessing':
      return text.assessment;
    case 'describing':
      return text.description;
    default:
      return text.tags;
  }
}

const labelsCache = new WeakMap<object, AnnotationBodyLabels>();

/** Drops malformed values (e.g. from an imported workspace); cached per config object to stay referentially stable. */
export function sanitizeLabels(raw: unknown): AnnotationBodyLabels | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const cached = labelsCache.get(raw);
  if (cached) return cached;
  const r = raw as Record<string, unknown>;
  const purposes = r.purposes && typeof r.purposes === 'object' && !Array.isArray(r.purposes)
    ? (r.purposes as Record<string, string>)
    : undefined;
  const clean: AnnotationBodyLabels = { purposes };
  for (const key of ANNOTATION_LABEL_KEYS) clean[key] = typeof r[key] === 'string' ? (r[key] as string) : undefined;
  labelsCache.set(raw, clean);
  return clean;
}
