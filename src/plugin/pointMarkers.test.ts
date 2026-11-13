import { describe, it, expect } from 'vitest';
import { AnnotationItem } from 'mirador';
import {
  computePointMarkers,
  DEFAULT_POINT_MARKER_CONFIG,
  markerFootprint,
  markerSize,
  RING_WIDTH,
  resolvePointMarkerConfig,
  splitPointResources,
  type PointResource,
} from './pointMarkers';
import { createCircleSvgSelector } from '../utils/annotationSelectors';

const C1 = 'https://example.org/canvas/1';
const C2 = 'https://example.org/canvas/2';
const target = (canvas: string, selector: unknown) => ({ type: 'SpecificResource', source: canvas, selector });
const item = (id: string, canvas: string, selector: unknown) =>
  new AnnotationItem({ id, type: 'Annotation', target: target(canvas, selector) } as never);

const point = (id: string, canvasId = C1, x = 10, y = 20, r = 5): PointResource => ({
  id,
  canvasId,
  point: { x, y, r },
  resource: { id, targetId: canvasId },
});
const base = { hovered: [] as string[], highlightAll: true };

describe('splitPointResources', () => {
  const area = item('area', C1, { type: 'SvgSelector', value: '<svg><path d="M 0 0 L 9 9 L 0 9 Z"/></svg>' });
  const box = item('box', C1, { type: 'FragmentSelector', value: 'xywh=1,1,80,90' });
  const pt = item('pt', C1, createCircleSvgSelector(30, 40, 7));
  const raw = item('raw', C2, { type: 'PointSelector', x: 5, y: 6 });
  const tiny = item('tiny', C2, { type: 'FragmentSelector', value: 'xywh=5,5,2,2' });
  const plain = { id: 'plain', targetId: C1, selector: 'https://example.org/canvas/1#xywh=3,3,1,1' };

  it('moves points out of the lists and reports them with their canvas', () => {
    const lists = [{ id: 'l1', resources: [area, pt, box] }, { id: 'l2', resources: [raw, tiny] }];
    const { areas, points } = splitPointResources(lists);
    expect(areas[0].resources!.map((r) => r.id)).toEqual(['area', 'box']);
    expect(areas[1].resources).toEqual([]);
    expect(points.map((p) => [p.id, p.canvasId])).toEqual([['pt', C1], ['raw', C2], ['tiny', C2]]);
    expect(points[0].point).toEqual({ x: 30, y: 40, r: 7 });
    // The inputs are untouched.
    expect(lists[0].resources).toHaveLength(3);
  });

  it('reports a repeated id on a canvas once and still removes every copy', () => {
    const copy = item('pt', C1, createCircleSvgSelector(30, 40, 7));
    const { areas, points } = splitPointResources([{ resources: [pt, area] }, { resources: [copy] }]);
    expect(points).toHaveLength(1);
    expect(areas.map((l) => l.resources!.length)).toEqual([1, 0]);
  });

  it('reads a string target with a tiny xywh', () => {
    expect(splitPointResources([{ resources: [plain] }]).points[0].point).toMatchObject({ x: 3.5, y: 3.5 });
  });

  it('keeps the same array when no list holds a point', () => {
    const lists = [{ resources: [area, box] }];
    expect(splitPointResources(lists).areas).toBe(lists);
  });

  it('keeps unchanged lists and the prototype chain of changed ones', () => {
    class Page {
      resources: unknown[];
      constructor(r: unknown[]) { this.resources = r; }
      present() { return this.resources.length > 0; }
    }
    const untouched = new Page([area]);
    const mixed = new Page([area, pt]);
    const { areas } = splitPointResources([untouched, mixed] as never[]) as { areas: Page[] };
    expect(areas[0]).toBe(untouched);
    expect(areas[1]).not.toBe(mixed);
    expect(Object.getPrototypeOf(areas[1])).toBe(mixed);
    expect(areas[1].present()).toBe(true);
    expect(areas[1].resources).toHaveLength(1);
    expect(mixed.resources).toHaveLength(2);
  });

  it('ignores malformed input', () => {
    const lists = [null, {}, { resources: [null, {}, { id: 'x' }] }] as never[];
    expect(splitPointResources(lists).points).toEqual([]);
    expect(splitPointResources(undefined as never).points).toEqual([]);
  });
});

