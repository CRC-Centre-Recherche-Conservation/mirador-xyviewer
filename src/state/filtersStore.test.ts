import { describe, it, expect, beforeEach } from 'vitest';
import { parseValueWithUrl, normalizeKey, createKey, facetGroupKey, filtersStore } from './filtersStore';

/**
 * Tests for filtersStore
 *
 * Tests the metadata filtering logic:
 * - Initialization from annotations
 * - Value toggling and selection
 * - Hidden annotation calculation
 * - "None" value handling for missing metadata
 */

// Internal helpers (parseValueWithUrl, normalizeKey, createKey) are imported from the
// source module via its @internal exports — no re-implementation, so these tests stay
// bound to the real logic. See DEVELOPER-GUIDE "Testing Conventions".

describe('filtersStore utility functions', () => {
  describe('parseValueWithUrl', () => {
    it('stays fast on long whitespace runs', () => {
      const t = Date.now();
      expect(parseValueWithUrl(' '.repeat(100000) + 'x').url).toBeUndefined();
      expect(Date.now() - t).toBeLessThan(500);
    });

    it('should extract display text and URL from combined string', () => {
      const result = parseValueWithUrl('XRF Analysis (https://example.org/technique/xrf)');

      expect(result.displayText).toBe('XRF Analysis');
      expect(result.url).toBe('https://example.org/technique/xrf');
    });

    it('should handle HTTP URLs', () => {
      const result = parseValueWithUrl('Raman (http://example.org/raman)');

      expect(result.displayText).toBe('Raman');
      expect(result.url).toBe('http://example.org/raman');
    });

    it('should handle text without URL', () => {
      const result = parseValueWithUrl('Simple Value');

      expect(result.displayText).toBe('Simple Value');
      expect(result.url).toBeUndefined();
    });

    it('should handle URLs with complex paths', () => {
      const result = parseValueWithUrl('Analysis (https://example.org/api/v2/technique?type=xrf&id=123)');

      expect(result.displayText).toBe('Analysis');
      expect(result.url).toBe('https://example.org/api/v2/technique?type=xrf&id=123');
    });

    it('should not match parentheses without URL', () => {
      const result = parseValueWithUrl('Value (not a URL)');

      expect(result.displayText).toBe('Value (not a URL)');
      expect(result.url).toBeUndefined();
    });

    it('should handle empty string', () => {
      const result = parseValueWithUrl('');

      expect(result.displayText).toBe('');
      expect(result.url).toBeUndefined();
    });
  });

  describe('normalizeKey', () => {
    it('should convert to lowercase', () => {
      expect(normalizeKey('Technique')).toBe('technique');
      expect(normalizeKey('OPERATOR')).toBe('operator');
    });

    it('should replace spaces with underscores', () => {
      expect(normalizeKey('Analysis Type')).toBe('analysis_type');
    });

    it('should trim whitespace', () => {
      expect(normalizeKey('  technique  ')).toBe('technique');
    });

    it('should collapse multiple spaces to single underscore', () => {
      // \s+ replaces one or more spaces with a single underscore
      expect(normalizeKey('Sample  Name')).toBe('sample_name');
      expect(normalizeKey('analysis   type   name')).toBe('analysis_type_name');
    });

    it('should handle empty string', () => {
      expect(normalizeKey('')).toBe('');
    });
  });

  describe('createKey', () => {
    it('should create composite key from windowId and canvasId', () => {
      expect(createKey('window-1', 'canvas-abc')).toBe('window-1::canvas-abc');
    });

    it('should handle special characters in IDs', () => {
      expect(createKey('win/1', 'canvas#2')).toBe('win/1::canvas#2');
    });

    it('should handle empty strings', () => {
      expect(createKey('', '')).toBe('::');
    });
  });
});

