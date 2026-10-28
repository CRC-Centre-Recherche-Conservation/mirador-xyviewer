import { describe, it, expect } from 'vitest';
import { annotationBounds, frameBox, panIfOutOfView, unionBox } from './viewportFraming';
import type { IIIFAnnotation } from '../types/iiif';

const ann = (target: unknown) => ({ id: 'a', type: 'Annotation', body: [], target }) as unknown as IIIFAnnotation;

describe('annotationBounds', () => {
  it('reads fragment, svg and point selectors and string targets', () => {
    const frag = { type: 'SpecificResource', source: 'c', selector: { type: 'FragmentSelector', value: 'xywh=10,20,30,40' } };
    expect(annotationBounds(ann(frag))).toEqual([10, 20, 30, 40]);
    expect(annotationBounds(ann('c#xywh=1,2,3,4'))).toEqual([1, 2, 3, 4]);
    const svg = { source: 'c', selector: [{ type: 'SvgSelector', value: '<svg><rect x="5" y="6" width="10" height="20"/></svg>' }] };
    expect(annotationBounds(ann(svg))).toEqual([5, 6, 10, 20]);
    expect(annotationBounds(ann({ source: 'c', selector: { type: 'PointSelector', x: 100, y: 50 } }))).toEqual([88, 38, 24, 24]);
    expect(annotationBounds(ann({ source: 'c' }))).toBeNull();
    expect(annotationBounds(undefined)).toBeNull();
  });
});

describe('framing', () => {
  const origin = { x: 0, y: 0 };

  it('unions boxes', () => {
    expect(unionBox([[0, 0, 10, 10], [20, 30, 10, 10]])).toEqual([0, 0, 30, 40]);
    expect(unionBox([])).toBeNull();
  });

  it('centres the box in world pixels and leaves a 10% margin on the limiting axis', () => {
    const v = frameBox([100, 100, 200, 100], origin, 2, 0.1);
    expect(v.x).toBeCloseTo(200);
    expect(v.y).toBeCloseTo(150);
    // width limits: 240 px fill the view, zoom is 1 / visible width
    expect(v.zoom).toBeCloseTo(1 / 240);
    const tall = frameBox([100, 100, 10, 400], origin, 2, 0.1);
    expect(tall.zoom).toBeCloseTo(1 / (2 * 480));
  });

  it('adds the canvas offset of a book-view page', () => {
    const v = frameBox([100, 100, 200, 100], { x: 3000, y: 0 }, 2, 0.1);
    expect(v.x).toBeCloseTo(3200);
    expect(v.y).toBeCloseTo(150);
  });

  it('pans only when the box is not fully in view, keeping the zoom (real Mirador values)', () => {
    // 2000 px wide view centred on (1500, 2000), 1:1 container
    const view = { x: 1500, y: 2000, zoom: 0.0005 };
    expect(panIfOutOfView([1400, 1900, 50, 50], origin, view, 1)).toBeNull();
    const moved = panIfOutOfView([2900, 3800, 50, 50], origin, view, 1);
    expect(moved).toEqual({ x: 2925, y: 3825, zoom: 0.0005 });
    expect(panIfOutOfView([0, 0, 1, 1], origin, { x: 0, y: 0, zoom: 0 }, 1)).toBeNull();
  });

  it('tests the box shifted by the canvas offset', () => {
    const view = { x: 4500, y: 2000, zoom: 0.0005 };
    expect(panIfOutOfView([1400, 1900, 50, 50], { x: 3000, y: 0 }, view, 1)).toBeNull();
    expect(panIfOutOfView([1400, 1900, 50, 50], origin, view, 1)).not.toBeNull();
  });
});
