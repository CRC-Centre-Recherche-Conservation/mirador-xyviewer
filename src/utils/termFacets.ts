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
  /** Sub-group of `describing` terms (enclosing Composite label, else the source's scheme, else the host hook). */
  groupName?: string;
  /** Source URI: the language-independent key of the term. */
  uri: string;
  label: string;
}

const MAX_DEPTH = 4;
/** Facets read per annotation: remote JSON is untrusted. */
const MAX_FACETS = 500;

/** Last path or fragment segment of an IRI, undecoded; scanned by hand to stay linear on untrusted input. */
export const rawLastSegment = (iri: string): string => {
  let end = iri.length;
  while (end > 0 && (iri[end - 1] === '/' || iri[end - 1] === '#')) end--;
  let start = end;
  while (start > 0 && iri[start - 1] !== '/' && iri[start - 1] !== '#') start--;
  return iri.slice(start, end);
};

/** Last path or fragment segment of an IRI, decoded. */
export const lastSegment = (iri: string): string => {
  const seg = rawLastSegment(iri);
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
};

/** Host hook naming the group of a descriptive term from its source URI. */
export type PropertyGroupOf = (uri: string) => string | undefined;

/** Config value to hook: anything but a function is ignored. */
export const asPropertyGroupOf = (raw: unknown): PropertyGroupOf | undefined =>
  typeof raw === 'function' ? (raw as PropertyGroupOf) : undefined;

/** Group name from the host hook; a throwing hook or a non-string result gives none. */
export function hostGroupName(hook: PropertyGroupOf | undefined, uri: string): string | undefined {
  if (!hook || !uri) return undefined;
  try {
    const name = hook(uri);
    return typeof name === 'string' && name.trim() ? name.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Display name of a concept scheme the source declares (`inScheme`), if any. */
export function schemeName(body: SpecificResourceBody, prefs: string[]): string | undefined {
  const source = body.source as { inScheme?: unknown };
  const scheme = typeof source === 'object' && source ? source.inScheme : undefined;
  const first = Array.isArray(scheme) ? scheme[0] : scheme;
  const label = first && typeof first === 'object' ? (first as { label?: LocalizedString }).label : undefined;
  return label ? getLocalizedString(label, prefs) || undefined : undefined;
}

/** Facetable terms of a body tree, in source order (Choice, Composite, List and Independents included). */
export function extractBodyFacets(body: unknown, prefs: string[], propertyGroupOf?: PropertyGroupOf): BodyFacet[] {
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
          ...(purpose === 'describing' ? { groupName: group ?? schemeName(b, prefs) ?? hostGroupName(propertyGroupOf, uri) } : {}),
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
