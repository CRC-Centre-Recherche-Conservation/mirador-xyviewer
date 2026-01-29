/**
 * Filters Store
 * Global state management for metadata filters
 *
 * This store manages:
 * - Active filters by label/value
 * - Filter visibility per window+canvas combination
 */

import type { LocalizedString } from '../types/iiif';
import { getLocalizedString } from '../utils/localization';

/** Filter value entry */
export interface FilterValue {
  /** Raw value string */
  raw: string;
  /** Display text (without URL) */
  displayText: string;
  /** Associated URL if any */
  url?: string;
  /** Total count of annotations with this value */
  count: number;
  /** Count of visible annotations with this value (after filtering) */
  visibleCount: number;
  /** Whether this value is selected (checked) */
  selected: boolean;
}

/** Filter group (by label) */
export interface FilterGroup {
  /** Label key (normalized) */
  key: string;
  /** Display label */
  label: string;
  /** Values for this label */
  values: Map<string, FilterValue>;
  /** Whether the group is expanded */
  expanded: boolean;
}

/** Store state per window+canvas */
interface FilterState {
  /** Filter groups by label key */
  groups: Map<string, FilterGroup>;
  /** Set of hidden annotation IDs based on current filters */
  hiddenAnnotationIds: Set<string>;
}

/** Event types for subscribers */
type FiltersStoreEvent =
  | { type: 'init'; windowId: string; canvasId: string }
  | { type: 'toggle-value'; windowId: string; canvasId: string; labelKey: string; valueKey: string; selected: boolean }
  | { type: 'toggle-group'; windowId: string; canvasId: string; labelKey: string; expanded: boolean }
  | { type: 'select-all'; windowId: string; canvasId: string; labelKey: string }
  | { type: 'deselect-all'; windowId: string; canvasId: string; labelKey: string }
  | { type: 'update-hidden'; windowId: string; canvasId: string; hiddenIds: Set<string> }
  | { type: 'clear'; windowId: string; canvasId: string };

type FiltersStoreListener = (event: FiltersStoreEvent) => void;

/**
 * Parse value to extract display text and URL
 * Format: "Display text (http://...)" or just "Display text"
 */
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

/**
 * Normalize a label key for grouping
 */
function normalizeKey(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, '_');
}

/**
 * Create a composite key from windowId and canvasId
 */
function createKey(windowId: string, canvasId: string): string {
  return `${windowId}::${canvasId}`;
}

/**
 * Global filters store class
 */
class FiltersStore {
  private states: Map<string, FilterState> = new Map();
  private listeners: Set<FiltersStoreListener> = new Set();

