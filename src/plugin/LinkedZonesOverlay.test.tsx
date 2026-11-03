import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { render, screen, cleanup, act } from '@testing-library/react';

const osd = vi.hoisted(() => ({ refs: {} as Record<string, { current?: unknown }> }));
vi.mock('mirador', () => ({
  SanitizedHtml: ({ htmlString }: { htmlString: string }) => <span>{htmlString}</span>,
  addWindow: vi.fn(),
  setCanvas: vi.fn(),
  updateViewport: vi.fn(),
  OSDReferences: { get: (id: string) => osd.refs[id] },
  getCurrentCanvasWorld: () => ({
    canvasIds: ['c1', 'c2', 'https://arca.irht.cnrs.fr/iiif/81855/canvas/canvas-1372508'],
    canvasToWorldCoordinates: (id: string) => (id === 'c2' ? [1000, 0, 1000, 1000] : [0, 0, 1000, 1000]),
    canvasScale: () => 1,
  }),
}));
vi.mock('react-plotly.js', () => ({ default: () => <div /> }));

import { LinkedZonesOverlay, computeZoneBadges, type ZoneBadge } from './LinkedZonesOverlay';
import { ConnectedScientificAnnotationPlugin } from './ConnectedScientificAnnotationPlugin';
import { canvasEmphasisStore } from '../state/canvasEmphasisStore';
import { buildClassificationView } from '../utils/classificationModel';
import { buildLinkRows, getLinkIndex } from '../utils/linkIndex';
import { normalizeAnnotationResources } from '../utils/annotationNormalizer';
import type { IIIFAnnotation } from '../types/iiif';
import type { MiradorState } from '../types/mirador';
import characterizations from '../test/fixtures/annotations/manuspectrum-characterizations-page.json';
import analyses from '../test/fixtures/annotations/manuspectrum-analyses-page.json';

const CANVAS = 'https://arca.irht.cnrs.fr/iiif/81855/canvas/canvas-1372508';
const MANIFEST = 'https://example.org/manifest';
const state = {
  config: { language: 'en' },
  windows: { w1: { id: 'w1', manifestId: MANIFEST, canvasId: CANVAS } },
  manifests: { [MANIFEST]: { id: MANIFEST, json: { id: MANIFEST, type: 'Manifest', items: [{ id: CANVAS, type: 'Canvas' }] } } },
  annotations: { [CANVAS]: { chars: { json: characterizations }, analyses: { json: analyses } } },
} as unknown as MiradorState;

const resources = normalizeAnnotationResources(state.annotations[CANVAS]);
const ids = Object.keys(resources);
const [lapis] = characterizations.items as unknown as IIIFAnnotation[];
const index = getLinkIndex(state, 'w1');
const base = { canvasId: CANVAS, index, canvasAnnotationIds: ids, annotationResources: resources, prefs: ['en'] };

/** Fake OpenSeadragon viewer: 1 world unit = 1 screen pixel, viewport at the origin. */
function fakeViewer() {
  const handlers: Record<string, Array<() => void>> = {};
  const canvas = document.createElement('div');
  document.body.appendChild(canvas);
  class Pt {
    constructor(public x: number, public y: number) {}
  }
  const viewer = {
    canvas,
    viewport: {
      getCenter: () => new Pt(0, 0),
      getFlip: () => false,
      getContainerSize: () => new Pt(1000, 500),
      viewportToViewerElementCoordinates: (p: Pt) => new Pt(p.x * 2, p.y * 2),
    },
    addHandler: (e: string, h: () => void) => (handlers[e] ??= []).push(h),
    removeHandler: (e: string, h: () => void) => {
      handlers[e] = (handlers[e] ?? []).filter((x) => x !== h);
    },
  };
  return { viewer, canvas, handlers };
}

afterEach(() => {
  cleanup();
  osd.refs = {};
  document.body.innerHTML = '';
});

