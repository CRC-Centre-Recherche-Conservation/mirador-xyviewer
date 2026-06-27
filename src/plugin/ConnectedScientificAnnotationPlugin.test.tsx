import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  computeVisibleAnnotations,
  shownOnlyBecauseSelected,
  ScientificAnnotationPluginComponent,
} from './ConnectedScientificAnnotationPlugin';
import { filtersStore } from '../state/filtersStore';
import { datasetAnnotation } from '../test/fixtures/miradorState';

vi.mock('../components/AnnotationBodyRenderer', () => ({
  AnnotationBodyRenderer: () => <div data-testid="body-renderer" />,
}));
vi.mock('../components/MetadataDisplay', () => ({
  MetadataDisplay: () => <div data-testid="metadata" />,
}));

afterEach(() => filtersStore.clearWindow('w1'));

describe('computeVisibleAnnotations', () => {
  const hidden = new Set(['b']);
  it('drops hidden annotations', () => {
    const out = computeVisibleAnnotations([{ id: 'a' }, { id: 'b' }], hidden, undefined);
    expect(out.map((a) => a.id)).toEqual(['a']);
  });
  it('keeps a hidden annotation when it is the selected one', () => {
    const out = computeVisibleAnnotations([{ id: 'a' }, { id: 'b' }], hidden, 'b');
    expect(out.map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('shownOnlyBecauseSelected', () => {
  it('true only when hidden AND selected', () => {
    expect(shownOnlyBecauseSelected('b', new Set(['b']), 'b')).toBe(true);
    expect(shownOnlyBecauseSelected('b', new Set(['b']), 'a')).toBe(false);
    expect(shownOnlyBecauseSelected('a', new Set(['b']), 'a')).toBe(false);
  });
});

describe('hidden-but-selected annotation', () => {
  it('renders the selected hidden annotation with a "hidden by filter" badge', () => {
    const windowId = 'w1';
    const canvasId = 'c1';
    const annId = datasetAnnotation.id;
    // Build a filter group from one metadata value, then deselect it to hide the annotation.
    const forFilter = [{ id: annId, metadata: [{ label: { en: ['k'] }, value: { en: ['v'] } }] }];
    filtersStore.initializeFromAnnotations(windowId, canvasId, forFilter);
    for (const group of filtersStore.getGroups(windowId, canvasId)) {
      for (const valueKey of group.values.keys()) {
        filtersStore.toggleValue(windowId, canvasId, group.key, valueKey);
      }
    }
    filtersStore.updateHiddenAnnotations(windowId, canvasId, forFilter);
    expect(filtersStore.getHiddenAnnotationIds(windowId, canvasId).has(annId)).toBe(true);

    render(
      <ScientificAnnotationPluginComponent
        targetProps={
          {
            annotations: [{ id: annId, content: 'x', tags: [], targetId: 't' }],
            windowId,
            canvasId,
            selectedAnnotationId: annId,
            selectAnnotation: vi.fn(),
            deselectAnnotation: vi.fn(),
            hoverAnnotation: vi.fn(),
          } as never
        }
        TargetComponent={(() => <div data-testid="target" />) as never}
        dispatch={vi.fn()}
        addWindow={vi.fn()}
        annotationResources={{ [annId]: datasetAnnotation }}
      />,
    );

    expect(screen.getByRole('note')).toHaveTextContent(/hidden by the metadata filter/i);
    expect(screen.getByTestId('body-renderer')).toBeInTheDocument();
  });
});
