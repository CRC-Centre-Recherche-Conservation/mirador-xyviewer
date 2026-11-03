import { describe, it, expect } from 'vitest';
import { asPropertyGroupOf, extractBodyFacets, lastSegment } from './termFacets';

const sr = (purpose: string | string[], source: unknown, label?: unknown) => ({
  type: 'SpecificResource',
  purpose,
  source,
  ...(label ? { label } : {}),
});

describe('asPropertyGroupOf', () => {
  it('keeps a function and drops anything else', () => {
    const fn = () => 'x';
    expect(asPropertyGroupOf(fn)).toBe(fn);
    expect(asPropertyGroupOf('x')).toBeUndefined();
    expect(asPropertyGroupOf(undefined)).toBeUndefined();
  });
});

describe('extractBodyFacets', () => {
  it('reads the controlled terms of the five facet purposes, keyed by source URI', () => {
    const facets = extractBodyFacets(
      [
        sr('classifying', 'http://v/blue', { en: ['blue'], fr: ['bleu'] }),
        sr('identifying', { id: 'http://v/lapis', label: { en: ['lapis'] } }),
        sr('assessing', 'http://v/reliable', { en: ['Reliable'] }),
        sr('describing', 'http://v/layer', { en: ['Layer'] }),
        sr('tagging', 'http://v/tag', { en: ['tag'] }),
      ],
      ['fr'],
    );
    expect(facets.map((f) => [f.purpose, f.uri, f.label])).toEqual([
      ['classifying', 'http://v/blue', 'bleu'],
      ['identifying', 'http://v/lapis', 'lapis'],
      ['assessing', 'http://v/reliable', 'Reliable'],
      ['describing', 'http://v/layer', 'Layer'],
      ['tagging', 'http://v/tag', 'tag'],
    ]);
  });

  it('never facets text bodies, linking bodies or terms without URI', () => {
    expect(
      extractBodyFacets(
        [
          { type: 'TextualBody', purpose: 'classifying', value: 'prose' },
          sr('linking', 'http://v/annotation/1'),
          sr('classifying', ''),
          { type: 'Dataset', id: 'http://v/data.csv' },
        ],
        ['en'],
      ),
    ).toEqual([]);
  });

  it('falls back to the last segment of the URI for a label', () => {
    expect(extractBodyFacets(sr('tagging', 'http://v/terms/red%20lead'), ['en'])[0].label).toBe('red lead');
    expect(lastSegment('http://v/a/b/')).toBe('b');
    expect(lastSegment('http://v/a#frag')).toBe('frag');
    expect(lastSegment('http://v/a/b#/#')).toBe('b');
    expect(lastSegment('#'.repeat(50000))).toBe('');
  });

  it('names describing sub-groups after the Composite, else the concept scheme', () => {
    const facets = extractBodyFacets(
      [
        { type: 'Composite', label: { en: ['Colour'] }, items: [sr('describing', 'http://v/blue')] },
        sr('describing', { id: 'http://v/lead', inScheme: { id: 'http://v/elements', label: { en: ['Elements'] } } }),
        sr('describing', 'http://v/other'),
        sr('classifying', 'http://v/class'),
      ],
      ['en'],
    );
    expect(facets.map((f) => f.groupName)).toEqual(['Colour', 'Elements', undefined, undefined]);
  });

  it('names describing sub-groups with the host hook when nothing else does', () => {
    const hook = (uri: string) => (uri.includes('loterre') ? ' Elements ' : undefined);
    const facets = extractBodyFacets(
      [sr('describing', 'http://data.loterre.fr/x'), sr('describing', 'http://v/y'), sr('classifying', 'http://data.loterre.fr/z')],
      ['en'],
      hook,
    );
    expect(facets.map((f) => f.groupName)).toEqual(['Elements', undefined, undefined]);
  });

  it('walks Choice, List and Independents and ignores malformed data', () => {
    const facets = extractBodyFacets(
      [
        null,
        'text',
        { type: 'Choice', items: [sr('classifying', 'http://v/a')] },
        { type: 'List', items: [{ type: 'Independents', items: [sr('classifying', 'http://v/b')] }] },
      ],
      ['en'],
    );
    expect(facets.map((f) => f.uri)).toEqual(['http://v/a', 'http://v/b']);
  });

  it('uses the first facet purpose of a multi-purpose body', () => {
    expect(extractBodyFacets(sr(['linking', 'describing'], 'http://v/x'), ['en'])[0].purpose).toBe('describing');
  });
});
