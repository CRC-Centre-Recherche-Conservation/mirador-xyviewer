import { describe, it, expect, beforeEach } from 'vitest';
import { filtersStore, hasFacets, facetGroupKey, NONE_KEY } from './filtersStore';

const W = 'w-facets';
const C = 'c1';
const term = (purpose: string, uri: string, en: string, fr = en) => ({
  type: 'SpecificResource',
  purpose,
  source: uri,
  label: { en: [en], fr: [fr] },
});
const link = (id: string) => ({ type: 'SpecificResource', purpose: 'linking', source: { id, type: 'Annotation' } });
const meta = (label: string, value: string | string[]) => ({ label: { en: [label] }, value: { en: [value].flat() } });
const CLASS = facetGroupKey('classifying');

// A cites B; C cites D; E stands alone; T is only text.
const A = { id: 'A', body: [term('classifying', 'u:lapis', 'lapis'), term('classifying', 'u:white', 'lead white'), term('assessing', 'u:high', 'High'), link('B')] };
const B = { id: 'B', metadata: [meta('Technique', 'Raman')] };
const C2 = { id: 'C', body: [term('classifying', 'u:red', 'red lead'), link('D')] };
const D = { id: 'D', metadata: [meta('Technique', 'XRF')] };
const E = { id: 'E', metadata: [meta('Technique', 'XRF')] };
const T = { id: 'T', body: [{ type: 'TextualBody', purpose: 'classifying', value: 'only prose' }] };
const all = [A, B, C2, D, E, T];

beforeEach(() => {
  filtersStore.clearFilters(W, C);
});

describe('hasFacets', () => {
  it('is true for metadata or a controlled body term, false for the rest', () => {
    expect(hasFacets(B)).toBe(true);
    expect(hasFacets(A)).toBe(true);
    expect(hasFacets(T)).toBe(false);
    expect(hasFacets({ metadata: [] })).toBe(false);
    expect(hasFacets({})).toBe(false);
  });
});

describe('body facets', () => {
  it('never facets text bodies and leaves annotations without facets outside filtering', () => {
    filtersStore.initializeFromAnnotations(W, C, all, false, ['en']);
    expect(filtersStore.getGroups(W, C).flatMap((g) => [...g.values.keys()])).not.toContain('only prose');
    filtersStore.deselectAll(W, C, CLASS);
    filtersStore.deselectAll(W, C, 'meta:technique');
    const hidden = filtersStore.updateHiddenAnnotations(W, C, all);
    expect(hidden.has('T')).toBe(false);
    expect(filtersStore.getStats(W, C).filterable).toBe(5);
  });

  it('captions the groups with the labels config and the purposes override', () => {
    filtersStore.initializeFromAnnotations(W, C, all, false, ['en'], {
      labels: { classifiedAs: 'Materials', purposes: { assessing: 'Certainty' } },
    });
    const label = (key: string) => filtersStore.getGroups(W, C).find((g) => g.key === key)?.label;
    expect(label(CLASS)).toBe('Materials');
    expect(label('body:assessing')).toBe('Certainty');
  });

  it('shows no sub-group name for classifying and names describing sub-groups', () => {
    const annotations = [
      {
        id: 'X',
        body: [
          { type: 'Composite', label: { en: ['Colour'] }, items: [term('describing', 'u:blue', 'Blue')] },
          { type: 'Composite', label: { en: ['Layer'] }, items: [term('describing', 'u:ink', 'Ink')] },
        ],
      },
      { id: 'Y', body: [{ type: 'Composite', label: { en: ['Colour'] }, items: [term('describing', 'u:red', 'Red')] }] },
    ];
    filtersStore.initializeFromAnnotations(W, C, annotations, false, ['en']);
    const groups = filtersStore.getGroups(W, C);
    expect(groups.map((g) => g.label).sort()).toEqual(['Colour', 'Layer']);
    // Y carries describing terms but no layer: it is not in the Layer population.
    const layer = groups.find((g) => g.label === 'Layer')!;
    expect(layer.values.get(NONE_KEY)).toBeUndefined();
    expect(filtersStore.getHiddenAnnotationIds(W, C).size).toBe(0);
  });

  it('keeps an annotation with one selected value among several', () => {
    filtersStore.initializeFromAnnotations(W, C, all, false, ['en']);
    filtersStore.setInheritLinked(W, C, false);
    filtersStore.toggleFacet(W, C, CLASS, 'u:lapis', 'only');
    expect(filtersStore.getHiddenAnnotationIds(W, C)).toEqual(new Set(['C']));
  });
});