describe('filtersStore', () => {
  // Import the actual store for integration tests
  let filtersStore: typeof import('./filtersStore').filtersStore;

  beforeEach(async () => {
    // Re-import to get fresh instance
    const module = await import('./filtersStore');
    filtersStore = module.filtersStore;
    // Clear any existing state
    filtersStore.clearFilters('test-window', 'test-canvas');
  });

  describe('initializeFromAnnotations', () => {
    it('should create filter groups from annotation metadata', () => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [
            { label: { en: ['Technique'] }, value: { en: ['XRF'] } },
            { label: { en: ['Operator'] }, value: { en: ['John'] } },
          ],
        },
        {
          id: 'anno-2',
          metadata: [
            { label: { en: ['Technique'] }, value: { en: ['Raman'] } },
            { label: { en: ['Operator'] }, value: { en: ['Jane'] } },
          ],
        },
      ];

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);

      const groups = filtersStore.getGroups('test-window', 'test-canvas');
      expect(groups.length).toBe(2);

      const techniqueGroup = groups.find(g => g.key === 'meta:technique');
      expect(techniqueGroup).toBeDefined();
      expect(techniqueGroup!.values.size).toBe(2);
      expect(techniqueGroup!.values.get('xrf')?.count).toBe(1);
      expect(techniqueGroup!.values.get('raman')?.count).toBe(1);

      const operatorGroup = groups.find(g => g.key === 'meta:operator');
      expect(operatorGroup).toBeDefined();
      expect(operatorGroup!.values.size).toBe(2);
    });

    it('should set all values as selected by default', () => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
      ];

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);

      const groups = filtersStore.getGroups('test-window', 'test-canvas');
      const value = groups[0]?.values.get('xrf');
      expect(value?.selected).toBe(true);
    });

    it('should add None value for annotations missing metadata in a group', () => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [
            { label: { en: ['Technique'] }, value: { en: ['XRF'] } },
            { label: { en: ['Operator'] }, value: { en: ['John'] } },
          ],
        },
        {
          id: 'anno-2',
          metadata: [
            { label: { en: ['Technique'] }, value: { en: ['Raman'] } },
            // Missing Operator
          ],
        },
      ];

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);

      const groups = filtersStore.getGroups('test-window', 'test-canvas');
      const operatorGroup = groups.find(g => g.key === 'meta:operator');

      expect(operatorGroup).toBeDefined();
      const noneValue = operatorGroup!.values.get('\u0000none');
      expect(noneValue).toBeDefined();
      expect(noneValue!.count).toBe(1);
      expect(noneValue!.displayText).toBe('Not specified');
    });

    it('should not reinitialize with the same annotations (unless forced)', () => {
      const annotations = [
        { id: 'anno-1', metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }] },
      ];

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);
      filtersStore.toggleValue('test-window', 'test-canvas', 'meta:technique', 'xrf');
      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);

      const groups = filtersStore.getGroups('test-window', 'test-canvas');
      expect(groups[0]?.values.get('xrf')?.selected).toBe(false);
    });

    it('should rebuild when more annotations load, keeping the selection', () => {
      const first = { id: 'anno-1', metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }] };
      const second = { id: 'anno-2', metadata: [{ label: { en: ['Technique'] }, value: { en: ['Raman'] } }] };

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', [first]);
      filtersStore.toggleValue('test-window', 'test-canvas', 'meta:technique', 'xrf');
      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', [first, second]);

      const group = filtersStore.getGroups('test-window', 'test-canvas')[0];
      expect(group.values.has('raman')).toBe(true);
      expect(group.values.get('xrf')?.selected).toBe(false);
      expect(group.values.get('raman')?.selected).toBe(true);
    });

    it('should reinitialize when forced', () => {
      const annotations1 = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
      ];
      const annotations2 = [
        {
          id: 'anno-2',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['Raman'] } }],
        },
      ];

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations1);
      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations2, true);

      const groups = filtersStore.getGroups('test-window', 'test-canvas');
      expect(groups[0]?.values.has('xrf')).toBe(false);
      expect(groups[0]?.values.has('raman')).toBe(true);
    });

    it('should handle annotations without metadata', () => {
      const annotations = [
        { id: 'anno-1' },
        { id: 'anno-2', metadata: [] },
      ];

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);

      const groups = filtersStore.getGroups('test-window', 'test-canvas');
      expect(groups.length).toBe(0);
    });
  });

  describe('toggleValue', () => {
    beforeEach(() => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
      ];
      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);
    });

    it('should toggle value selection', () => {
      let groups = filtersStore.getGroups('test-window', 'test-canvas');
      expect(groups[0]?.values.get('xrf')?.selected).toBe(true);

      filtersStore.toggleValue('test-window', 'test-canvas', 'meta:technique', 'xrf');

      groups = filtersStore.getGroups('test-window', 'test-canvas');
      expect(groups[0]?.values.get('xrf')?.selected).toBe(false);

      filtersStore.toggleValue('test-window', 'test-canvas', 'meta:technique', 'xrf');

      groups = filtersStore.getGroups('test-window', 'test-canvas');
      expect(groups[0]?.values.get('xrf')?.selected).toBe(true);
    });

    it('should handle non-existent label key', () => {
      // Should not throw
      filtersStore.toggleValue('test-window', 'test-canvas', 'nonexistent', 'xrf');
    });

    it('should handle non-existent value key', () => {
      // Should not throw
      filtersStore.toggleValue('test-window', 'test-canvas', 'meta:technique', 'nonexistent');
    });
  });

  describe('selectAll / deselectAll', () => {
    beforeEach(() => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
        {
          id: 'anno-2',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['Raman'] } }],
        },
      ];
      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);
    });

    it('should deselect all values in a group', () => {
      filtersStore.deselectAll('test-window', 'test-canvas', 'meta:technique');

      const groups = filtersStore.getGroups('test-window', 'test-canvas');
      for (const value of groups[0]?.values.values() ?? []) {
        expect(value.selected).toBe(false);
      }
    });

    it('should select all values in a group', () => {
      filtersStore.deselectAll('test-window', 'test-canvas', 'meta:technique');
      filtersStore.selectAll('test-window', 'test-canvas', 'meta:technique');

      const groups = filtersStore.getGroups('test-window', 'test-canvas');
      for (const value of groups[0]?.values.values() ?? []) {
        expect(value.selected).toBe(true);
      }
    });
  });

  describe('updateHiddenAnnotations', () => {
    it('should hide annotations with deselected values', () => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
        {
          id: 'anno-2',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['Raman'] } }],
        },
      ];

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);
      filtersStore.toggleValue('test-window', 'test-canvas', 'meta:technique', 'xrf');

      const hiddenIds = filtersStore.updateHiddenAnnotations('test-window', 'test-canvas', annotations);

      expect(hiddenIds.has('anno-1')).toBe(true);
      expect(hiddenIds.has('anno-2')).toBe(false);
    });

    it('should hide annotations missing metadata when None is deselected', () => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [
            { label: { en: ['Technique'] }, value: { en: ['XRF'] } },
            { label: { en: ['Operator'] }, value: { en: ['John'] } },
          ],
        },
        {
          id: 'anno-2',
          metadata: [
            { label: { en: ['Technique'] }, value: { en: ['Raman'] } },
            // Missing Operator - should have "None"
          ],
        },
      ];

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);
      filtersStore.toggleValue('test-window', 'test-canvas', 'meta:operator', '\u0000none');

      const hiddenIds = filtersStore.updateHiddenAnnotations('test-window', 'test-canvas', annotations);

      expect(hiddenIds.has('anno-1')).toBe(false);
      expect(hiddenIds.has('anno-2')).toBe(true);
    });

    it('should update visible counts correctly', () => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
        {
          id: 'anno-2',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
        {
          id: 'anno-3',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['Raman'] } }],
        },
      ];

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);
      filtersStore.toggleValue('test-window', 'test-canvas', 'meta:technique', 'raman');
      filtersStore.updateHiddenAnnotations('test-window', 'test-canvas', annotations);

      const groups = filtersStore.getGroups('test-window', 'test-canvas');
      const xrfValue = groups[0]?.values.get('xrf');
      const ramanValue = groups[0]?.values.get('raman');

      expect(xrfValue?.count).toBe(2);
      expect(xrfValue?.visibleCount).toBe(2);
      expect(ramanValue?.count).toBe(1);
      expect(ramanValue?.visibleCount).toBe(0);
    });
  });

  describe('hasFiltersInitialized', () => {
    it('should return false for uninitialized window+canvas', () => {
      expect(filtersStore.hasFiltersInitialized('new-window', 'new-canvas')).toBe(false);
    });

    it('should return true after initialization with metadata', () => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
      ];

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);

      expect(filtersStore.hasFiltersInitialized('test-window', 'test-canvas')).toBe(true);
    });

    it('should return false after initialization with empty metadata', () => {
      const annotations = [{ id: 'anno-1' }];

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);

      expect(filtersStore.hasFiltersInitialized('test-window', 'test-canvas')).toBe(false);
    });
  });

  describe('hasActiveFilters', () => {
    beforeEach(() => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
      ];
      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);
    });

    it('should return false when all values are selected', () => {
      expect(filtersStore.hasActiveFilters('test-window', 'test-canvas')).toBe(false);
    });

    it('should return true when any value is deselected', () => {
      filtersStore.toggleValue('test-window', 'test-canvas', 'meta:technique', 'xrf');

      expect(filtersStore.hasActiveFilters('test-window', 'test-canvas')).toBe(true);
    });
  });

  describe('isAnnotationVisible', () => {
    it('should return true for visible annotations', () => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
      ];

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);

      expect(filtersStore.isAnnotationVisible('test-window', 'test-canvas', 'anno-1')).toBe(true);
    });

    it('should return false for hidden annotations', () => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
      ];

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);
      filtersStore.toggleValue('test-window', 'test-canvas', 'meta:technique', 'xrf');
      filtersStore.updateHiddenAnnotations('test-window', 'test-canvas', annotations);

      expect(filtersStore.isAnnotationVisible('test-window', 'test-canvas', 'anno-1')).toBe(false);
    });

    it('should return true for uninitialized window+canvas', () => {
      expect(filtersStore.isAnnotationVisible('new-window', 'new-canvas', 'any-id')).toBe(true);
    });
  });

  describe('resetAll', () => {
    it('should reset all values to selected and clear hidden annotations', () => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
      ];

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);
      filtersStore.toggleValue('test-window', 'test-canvas', 'meta:technique', 'xrf');
      filtersStore.updateHiddenAnnotations('test-window', 'test-canvas', annotations);

      expect(filtersStore.getHiddenAnnotationIds('test-window', 'test-canvas').size).toBe(1);

      filtersStore.resetAll('test-window', 'test-canvas');

      const groups = filtersStore.getGroups('test-window', 'test-canvas');
      expect(groups[0]?.values.get('xrf')?.selected).toBe(true);
      expect(filtersStore.getHiddenAnnotationIds('test-window', 'test-canvas').size).toBe(0);
    });
  });

  describe('clearFilters', () => {
    it('should remove all filter state for window+canvas', () => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
      ];

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);
      expect(filtersStore.hasFiltersInitialized('test-window', 'test-canvas')).toBe(true);

      filtersStore.clearFilters('test-window', 'test-canvas');

      expect(filtersStore.hasFiltersInitialized('test-window', 'test-canvas')).toBe(false);
      expect(filtersStore.getGroups('test-window', 'test-canvas').length).toBe(0);
    });
  });

  describe('clearWindow', () => {
    it('should remove all filter state for all canvases in a window', () => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
      ];

      filtersStore.initializeFromAnnotations('test-window', 'canvas-1', annotations);
      filtersStore.initializeFromAnnotations('test-window', 'canvas-2', annotations);
      filtersStore.initializeFromAnnotations('other-window', 'canvas-1', annotations);

      filtersStore.clearWindow('test-window');

      expect(filtersStore.hasFiltersInitialized('test-window', 'canvas-1')).toBe(false);
      expect(filtersStore.hasFiltersInitialized('test-window', 'canvas-2')).toBe(false);
      expect(filtersStore.hasFiltersInitialized('other-window', 'canvas-1')).toBe(true);
    });
  });

  describe('subscribe', () => {
    it('should call listener on init event', () => {
      const events: Array<{ type: string }> = [];
      const unsubscribe = filtersStore.subscribe((event) => {
        events.push(event);
      });

      const annotations = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
      ];
      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);

      expect(events.some(e => e.type === 'init')).toBe(true);
      unsubscribe();
    });

    it('should call listener on toggle event', () => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
      ];
      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);

      const events: Array<{ type: string }> = [];
      const unsubscribe = filtersStore.subscribe((event) => {
        events.push(event);
      });

      filtersStore.toggleValue('test-window', 'test-canvas', 'meta:technique', 'xrf');

      expect(events.some(e => e.type === 'toggle-value')).toBe(true);
      unsubscribe();
    });

    it('should unsubscribe correctly', () => {
      const events: Array<{ type: string }> = [];
      const unsubscribe = filtersStore.subscribe((event) => {
        events.push(event);
      });

      unsubscribe();

      const annotations = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
      ];
      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);

      expect(events.length).toBe(0);
    });
  });

  describe('getActiveFilters', () => {
    it('should return selected values by group', () => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [
            { label: { en: ['Technique'] }, value: { en: ['XRF'] } },
            { label: { en: ['Operator'] }, value: { en: ['John'] } },
          ],
        },
        {
          id: 'anno-2',
          metadata: [
            { label: { en: ['Technique'] }, value: { en: ['Raman'] } },
            { label: { en: ['Operator'] }, value: { en: ['Jane'] } },
          ],
        },
      ];

      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);
      filtersStore.toggleValue('test-window', 'test-canvas', 'meta:technique', 'xrf');

      const activeFilters = filtersStore.getActiveFilters('test-window', 'test-canvas');

      expect(activeFilters.get('meta:technique')?.has('xrf')).toBe(false);
      expect(activeFilters.get('meta:technique')?.has('raman')).toBe(true);
      expect(activeFilters.get('meta:operator')?.has('john')).toBe(true);
      expect(activeFilters.get('meta:operator')?.has('jane')).toBe(true);
    });

    it('should return empty map for uninitialized state', () => {
      const activeFilters = filtersStore.getActiveFilters('new-window', 'new-canvas');

      expect(activeFilters.size).toBe(0);
    });
  });

  describe('toggleGroupExpanded', () => {
    beforeEach(() => {
      const annotations = [
        {
          id: 'anno-1',
          metadata: [{ label: { en: ['Technique'] }, value: { en: ['XRF'] } }],
        },
      ];
      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations);
    });

    it('should toggle group expanded state', () => {
      let groups = filtersStore.getGroups('test-window', 'test-canvas');
      expect(groups[0]?.expanded).toBe(true);

      filtersStore.toggleGroupExpanded('test-window', 'test-canvas', 'meta:technique');

      groups = filtersStore.getGroups('test-window', 'test-canvas');
      expect(groups[0]?.expanded).toBe(false);

      filtersStore.toggleGroupExpanded('test-window', 'test-canvas', 'meta:technique');

      groups = filtersStore.getGroups('test-window', 'test-canvas');
      expect(groups[0]?.expanded).toBe(true);
    });
  });
});

