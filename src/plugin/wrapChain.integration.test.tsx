/**
 * The three AnnotationsOverlay wrap plugins through Mirador's real PluginProvider and
 * withPlugins: whatever the registration order, each must run and the target must
 * receive the filtered annotations.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
// @ts-expect-error not in Mirador's published typings
import { PluginProvider, withPlugins } from 'mirador';
import { metadataFiltersPlugin } from './MetadataFiltersPlugin';
import { selectionHighlightPlugin } from './SelectionHighlightPlugin';
import { searchResultFocusPlugin } from './SearchResultFocusPlugin';
import { filtersStore } from '../state/filtersStore';
import type { MiradorPlugin } from '../types/mirador';

vi.mock('mirador', async (importOriginal) => ({
  ...(await importOriginal<typeof import('mirador')>()),
  getSelectedAnnotationId: () => 'a',
  getSearchAnnotationsForWindow: () => [{ resources: [{ id: 'a' }] }],
  getCompanionWindowsForPosition: () => [{ id: 'cw', content: 'info' }],
}));

const overlay = metadataFiltersPlugin.find((p) => p.target === 'AnnotationsOverlay')!;
const all: Record<string, MiradorPlugin> = {
  filters: overlay,
  highlight: selectionHighlightPlugin,
  focus: searchResultFocusPlugin,
};

const seen: string[][] = [];
const Target: React.FC<{ annotations?: Array<{ resources: Array<{ id: string }> }> }> = ({ annotations }) => {
  seen.push((annotations ?? []).flatMap((l) => l.resources.map((r) => r.id)));
  return null;
};
const Wrapped = withPlugins('AnnotationsOverlay', Target);

const dispatch = vi.fn();
const state = {};
const store = { getState: () => state, subscribe: () => () => {}, dispatch };

const res = (id: string) => ({ id, targetId: 'c1', fragmentSelector: [1, 1, 10, 10] });

beforeEach(() => {
  seen.length = 0;
  dispatch.mockClear();
  filtersStore.clearWindow('w');
});
afterEach(cleanup);

const orders = [
  ['filters', 'highlight', 'focus'],
  ['highlight', 'focus', 'filters'],
  ['highlight', 'filters', 'focus'],
];

describe.each(orders)('wrap order %s, %s, %s', (...order) => {
  it('runs every plugin and filters what the target draws', async () => {
    const annos = [
      { id: 'a', metadata: [{ label: { en: ['kind'] }, value: { en: ['one'] } }] },
      { id: 'b', metadata: [{ label: { en: ['kind'] }, value: { en: ['two'] } }] },
    ];
    filtersStore.initializeFromAnnotations('w', 'c1', annos as never, true, ['en']);
    filtersStore.toggleValue('w', 'c1', 'kind', 'two');
    filtersStore.updateHiddenAnnotations('w', 'c1', annos as never);
    const plugins = order.map((k) => all[k]); // stable: PluginProvider re-maps on a new array
    const viewer = { canvas: document.createElement('div') };

    render(
      <Provider store={store as never}>
        <PluginProvider plugins={plugins}>
          <Wrapped
            windowId="w"
            viewer={viewer}
            selectedAnnotationId="a"
            annotations={[{ id: 'l', resources: [res('a'), res('b')] }]}
          />
        </PluginProvider>
      </Provider>,
    );

    // Filter overlay: the target only gets the visible annotation.
    await waitFor(() => expect(seen.at(-1)).toEqual(['a']));
    // Selection highlight: the pulse is portalled into the viewer canvas.
    await waitFor(() => expect(viewer.canvas.childElementCount).toBeGreaterThan(0));
    // Search focus: switches the left panel to the annotations list.
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
  });
});
