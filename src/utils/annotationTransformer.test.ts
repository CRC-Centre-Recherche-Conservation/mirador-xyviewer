import { describe, it, expect, afterEach } from 'vitest';
import {
  transformPointAnnotations,
  annotationPostprocessor,
  createAnnotationPostprocessor,
} from './annotationTransformer';
import {
  ANNOTATION_ADAPTERS,
  registerAnnotationAdapter,
  type AnnotationAdapter,
} from './annotationNormalizer';

// transformPointAnnotations returns dynamically-shaped IIIF data (Record<string, unknown>);
// the assertions below reach into nested runtime target/selector fields, so the result is
// treated as loosely typed here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransformedPage = any;

describe('annotationTransformer', () => {
  describe('transformPointAnnotations', () => {
    it('should transform point annotations to SVG circles', () => {
      const annotationPage = {
        '@context': 'http://www.w3.org/ns/anno.jsonld',
        type: 'AnnotationPage',
        items: [
          {
            id: 'anno-1',
            type: 'Annotation',
            target: {
              source: 'http://example.com/image.jpg',
              selector: {
                type: 'FragmentSelector',
                value: 'xywh=100,200,1,1',
              },
            },
          },
        ],
      };

      const result = transformPointAnnotations(annotationPage) as TransformedPage;

      expect(result.items[0].target.selector.type).toBe('SvgSelector');
      expect(result.items[0].target.selector.value).toContain('<svg');
      expect(result.items[0].target.selector.value).toContain('path');
    });

    it('should not transform non-point annotations', () => {
      const annotationPage = {
        type: 'AnnotationPage',
        items: [
          {
            id: 'anno-1',
            type: 'Annotation',
            target: {
              source: 'http://example.com/image.jpg',
              selector: {
                type: 'FragmentSelector',
                value: 'xywh=100,200,50,50', // 50x50 is not a point
              },
            },
          },
        ],
      };

      const result = transformPointAnnotations(annotationPage) as TransformedPage;

      expect(result.items[0].target.selector.type).toBe('FragmentSelector');
      expect(result.items[0].target.selector.value).toBe('xywh=100,200,50,50');
    });

    it('should transform small rectangles (<=5px) as points', () => {
      const annotationPage = {
        type: 'AnnotationPage',
        items: [
          {
            id: 'anno-1',
            target: {
              source: 'http://example.com/image.jpg',
              selector: {
                type: 'FragmentSelector',
                value: 'xywh=100,200,5,5',
              },
            },
          },
        ],
      };

      const result = transformPointAnnotations(annotationPage) as TransformedPage;

      expect(result.items[0].target.selector.type).toBe('SvgSelector');
    });

    it('should use custom radius when provided', () => {
      const annotationPage = {
        type: 'AnnotationPage',
        items: [
          {
            id: 'anno-1',
            target: {
              source: 'http://example.com/image.jpg',
              selector: {
                type: 'FragmentSelector',
                value: 'xywh=100,200,1,1',
              },
            },
          },
        ],
      };

      const result = transformPointAnnotations(annotationPage, 20) as TransformedPage;

      // Check that SVG contains the custom radius
      expect(result.items[0].target.selector.value).toContain('A 20 20');
    });

    it('should handle string targets without modification', () => {
      const annotationPage = {
        type: 'AnnotationPage',
        items: [
          {
            id: 'anno-1',
            target: 'http://example.com/image.jpg',
          },
        ],
      };

      const result = transformPointAnnotations(annotationPage) as TransformedPage;

      expect(result.items[0].target).toBe('http://example.com/image.jpg');
    });

    it('should handle targets without selectors', () => {
      const annotationPage = {
        type: 'AnnotationPage',
        items: [
          {
            id: 'anno-1',
            target: {
              source: 'http://example.com/image.jpg',
            },
          },
        ],
      };

      const result = transformPointAnnotations(annotationPage) as TransformedPage;

      expect(result.items[0].target.selector).toBeUndefined();
    });

    it('should return unchanged page if items is missing', () => {
      const annotationPage = {
        type: 'AnnotationPage',
      };

      const result = transformPointAnnotations(annotationPage) as TransformedPage;

      expect(result).toEqual(annotationPage);
    });

    it('should return unchanged page if items is not an array', () => {
      const annotationPage = {
        type: 'AnnotationPage',
        items: 'not an array',
      };

      const result = transformPointAnnotations(annotationPage) as TransformedPage;

      expect(result.items).toBe('not an array');
    });

    it('should merge annotations with duplicate IDs', () => {
      const annotationPage = {
        type: 'AnnotationPage',
        items: [
          {
            id: 'anno-1',
            body: { value: 'Test' },
            target: {
              source: 'http://example.com/image1.jpg',
              selector: { type: 'FragmentSelector', value: 'xywh=10,10,1,1' },
            },
          },
          {
            id: 'anno-1', // Same ID
            body: { value: 'Test' },
            target: {
              source: 'http://example.com/image2.jpg',
              selector: { type: 'FragmentSelector', value: 'xywh=20,20,1,1' },
            },
          },
        ],
      };

      const result = transformPointAnnotations(annotationPage) as TransformedPage;

      // Should be expanded into 2 annotations with unique IDs
      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('anno-1#target-0');
      expect(result.items[1].id).toBe('anno-1#target-1');
    });

    it('should expand multi-target annotations', () => {
      const annotationPage = {
        type: 'AnnotationPage',
        items: [
          {
            id: 'anno-1',
            body: { value: 'Multi-target annotation' },
            target: [
              { source: 'http://example.com/image1.jpg' },
              { source: 'http://example.com/image2.jpg' },
              { source: 'http://example.com/image3.jpg' },
            ],
          },
        ],
      };

      const result = transformPointAnnotations(annotationPage) as TransformedPage;

      expect(result.items).toHaveLength(3);
      expect(result.items[0].id).toBe('anno-1#target-0');
      expect(result.items[1].id).toBe('anno-1#target-1');
      expect(result.items[2].id).toBe('anno-1#target-2');
      expect(result.items[0]._originalAnnotationId).toBe('anno-1');
      expect(result.items[0]._targetIndex).toBe(0);
      expect(result.items[0]._totalTargets).toBe(3);
    });

    it('should simplify single-element target arrays', () => {
      const annotationPage = {
        type: 'AnnotationPage',
        items: [
          {
            id: 'anno-1',
            target: [{ source: 'http://example.com/image.jpg' }],
          },
        ],
      };

      const result = transformPointAnnotations(annotationPage) as TransformedPage;

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('anno-1');
      expect(result.items[0].target).toEqual({ source: 'http://example.com/image.jpg' });
    });
  });

  // IIIF Presentation v2 inputs (`sc:AnnotationList` / `resources` / `on`) flow through the
  // same version-agnostic path: read into the internal model via the normalizer's adapter
  // registry, then run through the version-blind merge/expand/point→circle pipeline (plan §4.7).
  describe('transformPointAnnotations (IIIF v2)', () => {
    it('should transform a v2 1x1 point into an SVG circle', () => {
      const annotationList = {
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        '@id': 'https://h/list.json',
        '@type': 'sc:AnnotationList',
        resources: [
          {
            '@id': 'anno-1',
            '@type': 'oa:Annotation',
            motivation: 'oa:commenting',
            resource: {
              '@type': 'cnt:ContentAsText',
              chars: 'A point',
            },
            on: 'https://h/i.tif#xywh=100,200,1,1',
          },
        ],
      };

      const result = transformPointAnnotations(annotationList) as TransformedPage;

      expect(result.items).toHaveLength(1);
      expect(result.items[0].target.selector.type).toBe('SvgSelector');
      expect(result.items[0].target.selector.value).toContain('<svg');
      expect(result.items[0].target.selector.value).toContain('<path');
      // Circle centered on the point (100.5, 200.5).
      expect(result.items[0].target.selector.value).toContain('M 100.5 188.5');
    });

    it('should expand four same-@id v2 annotations into four unique-id items', () => {
      const annotationList = {
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        '@id': 'https://h/micro-imaging-list.json',
        '@type': 'sc:AnnotationList',
        resources: [
          {
            '@id': 'micro-imaging',
            '@type': 'oa:Annotation',
            resource: { '@type': 'dctypes:Dataset', '@id': 'https://h/d.csv', format: 'text/csv' },
            on: 'https://h/i.tif#xywh=10,10,100,100',
          },
          {
            '@id': 'micro-imaging',
            '@type': 'oa:Annotation',
            resource: { '@type': 'dctypes:Dataset', '@id': 'https://h/d.csv', format: 'text/csv' },
            on: 'https://h/i.tif#xywh=200,10,100,100',
          },
          {
            '@id': 'micro-imaging',
            '@type': 'oa:Annotation',
            resource: { '@type': 'dctypes:Dataset', '@id': 'https://h/d.csv', format: 'text/csv' },
            on: 'https://h/i.tif#xywh=10,200,100,100',
          },
          {
            '@id': 'micro-imaging',
            '@type': 'oa:Annotation',
            resource: { '@type': 'dctypes:Dataset', '@id': 'https://h/d.csv', format: 'text/csv' },
            on: 'https://h/i.tif#xywh=200,200,100,100',
          },
        ],
      };

      const result = transformPointAnnotations(annotationList) as TransformedPage;

      expect(result.items).toHaveLength(4);
      const ids = result.items.map((item: TransformedPage) => item.id);
      expect(ids).toEqual([
        'micro-imaging#target-0',
        'micro-imaging#target-1',
        'micro-imaging#target-2',
        'micro-imaging#target-3',
      ]);
      // Ids are unique.
      expect(new Set(ids).size).toBe(4);
      // Expand metadata is preserved (as the v3 expand does).
      expect(result.items[0]._originalAnnotationId).toBe('micro-imaging');
      expect(result.items[0]._targetIndex).toBe(0);
      expect(result.items[0]._totalTargets).toBe(4);
    });

    it('should keep a v2 box (w,h > threshold) as a FragmentSelector', () => {
      const annotationList = {
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        '@id': 'https://h/list.json',
        '@type': 'sc:AnnotationList',
        resources: [
          {
            '@id': 'anno-box',
            '@type': 'oa:Annotation',
            resource: { '@type': 'cnt:ContentAsText', chars: 'A box' },
            on: 'https://h/i.tif#xywh=100,200,50,50',
          },
        ],
      };

      const result = transformPointAnnotations(annotationList) as TransformedPage;

      expect(result.items).toHaveLength(1);
      expect(result.items[0].target.selector.type).toBe('FragmentSelector');
      expect(result.items[0].target.selector.value).toBe('xywh=100,200,50,50');
    });

    it('should produce a v3-shaped page (type AnnotationPage, items, no resources)', () => {
      const annotationList = {
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        '@id': 'https://h/list.json',
        '@type': 'sc:AnnotationList',
        resources: [
          {
            '@id': 'anno-1',
            '@type': 'oa:Annotation',
            resource: { '@type': 'cnt:ContentAsText', chars: 'A point' },
            on: 'https://h/i.tif#xywh=100,200,1,1',
          },
        ],
      };

      const result = transformPointAnnotations(annotationList) as TransformedPage;

      expect(result.type).toBe('AnnotationPage');
      expect(Array.isArray(result.items)).toBe(true);
      // Non-canonical container keys are dropped so Mirador sees a clean v3 page.
      expect(result.resources).toBeUndefined();
      expect(result['@type']).toBeUndefined();
      expect(result['@context']).toBeUndefined();
      expect(result['@id']).toBeUndefined();
    });
  });

  // The display pipeline is version-blind: a brand-new IIIF format needs only an adapter,
  // not a change to the postprocessor. Register a made-up future shape and prove points
  // still become circles.
  describe('transformPointAnnotations (future version via registered adapter)', () => {
    afterEach(() => {
      // Restore the registry so the prepended fake adapter does not pollute other tests.
      ANNOTATION_ADAPTERS.shift();
    });

    it('turns points into circles for a v4-like container with no code change', () => {
      const presentation4Adapter: AnnotationAdapter = {
        name: 'iiif-presentation-4-fake',
        matches: (page) => Array.isArray(page.annotationCollection),
        listAnnotations: (page) =>
          Array.isArray(page.annotationCollection) ? page.annotationCollection : [],
        id: (a) => (typeof a.iri === 'string' ? a.iri : undefined),
        motivation: (a) => a.purpose,
        bodies: (a) => (Array.isArray(a.resources2) ? a.resources2 : []),
        target: (a) => a.region,
        label: (a) => a.title,
        metadata: () => undefined,
        seeAlso: () => undefined,
      };
      registerAnnotationAdapter(presentation4Adapter);

      const futurePage = {
        annotationCollection: [
          {
            iri: 'v4-anno-1',
            purpose: 'commenting',
            resources2: [{ type: 'TextualBody', value: 'A point' }],
            region: {
              source: 'https://h/i.tif',
              selector: { type: 'FragmentSelector', value: 'xywh=100,200,1,1' },
            },
          },
        ],
      };

      const result = transformPointAnnotations(futurePage) as TransformedPage;

      expect(result.type).toBe('AnnotationPage');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('v4-anno-1');
      expect(result.items[0].target.selector.type).toBe('SvgSelector');
      expect(result.items[0].target.selector.value).toContain('<svg');
    });
  });

  describe('annotationPostprocessor', () => {
    it('should transform annotationJson if present', () => {
      const action = {
        type: 'RECEIVE_ANNOTATION',
        annotationJson: {
          type: 'AnnotationPage',
          items: [
            {
              id: 'anno-1',
              target: {
                source: 'http://example.com/image.jpg',
                selector: {
                  type: 'FragmentSelector',
                  value: 'xywh=100,200,1,1',
                },
              },
            },
          ],
        },
      };

      annotationPostprocessor('http://example.com/annotations', action);

      expect(action.annotationJson.items[0].target.selector.type).toBe('SvgSelector');
    });

    it('should not modify action without annotationJson', () => {
      const action = {
        type: 'SOME_OTHER_ACTION',
        data: { foo: 'bar' },
      };

      annotationPostprocessor('http://example.com', action);

      expect(action).toEqual({
        type: 'SOME_OTHER_ACTION',
        data: { foo: 'bar' },
      });
    });
  });

  describe('createAnnotationPostprocessor', () => {
    it('should create postprocessor with custom radius', () => {
      const customPostprocessor = createAnnotationPostprocessor(25);

      const action = {
        annotationJson: {
          type: 'AnnotationPage',
          items: [
            {
              id: 'anno-1',
              target: {
                selector: {
                  type: 'FragmentSelector',
                  value: 'xywh=100,200,1,1',
                },
              },
            },
          ],
        },
      };

      customPostprocessor('http://example.com', action);

      expect(action.annotationJson.items[0].target.selector.value).toContain('A 25 25');
    });
  });
});