describe('computeZoneBadges', () => {
  const rows = () =>
    buildLinkRows(buildClassificationView(lapis, ['en']).related, { index, canvasId: CANVAS, canvasAnnotationIds: ids, prefs: ['en'] });

  const all = { ownerId: lapis.id, rows: 'all' as const };

  it('numbers the zones like the rows of the list', () => {
    const badges = computeZoneBadges({ ...base, emphasis: all });
    const here = rows().filter((r) => r.kind === 'here');
    expect(badges.length).toBeGreaterThan(0);
    expect(badges.map((b) => b.n)).toEqual(here.map((r) => r.n));
    expect(badges.map((b) => b.annotationId)).toEqual(here.map((r) => r.annotationId));
    for (const b of badges) expect(b.box[2]).toBeGreaterThan(0);
  });

  it('keeps only the requested rows', () => {
    const [first] = computeZoneBadges({ ...base, emphasis: all });
    const one = computeZoneBadges({ ...base, emphasis: { ownerId: lapis.id, rows: [first.n] } });
    expect(one.map((b) => b.n)).toEqual([first.n]);
    expect(computeZoneBadges({ ...base, emphasis: { ownerId: lapis.id, rows: [999] } })).toEqual([]);
  });

  it('draws nothing without emphasis or for a card without links', () => {
    expect(computeZoneBadges({ ...base })).toEqual([]);
    const analysis = ids.find((id) => !characterizations.items.some((c) => (c as { id: string }).id === id))!;
    expect(computeZoneBadges({ ...base, emphasis: { ownerId: analysis, rows: 'all' } })).toEqual([]);
    expect(computeZoneBadges({ ...base, emphasis: { ownerId: 'unknown', rows: 'all' } })).toEqual([]);
    expect(computeZoneBadges({ ...base, canvasId: undefined, emphasis: all })).toEqual([]);
  });

  it('skips zones hidden by the filter but keeps the numbering', () => {
    const full = computeZoneBadges({ ...base, emphasis: all });
    const hidden = new Set([full[0].annotationId]);
    const some = computeZoneBadges({ ...base, emphasis: all, hiddenIds: hidden });
    expect(some.map((b) => b.n)).toEqual(full.slice(1).map((b) => b.n));
  });
});

describe('computeZoneBadges owner priority', () => {
  const link = (id: string) => ({ type: 'SpecificResource', purpose: 'linking', source: { id, type: 'Annotation' } });
  const target = (xywh: string) => ({ type: 'SpecificResource', source: { id: 'c1', type: 'Canvas' }, selector: { type: 'FragmentSelector', value: `xywh=${xywh}` } });
  const items = [
    { id: 'A', type: 'Annotation', motivation: 'classifying', body: [link('B'), link('Z')], target: target('0,0,5,5') },
    { id: 'B', type: 'Annotation', motivation: 'classifying', body: [link('Z')], target: target('50,50,5,5') },
    { id: 'Z', type: 'Annotation', motivation: 'describing', body: { type: 'TextualBody', value: 'z' }, target: target('10,20,30,40') },
  ];
  const st = {
    config: {},
    windows: { w: { id: 'w', manifestId: 'm', canvasId: 'c1' } },
    manifests: { m: { json: { id: 'm', type: 'Manifest', items: [{ id: 'c1' }] } } },
    annotations: { c1: { p: { json: { type: 'AnnotationPage', items } } } },
  } as unknown as MiradorState;
  const res = normalizeAnnotationResources(st.annotations.c1);
  const input = { canvasId: 'c1', index: getLinkIndex(st, 'w'), canvasAnnotationIds: Object.keys(res), annotationResources: res, prefs: ['en'] };

  it('numbers the emphasised owner, whatever is hovered or selected', () => {
    const fromA = computeZoneBadges({ ...input, emphasis: { ownerId: 'A', rows: 'all' } });
    expect(fromA.map((b) => [b.n, b.annotationId])).toEqual([[1, 'B'], [2, 'Z']]);
    const fromB = computeZoneBadges({ ...input, emphasis: { ownerId: 'B', rows: 'all' } });
    expect(fromB.map((b) => [b.n, b.annotationId])).toEqual([[1, 'Z']]);
  });

  it('flags point zones so the badge goes beside the marker', () => {
    const [b, z] = computeZoneBadges({ ...input, emphasis: { ownerId: 'A', rows: 'all' } });
    expect(b.point).toMatchObject({ x: 52.5, y: 52.5 });
    expect(z.point).toBeUndefined();
  });

  it('finds the owner through the link index after a move to another canvas', () => {
    const { A, ...others } = res;
    void A;
    const badges = computeZoneBadges({
      ...input,
      canvasAnnotationIds: Object.keys(others),
      annotationResources: others,
      emphasis: { ownerId: 'A', rows: [2] },
    });
    expect(badges.map((x) => x.annotationId)).toEqual(['Z']);
  });
});

