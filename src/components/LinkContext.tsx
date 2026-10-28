/**
 * LinkContext
 * What linked-annotation rows and "Cited by" need from the viewer: the link index, the
 * annotations of the canvas, and the actions (hover, follow a link, frame all zones). The
 * plugin provides it; without a provider the components fall back to their own props.
 */

import { createContext, useContext } from 'react';
import type { LinkIndex } from '../utils/linkIndex';

export interface LinkTarget {
  /** Id to select, as listed on its canvas. */
  annotationId: string;
  canvasId?: string;
}

export interface LinkContextValue {
  windowId?: string;
  /** Canvas the panel shows. */
  canvasId?: string;
  index: LinkIndex;
  /** Ids of the annotations on the current canvas. */
  canvasAnnotationIds: string[];
  /** Ids hidden by the metadata filter on the current canvas. */
  hiddenIds: Set<string>;
  /** Metadata label whose value is the subtitle of a linked row. */
  subtitleLabel?: string;
  /** Highlights these zones on the canvas (debounced). */
  hover: (ids: string[]) => void;
  /** The annotation and its linked zones present on the canvas. */
  groupOf: (annotationId: string) => string[];
  /** Selects the target, remembering `ownerId` for the back link; changes canvas when needed. */
  follow: (ownerId: string | undefined, to: LinkTarget) => void;
  /** Frames the annotation and its linked zones. */
  showAll: (ownerId: string) => void;
  /** Display title of a loaded annotation. */
  titleOf: (annotationId: string) => string;
}

export const LinkContext = createContext<LinkContextValue | null>(null);

export const useLinkContext = (): LinkContextValue | null => useContext(LinkContext);
