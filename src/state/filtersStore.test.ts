import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Tests for filtersStore
 *
 * Tests the metadata filtering logic:
 * - Initialization from annotations
 * - Value toggling and selection
 * - Hidden annotation calculation
 * - "None" value handling for missing metadata
 */

// Re-implement utility functions for testing (they are not exported)
function parseValueWithUrl(value: string): { displayText: string; url?: string } {
  const urlMatch = value.match(/^(.+?)\s*\((https?:\/\/[^)]+)\)$/);
  if (urlMatch) {
    return {
      displayText: urlMatch[1].trim(),
      url: urlMatch[2],
    };
  }
  return { displayText: value };
}

function normalizeKey(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, '_');
}

function createKey(windowId: string, canvasId: string): string {
  return `${windowId}::${canvasId}`;
}

describe('filtersStore utility functions', () => {
  describe('parseValueWithUrl', () => {
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

      const techniqueGroup = groups.find(g => g.key === 'technique');
      expect(techniqueGroup).toBeDefined();
      expect(techniqueGroup!.values.size).toBe(2);
      expect(techniqueGroup!.values.get('xrf')?.count).toBe(1);
      expect(techniqueGroup!.values.get('raman')?.count).toBe(1);

      const operatorGroup = groups.find(g => g.key === 'operator');
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
      const operatorGroup = groups.find(g => g.key === 'operator');

      expect(operatorGroup).toBeDefined();
      const noneValue = operatorGroup!.values.get('__none__');
      expect(noneValue).toBeDefined();
      expect(noneValue!.count).toBe(1);
      expect(noneValue!.displayText).toBe('None');
    });

    it('should not reinitialize if already initialized (unless forced)', () => {
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
      filtersStore.initializeFromAnnotations('test-window', 'test-canvas', annotations2);

      const groups = filtersStore.getGroups('test-window', 'test-canvas');
      expect(groups[0]?.values.has('xrf')).toBe(true);
      expect(groups[0]?.values.has('raman')).toBe(false);
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

      filtersStore.toggleValue('test-window', 'test-canvas', 'technique', 'xrf');

      groups = filtersStore.getGroups('test-window', 'test-canvas');
      expect(groups[0]?.values.get('xrf')?.selected).toBe(false);

      filtersStore.toggleValue('test-window', 'test-canvas', 'technique', 'xrf');

      groups = filtersStore.getGroups('test-window', 'test-canvas');
      expect(groups[0]?.values.get('xrf')?.selected).toBe(true);
    });

    it('should handle non-existent label key', () => {
      // Should not throw
      filtersStore.toggleValue('test-window', 'test-canvas', 'nonexistent', 'xrf');
    });

    it('should handle non-existent value key', () => {
      // Should not throw
      filtersStore.toggleValue('test-window', 'test-canvas', 'technique', 'nonexistent');
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
      filtersStore.deselectAll('test-window', 'test-canvas', 'technique');

      const groups = filtersStore.getGroups('test-window', 'test-canvas');
      for (const value of groups[0]?.values.values() ?? []) {
        expect(value.selected).toBe(false);
      }
    });

    it('should select all values in a group', () => {
      filtersStore.deselectAll('test-window', 'test-canvas', 'technique');
      filtersStore.selectAll('test-window', 'test-canvas', 'technique');

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
      filtersStore.toggleValue('test-window', 'test-canvas', 'technique', 'xrf');

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
      filtersStore.toggleValue('test-window', 'test-canvas', 'operator', '__none__');

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
      filtersStore.toggleValue('test-window', 'test-canvas', 'technique', 'raman');
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
      filtersStore.toggleValue('test-window', 'test-canvas', 'technique', 'xrf');

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
      filtersStore.toggleValue('test-window', 'test-canvas', 'technique', 'xrf');
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
      filtersStore.toggleValue('test-window', 'test-canvas', 'technique', 'xrf');
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

      filtersStore.toggleValue('test-window', 'test-canvas', 'technique', 'xrf');

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
      filtersStore.toggleValue('test-window', 'test-canvas', 'technique', 'xrf');

      const activeFilters = filtersStore.getActiveFilters('test-window', 'test-canvas');

      expect(activeFilters.get('technique')?.has('xrf')).toBe(false);
      expect(activeFilters.get('technique')?.has('raman')).toBe(true);
      expect(activeFilters.get('operator')?.has('john')).toBe(true);
      expect(activeFilters.get('operator')?.has('jane')).toBe(true);
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

      filtersStore.toggleGroupExpanded('test-window', 'test-canvas', 'technique');

      groups = filtersStore.getGroups('test-window', 'test-canvas');
      expect(groups[0]?.expanded).toBe(false);

      filtersStore.toggleGroupExpanded('test-window', 'test-canvas', 'technique');

      groups = filtersStore.getGroups('test-window', 'test-canvas');
      expect(groups[0]?.expanded).toBe(true);
    });
  });
});