describe('computeZoneBadges on a book view', () => {
  const link = (id: string) => ({ type: 'SpecificResource', purpose: 'linking', source: { id, type: 'Annotation' } });
  const zone = (id: string, canvas: string) => ({
    id,
    type: 'Annotation',
    motivation: 'describing',
    body: { type: 'TextualBody', value: id },
    target: { type: 'SpecificResource', source: { id: canvas, type: 'Canvas' }, selector: { type: 'FragmentSelector', value: 'xywh=10,20,30,40' } },
  });
  const owner = {
    id: 'owner',
    type: 'Annotation',
    motivation: 'classifying',
    body: [link('z2'), link('z1')],
    target: { type: 'SpecificResource', source: { id: 'c1', type: 'Canvas' }, selector: { type: 'FragmentSelector', value: 'xywh=0,0,5,5' } },
  };
  const book = {
    config: {},
    windows: { w: { id: 'w', manifestId: 'm', canvasId: 'c1' } },
    manifests: { m: { json: { id: 'm', type: 'Manifest', items: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] } } },
    annotations: {
      c1: { p: { json: { type: 'AnnotationPage', items: [owner, zone('z1', 'c1')] } } },
      c2: { p: { json: { type: 'AnnotationPage', items: [zone('z2', 'c2')] } } },
    },
  } as unknown as MiradorState;
  const res = normalizeAnnotationResources(book.annotations.c1);

  it('numbers a zone on the other visible canvas, and ignores one on a hidden canvas', () => {
    const input = {
      canvasId: 'c1',
      index: getLinkIndex(book, 'w'),
      canvasAnnotationIds: Object.keys(res),
      annotationResources: res,
      emphasis: { ownerId: 'owner', rows: 'all' as const },
      prefs: ['en'],
    };
    const both = computeZoneBadges({ ...input, visibleCanvasIds: ['c1', 'c2'] });
    expect(both.map((b) => [b.n, b.annotationId, b.canvasId])).toEqual([[1, 'z2', 'c2'], [2, 'z1', 'c1']]);
    const single = computeZoneBadges({ ...input, visibleCanvasIds: ['c1'] });
    expect(single.map((b) => [b.n, b.annotationId])).toEqual([[2, 'z1']]);
  });
});

describe('computeZoneBadges with a multi-target zone on the other canvas', () => {
  const multi = {
    id: 'z2',
    type: 'Annotation',
    motivation: 'describing',
    body: { type: 'TextualBody', value: 'z2' },
    target: [
      { type: 'SpecificResource', source: { id: 'c2', type: 'Canvas' }, selector: { type: 'FragmentSelector', value: 'xywh=10,20,30,40' } },
      { type: 'SpecificResource', source: { id: 'c2', type: 'Canvas' }, selector: { type: 'FragmentSelector', value: 'xywh=500,600,30,40' } },
    ],
  };
  const owner = {
    id: 'owner',
    type: 'Annotation',
    motivation: 'classifying',
    body: [{ type: 'SpecificResource', purpose: 'linking', source: { id: 'z2', type: 'Annotation' } }],
    target: { type: 'SpecificResource', source: { id: 'c1', type: 'Canvas' }, selector: { type: 'FragmentSelector', value: 'xywh=0,0,5,5' } },
  };
  const book = {
    config: {},
    windows: { w: { id: 'w', manifestId: 'm', canvasId: 'c1' } },
    manifests: { m: { json: { id: 'm', type: 'Manifest', items: [{ id: 'c1' }, { id: 'c2' }] } } },
    annotations: {
      c1: { p: { json: { type: 'AnnotationPage', items: [owner] } } },
      c2: { p: { json: { type: 'AnnotationPage', items: [multi] } } },
    },
  } as unknown as MiradorState;

  it('gives each target its own box', () => {
    const res = normalizeAnnotationResources(book.annotations.c1);
    const badges = computeZoneBadges({
      canvasId: 'c1',
      visibleCanvasIds: ['c1', 'c2'],
      index: getLinkIndex(book, 'w'),
      canvasAnnotationIds: Object.keys(res),
      annotationResources: res,
      emphasis: { ownerId: 'owner', rows: 'all' },
      prefs: ['en'],
    });
    expect(badges).toHaveLength(2);
    expect(badges.map((b) => b.box.slice(0, 2))).toEqual([[10, 20], [500, 600]]);
  });
});