describe('computePointMarkers', () => {
  const points = [point('a'), point('b'), point('c', C2)];

  it('lists the points of the visible canvases with their state', () => {
    const m = computePointMarkers({ ...base, points, visibleCanvasIds: [C1], hovered: ['b'] });
    expect(m.map((x) => [x.id, x.state])).toEqual([['b', 'hovered'], ['a', 'default']]);
    expect(computePointMarkers({ ...base, points }).map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('selected wins over hovered', () => {
    const m = computePointMarkers({ ...base, points, hovered: ['a'], selected: 'a' });
    expect(m.find((x) => x.id === 'a')!.state).toBe('selected');
  });

  it('keeps resting markers as invisible hit areas when highlightAll is off', () => {
    const m = computePointMarkers({ ...base, points, highlightAll: false, hovered: ['a'], selected: 'c' });
    expect(m.map((x) => [x.id, x.state, !!x.invisible]).sort()).toEqual([
      ['a', 'hovered', false],
      ['b', 'default', true],
      ['c', 'selected', false],
    ]);
    expect(computePointMarkers({ ...base, points, highlightAll: true }).some((x) => x.invisible)).toBe(false);
  });

  it('renders nothing when Mirador does not draw annotations, selected included', () => {
    expect(computePointMarkers({ ...base, points, drawAnnotations: false, hovered: ['a'], selected: 'b' })).toEqual([]);
    expect(computePointMarkers({ ...base, points, drawAnnotations: true })).toHaveLength(3);
  });

  it('lists a repeated id once per canvas', () => {
    const dup = [point('a'), point('a'), point('a', C2)];
    expect(computePointMarkers({ ...base, points: dup }).map((x) => [x.id, x.canvasId])).toEqual([['a', C1], ['a', C2]]);
  });

  it('hides filtered points but keeps the selected one', () => {
    const hiddenFor = (c: string) => (c === C1 ? new Set(['a', 'b']) : undefined);
    expect(computePointMarkers({ ...base, points, hiddenFor }).map((x) => x.id)).toEqual(['c']);
    const m = computePointMarkers({ ...base, points, hiddenFor, selected: 'a' });
    expect(m.map((x) => x.id).sort()).toEqual(['a', 'c']);
  });

  it('caps the markers but always keeps hovered and selected ones', () => {
    const many = Array.from({ length: 10 }, (_, i) => point(`p${i}`));
    const m = computePointMarkers({ ...base, points: many, maxMarkers: 3, hovered: ['p9'], selected: 'p8' });
    expect(m).toHaveLength(3);
    expect(m.map((x) => x.id)).toEqual(expect.arrayContaining(['p9', 'p8']));
  });
});

describe('markerSize', () => {
  const cfg = DEFAULT_POINT_MARKER_CONFIG;
  it('follows the point size on screen between min and max', () => {
    expect(markerSize(12, 1, cfg)).toBe(24);
    expect(markerSize(12, 0.1, cfg)).toBe(12);
    expect(markerSize(12, 10, cfg)).toBe(48);
    expect(markerSize(12, undefined, cfg)).toBe(12);
  });
  it('never shrinks a hovered or selected marker below hoverSize', () => {
    expect(markerSize(12, 0.1, cfg, 'hovered')).toBe(18);
    expect(markerSize(12, 1, cfg, 'selected')).toBe(24);
  });
});

describe('resolvePointMarkerConfig', () => {
  it('defaults without a value', () => {
    for (const v of [undefined, null, 'x', 5, []]) expect(resolvePointMarkerConfig(v)).toEqual(DEFAULT_POINT_MARKER_CONFIG);
  });
  it('clamps numbers and ignores non-numbers', () => {
    const c = resolvePointMarkerConfig({ minSize: 1, hoverSize: 1000, maxSize: NaN, hitSize: '30', maxMarkers: 99999.6 });
    expect(c).toMatchObject({ minSize: 4, hoverSize: 96, maxSize: 48, hitSize: 20, maxMarkers: 10000 });
    expect(resolvePointMarkerConfig({ minSize: 20 })).toMatchObject({ minSize: 20, hoverSize: 20, maxSize: 48 });
  });
  it('keeps plain CSS colours only', () => {
    const c = resolvePointMarkerConfig({
      colors: { default: '#f00', hovered: 'url(javascript:1)', selected: 'rgb(1, 2, 3); background:red' },
    });
    expect(c.colors).toEqual({ default: '#f00' });
    expect(resolvePointMarkerConfig({ colors: { hovered: 'hsla(10, 20%, 30%, .5)' } }).colors).toEqual({ hovered: 'hsla(10, 20%, 30%, .5)' });
  });
});

describe('markerFootprint', () => {
  it('adds the stroke on both sides of the inner diameter', () => {
    expect(RING_WIDTH).toEqual({ default: 1.5, hovered: 2, selected: 2 });
    expect(markerFootprint(12, 'default')).toBe(15);
    expect(markerFootprint(18, 'hovered')).toBe(22);
    expect(markerFootprint(48, 'selected')).toBe(52);
  });
});
