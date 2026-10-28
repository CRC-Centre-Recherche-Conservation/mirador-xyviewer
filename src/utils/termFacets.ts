/**
 * Controlled terms of an annotation (W3C `SpecificResource` bodies) as filter facets.
 * Only SpecificResource bodies are read: text bodies are prose and never faceted.
 */

import type { AnnotationBody, LocalizedString, SpecificResourceBody } from '../types/iiif';
import {
  isChoiceBody,
  isCompositeBody,
  isIndependentsBody,
  isListBody,
  isSpecificResourceBody,
  srLabel,
  srSourceId,
  stringPurposes,
} from '../types/iiif';
import { getLocalizedString } from './localization';

/** Purposes that become filter groups, in display order. */
export const FACET_PURPOSES = ['classifying', 'identifying', 'assessing', 'describing', 'tagging'] as const;
export type FacetPurpose = (typeof FACET_PURPOSES)[number];

export interface BodyFacet {
  purpose: FacetPurpose;
  /** Sub-group of `describing` terms (enclosing Composite label, else the source's scheme). */
  groupName?: string;
  /** Source URI: the language-independent key of the term. */
  uri: string;
  label: string;
}

const MAX_DEPTH = 4;
/** Facets read per annotation: remote JSON is untrusted. */
const MAX_FACETS = 500;

/** Last path or fragment segment of an IRI, decoded. */
export const lastSegment = (iri: string): string => {
  const seg = iri.replace(/[/#]+$/, '').split(/[/#]/).pop() ?? iri;
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
};

/** Display name of a concept scheme the source declares (`inScheme`), if any. */
export function schemeName(body: SpecificResourceBody, prefs: string[]): string | undefined {
  const source = body.source as { inScheme?: unknown };
  const scheme = typeof source === 'object' && source ? source.inScheme : undefined;
  const first = Array.isArray(scheme) ? scheme[0] : scheme;
  const label = first && typeof first === 'object' ? (first as { label?: LocalizedString }).label : undefined;
  return label ? getLocalizedString(label, prefs) || undefined : undefined;
}

/** Facetable terms of a body tree, in source order (Choice, Composite, List and Independents included). */
export function extractBodyFacets(body: unknown, prefs: string[]): BodyFacet[] {
  const out: BodyFacet[] = [];

  function walk(bodies: unknown, depth: number, group?: string): void {
    for (const b of [bodies ?? []].flat() as AnnotationBody[]) {
      if (out.length >= MAX_FACETS) return;
      if (!b || typeof b !== 'object') continue;
      if (isSpecificResourceBody(b)) {
        const purposes = stringPurposes(b);
        const purpose = FACET_PURPOSES.find((p) => purposes.includes(p));
        const uri = srSourceId(b);
        if (!purpose || !uri) continue;
        out.push({
          purpose,
          ...(purpose === 'describing' ? { groupName: group ?? schemeName(b, prefs) } : {}),
          uri,
          label: getLocalizedString(srLabel(b), prefs) || lastSegment(uri),
        });
      } else if (depth < MAX_DEPTH) {
        if (isCompositeBody(b)) walk(b.items, depth + 1, getLocalizedString(b.label, prefs) || group);
        else if (isChoiceBody(b) || isListBody(b) || isIndependentsBody(b)) walk(b.items, depth + 1, group);
      }
    }
  }

  walk(body, 0);
  return out;
}