describe('filtersStore reader language', () => {
  const annotations = [
    {
      id: 'a1',
      metadata: [{ label: { en: ['Technique'], fr: ['Technique d\u2019analyse'] }, value: { en: ['Painting'], fr: ['Peinture'] } }],
    },
    {
      id: 'a2',
      metadata: [{ label: { en: ['Technique'], fr: ['Technique d\u2019analyse'] }, value: { en: ['Drawing'], fr: ['Dessin'] } }],
    },
  ];
  const w = 'lang-window';
  const c = 'lang-canvas';

  beforeEach(async () => {
    const { filtersStore } = await import('./filtersStore');
    filtersStore.clearFilters(w, c);
  });

  it('builds French labels and keys with fr prefs, exposing the value key', async () => {
    const { filtersStore } = await import('./filtersStore');
    filtersStore.initializeFromAnnotations(w, c, annotations, false, ['fr', 'none']);
    const [group] = filtersStore.getGroups(w, c);
    expect(group.label).toBe('Technique d\u2019analyse');
    expect([...group.values.keys()].sort()).toEqual(['dessin', 'peinture']);
    expect(group.values.get('dessin')!.key).toBe('dessin');
  });

  it('hides annotations using the French keys', async () => {
    const { filtersStore } = await import('./filtersStore');
    filtersStore.initializeFromAnnotations(w, c, annotations, false, ['fr']);
    const [group] = filtersStore.getGroups(w, c);
    filtersStore.toggleValue(w, c, group.key, 'dessin');
    expect([...filtersStore.updateHiddenAnnotations(w, c, annotations)]).toEqual(['a2']);
  });

  it('rebuilds (and resets the selection) when the prefs change, not otherwise', async () => {
    const { filtersStore } = await import('./filtersStore');
    filtersStore.initializeFromAnnotations(w, c, annotations, false, ['en']);
    const [en] = filtersStore.getGroups(w, c);
    filtersStore.toggleValue(w, c, en.key, 'drawing');
    expect(filtersStore.hasActiveFilters(w, c)).toBe(true);

    filtersStore.initializeFromAnnotations(w, c, annotations, false, ['en']);
    expect(filtersStore.hasActiveFilters(w, c)).toBe(true); // same prefs: untouched

    filtersStore.initializeFromAnnotations(w, c, annotations, false, ['fr']);
    expect(filtersStore.hasActiveFilters(w, c)).toBe(false);
    expect(filtersStore.getGroups(w, c)[0].label).toBe('Technique d\u2019analyse');
  });
});

