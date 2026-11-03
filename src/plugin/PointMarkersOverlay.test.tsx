import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';

const osd = vi.hoisted(() => ({ refs: {} as Record<string, { current?: unknown }> }));
vi.mock('mirador', () => ({
  OSDReferences: { get: (id: string) => osd.refs[id] },
  getCurrentCanvasWorld: () => ({
    canvasIds: ['c1', 'c2'],
    canvasToWorldCoordinates: (id: string) => (id === 'c2' ? [1000, 0, 1000, 1000] : [0, 0, 1000, 1000]),
    canvasScale: () => 1,
  }),
}));

import { PointMarkersOverlay, type PointMarkersOverlayProps } from './PointMarkersOverlay';
import { DEFAULT_POINT_MARKER_CONFIG, type PointMarker } from './pointMarkers';

/** Fake OpenSeadragon viewer: 1 world unit = 2 screen pixels. */
function fakeViewer() {
  const handlers: Record<string, Array<() => void>> = {};
  const canvas = document.createElement('div');
  document.body.appendChild(canvas);
  let shift = 0;
  class Pt {
    constructor(public x: number, public y: number) {}
  }
  const viewer = {
    canvas,
    viewport: {
      getCenter: () => new Pt(0, 0),
      getFlip: () => false,
      getContainerSize: () => new Pt(1000, 500),
      viewportToViewerElementCoordinates: (p: Pt) => new Pt(p.x * 2 + shift, p.y * 2),
    },
    addHandler: (e: string, h: () => void) => (handlers[e] ??= []).push(h),
    removeHandler: (e: string, h: () => void) => {
      handlers[e] = (handlers[e] ?? []).filter((x) => x !== h);
    },
  };
  return { viewer, canvas, handlers, pan: (n: number) => (shift = n) };
}

const marker = (id: string, state: PointMarker['state'] = 'default', canvasId = 'c1', x = 10, y = 20, r = 5): PointMarker => ({
  id,
  canvasId,
  state,
  point: { x, y, r },
  resource: { id },
});
const colors = { default: 'rgb(0, 0, 255)', hovered: 'rgb(255, 0, 0)', selected: 'rgb(255, 255, 0)' };
const fns = () => ({ hoverAnnotation: vi.fn(), selectAnnotation: vi.fn(), deselectAnnotation: vi.fn() });

function mount(markers: PointMarker[], extra: Partial<PointMarkersOverlayProps> = {}) {
  const f = fns();
  const props = { windowId: 'w', markers, config: DEFAULT_POINT_MARKER_CONFIG, colors, ...f, ...extra };
  const view = render(<PointMarkersOverlay {...props} />);
  return { ...f, view, props };
}
const dots = (canvas: HTMLElement) => [...canvas.querySelectorAll<HTMLElement>('[data-xyviewer-point-marker]')];

afterEach(() => {
  cleanup();
  osd.refs = {};
  document.body.innerHTML = '';
});

