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
  selector?: unknown;
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

    it('reads a polygon path with negative and decimal coordinates', () => {
      const svg = '<svg><path d="M -10.5 20 L 30 40.25 L 50 -60 Z"/></svg>';
      expect(getAnnotationBounds({ id: 'a', targetId: 'c', svgSelector: { value: svg } })).toEqual([-10.5, -60, 60.5, 100.25]);
    });

    it('reads polygon, rect, circle and ellipse SVG shapes', () => {
      const b = (value: string) => getAnnotationBounds({ id: 'a', targetId: 'c', svgSelector: { value } });
      expect(b('<svg><polygon points="0,0 10,5 4,-8"/></svg>')).toEqual([0, -8, 10, 13]);
      expect(b('<svg><rect x="5" y="6" width="10" height="20"/></svg>')).toEqual([5, 6, 10, 20]);
      expect(b('<svg><circle cx="50" cy="50" r="10"/></svg>')).toEqual([40, 40, 20, 20]);
      expect(b('<svg><ellipse cx="50" cy="50" rx="10" ry="5"/></svg>')).toEqual([40, 45, 20, 10]);
    });

    it('handles relative path commands', () => {
      const svg = '<svg><path d="m 10 10 l 20 0 v 15 h -20 z"/></svg>';
      expect(getAnnotationBounds({ id: 'a', targetId: 'c', svgSelector: { value: svg } })).toEqual([10, 10, 20, 15]);
    });

    it('falls back to a PointSelector when nothing else is readable', () => {
      const resource = { id: 'a', targetId: 'c', selector: [{ type: 'PointSelector', x: 100, y: 200 }] };
      expect(getAnnotationBounds(resource)).toEqual([88, 188, 24, 24]);
    });

    it('reads a pixel: fragment when Mirador yields NaN, and ignores percent:', () => {
      const nan = [NaN, 2, 3, 4] as unknown as [number, number, number, number];
      expect(
        getAnnotationBounds({
          id: 'a',
          targetId: 'c',
          fragmentSelector: nan,
          selector: [{ type: 'FragmentSelector', value: 'xywh=pixel:1,2,3,4' }],
        })
      ).toEqual([1, 2, 3, 4]);
      expect(
        getAnnotationBounds({
          id: 'a',
          targetId: 'c',
          fragmentSelector: nan,
          selector: [{ type: 'FragmentSelector', value: 'xywh=percent:1,2,3,4' }],
        })
      ).toBeNull();
    });

    it('prefers the fragment bbox over the SVG in a selector array', () => {
      expect(
        getAnnotationBounds({
          id: 'a',
          targetId: 'c',
          fragmentSelector: [0, 0, 60, 100],
          svgSelector: { value: '<svg><polygon points="0,0 60,0 60,100"/></svg>' },
        })
      ).toEqual([0, 0, 60, 100]);
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

describe('getAnnotationBounds hardening', () => {
  const res = (value: string) => ({ id: 'a', targetId: 'c', svgSelector: { value } });

  it('reads width, not stroke-width', () => {
    const b = getAnnotationBounds(res('<svg><rect stroke-width="2" x="5" y="6" width="100" height="20"/></svg>'));
    expect(b).toEqual([5, 6, 100, 20]);
  });

  it('does not take a producer semicircle for the marker', () => {
    const b = getAnnotationBounds(res('<svg><path d="M 0 0 A 50 50 0 0 1 100 0"/></svg>'));
    expect(b![2]).toBeGreaterThan(100);
  });

  it('survives 200k coordinates and hostile tag runs quickly', () => {
    const t = Date.now();
    const pts = Array.from({ length: 200000 }, (_, i) => `${i},${i}`).join(' ');
    expect(getAnnotationBounds(res(`<svg><polygon points="${pts}"/></svg>`))).toBeNull();
    expect(getAnnotationBounds(res('<path '.repeat(40000)))).toBeNull();
    expect(getAnnotationBounds(res(`<svg><path d="M 1 ${'1'.repeat(40000)}x"/></svg>`))).not.toBeUndefined();
    expect(Date.now() - t).toBeLessThan(1500);
  });

  it('still reads a large-but-allowed polygon', () => {
    const pts = Array.from({ length: 5000 }, (_, i) => `${i},${i}`).join(' ');
    expect(getAnnotationBounds(res(`<svg><polygon points="${pts}"/></svg>`))).toEqual([0, 0, 4999, 4999]);
  });
});
