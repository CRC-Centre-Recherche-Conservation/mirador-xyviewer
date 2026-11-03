/**
 * The point markers plugin through Mirador's real PluginProvider and withPlugins, in both
 * wrap orders with the metadata filter and the selection highlight: the target must get the
 * areas only (filtered), markers must render for the points, and the pulse must still find a
 * selected point.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
// @ts-expect-error not in Mirador's published typings
import { PluginProvider, withPlugins, OSDReferences as OSDReferencesTyped, AnnotationItem } from 'mirador';
import { metadataFiltersPlugin } from './MetadataFiltersPlugin';
import { selectionHighlightPlugin } from './SelectionHighlightPlugin';
import { pointMarkersPlugin, mapStateToProps } from './PointMarkersPlugin';
import { filtersStore } from '../state/filtersStore';
import { createCircleSvgSelector } from '../utils/annotationSelectors';
import type { MiradorPlugin, MiradorState } from '../types/mirador';

const OSDReferences = OSDReferencesTyped as unknown as { set(id: string, ref: unknown): void; remove(id: string): void };
const overlay = metadataFiltersPlugin.find((p) => p.target === 'AnnotationsOverlay')!;
const all: Record<string, MiradorPlugin> = { filters: overlay, markers: pointMarkersPlugin, highlight: selectionHighlightPlugin };

const seen: string[][] = [];
const Target: React.FC<{ annotations?: Array<{ resources: Array<{ id: string }> }> }> = ({ annotations }) => {
  seen.push((annotations ?? []).flatMap((l) => l.resources.map((r) => r.id)));
  return null;
};
const Wrapped = withPlugins('AnnotationsOverlay', Target);

const store = { getState: () => ({}), subscribe: () => () => {}, dispatch: vi.fn() };
const item = (id: string, selector: unknown, metadata?: unknown) =>
  new AnnotationItem({ id, type: 'Annotation', metadata, target: { type: 'SpecificResource', source: 'c1', selector } });
const meta = (v: string) => [{ label: { en: ['kind'] }, value: { en: [v] } }];

function fakeViewer() {
  class Pt {
    constructor(public x: number, public y: number) {}
  }
  return {
    canvas: document.createElement('div'),
    viewport: {
      getCenter: () => new Pt(0, 0),
      getZoom: () => 1,
      getMaxZoom: () => 10,
      getContainerSize: () => new Pt(1000, 500),
      viewportToViewerElementCoordinates: (p: Pt) => p,
      imageToViewportCoordinates: (p: Pt) => p,
    },
    addHandler: () => {},
    removeHandler: () => {},
  };
}

beforeEach(() => {
  seen.length = 0;
  filtersStore.clearWindow('w');
});
afterEach(() => {
  cleanup();
  OSDReferences.remove('w');
});

describe.each([
  ['filters', 'markers', 'highlight'],
  ['markers', 'filters', 'highlight'],
  ['highlight', 'markers', 'filters'],
  ['highlight', 'filters', 'markers'],
])('wrap order %s, %s, %s', (...order) => {
  it('swaps the areas through the chain and renders markers for the points', async () => {
    const annos = [
      { id: 'a', metadata: meta('one') },
      { id: 'b', metadata: meta('two') },
    ];
    filtersStore.initializeFromAnnotations('w', 'c1', annos as never, true, ['en']);
    filtersStore.toggleValue('w', 'c1', 'meta:kind', 'two');
    filtersStore.updateHiddenAnnotations('w', 'c1', annos as never);
    const viewer = fakeViewer();
    OSDReferences.set('w', { current: viewer });
    const plugins = order.map((k) => all[k]);

    const lists = [{
      id: 'l',
      resources: [
        item('a', { type: 'FragmentSelector', value: 'xywh=1,1,10,10' }, meta('one')),
        item('b', { type: 'FragmentSelector', value: 'xywh=1,1,10,10' }, meta('two')),
        item('p', createCircleSvgSelector(30, 40, 7)),
      ],
    }];
    render(
      <Provider store={store as never}>
        <PluginProvider plugins={plugins}>
          <Wrapped windowId="w" viewer={viewer} selectedAnnotationId="p" highlightAllAnnotations annotations={lists} />
        </PluginProvider>
      </Provider>,
    );

    // The target draws the visible area only: no hidden area, no point.
    await waitFor(() => expect(seen.at(-1)).toEqual(['a']));
    // The point is a DOM marker (selected) and the pulse still resolved it.
    await waitFor(() => expect(viewer.canvas.querySelectorAll('[data-xyviewer-point-marker="selected"]')).toHaveLength(1));
    await waitFor(() => expect(viewer.canvas.querySelectorAll('[data-xyviewer-point-markers] > *')).toHaveLength(1));
    await waitFor(() => expect(viewer.canvas.childElementCount).toBeGreaterThan(2));
  });
});

describe('mapStateToProps', () => {
  it('reads the host config and language', () => {
    const cfg = { minSize: 20 };
    const state = { config: { language: 'fr', scientificAnnotations: { pointMarkers: cfg } } } as unknown as MiradorState;
    expect(mapStateToProps(state)).toEqual({ pointMarkersConfig: cfg, language: 'fr' });
    expect(mapStateToProps({} as MiradorState)).toEqual({ pointMarkersConfig: undefined, language: undefined });
  });

  it('is a wrap plugin of AnnotationsOverlay', () => {
    expect(pointMarkersPlugin.target).toBe('AnnotationsOverlay');
    expect(pointMarkersPlugin.mode).toBe('wrap');
  });
});
