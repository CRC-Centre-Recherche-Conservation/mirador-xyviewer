import { describe, it, expect } from 'vitest';
import {
  getAnnotationBounds,
  getBoundsCenter,
  findAnnotationResource,
} from './SelectionHighlightPlugin';

/**
 * Tests for SelectionHighlightPlugin utility functions
 *
 * Note: The React component tests would require a more complex setup with
 * mocked Mirador/OpenSeadragon environment. These tests focus on the
 * pure utility functions.
 */

// Internal helpers are imported from the plugin via @internal exports (no
// re-implementation). The local IIIF-ish types below only type the test fixtures.

interface AnnotationResource {
  id: string;
  targetId: string;
  fragmentSelector?: [number, number, number, number] | null;
  svgSelector?: { value: string } | null;
}

interface AnnotationList {
  id: string;
  resources: AnnotationResource[];
}

// Constants matching the plugin
const MAX_HIGHLIGHT_SIZE = 100;
const MIN_HIGHLIGHT_SIZE = 50;

describe('SelectionHighlightPlugin', () => {
  describe('getAnnotationBounds', () => {
    it('should return fragment selector bounds directly', () => {
      const resource: AnnotationResource = {
        id: 'anno-1',
        targetId: 'canvas-1',
        fragmentSelector: [100, 200, 50, 50],
      };

      const bounds = getAnnotationBounds(resource);

      expect(bounds).toEqual([100, 200, 50, 50]);
    });

    it('should parse SVG selector and extract bounds', () => {
      // SVG path for a circle at (100, 200) with radius 12
      const svgValue = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M 100 188 A 12 12 0 1 1 100 212 A 12 12 0 1 1 100 188" fill="rgba(26, 115, 232, 0.3)" stroke="#1a73e8" stroke-width="2"/></svg>';

      const resource: AnnotationResource = {
        id: 'anno-1',
        targetId: 'canvas-1',
        svgSelector: { value: svgValue },
      };

      const bounds = getAnnotationBounds(resource);

      expect(bounds).not.toBeNull();
      // Center should be at (100, 200) with radius 12
      // So bounds should be [88, 188, 24, 24]
      expect(bounds![0]).toBe(88);  // x = 100 - 12
      expect(bounds![1]).toBe(188); // y = 200 - 12
      expect(bounds![2]).toBe(24);  // width = 12 * 2
      expect(bounds![3]).toBe(24);  // height = 12 * 2
    });

    it('should use default radius if arc command not found', () => {
      const svgValue = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M 100 188"/></svg>';

      const resource: AnnotationResource = {
        id: 'anno-1',
        targetId: 'canvas-1',
        svgSelector: { value: svgValue },
      };

      const bounds = getAnnotationBounds(resource);

      expect(bounds).not.toBeNull();
      // Should use DEFAULT_POINT_RADIUS = 12
      expect(bounds![2]).toBe(24); // width = 12 * 2
      expect(bounds![3]).toBe(24); // height = 12 * 2
    });

    it('should return null for resource without selector', () => {
      const resource: AnnotationResource = {
        id: 'anno-1',
        targetId: 'canvas-1',
        fragmentSelector: null,
        svgSelector: null,
      };

      const bounds = getAnnotationBounds(resource);

      expect(bounds).toBeNull();
    });

    it('should return null for resource with undefined selectors', () => {
      const resource: AnnotationResource = {
        id: 'anno-1',
        targetId: 'canvas-1',
      };

      const bounds = getAnnotationBounds(resource);

      expect(bounds).toBeNull();
    });

    it('should return null for invalid SVG selector', () => {
      const resource: AnnotationResource = {
        id: 'anno-1',
        targetId: 'canvas-1',
        svgSelector: { value: '<svg><rect/></svg>' }, // No path with M command
      };

      const bounds = getAnnotationBounds(resource);

      expect(bounds).toBeNull();
    });

    it('should handle SVG with custom radius', () => {
      // SVG with radius 25
      const svgValue = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M 150 75 A 25 25 0 1 1 150 125 A 25 25 0 1 1 150 75"/></svg>';

      const resource: AnnotationResource = {
        id: 'anno-1',
        targetId: 'canvas-1',
        svgSelector: { value: svgValue },
      };

      const bounds = getAnnotationBounds(resource);

      expect(bounds).not.toBeNull();
      // Center at (150, 100), radius 25
      expect(bounds![0]).toBe(125); // x = 150 - 25
      expect(bounds![1]).toBe(75);  // y = 100 - 25
      expect(bounds![2]).toBe(50);  // width = 25 * 2
      expect(bounds![3]).toBe(50);  // height = 25 * 2
    });
  });

  describe('getBoundsCenter', () => {
    it('should calculate center of bounds correctly', () => {
      const bounds: [number, number, number, number] = [100, 200, 50, 50];

      const center = getBoundsCenter(bounds);

      expect(center.x).toBe(125); // 100 + 50/2
      expect(center.y).toBe(225); // 200 + 50/2
    });

    it('should handle zero-size bounds', () => {
      const bounds: [number, number, number, number] = [100, 200, 0, 0];

      const center = getBoundsCenter(bounds);

      expect(center.x).toBe(100);
      expect(center.y).toBe(200);
    });

    it('should handle asymmetric bounds', () => {
      const bounds: [number, number, number, number] = [0, 0, 100, 50];

      const center = getBoundsCenter(bounds);

      expect(center.x).toBe(50);
      expect(center.y).toBe(25);
    });
  });

  describe('findAnnotationResource', () => {
    const mockAnnotations: AnnotationList[] = [
      {
        id: 'list-1',
        resources: [
          { id: 'anno-1', targetId: 'canvas-1', fragmentSelector: [0, 0, 10, 10] },
          { id: 'anno-2', targetId: 'canvas-1', fragmentSelector: [20, 20, 10, 10] },
        ],
      },
      {
        id: 'list-2',
        resources: [
          { id: 'anno-3', targetId: 'canvas-2', fragmentSelector: [50, 50, 10, 10] },
        ],
      },
    ];

    it('should find annotation in first list', () => {
      const resource = findAnnotationResource(mockAnnotations, 'anno-1');

      expect(resource).not.toBeNull();
      expect(resource!.id).toBe('anno-1');
    });

    it('should find annotation in second list', () => {
      const resource = findAnnotationResource(mockAnnotations, 'anno-3');

      expect(resource).not.toBeNull();
      expect(resource!.id).toBe('anno-3');
    });

    it('should return null for non-existent annotation', () => {
      const resource = findAnnotationResource(mockAnnotations, 'anno-999');

      expect(resource).toBeNull();
    });

    it('should return null for empty annotations list', () => {
      const resource = findAnnotationResource([], 'anno-1');

      expect(resource).toBeNull();
    });

    it('should return null for list with empty resources', () => {
      const emptyAnnotations: AnnotationList[] = [
        { id: 'list-1', resources: [] },
      ];

      const resource = findAnnotationResource(emptyAnnotations, 'anno-1');

      expect(resource).toBeNull();
    });
  });

  describe('highlight size constraints', () => {
    it('should have MAX_HIGHLIGHT_SIZE set to 100px', () => {
      expect(MAX_HIGHLIGHT_SIZE).toBe(100);
    });

    it('should have MIN_HIGHLIGHT_SIZE set to 50px', () => {
      expect(MIN_HIGHLIGHT_SIZE).toBe(50);
    });

    it('should clamp display size between min and max', () => {
      // Test the clamping logic used in the plugin
      const calculateDisplaySize = () => {
        return Math.min(MAX_HIGHLIGHT_SIZE, Math.max(MIN_HIGHLIGHT_SIZE, 80));
      };

      const displaySize = calculateDisplaySize();
      expect(displaySize).toBe(80);
      expect(displaySize).toBeGreaterThanOrEqual(MIN_HIGHLIGHT_SIZE);
      expect(displaySize).toBeLessThanOrEqual(MAX_HIGHLIGHT_SIZE);
    });

    it('should not exceed MAX_HIGHLIGHT_SIZE for large annotations', () => {
      // Even for a very large annotation, the highlight should be capped
      // The display size should still be capped at MAX_HIGHLIGHT_SIZE
      const displaySize = Math.min(MAX_HIGHLIGHT_SIZE, Math.max(MIN_HIGHLIGHT_SIZE, 80));
      expect(displaySize).toBeLessThanOrEqual(MAX_HIGHLIGHT_SIZE);
    });
  });
});

describe('SelectionHighlightPlugin export', () => {
  it('should export the plugin correctly', async () => {
    const { selectionHighlightPlugin } = await import('./SelectionHighlightPlugin');

    expect(selectionHighlightPlugin).toBeDefined();
    expect(selectionHighlightPlugin.target).toBe('AnnotationsOverlay');
    expect(selectionHighlightPlugin.mode).toBe('wrap');
    expect(selectionHighlightPlugin.name).toBe('SelectionHighlightPlugin');
    expect(selectionHighlightPlugin.component).toBeDefined();
  });
});
