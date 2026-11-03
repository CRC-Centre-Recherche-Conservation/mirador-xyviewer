/**
 * EvidenceLinkBody
 * @deprecated Use {@link LinkedAnnotationList}. Thin wrapper kept for existing imports: it
 * renders the same named rows for `linking` SpecificResource bodies.
 */

import React from 'react';
import type { SpecificResourceBody as SpecificResourceBodyType } from '../types/iiif';
import { LinkedAnnotationList } from './LinkedAnnotationList';

export { resolveLinkedAnnotationId } from '../utils/linkIndex';

export interface EvidenceLinkBodyProps {
  /** Linking SpecificResource bodies to show as one block. */
  bodies: SpecificResourceBodyType[];
  /** Mirador window the annotation belongs to. */
  windowId?: string;
  /** Mirador `selectAnnotation(windowId, annotationId)`. */
  selectAnnotation?: (windowId: string, annotationId: string) => void;
  /** Ids of the annotations on the current canvas. */
  canvasAnnotationIds?: Iterable<string>;
  /** Caption of the block (default "Linked annotations"). */
  label?: string;
  /** Reason shown on a row whose annotation is not available. */
  unavailableLabel?: string;
}

/** @deprecated Use {@link LinkedAnnotationList}. */
export const EvidenceLinkBody: React.FC<EvidenceLinkBodyProps> = ({
  bodies,
  windowId,
  selectAnnotation,
  canvasAnnotationIds,
  label,
  unavailableLabel,
}) => (
  <LinkedAnnotationList
    bodies={bodies}
    windowId={windowId}
    selectAnnotation={selectAnnotation}
    canvasAnnotationIds={canvasAnnotationIds}
    labels={{ linkedAnnotations: label, linkUnavailable: unavailableLabel }}
  />
);

export default EvidenceLinkBody;
