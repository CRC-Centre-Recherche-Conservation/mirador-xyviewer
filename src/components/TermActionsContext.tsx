/**
 * TermActionsContext
 * What a term chip can do beyond opening its vocabulary: filter the canvas by it and highlight
 * the annotations carrying it. The annotation plugin provides it; without a provider chips only
 * offer the vocabulary link.
 */

import { createContext, useContext } from 'react';
import type { Term } from '../utils/classificationModel';
import type { TermChipAction } from './TermChip';

/** Which filter group a term belongs to. */
export interface TermFacetRef {
  /** Purpose(s) the term may have been read under; the first that has the term as a facet wins. */
  purpose: string | string[];
  /** Sub-group of `describing` terms. */
  group?: string;
}

export interface TermActionsValue {
  /** Menu entries for a term; empty when it is not a facet of the canvas. */
  actionsFor: (term: Term, facet: TermFacetRef) => TermChipAction[];
  /** Whether the canvas is filtered by this term. */
  isFiltering: (term: Term, facet: TermFacetRef) => boolean;
  /** State added to a filtering chip's accessible name. */
  filterActiveLabel?: string;
}

export const TermActionsContext = createContext<TermActionsValue | null>(null);

export const useTermActions = (): TermActionsValue | null => useContext(TermActionsContext);
