/** Display title of an annotation: its label, else (classification) its terms, else the id tail. */

import type { IIIFAnnotation } from '../types/iiif';
import { buildClassificationView, classificationKind } from './classificationModel';
import { getLocalizedString } from './localization';

export function annotationTitle(resource: IIIFAnnotation | undefined, prefs: string[]): string {
  if (!resource) return '';
  const label = getLocalizedString(resource.label, prefs);
  if (label) return label;
  if (classificationKind(resource.motivation)) {
    const title = buildClassificationView(resource, prefs).title;
    if (title) return title;
  }
  return resource.id ? `…${resource.id.slice(-12)}` : '';
}