describe('populations', () => {
  it('tests a metadata group only on annotations with metadata', () => {
    filtersStore.initializeFromAnnotations(W, C, all, false, ['en']);
    filtersStore.toggleFacet(W, C, 'meta:technique', 'xrf', 'only');
    expect(filtersStore.getHiddenAnnotationIds(W, C)).toEqual(new Set(['B']));
  });

  it('counts None only inside the population', () => {
    filtersStore.initializeFromAnnotations(W, C, [A, B, { id: 'M', metadata: [meta('Other', 'x')] }], false, ['en']);
    const technique = filtersStore.getGroups(W, C).find((g) => g.key === 'meta:technique')!;
    expect(technique.values.get(NONE_KEY)?.count).toBe(1); // M only; A has no metadata
    const assessing = filtersStore.getGroups(W, C).find((g) => g.key === 'body:assessing')!;
    expect(assessing.values.has(NONE_KEY)).toBe(false);
  });

  it('gives one facet value per entry of a multi-valued metadata, never splitting strings', () => {
    const annotations = [
      { id: 'P', metadata: [meta('Materials', ['lapis lazuli', 'lead white'])] },
      { id: 'Q', metadata: [meta('Materials', 'red lead, vermilion')] },
    ];
    filtersStore.initializeFromAnnotations(W, C, annotations, false, ['en']);
    const group = filtersStore.getGroups(W, C)[0];
    expect([...group.values.values()].map((v) => v.displayText)).toEqual([
      'lapis lazuli',
      'lead white',
      'red lead, vermilion',
    ]);
  });

  it('can leave groups out by metadata label, caption or purpose', () => {
    filtersStore.initializeFromAnnotations(W, C, all, false, ['en'], { hiddenGroups: ['technique', 'Classified as'] });
    expect(filtersStore.getGroups(W, C).map((g) => g.key)).toEqual(['body:assessing']);
    // E has only hidden facets: outside filtering.
    expect(filtersStore.getStats(W, C).filterable).toBe(1);
    filtersStore.initializeFromAnnotations(W, C, all, false, ['en'], { hiddenGroups: ['assessing'] });
    expect(filtersStore.getGroups(W, C).map((g) => g.key)).not.toContain('body:assessing');
  });
});

