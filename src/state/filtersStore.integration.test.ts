/**
 * Facets from annotation bodies, with the real ManuSpectrum page of Paris Mazarine Ms 416
 * f. 009: 2 characterizations (lapis lazuli + lead white, red lead) citing 8 of the 14 analyses.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { filtersStore } from './filtersStore';
import { extractAnnotationsWithMetadata } from '../plugin/MetadataFiltersPlugin';
import { normalizeAnnotationResources } from '../utils/annotationNormalizer';
import characterizations from '../test/fixtures/annotations/manuspectrum-characterizations-page.json';
import analyses from '../test/fixtures/annotations/manuspectrum-analyses-page.json';
import type { IIIFAnnotation } from '../types/iiif';

const W = 'w';
const C = 'canvas';
const CLASSES = 'body:classifying';
const LAPIS = 'https://thesaurus.inha.fr/thesaurus/resource/ark:/54721/6063f3af-bd04-45e4-b30c-2240ae73d2ff';

const resources = normalizeAnnotationResources({
  chars: { json: characterizations },
  analyses: { json: analyses },
});
const annotations = extractAnnotationsWithMetadata(resources);
const [lapisChar, redLeadChar] = characterizations.items as unknown as IIIFAnnotation[];
const linkedTo = (a: IIIFAnnotation) =>
  (a.body as Array<{ purpose?: string; source?: { id: string } }>)
    .filter((b) => b.purpose === 'linking')
    .map((b) => b.source!.id);
const lapisLinked = linkedTo(lapisChar);

/** Group "Classified as" with only `keep` selected. */
function filterClasses(keep: string) {
  filtersStore.deselectAll(W, C, CLASSES);
  filtersStore.toggleFacet(W, C, CLASSES, keep);
}

beforeEach(() => {
  filtersStore.clearFilters(W, C);
  filtersStore.initializeFromAnnotations(W, C, annotations, false, ['en']);
});

describe('facets of the f. 009 page', () => {
  it('builds the body groups, keyed by term URI, before any metadata', () => {
    const keys = filtersStore.getGroups(W, C).map((g) => g.key);
    expect(keys).toEqual(expect.arrayContaining([CLASSES, 'body:assessing', 'body:describing', 'meta:technique']));
    const classes = filtersStore.getGroups(W, C).find((g) => g.key === CLASSES)!;
    expect(classes.label).toBe('Classified as');
    expect(classes.values.get(LAPIS)?.displayText).toBe('lapis lazuli');
  });

  it('keys the terms by URI whatever the reader language', () => {
    filtersStore.initializeFromAnnotations(W, C, annotations, false, ['fr']);
    const classes = filtersStore.getGroups(W, C).find((g) => g.key === CLASSES)!;
    expect(classes.values.get(LAPIS)?.displayText).toBe('lapis-lazuli');
  });

  it('counts the carriers and, with the switch on, the annotations linked to them', () => {
    const classes = filtersStore.getGroups(W, C).find((g) => g.key === CLASSES)!;
    expect(classes.appliesTo).toBe(2);
    expect(classes.appliesToLinked).toBe(8);
    const lapis = classes.values.get(LAPIS)!;
    expect([lapis.count, lapis.linkedCount]).toEqual([1, 5]);
    // The 6 analyses nobody cites are counted under "None".
    expect(classes.values.get('\u0000none')?.count).toBe(6);
  });

  it('keeps the characterization and its 5 linked analyses when filtering by lapis lazuli', () => {
    filterClasses(LAPIS);
    const hidden = filtersStore.getHiddenAnnotationIds(W, C);
    const visible = annotations.map((a) => a.id).filter((id) => !hidden.has(id));
    expect(visible.sort()).toEqual([lapisChar.id, ...lapisLinked].sort());
    expect(hidden.size).toBe(16 - 6);
    expect(hidden.has(redLeadChar.id)).toBe(true);
  });

  it('tells why a linked analysis is shown', () => {
    filterClasses(LAPIS);
    const because = filtersStore.getShownBecauseLinked(W, C);
    expect(because.get(lapisLinked[0])).toEqual([lapisChar.id]);
    expect(because.has(lapisChar.id)).toBe(false);
  });

  it('filters only the characterizations when the switch is off', () => {
    filtersStore.setInheritLinked(W, C, false);
    filterClasses(LAPIS);
    const hidden = filtersStore.getHiddenAnnotationIds(W, C);
    expect([...hidden]).toEqual([redLeadChar.id]);
    const classes = filtersStore.getGroups(W, C).find((g) => g.key === CLASSES)!;
    expect(classes.values.get('\u0000none')).toBeUndefined();
    expect(classes.appliesToLinked).toBe(0);
  });

  it('never lets a technique filter touch a characterization', () => {
    const technique = filtersStore.getGroups(W, C).find((g) => g.key === 'meta:technique')!;
    filtersStore.deselectAll(W, C, 'meta:technique');
    filtersStore.updateHiddenAnnotations(W, C, annotations);
    const hidden = filtersStore.getHiddenAnnotationIds(W, C);
    expect(hidden.has(lapisChar.id)).toBe(false);
    expect(hidden.has(redLeadChar.id)).toBe(false);
    expect(hidden.size).toBe(14);
    expect(technique.appliesTo).toBe(14);
  });

  it('does not inherit assessments', () => {
    const assessing = filtersStore.getGroups(W, C).find((g) => g.key === 'body:assessing')!;
    expect(assessing.inherits).toBe(false);
    expect(assessing.appliesTo).toBe(2);
    expect(assessing.values.get('\u0000none')).toBeUndefined();
    const [first] = [...assessing.values.values()];
    filtersStore.deselectAll(W, C, 'body:assessing');
    filtersStore.toggleFacet(W, C, 'body:assessing', first.key);
    const hidden = filtersStore.getHiddenAnnotationIds(W, C);
    // Only characterizations can be hidden by an assessment.
    expect([...hidden].every((id) => [lapisChar.id, redLeadChar.id].includes(id))).toBe(true);
  });

  it('filters by one term from a chip menu and clears it on a second use', () => {
    filtersStore.toggleFacet(W, C, CLASSES, LAPIS, 'only');
    expect(filtersStore.isFacetActive(W, C, CLASSES, LAPIS)).toBe(true);
    expect(filtersStore.getHiddenAnnotationIds(W, C).size).toBe(10);
    filtersStore.toggleFacet(W, C, CLASSES, LAPIS, 'only');
    expect(filtersStore.isFacetActive(W, C, CLASSES, LAPIS)).toBe(false);
    expect(filtersStore.getHiddenAnnotationIds(W, C).size).toBe(0);
  });

  it('lists the annotations carrying a term themselves', () => {
    expect(filtersStore.getAnnotationIdsWithValue(W, C, CLASSES, LAPIS)).toEqual([lapisChar.id]);
  });

  it('can leave a group out', () => {
    filtersStore.initializeFromAnnotations(W, C, annotations, false, ['en'], {
      hiddenGroups: ['Identified materials', 'assessing'],
    });
    const keys = filtersStore.getGroups(W, C).map((g) => g.key);
    expect(keys).not.toContain('identified_materials');
    expect(keys).not.toContain('body:assessing');
    expect(keys).toContain(CLASSES);
  });
});