  /**
   * Subscribe to store changes
   */
  subscribe(listener: FiltersStoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of an event
   */
  private notify(event: FiltersStoreEvent): void {
    this.listeners.forEach(listener => listener(event));
  }

  /**
   * Get or create state for window+canvas combination
   */
  private getState(key: string): FilterState {
    if (!this.states.has(key)) {
      this.states.set(key, {
        groups: new Map(),
        hiddenAnnotationIds: new Set(),
      });
    }
    return this.states.get(key)!;
  }

  /**
   * Check if filters are already initialized for a window+canvas
   */
  hasFiltersInitialized(windowId: string, canvasId: string): boolean {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    return state !== undefined && state.groups.size > 0;
  }

  /**
   * Initialize filters from annotations (only if not already initialized)
   */
  initializeFromAnnotations(
    windowId: string,
    canvasId: string,
    annotations: Array<{
      id: string;
      metadata?: Array<{
        label: LocalizedString;
        value: LocalizedString;
      }>;
    }>,
    force: boolean = false
  ): void {
    const key = createKey(windowId, canvasId);

    // Skip if already initialized (unless forced)
    if (!force && this.hasFiltersInitialized(windowId, canvasId)) {
      return;
    }

    const state = this.getState(key);
    state.groups.clear();
    state.hiddenAnnotationIds.clear();

    // First pass: Build filter groups from annotations
    for (const annotation of annotations) {
      if (!annotation.metadata) continue;

      for (const entry of annotation.metadata) {
        const labelText = getLocalizedString(entry.label) || 'Unknown';
        const labelKey = normalizeKey(labelText);
        const valueText = getLocalizedString(entry.value) || '';

        if (!valueText) continue;

        // Get or create group
        if (!state.groups.has(labelKey)) {
          state.groups.set(labelKey, {
            key: labelKey,
            label: labelText,
            values: new Map(),
            expanded: true, // Start expanded
          });
        }

        const group = state.groups.get(labelKey)!;
        const valueKey = normalizeKey(valueText);

        // Get or create value
        if (!group.values.has(valueKey)) {
          const parsed = parseValueWithUrl(valueText);
          group.values.set(valueKey, {
            raw: valueText,
            displayText: parsed.displayText,
            url: parsed.url,
            count: 0,
            visibleCount: 0,
            selected: true, // All selected by default
          });
        }

        // Increment count
        const filterValue = group.values.get(valueKey)!;
        filterValue.count++;
        filterValue.visibleCount++; // Initially all are visible
      }
    }

    // Second pass: Add "None" entries for annotations missing values in each group
    const allGroupKeys = Array.from(state.groups.keys());

    for (const annotation of annotations) {
      // Get the label keys this annotation has
      const annotationLabelKeys = new Set<string>();
      if (annotation.metadata) {
        for (const entry of annotation.metadata) {
          const labelText = getLocalizedString(entry.label) || 'Unknown';
          const labelKey = normalizeKey(labelText);
          const valueText = getLocalizedString(entry.value) || '';
          if (valueText) {
            annotationLabelKeys.add(labelKey);
          }
        }
      }

      // For each group, check if annotation is missing a value
      for (const labelKey of allGroupKeys) {
        if (!annotationLabelKeys.has(labelKey)) {
          const group = state.groups.get(labelKey)!;

          // Create "None" value if it doesn't exist
          if (!group.values.has('__none__')) {
            group.values.set('__none__', {
              raw: '__none__',
              displayText: 'None',
              count: 0,
              visibleCount: 0,
              selected: true,
            });
          }

          // Increment count for "None"
          const noneValue = group.values.get('__none__')!;
          noneValue.count++;
          noneValue.visibleCount++;
        }
      }
    }

    this.notify({ type: 'init', windowId, canvasId });
  }

  /**
   * Toggle a specific value's selection
   */
  toggleValue(windowId: string, canvasId: string, labelKey: string, valueKey: string): void {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return;

    const group = state.groups.get(labelKey);
    if (!group) return;

    const value = group.values.get(valueKey);
    if (!value) return;

    value.selected = !value.selected;
    this.notify({ type: 'toggle-value', windowId, canvasId, labelKey, valueKey, selected: value.selected });
  }

  /**
   * Toggle group expansion
   */
  toggleGroupExpanded(windowId: string, canvasId: string, labelKey: string): void {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return;

    const group = state.groups.get(labelKey);
    if (!group) return;

    group.expanded = !group.expanded;
    this.notify({ type: 'toggle-group', windowId, canvasId, labelKey, expanded: group.expanded });
  }

  /**
   * Select all values in a group
   */
  selectAll(windowId: string, canvasId: string, labelKey: string): void {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return;

    const group = state.groups.get(labelKey);
    if (!group) return;

    for (const value of group.values.values()) {
      value.selected = true;
    }
    this.notify({ type: 'select-all', windowId, canvasId, labelKey });
  }

  /**
   * Deselect all values in a group
   */
  deselectAll(windowId: string, canvasId: string, labelKey: string): void {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return;

    const group = state.groups.get(labelKey);
    if (!group) return;

    for (const value of group.values.values()) {
      value.selected = false;
    }
    this.notify({ type: 'deselect-all', windowId, canvasId, labelKey });
  }

  /**
   * Get filter groups for a window+canvas
   */
  getGroups(windowId: string, canvasId: string): FilterGroup[] {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return [];
    return Array.from(state.groups.values());
  }

  /**
   * Get hidden annotation IDs for a window+canvas
   */
  getHiddenAnnotationIds(windowId: string, canvasId: string): Set<string> {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return new Set();
    return state.hiddenAnnotationIds;
  }

  /**
   * Update hidden annotation IDs based on current filters
   */
  updateHiddenAnnotations(
    windowId: string,
    canvasId: string,
    annotations: Array<{
      id: string;
      metadata?: Array<{
        label: LocalizedString;
        value: LocalizedString;
      }>;
    }>
  ): Set<string> {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return new Set();

    const hiddenIds = new Set<string>();
    const allGroupKeys = Array.from(state.groups.keys());

    // Reset all visible counts to 0
    for (const group of state.groups.values()) {
      for (const value of group.values.values()) {
        value.visibleCount = 0;
      }
    }

    for (const annotation of annotations) {
      let shouldHide = false;

      // Get the label keys this annotation has
      const annotationLabelKeys = new Set<string>();
      if (annotation.metadata) {
        for (const entry of annotation.metadata) {
          const labelText = getLocalizedString(entry.label) || 'Unknown';
          const labelKey = normalizeKey(labelText);
          const valueText = getLocalizedString(entry.value) || '';
          if (valueText) {
            annotationLabelKeys.add(labelKey);
          }
        }
      }

      // Check if annotation matches any deselected filter
      if (annotation.metadata) {
        for (const entry of annotation.metadata) {
          const labelText = getLocalizedString(entry.label) || 'Unknown';
          const labelKey = normalizeKey(labelText);
          const valueText = getLocalizedString(entry.value) || '';
          const valueKey = normalizeKey(valueText);

          const group = state.groups.get(labelKey);
          if (!group) continue;

          const value = group.values.get(valueKey);
          if (value && !value.selected) {
            shouldHide = true;
            break;
          }
        }
      }

      // Check if annotation should be hidden because "None" is deselected for a group it's missing
      if (!shouldHide) {
        for (const labelKey of allGroupKeys) {
          if (!annotationLabelKeys.has(labelKey)) {
            const group = state.groups.get(labelKey)!;
            const noneValue = group.values.get('__none__');
            if (noneValue && !noneValue.selected) {
              shouldHide = true;
              break;
            }
          }
        }
      }

      if (shouldHide) {
        hiddenIds.add(annotation.id);
      } else {
        // Annotation is visible - increment visible counts for all its metadata values
        if (annotation.metadata) {
          for (const entry of annotation.metadata) {
            const labelText = getLocalizedString(entry.label) || 'Unknown';
            const labelKey = normalizeKey(labelText);
            const valueText = getLocalizedString(entry.value) || '';
            const valueKey = normalizeKey(valueText);

            const group = state.groups.get(labelKey);
            if (!group) continue;

            const value = group.values.get(valueKey);
            if (value) {
              value.visibleCount++;
            }
          }
        }

        // Increment "None" visible counts for groups this annotation is missing
        for (const labelKey of allGroupKeys) {
          if (!annotationLabelKeys.has(labelKey)) {
            const group = state.groups.get(labelKey)!;
            const noneValue = group.values.get('__none__');
            if (noneValue) {
              noneValue.visibleCount++;
            }
          }
        }
      }
    }

    state.hiddenAnnotationIds = hiddenIds;
    this.notify({ type: 'update-hidden', windowId, canvasId, hiddenIds });
    return hiddenIds;
  }

  /**
   * Check if an annotation should be visible based on filters
   */
  isAnnotationVisible(windowId: string, canvasId: string, annotationId: string): boolean {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return true;
    return !state.hiddenAnnotationIds.has(annotationId);
  }

  /**
   * Reset all filters to default (all selected)
   */
  resetAll(windowId: string, canvasId: string): void {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return;

    for (const group of state.groups.values()) {
      for (const value of group.values.values()) {
        value.selected = true;
        value.visibleCount = value.count; // All visible when reset
      }
    }
    state.hiddenAnnotationIds.clear();
    this.notify({ type: 'update-hidden', windowId, canvasId, hiddenIds: new Set() });
  }

  /**
   * Clear filters for a window+canvas
   */
  clearFilters(windowId: string, canvasId: string): void {
    const key = createKey(windowId, canvasId);
    this.states.delete(key);
    this.notify({ type: 'clear', windowId, canvasId });
  }

  /**
   * Clear all filters for a window (all canvases)
   */
  clearWindow(windowId: string): void {
    const prefix = `${windowId}::`;
    for (const key of this.states.keys()) {
      if (key.startsWith(prefix)) {
        this.states.delete(key);
      }
    }
  }

  /**
   * Get all active filter selections for a window+canvas
   */
  getActiveFilters(windowId: string, canvasId: string): Map<string, Set<string>> {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return new Map();

    const active = new Map<string, Set<string>>();
    for (const [labelKey, group] of state.groups) {
      const selectedValues = new Set<string>();
      for (const [valueKey, value] of group.values) {
        if (value.selected) {
          selectedValues.add(valueKey);
        }
      }
      if (selectedValues.size > 0) {
        active.set(labelKey, selectedValues);
      }
    }
    return active;
  }

  /**
   * Check if any filters are active (not all selected)
   */
  hasActiveFilters(windowId: string, canvasId: string): boolean {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return false;

    for (const group of state.groups.values()) {
      for (const value of group.values.values()) {
        if (!value.selected) return true;
      }
    }
    return false;
  }
}

// Singleton instance
export const filtersStore = new FiltersStore();

// Export types
export type { FiltersStoreEvent, FiltersStoreListener };
