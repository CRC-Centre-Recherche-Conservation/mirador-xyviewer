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
  return out;
}