describe('PointMarkersOverlay', () => {
  it('portals one marker per point into the viewer canvas, centred on the point', () => {
    const { viewer, canvas } = fakeViewer();
    osd.refs.w = { current: viewer };
    mount([marker('a'), marker('b', 'default', 'c2', 100, 100)]);
    const [a, b] = dots(canvas);
    // r = 5 canvas px at 2 px each: 20 px dot, hit area 20 px (hitSize), centred on pixel (20, 40).
    expect(a.style.width).toBe('20px');
    expect(a.style.left).toBe('10px');
    expect(a.style.top).toBe('30px');
    expect(a.style.getPropertyValue('--xyviewer-d')).toBe('20px');
    // Second canvas sits at world x = 1000.
    expect(b.style.left).toBe(`${(1000 + 100) * 2 - 10}px`);
    expect(canvas.querySelector('[data-xyviewer-point-markers]')!.getAttribute('aria-hidden')).toBe('true');
    expect((canvas.querySelector('[data-xyviewer-point-markers]') as HTMLElement).style.pointerEvents).toBe('none');
    expect(a.style.pointerEvents).toBe('auto');
  });

  it('applies the size rule: clamped screen size, bigger hit area, never below hoverSize when active', () => {
    const { viewer, canvas } = fakeViewer();
    osd.refs.w = { current: viewer };
    mount([marker('tiny', 'default', 'c1', 1, 1, 1), marker('big', 'default', 'c1', 1, 1, 100), marker('h', 'hovered', 'c1', 1, 1, 1)]);
    const [tiny, big, hov] = dots(canvas);
    expect(tiny.style.getPropertyValue('--xyviewer-d')).toBe('12px');
    expect(tiny.style.width).toBe('20px');
    expect(big.style.getPropertyValue('--xyviewer-d')).toBe('48px');
    expect(big.style.width).toBe('48px');
    expect(hov.style.getPropertyValue('--xyviewer-d')).toBe('18px');
  });

  it('colours and titles the markers by state', () => {
    const { viewer, canvas } = fakeViewer();
    osd.refs.w = { current: viewer };
    mount([marker('a'), marker('b', 'hovered'), marker('c', 'selected')], { titleOf: (m) => `title ${m.id}` });
    const [a, b, c] = dots(canvas);
    const bg = (el: HTMLElement) => (el.querySelector('span') as HTMLElement).style.background;
    expect([bg(a), bg(b), bg(c)]).toEqual([colors.default, colors.hovered, colors.selected]);
    expect(a.title).toBe('');
    expect(b.title).toBe('title b');
  });

  it('hover and click dispatch through the Mirador dispatchers', () => {
    const { viewer, canvas } = fakeViewer();
    osd.refs.w = { current: viewer };
    const { hoverAnnotation, selectAnnotation, deselectAnnotation } = mount([marker('a'), marker('b')], { selectedAnnotationId: 'b' });
    const [a, b] = dots(canvas);
    fireEvent.pointerEnter(a);
    expect(hoverAnnotation).toHaveBeenLastCalledWith('w', ['a']);
    fireEvent.pointerLeave(a);
    expect(hoverAnnotation).toHaveBeenLastCalledWith('w', []);
    fireEvent.click(a);
    expect(selectAnnotation).toHaveBeenCalledWith('w', 'a');
    fireEvent.click(b);
    expect(deselectAnnotation).toHaveBeenCalledWith('w', 'b');
  });

  it('keeps pointer events from the canvas listeners but lets wheel through', () => {
    const { viewer, canvas } = fakeViewer();
    osd.refs.w = { current: viewer };
    mount([marker('a')]);
    const [a] = dots(canvas);
    const seen: string[] = [];
    const types = ['pointerdown', 'pointerup', 'pointermove', 'mousemove', 'click', 'dblclick', 'wheel'];
    for (const t of types) canvas.addEventListener(t, () => seen.push(t));
    for (const t of types) {
      a.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
    }
    expect(seen).toEqual(['wheel']);
  });

  it('follows the viewport and stops after unmount', () => {
    const { viewer, canvas, handlers, pan } = fakeViewer();
    osd.refs.w = { current: viewer };
    const { view } = mount([marker('a')]);
    const [a] = dots(canvas);
    expect(a.style.left).toBe('10px');
    pan(100);
    act(() => handlers['update-viewport'].forEach((h) => h()));
    expect(a.style.left).toBe('110px');
    expect(Object.keys(handlers).sort()).toEqual(['flip', 'rotate', 'update-viewport']);
    view.unmount();
    for (const list of Object.values(handlers)) expect(list).toEqual([]);
  });

  it('re-places when the markers change', () => {
    const { viewer, canvas } = fakeViewer();
    osd.refs.w = { current: viewer };
    const { view, props } = mount([marker('a', 'default', 'c1', 10, 20, 5)]);
    view.rerender(<PointMarkersOverlay {...props} markers={[marker('a', 'default', 'c1', 50, 20, 5)]} />);
    expect(dots(canvas)[0].style.left).toBe('90px');
  });

  it('hides a marker whose canvas is not in the world and renders nothing without markers or viewer', () => {
    const { viewer, canvas } = fakeViewer();
    osd.refs.w = { current: viewer };
    mount([marker('gone', 'default', 'other')]);
    expect(dots(canvas)[0].style.display).toBe('none');
    cleanup();
    mount([]);
    expect(canvas.querySelector('[data-xyviewer-point-markers]')).toBeNull();
    osd.refs = {};
    const other = fakeViewer();
    mount([marker('a')]);
    expect(other.canvas.childElementCount).toBe(0);
  });

  it('honours reduced motion', () => {
    const { viewer, canvas } = fakeViewer();
    osd.refs.w = { current: viewer };
    mount([marker('a')]);
    const css = canvas.querySelector('style')!.textContent!;
    expect(css).toMatch(/@media \(prefers-reduced-motion:no-preference\)\{\.xyviewer-point-marker__dot\{transition/);
    expect(css).not.toMatch(/(^|\})\.xyviewer-point-marker__dot\{[^}]*transition/);
  });
});
