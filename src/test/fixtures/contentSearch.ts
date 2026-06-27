/**
 * IIIF Content Search response fixtures (search/1 + search/2), realistic shapes.
 * Used by the defensive guard tests and the postprocessor-survival integration test.
 */

/** Search API 1.0 response: array @context (presentation/2 + search/1), resources + hits + within. */
export const searchV1 = {
  '@context': [
    'http://iiif.io/api/presentation/2/context.json',
    'http://iiif.io/api/search/1/context.json',
  ],
  '@id': 'http://example.org/search?q=foo',
  '@type': 'sc:AnnotationList',
  within: { '@type': 'sc:Layer', total: 1 },
  resources: [
    {
      '@id': 'http://example.org/anno/1',
      '@type': 'oa:Annotation',
      motivation: 'sc:painting',
      resource: { '@type': 'cnt:ContentAsText', chars: 'foo' },
      on: 'http://example.org/canvas/1#xywh=10,20,30,40',
    },
  ],
  hits: [{ '@type': 'search:Hit', annotations: ['http://example.org/anno/1'], match: 'foo' }],
};

/** Empty search/1 result that omits BOTH `hits` and `ignored` — detection relies on the array @context. */
export const searchV1Empty = {
  '@context': [
    'http://iiif.io/api/presentation/2/context.json',
    'http://iiif.io/api/search/1/context.json',
  ],
  '@id': 'http://example.org/search?q=zzz',
  '@type': 'sc:AnnotationList',
  resources: [],
};

/** Search API 2.0 response: items + hits + pagination + ignored. */
export const searchV2 = {
  '@context': 'http://iiif.io/api/search/2/context.json',
  id: 'http://example.org/search?q=foo',
  type: 'AnnotationPage',
  items: [
    {
      id: 'http://example.org/anno/1',
      type: 'Annotation',
      body: { type: 'TextualBody', value: 'foo' },
      target: 'http://example.org/canvas/1#xywh=10,20,30,40',
    },
  ],
  partOf: { id: 'http://example.org/search?q=foo', type: 'AnnotationCollection', total: 1 },
  next: 'http://example.org/search?q=foo&page=1',
  startIndex: 0,
  ignored: ['date'],
  hits: [{ type: 'Hit', annotations: ['http://example.org/anno/1'], match: 'foo' }],
};

/** Empty search/2 result: search @context, no items. */
export const searchV2Empty = {
  '@context': 'http://iiif.io/api/search/2/context.json',
  id: 'http://example.org/search?q=zzz',
  type: 'AnnotationPage',
  items: [],
};

/**
 * A legitimate Presentation-3 AnnotationPage that even carries `partOf` (links to its
 * AnnotationCollection). It must NOT be detected as a search response — this is exactly
 * why pagination keys are NOT added to the detection logic.
 */
export const plainAnnotationPage = {
  '@context': 'http://iiif.io/api/presentation/3/context.json',
  id: 'http://example.org/page/1',
  type: 'AnnotationPage',
  partOf: { id: 'http://example.org/collection/1', type: 'AnnotationCollection' },
  items: [
    {
      id: 'http://example.org/anno/2',
      type: 'Annotation',
      motivation: 'supplementing',
      body: { type: 'TextualBody', value: 'note' },
      target: 'http://example.org/canvas/1#xywh=0,0,100,100',
    },
  ],
};
