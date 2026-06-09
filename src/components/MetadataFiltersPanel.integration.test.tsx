/**
 * Pattern D integration: filter visibility through the real store.
 * MetadataFiltersPanel -> filtersStore.toggleValue -> updateHiddenAnnotations.
 * Deselecting a value hides the annotations carrying it; the panel reports the
 * real hidden set via onFiltersChange. No mocks — the panel and store are wired
 * exactly as in production.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MetadataFiltersPanel } from './MetadataFiltersPanel';
import { filtersStore } from '../state/filtersStore';

const WIN = 'win-int';
const CANVAS = 'canvas-int';
const annotations = [
  { id: 'a1', metadata: [{ label: { none: ['Technique'] }, value: { none: ['XRF'] } }] },
  { id: 'a2', metadata: [{ label: { none: ['Technique'] }, value: { none: ['Raman'] } }] },
];

beforeEach(() => filtersStore.clearFilters(WIN, CANVAS));

describe('filter-visibility integration', () => {
  it('hides the matching annotation when its value is deselected', () => {
    filtersStore.initializeFromAnnotations(WIN, CANVAS, annotations);
    const onFiltersChange = vi.fn();
    render(
      <MetadataFiltersPanel
        windowId={WIN}
        canvasId={CANVAS}
        annotations={annotations}
        onFiltersChange={onFiltersChange}
      />,
    );

    // Deselect the first value -> the annotation carrying it becomes hidden.
    fireEvent.click(screen.getAllByRole('checkbox')[0]);

    const hidden = onFiltersChange.mock.calls.at(-1)![0] as Set<string>;
    expect(hidden.size).toBe(1);
    // The store and the callback agree.
    expect(filtersStore.getHiddenAnnotationIds(WIN, CANVAS).size).toBe(1);
  });
});
