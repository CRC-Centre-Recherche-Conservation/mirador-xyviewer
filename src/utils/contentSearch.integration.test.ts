/**
 * Whole-chain proof: a IIIF Content Search response passes through the real
 * annotationPostprocessor untouched. Mirador delivers search under `searchJson`
 * (gate skips it); even if mis-delivered as `annotationJson`, isContentSearchResponse
 * bails out. Both paths must leave the response byte-identical.
 */
import { describe, it, expect } from 'vitest';
import { annotationPostprocessor } from './annotationTransformer';
import { searchV1, searchV2 } from '../test/fixtures/contentSearch';

describe('Content Search survives the annotation postprocessor', () => {
  it('leaves a search/1 response identical when delivered as searchJson', () => {
    const searchJson = structuredClone(searchV1);
    annotationPostprocessor('http://example.org/search?q=foo', { searchJson });
    expect(searchJson).toEqual(searchV1);
  });

  it('leaves a search/2 response identical when delivered as searchJson', () => {
    const searchJson = structuredClone(searchV2);
    annotationPostprocessor('http://example.org/search?q=foo', { searchJson });
    expect(searchJson).toEqual(searchV2);
  });

  it('no-ops even if a search response is mis-delivered as annotationJson (defence-in-depth)', () => {
    const annotationJson = structuredClone(searchV1);
    annotationPostprocessor('http://example.org/search?q=foo', { annotationJson });
    expect(annotationJson).toEqual(searchV1);
  });
});