describe('LinkedZonesOverlay', () => {
  const store = createStore((s: unknown = {}) => s);
  const badges = [
    { n: 1, annotationId: 'a', canvasId: 'c1', box: [10, 20, 30, 40] as [number, number, number, number] },
    { n: 2, annotationId: 'b', canvasId: 'c2', box: [5, 5, 10, 10] as [number, number, number, number] },
  ];
  const mount = (b: ZoneBadge[] = badges) =>
    render(
      <Provider store={store}>
        <LinkedZonesOverlay windowId="w" badges={b} />
      </Provider>,
    );

  it('renders decorative badges at the converted corner, including the book view offset', () => {
    const { viewer, canvas } = fakeViewer();
    osd.refs.w = { current: viewer };
    mount();
    const root = canvas.querySelector('[data-xyviewer-zone-badges]') as HTMLElement;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    const els = [...root.querySelectorAll<HTMLElement>('.xyviewer-zone-badge')];
    expect(els.map((e) => e.textContent)).toEqual(['1', '2']);
    // Areas: centred on the top-left corner shifted outwards by half a badge.
    expect([els[0].style.left, els[0].style.top]).toEqual(['9px', '29px']);
    expect([els[1].style.left, els[1].style.top]).toEqual(['1999px', '-1px']);
    expect(root.style.pointerEvents).toBe('none');
  });

  it('follows the viewport and unsubscribes on unmount', () => {
    const { viewer, canvas, handlers } = fakeViewer();
    osd.refs.w = { current: viewer };
    const { unmount } = mount();
    expect(handlers['update-viewport']).toHaveLength(1);
    expect(handlers.animation ?? []).toHaveLength(0);
    expect(handlers.flip).toHaveLength(1);
    expect(handlers.rotate).toHaveLength(1);
    let factor = 2;
    viewer.viewport.viewportToViewerElementCoordinates = (p) => ({ x: p.x * factor, y: p.y * factor });
    factor = 4;
    handlers['update-viewport'][0]();
    expect(canvas.querySelector<HTMLElement>('.xyviewer-zone-badge')!.style.left).toBe('29px');
    unmount();
    expect(handlers['update-viewport']).toHaveLength(0);
    expect(handlers.flip).toHaveLength(0);
    expect(handlers.rotate).toHaveLength(0);
    expect(canvas.querySelector('[data-xyviewer-zone-badges]')).toBeNull();
  });

  it('mirrors x when the image is flipped, and re-places on flip', () => {
    const { viewer, canvas, handlers } = fakeViewer();
    osd.refs.w = { current: viewer };
    mount();
    const first = () => canvas.querySelector<HTMLElement>('.xyviewer-zone-badge')!;
    expect(first().style.left).toBe('9px');
    viewer.viewport.getFlip = () => true;
    handlers.flip[0]();
    expect(first().style.left).toBe('969px');
    expect(first().style.top).toBe('29px');
  });

  it('builds the point from the real prototype when constructor is Object (OpenSeadragon 5)', () => {
    const { viewer, canvas } = fakeViewer();
    // Prototype replaced wholesale: constructor falls back to Object, rotate lives on the prototype.
    const proto = {
      rotate(this: { x: number; y: number }) {
        return { x: this.x * 2, y: this.y * 2 };
      },
    };
    const point = (x: number, y: number) => Object.assign(Object.create(proto), { x, y });
    viewer.viewport.getCenter = () => point(0, 0);
    viewer.viewport.viewportToViewerElementCoordinates = (p: { x: number; y: number }) =>
      (p as unknown as typeof proto).rotate.call(p);
    osd.refs.w = { current: viewer };
    mount();
    const badge = canvas.querySelector<HTMLElement>('.xyviewer-zone-badge')!;
    expect(badge.style.display).not.toBe('none');
  });

  it('puts a point badge at the top-right of the marker, clear of it', () => {
    const { viewer, canvas } = fakeViewer();
    osd.refs.w = { current: viewer };
    // Point at (100, 100), r 12; 2 px per canvas px, so the marker is capped at 48 px (r 24).
    mount([{ n: 1, annotationId: 'p', canvasId: 'c1', box: [88, 88, 24, 24], point: { x: 100, y: 100, r: 12 } }]);
    const el = canvas.querySelector<HTMLElement>('.xyviewer-zone-badge')!;
    const radius = 24;
    const d = radius + 11 + 2;
    expect([el.style.left, el.style.top]).toEqual([`${200 + d}px`, `${200 - d}px`]);
  });

  it('keeps clear of Mirador’s own circle when no marker size applies', () => {
    const { viewer, canvas } = fakeViewer();
    osd.refs.w = { current: viewer };
    viewer.viewport.viewportToViewerElementCoordinates = (p) => ({ x: p.x * 10, y: p.y * 10 });
    // At 10 px per canvas px the plain circle (240 px across) is larger than any marker.
    mount([{ n: 1, annotationId: 'p', canvasId: 'c1', box: [88, 88, 24, 24], point: { x: 100, y: 100, r: 12 } }]);
    const el = canvas.querySelector<HTMLElement>('.xyviewer-zone-badge')!;
    expect(parseFloat(el.style.left)).toBeGreaterThanOrEqual(1000 + 120 + 11);
  });

  it('hides a badge whose canvas is not in the current world instead of throwing', () => {
    const { viewer, canvas } = fakeViewer();
    osd.refs.w = { current: viewer };
    mount([{ n: 1, annotationId: 'x', canvasId: 'gone', box: [1, 1, 2, 2] }]);
    expect(canvas.querySelector<HTMLElement>('.xyviewer-zone-badge')!.style.display).toBe('none');
  });

  it('picks the viewer up when Mirador creates it after the first render', () => {
    vi.useFakeTimers();
    try {
      const { viewer, canvas } = fakeViewer();
      mount();
      expect(canvas.childElementCount).toBe(0);
      osd.refs.w = { current: viewer };
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(canvas.querySelectorAll('.xyviewer-zone-badge')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a fixed screen size and honours reduced motion', () => {
    const { viewer, canvas } = fakeViewer();
    osd.refs.w = { current: viewer };
    mount();
    const css = canvas.querySelector('style')!.textContent!;
    expect(css).toMatch(/width:22px;height:22px/);
    expect(css).toMatch(/@media \(prefers-reduced-motion:no-preference\)\{\.xyviewer-zone-badge\{animation/);
    expect(css).not.toMatch(/(^|\})\.xyviewer-zone-badge\{[^}]*animation/);
  });

  it('renders nothing without badges or without a viewer', () => {
    const { viewer, canvas } = fakeViewer();
    osd.refs.w = { current: viewer };
    mount([]);
    expect(canvas.childElementCount).toBe(0);
    osd.refs = {};
    mount();
    expect(canvas.childElementCount).toBe(0);
  });
});

describe('through the annotation panel', () => {
  const store = createStore((s: unknown = state) => s);
  const panel = (extra: Record<string, unknown>) => (
    <Provider store={store as never}>
      <ConnectedScientificAnnotationPlugin
        targetProps={
          {
            annotations: ids.map((id) => ({ id, content: null, tags: [], targetId: 't' })),
            windowId: 'w1',
            canvasId: CANVAS,
            selectAnnotation: vi.fn(),
            deselectAnnotation: vi.fn(),
            hoverAnnotation: vi.fn(),
            ...extra,
          } as never
        }
        TargetComponent={(() => <div />) as never}
      />
    </Provider>
  );

  beforeEach(() => {
    const { viewer } = fakeViewer();
    osd.refs.w1 = { current: viewer };
  });

  afterEach(() => canvasEmphasisStore.clear('w1'));

  it('shows the list numbers on the canvas for the emphasised card', () => {
    render(panel({ selectedAnnotationId: lapis.id }));
    act(() => canvasEmphasisStore.hover('w1', lapis.id, 'all'));
    const canvasBadges = [...document.querySelectorAll('.xyviewer-zone-badge')].map((e) => e.textContent);
    const listed = screen
      .getAllByRole('button', { name: /^Select linked annotation \d+ of/ })
      .map((b) => /annotation (\d+) of/.exec(b.getAttribute('aria-label')!)![1]);
    expect(canvasBadges.length).toBeGreaterThan(0);
    expect(canvasBadges).toEqual(listed);
  });

  it('shows no badge from hover or selection alone', () => {
    render(panel({ hoveredAnnotationIds: [lapis.id], selectedAnnotationId: lapis.id }));
    expect(document.querySelector('.xyviewer-zone-badge')).toBeNull();
  });
});
