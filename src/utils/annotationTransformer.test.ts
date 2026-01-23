import { describe, it, expect } from 'vitest';
import {
  transformPointAnnotations,
  annotationPostprocessor,
  createAnnotationPostprocessor,
} from './annotationTransformer';

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

      const result = transformPointAnnotations(annotationPage);

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

      const result = transformPointAnnotations(annotationPage);

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

      const result = transformPointAnnotations(annotationPage);

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

      const result = transformPointAnnotations(annotationPage, 20);

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

      const result = transformPointAnnotations(annotationPage);

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

      const result = transformPointAnnotations(annotationPage);

      expect(result.items[0].target.selector).toBeUndefined();
    });

    it('should return unchanged page if items is missing', () => {
      const annotationPage = {
        type: 'AnnotationPage',
      };

      const result = transformPointAnnotations(annotationPage);

      expect(result).toEqual(annotationPage);
    });

    it('should return unchanged page if items is not an array', () => {
      const annotationPage = {
        type: 'AnnotationPage',
        items: 'not an array',
      };

      const result = transformPointAnnotations(annotationPage as unknown);

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

      const result = transformPointAnnotations(annotationPage);

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

      const result = transformPointAnnotations(annotationPage);

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

      const result = transformPointAnnotations(annotationPage);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('anno-1');
      expect(result.items[0].target).toEqual({ source: 'http://example.com/image.jpg' });
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