describe('apply to linked annotations', () => {
  beforeEach(() => filtersStore.initializeFromAnnotations(W, C, all, false, ['en']));

  it('is on by default and extends the class groups to the filterable annotations', () => {
    expect(filtersStore.getInheritLinked(W, C)).toBe(true);
    const group = filtersStore.getGroups(W, C).find((g) => g.key === CLASS)!;
    expect(group.inherits).toBe(true);
    expect([group.appliesTo, group.appliesToLinked]).toEqual([2, 2]);
    expect(group.values.get('u:lapis')).toMatchObject({ count: 1, linkedCount: 1 });
    expect(group.values.get(NONE_KEY)?.count).toBe(1); // E
  });

  it('keeps the carrier and what it links to, hides the rest', () => {
    filtersStore.toggleFacet(W, C, CLASS, 'u:lapis', 'only');
    expect(filtersStore.getHiddenAnnotationIds(W, C)).toEqual(new Set(['C', 'D', 'E']));
    const lapis = filtersStore.getGroups(W, C).find((g) => g.key === CLASS)!.values.get('u:lapis')!;
    expect([lapis.visibleCount, lapis.visibleLinkedCount]).toEqual([1, 1]);
    expect(filtersStore.getShownBecauseLinked(W, C).get('B')).toEqual(['A']);
  });

  it('follows one hop only', () => {
    const chain = [
      A,
      { id: 'B', metadata: [meta('Technique', 'Raman')], body: [link('F')] },
      { id: 'F', metadata: [meta('Technique', 'XRF')] },
    ];
    filtersStore.initializeFromAnnotations(W, C, chain, true, ['en']);
    filtersStore.toggleFacet(W, C, CLASS, 'u:lapis', 'only');
    expect(filtersStore.getHiddenAnnotationIds(W, C)).toEqual(new Set(['F']));
  });

  it('does not inherit in the other direction', () => {
    const back = [{ id: 'S', body: [term('classifying', 'u:s', 's')] }, { id: 'R', metadata: [meta('Technique', 'x')], body: [link('S')] }];
    filtersStore.initializeFromAnnotations(W, C, back, true, ['en']);
    filtersStore.toggleFacet(W, C, CLASS, 'u:s', 'only');
    // R cites S but carries no class: it is not kept by S's value.
    expect(filtersStore.getHiddenAnnotationIds(W, C)).toEqual(new Set(['R']));
  });

  it('filters only the carriers when switched off', () => {
    filtersStore.setInheritLinked(W, C, false);
    filtersStore.toggleFacet(W, C, CLASS, 'u:lapis', 'only');
    expect(filtersStore.getHiddenAnnotationIds(W, C)).toEqual(new Set(['C']));
    const group = filtersStore.getGroups(W, C).find((g) => g.key === CLASS)!;
    expect([group.appliesTo, group.appliesToLinked]).toEqual([2, 0]);
    expect(group.values.has(NONE_KEY)).toBe(false);
    // Turned on after the filter was set: the annotations nobody cites are not selected by it.
    filtersStore.setInheritLinked(W, C, true);
    expect(filtersStore.getHiddenAnnotationIds(W, C)).toEqual(new Set(['C', 'D']));
  });

  it('remembers a deselected None across the switch', () => {
    filtersStore.toggleFacet(W, C, CLASS, 'u:lapis', 'only');
    filtersStore.setInheritLinked(W, C, false);
    filtersStore.setInheritLinked(W, C, true);
    expect(filtersStore.getHiddenAnnotationIds(W, C)).toEqual(new Set(['C', 'D', 'E']));
  });

  it('folds #target-N ids to the annotation the body cites', () => {
    const multi = [
      { id: 'A', body: [term('classifying', 'u:lapis', 'lapis'), link('B')] },
      { id: 'B#target-1', metadata: [meta('Technique', 'Raman')] },
      { id: 'B#target-2', metadata: [meta('Technique', 'Raman')] },
      { id: 'Z', metadata: [meta('Technique', 'XRF')] },
    ];
    filtersStore.initializeFromAnnotations(W, C, multi, true, ['en']);
    filtersStore.toggleFacet(W, C, CLASS, 'u:lapis', 'only');
    expect(filtersStore.getHiddenAnnotationIds(W, C)).toEqual(new Set(['Z']));
  });

  it('is not shown as a reason when no filter is active', () => {
    expect(filtersStore.getShownBecauseLinked(W, C).size).toBe(0);
  });
});

describe('toggleFacet', () => {
  beforeEach(() => filtersStore.initializeFromAnnotations(W, C, all, false, ['en']));

  it('toggles one value and notifies the change of the hidden set', () => {
    const events: string[] = [];
    const off = filtersStore.subscribe((e) => events.push(e.type));
    filtersStore.setInheritLinked(W, C, false);
    filtersStore.toggleFacet(W, C, 'meta:technique', 'xrf');
    off();
    expect(filtersStore.getHiddenAnnotationIds(W, C)).toEqual(new Set(['D', 'E']));
    expect(events).toEqual(['update-hidden', 'update-hidden']);
    filtersStore.toggleFacet(W, C, 'meta:technique', 'xrf');
    expect(filtersStore.getHiddenAnnotationIds(W, C).size).toBe(0);
  });

  it('ignores unknown groups and values', () => {
    expect(filtersStore.toggleFacet(W, C, 'nope', 'x').size).toBe(0);
    expect(filtersStore.toggleFacet(W, C, 'meta:technique', 'nope').size).toBe(0);
    expect(filtersStore.hasFacet(W, C, 'meta:technique', 'xrf')).toBe(true);
    expect(filtersStore.hasFacet(W, C, 'meta:technique', 'nope')).toBe(false);
  });

  it('resets everything, counts included', () => {
    filtersStore.toggleFacet(W, C, CLASS, 'u:lapis', 'only');
    filtersStore.resetAll(W, C);
    expect(filtersStore.getHiddenAnnotationIds(W, C).size).toBe(0);
    const group = filtersStore.getGroups(W, C).find((g) => g.key === CLASS)!;
    expect(group.values.get('u:red')?.visibleCount).toBe(1);
  });
});

