import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  filterOverlayAnnotations,
  MetadataFilterOverlayPluginComponent,
  metadataFilterOverlayPlugin,
} from './MetadataFilterOverlayPlugin';
import { filtersStore } from '../state/filtersStore';
import { expandAnnotations } from '../utils/annotationNormalizer';
import { transformEmbeddedAnnotationPages } from '../utils/annotationTransformer';
import type { AnnotationV3 } from '../types/iiif';
// @ts-expect-error untyped Mirador source; the package exports map hides it
import AnnotationItem from '../../node_modules/mirador/src/lib/AnnotationItem.js';

const res = (id: string, targetId = 'c1') => ({ id, targetId });
const hidden = (...ids: string[]) => () => new Set(ids);

/** Mimics Mirador's wrapper classes: `resources` is a prototype getter. */
class FakeList {
  constructor(private raw: Array<{ id: string; targetId: string }>) {}
  get resources() { return this.raw; }
  describe() { return `list of ${this.resources.length}`; }
}

describe('filterOverlayAnnotations', () => {
  it('removes hidden resources and keeps the others', () => {
    const out = filterOverlayAnnotations([{ resources: [res('a'), res('b'), res('c')] }], hidden('b'));
    expect(out[0].resources!.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('keeps the selected annotation even when hidden', () => {
    const out = filterOverlayAnnotations([{ resources: [res('a'), res('b')] }], hidden('a', 'b'), 'b');
    expect(out[0].resources!.map((r) => r.id)).toEqual(['b']);
  });

  it('returns the same array and lists when nothing is hidden', () => {
    const lists = [{ resources: [res('a')] }];
    expect(filterOverlayAnnotations(lists, hidden())).toBe(lists);
    expect(filterOverlayAnnotations(lists, () => undefined)).toBe(lists);
    expect(filterOverlayAnnotations(lists, hidden('zzz'))).toBe(lists);
  });

  it('keeps unchanged lists by reference and does not mutate the input', () => {
    const l1 = { resources: [res('a')] };
    const l2 = { resources: [res('b')] };
    const out = filterOverlayAnnotations([l1, l2], hidden('b'));
    expect(out[0]).toBe(l1);
    expect(out[1].resources).toEqual([]);
    expect(l2.resources).toHaveLength(1);
  });

  it('preserves the prototype of Mirador list wrappers', () => {
    const list = new FakeList([res('a'), res('b')]);
    const [copy] = filterOverlayAnnotations([list], hidden('a'));
    expect(copy.describe()).toBe('list of 1');
    expect(list.resources).toHaveLength(2);
  });

  it('looks hidden ids up per canvas (book view)', () => {
    const lists = [{ resources: [res('x', 'c1'), res('x', 'c2')] }];
    const hiddenFor = (canvasId: string) => (canvasId === 'c2' ? new Set(['x']) : undefined);
    const out = filterOverlayAnnotations(lists, hiddenFor);
    expect(out[0].resources).toEqual([res('x', 'c1')]);
  });

  it('tolerates malformed lists and resources', () => {
    const lists = [{}, { resources: [{}, { id: 'a' }, null as never] }];
    expect(() => filterOverlayAnnotations(lists, hidden('a'))).not.toThrow();
  });
});

describe('multi-target expansion', () => {
  it('hides the expanded ids the filter store keys on', () => {
    const W = 'w-exp';
    const base = { type: 'Annotation', metadata: [{ label: { en: ['Kind'] }, value: { en: ['x'] } }] };
    const expanded = expandAnnotations([
      { ...base, id: 'multi', target: ['c1#xywh=0,0,5,5', 'c1#xywh=9,9,5,5'] },
      { ...base, id: 'single', target: 'c1#xywh=1,1,5,5', metadata: [] },
    ] as unknown as AnnotationV3[]);
    const ids = expanded.map((a) => a.id);
    expect(ids).toEqual(['multi#target-0', 'multi#target-1', 'single']);

    filtersStore.initializeFromAnnotations(W, 'c1', expanded as never, true, ['en']);
    filtersStore.toggleValue(W, 'c1', 'kind', 'x');
    filtersStore.updateHiddenAnnotations(W, 'c1', expanded as never);

    const lists = [{ resources: ids.map((id) => ({ id, targetId: 'c1' })) }];
    const hiddenFor = (c: string) => (filtersStore.hasFiltersInitialized(W, c) ? filtersStore.getHiddenAnnotationIds(W, c) : undefined);
    const out = filterOverlayAnnotations(lists, hiddenFor);
    expect(out[0].resources!.map((r) => r.id)).toEqual(['single']);
    filtersStore.clearWindow(W);
  });
});

describe('MetadataFilterOverlayPluginComponent', () => {
  const W = 'w-overlay';
  const C = 'c1';
  const meta = (v: string) => [{ label: { en: ['Kind'] }, value: { en: [v] } }];
  const seen: string[][] = [];
  const Target = ({ annotations }: { annotations?: Array<{ resources?: Array<{ id?: string }> }> }) => {
    seen.push((annotations ?? []).flatMap((l) => (l.resources ?? []).map((r) => r.id as string)));
    return <div data-testid="target" />;
  };
  const annotations = [{ resources: [res('a'), res('b')] }];
  const renderPlugin = (selected: string | null = null) =>
    render(
      <MetadataFilterOverlayPluginComponent
        targetProps={{ windowId: W, annotations, selectedAnnotationId: selected }}
        TargetComponent={Target as never}
      />,
    );

  beforeEach(() => {
    seen.length = 0;
    filtersStore.initializeFromAnnotations(W, C, [
      { id: 'a', metadata: meta('one') },
      { id: 'b', metadata: meta('two') },
    ], true, ['en']);
  });
  afterEach(() => filtersStore.clearWindow(W));

  it('passes annotations untouched while nothing is hidden', () => {
    renderPlugin();
    expect(screen.getByTestId('target')).toBeInTheDocument();
    expect(seen.at(-1)).toEqual(['a', 'b']);
  });

  it('follows the filter store live', () => {
    renderPlugin();
    act(() => {
      filtersStore.toggleValue(W, C, 'kind', 'two');
      filtersStore.updateHiddenAnnotations(W, C, [
        { id: 'a', metadata: meta('one') },
        { id: 'b', metadata: meta('two') },
      ]);
    });
    expect(seen.at(-1)).toEqual(['a']);
    act(() => filtersStore.resetAll(W, C));
    expect(seen.at(-1)).toEqual(['a', 'b']);
  });

  it('ignores events of other windows and unsubscribes on unmount', () => {
    const { unmount } = renderPlugin();
    const before = seen.length;
    act(() => filtersStore.resetAll('other', C));
    expect(seen.length).toBe(before);
    unmount();
    const afterUnmount = seen.length;
    act(() => filtersStore.resetAll(W, C));
    expect(seen.length).toBe(afterUnmount);
  });

  it('keeps the selected annotation drawn', () => {
    filtersStore.toggleValue(W, C, 'kind', 'two');
    filtersStore.updateHiddenAnnotations(W, C, [
      { id: 'a', metadata: meta('one') },
      { id: 'b', metadata: meta('two') },
    ]);
    renderPlugin('b');
    expect(seen.at(-1)).toEqual(['a', 'b']);
  });

  it('ignores UI-only events such as toggle-group', () => {
    renderPlugin();
    const before = seen.length;
    act(() => filtersStore.toggleGroupExpanded(W, C, 'kind'));
    expect(seen.length).toBe(before);
  });

  it('filters per canvas when only one canvas has initialized filters', () => {
    const W2 = 'w-book';
    const items = [{ id: 'x', metadata: meta('one') }];
    filtersStore.initializeFromAnnotations(W2, 'c2', items, true, ['en']);
    filtersStore.toggleValue(W2, 'c2', 'kind', 'one');
    filtersStore.updateHiddenAnnotations(W2, 'c2', items);
    const lists = [{ resources: [res('x', 'c1'), res('x', 'c2')] }];
    render(
      <MetadataFilterOverlayPluginComponent
        targetProps={{ windowId: W2, annotations: lists }}
        TargetComponent={Target as never}
      />,
    );
    expect(seen.at(-1)).toEqual(['x']);
    expect(filtersStore.hasFiltersInitialized(W2, 'c1')).toBe(false);
    filtersStore.clearWindow(W2);
  });

  it('catches up with filters initialized before the subscription', () => {
    const W3 = 'w-late';
    const items = [{ id: 'a', metadata: meta('one') }, { id: 'b', metadata: meta('two') }];
    let done = false;
    const LateTarget = ({ annotations: a }: { annotations?: Array<{ resources?: Array<{ id?: string }> }> }) => {
      if (!done) {
        done = true;
        filtersStore.initializeFromAnnotations(W3, C, items, true, ['en']);
        filtersStore.toggleValue(W3, C, 'kind', 'two');
        filtersStore.updateHiddenAnnotations(W3, C, items);
      }
      seen.push((a ?? []).flatMap((l) => (l.resources ?? []).map((r) => r.id as string)));
      return null;
    };
    render(
      <MetadataFilterOverlayPluginComponent
        targetProps={{ windowId: W3, annotations }}
        TargetComponent={LateTarget as never}
      />,
    );
    expect(seen[0]).toEqual(['a', 'b']);
    expect(seen.at(-1)).toEqual(['a']);
    filtersStore.clearWindow(W3);
  });

  it('does not filter searchAnnotations', () => {
    filtersStore.toggleValue(W, C, 'kind', 'two');
    filtersStore.updateHiddenAnnotations(W, C, [
      { id: 'a', metadata: meta('one') },
      { id: 'b', metadata: meta('two') },
    ]);
    let received: unknown;
    const search = [{ resources: [res('b')] }];
    render(
      <MetadataFilterOverlayPluginComponent
        targetProps={{ windowId: W, annotations, searchAnnotations: search }}
        TargetComponent={((p: { searchAnnotations: unknown }) => { received = p.searchAnnotations; return null; }) as never}
      />,
    );
    expect(received).toBe(search);
  });
});

describe('plugin export', () => {
  it('wraps AnnotationsOverlay', () => {
    expect(metadataFilterOverlayPlugin.target).toBe('AnnotationsOverlay');
    expect(metadataFilterOverlayPlugin.mode).toBe('wrap');
  });
});

describe('overlay with metadata-less and embedded annotations', () => {
  const W = 'w-mixed';
  const meta = (v: string) => [{ label: { en: ['Technique'] }, value: { en: [v] } }];

  it('keeps metadata-less annotations when None is deselected', () => {
    const items = [
      { id: 'a', metadata: meta('XRF') },
      { id: 'b', metadata: [{ label: { en: ['Operator'] }, value: { en: ['Smith'] } }] },
      { id: 'cls' },
    ];
    filtersStore.initializeFromAnnotations(W, 'c1', items, true, ['en']);
    filtersStore.toggleValue(W, 'c1', 'technique', '__none__');
    filtersStore.updateHiddenAnnotations(W, 'c1', items);
    const lists = [{ resources: items.map((i) => res(i.id)) }];
    const hiddenFor = (c: string) => (filtersStore.hasFiltersInitialized(W, c) ? filtersStore.getHiddenAnnotationIds(W, c) : undefined);
    expect(filterOverlayAnnotations(lists, hiddenFor)[0].resources!.map((r) => r.id)).toEqual(['a', 'cls']);
    filtersStore.clearWindow(W);
  });

  it('keeps annotations whose metadata values are all empty', () => {
    const items = [
      { id: 'a', metadata: meta('XRF') },
      { id: 'blank', metadata: meta('') },
    ];
    filtersStore.initializeFromAnnotations(W, 'c1', items, true, ['en']);
    filtersStore.toggleValue(W, 'c1', 'technique', '__none__');
    expect([...filtersStore.updateHiddenAnnotations(W, 'c1', items)]).toEqual([]);
    expect(filtersStore.getGroups(W, 'c1').find((g) => g.key === 'technique')!.values.get('__none__')).toBeUndefined();
    filtersStore.clearWindow(W);
  });

  it('hides annotations coming from manifest-embedded pages', () => {
    const CANVAS = 'https://iiif.example.org/m/canvas/1';
    const anno = (id: string, target: unknown, metadata?: unknown) => ({
      id, type: 'Annotation', motivation: 'commenting', metadata, target,
    });
    const manifest = transformEmbeddedAnnotationPages({
      type: 'Manifest',
      items: [{
        id: CANVAS, type: 'Canvas', items: [],
        annotations: [{
          id: 'p1', type: 'AnnotationPage',
          items: [
            anno('multi', [`${CANVAS}#xywh=0,0,50,50`, `${CANVAS}#xywh=90,90,50,50`], meta('XRF')),
            anno('tiny', `${CANVAS}#xywh=5,5,1,1`, meta('Raman')),
            anno('cls', `${CANVAS}#xywh=9,9,40,40`),
          ],
        }],
      }],
    }) as { items: Array<{ annotations: Array<{ items: Array<{ id: string; metadata?: never }> }> }> };
    const items = manifest.items[0].annotations[0].items;
    expect(items.map((i) => i.id)).toEqual(['multi#target-0', 'multi#target-1', 'tiny', 'cls']);

    filtersStore.initializeFromAnnotations(W, CANVAS, items, true, ['en']);
    filtersStore.toggleValue(W, CANVAS, 'technique', 'xrf');
    filtersStore.updateHiddenAnnotations(W, CANVAS, items);
    // Resources as Mirador models them, so targetId matches the per-canvas filter key.
    const resources = items.map((i) => new AnnotationItem(i) as { id: string; targetId: string });
    expect(resources.map((r) => r.targetId)).toEqual([CANVAS, CANVAS, CANVAS, CANVAS]);
    const lists = [{ resources }];
    const hiddenFor = (c: string) => (filtersStore.hasFiltersInitialized(W, c) ? filtersStore.getHiddenAnnotationIds(W, c) : undefined);
    expect(filterOverlayAnnotations(lists, hiddenFor)[0].resources!.map((r) => r.id)).toEqual(['tiny', 'cls']);
    filtersStore.clearWindow(W);
  });
});