describe('annotations without metadata', () => {
  const w = 'w-nometa';
  const c = 'c1';
  const m = (label: string, value: string) => [{ label: { en: [label] }, value: { en: [value] } }];
  const annotations = [
    { id: 'xrf', metadata: m('Technique', 'XRF') },
    { id: 'raman', metadata: m('Technique', 'Raman') },
    { id: 'other', metadata: m('Operator', 'Smith') },
    { id: 'cls-none' },
    { id: 'cls-empty', metadata: [] },
  ];

  it('does not count them under None', async () => {
    const { filtersStore, NONE_KEY } = await import('./filtersStore');
    filtersStore.initializeFromAnnotations(w, c, annotations, true, ['en']);
    const technique = filtersStore.getGroups(w, c).find((g) => g.key === 'meta:technique')!;
    expect(technique.values.get(NONE_KEY)).toMatchObject({ count: 1, visibleCount: 1 });
  });

  it('never hides them, whatever is deselected', async () => {
    const { filtersStore, NONE_KEY } = await import('./filtersStore');
    filtersStore.initializeFromAnnotations(w, c, annotations, true, ['en']);
    filtersStore.toggleValue(w, c, 'meta:technique', NONE_KEY);
    filtersStore.toggleValue(w, c, 'meta:technique', 'xrf');
    filtersStore.toggleValue(w, c, 'meta:operator', NONE_KEY);
    const hidden = filtersStore.updateHiddenAnnotations(w, c, annotations);
    expect([...hidden].sort()).toEqual(['other', 'raman', 'xrf']);
    expect(filtersStore.isAnnotationVisible(w, c, 'cls-none')).toBe(true);
    expect(filtersStore.isAnnotationVisible(w, c, 'cls-empty')).toBe(true);
    const technique = filtersStore.getGroups(w, c).find((g) => g.key === 'meta:technique')!;
    expect(technique.values.get(NONE_KEY)!.visibleCount).toBe(0);
  });

  describe('propertyGroupOf', () => {
    const body = (uri: string) => ({
      type: 'SpecificResource',
      purpose: 'describing',
      source: uri,
      label: { en: [uri.split('/').pop()!] },
    });
    const annotations = [
      { id: 'a1', body: [body('http://data.loterre.fr/lead'), body('http://v/layer')] },
      { id: 'a2', body: [body('http://data.loterre.fr/iron')] },
    ];
    const init = (fn?: (uri: string) => string | undefined, language = 'en') =>
      filtersStore.initializeFromAnnotations('w-hook', 'c-hook', annotations as never, false, [language], { propertyGroupOf: fn });

    it('captions a describing group with the hook result', () => {
      init((u) => (u.includes('loterre') ? 'Elements' : undefined));
      const group = filtersStore.getGroups('w-hook', 'c-hook').find((g) => g.key === facetGroupKey('describing', 'Elements'));
      expect(group?.label).toBe('Elements');
      expect(group?.values.size).toBe(2);
    });

    it('keeps the selection for the same hook and resets it for a new one', () => {
      const hook = (u: string) => (u.includes('loterre') ? 'Elements' : undefined);
      init(hook);
      const key = facetGroupKey('describing', 'Elements');
      const valueKey = [...filtersStore.getGroups('w-hook', 'c-hook').find((g) => g.key === key)!.values.keys()][0];
      filtersStore.toggleFacet('w-hook', 'c-hook', key, valueKey);
      init(hook);
      expect(filtersStore.getGroups('w-hook', 'c-hook').find((g) => g.key === key)!.values.get(valueKey)!.selected).toBe(false);
      init((u) => (u.includes('loterre') ? 'Elements' : undefined));
      expect(filtersStore.getGroups('w-hook', 'c-hook').find((g) => g.key === key)!.values.get(valueKey)!.selected).toBe(true);
      filtersStore.clearFilters('w-hook', 'c-hook');
    });
  });
});