describe('review regressions', () => {
  it('caps groups and values of an untrusted page', async () => {
    const { MAX_GROUPS, MAX_VALUES_PER_GROUP } = await import('./filtersStore');
    const many = Array.from({ length: MAX_GROUPS + 40 }, (_, i) => ({
      id: `g${i}`,
      body: [{ type: 'Composite', label: { en: [`Scheme ${i}`] }, items: [term('describing', `u:t${i}`, `T${i}`)] }],
    }));
    filtersStore.initializeFromAnnotations(W, C, many, false, ['en']);
    expect(filtersStore.getGroups(W, C).length).toBe(MAX_GROUPS);

    const values = Array.from({ length: MAX_VALUES_PER_GROUP + 30 }, (_, i) => ({ id: `v${i}`, metadata: [meta('Big', `val ${i}`)] }));
    filtersStore.initializeFromAnnotations(W, C, values, true, ['en']);
    const big = filtersStore.getGroups(W, C)[0];
    expect([...big.values.keys()].filter((k) => k !== NONE_KEY).length).toBe(MAX_VALUES_PER_GROUP);
  });

  it('limits a describing sub-group to the annotations carrying it', () => {
    const sub = (label: string, uri: string) => ({ type: 'Composite', label: { en: [label] }, items: [term('describing', uri, uri)] });
    filtersStore.initializeFromAnnotations(W, C, [{ id: 'a', body: [sub('Colour', 'u:blue')] }, { id: 'b', body: [sub('Layer', 'u:ink')] }], false, ['en']);
    for (const g of filtersStore.getGroups(W, C)) expect(g.values.get(NONE_KEY)).toBeUndefined();
  });

  it('keeps metadata and body group keys apart, and real values apart from None', () => {
    const annotations = [
      { id: 'a', metadata: [meta('Body:Classifying', 'x'), meta('Kind', '__none__')] },
      { id: 'b', body: [term('classifying', 'u:lapis', 'lapis')] },
    ];
    filtersStore.initializeFromAnnotations(W, C, annotations, false, ['en']);
    const groups = filtersStore.getGroups(W, C);
    expect(groups.find((g) => g.key === CLASS)?.kind).toBe('body');
    expect(groups.find((g) => g.label === 'Body:Classifying')?.kind).toBe('metadata');
    const kind = groups.find((g) => g.label === 'Kind')!;
    expect(kind.values.get('__none__')?.count).toBe(1);
  });

  it('is filtering by a term only when it is the single selected value', () => {
    filtersStore.initializeFromAnnotations(W, C, all, false, ['en']);
    filtersStore.toggleFacet(W, C, CLASS, 'u:white');
    expect(filtersStore.isFacetActive(W, C, CLASS, 'u:lapis')).toBe(false);
    filtersStore.toggleFacet(W, C, CLASS, 'u:lapis', 'only');
    expect(filtersStore.isFacetActive(W, C, CLASS, 'u:lapis')).toBe(true);
    expect(filtersStore.isFacetActive(W, C, CLASS, 'u:red')).toBe(false);
  });

  it('is not filtering when the group has a single value', () => {
    filtersStore.initializeFromAnnotations(W, C, [{ id: 'a', body: [term('classifying', 'u:lapis', 'lapis')] }], false, ['en']);
    expect(filtersStore.isFacetActive(W, C, CLASS, 'u:lapis')).toBe(false);
    filtersStore.toggleFacet(W, C, CLASS, 'u:lapis', 'only');
    expect(filtersStore.getHiddenAnnotationIds(W, C).size).toBe(0);
    expect(filtersStore.isFacetActive(W, C, CLASS, 'u:lapis')).toBe(false);
  });

  it('lists a multi-target carrier once in shownBecause', () => {
    const carrier = (id: string) => ({ id, body: [term('classifying', 'u:lapis', 'lapis'), link('B')] });
    filtersStore.initializeFromAnnotations(W, C, [carrier('A#target-1'), carrier('A#target-2'), { id: 'B', metadata: [meta('Technique', 'Raman')] }, { id: 'Z', body: [term('classifying', 'u:red', 'red')] }], false, ['en']);
    filtersStore.toggleFacet(W, C, CLASS, 'u:lapis', 'only');
    expect(filtersStore.getShownBecauseLinked(W, C).get('B')).toEqual(['A#target-1']);
  });
});
