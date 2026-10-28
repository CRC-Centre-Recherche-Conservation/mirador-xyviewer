/**
 * Default UI strings of the annotation cards (English); hosts override them through
 * the `labels` of `config.scientificAnnotations`.
 */

import type { AnnotationBodyLabels } from '../types/mirador';

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
