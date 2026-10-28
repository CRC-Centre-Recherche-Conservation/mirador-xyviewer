import { describe, it, expect } from 'vitest';
import { AnnotationItem } from 'mirador';
import { normalizeTargetSelector, parseXYWH } from './annotationSelectors';
import { transformPointAnnotations } from './annotationTransformer';
import { normalizeAnnotationResources } from './annotationNormalizer';
import v3Annotations from '../test/fixtures/annotations/v3-annotation-page.json';

const SRC = 'https://iiif.example.org/canvas/1';
const ann = (selector: unknown) => ({
  id: 'a',
  type: 'Annotation',
  target: { type: 'SpecificResource', source: SRC, selector },
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (selector: unknown): any => {
  const a = ann(selector);
  normalizeTargetSelector(a);
  return a;
};
// Mirador's AnnotationItem is untyped JS; read its getters loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const item = (a: unknown): any => new AnnotationItem(a as any);

const CIRCLE =
  '<svg xmlns="http://www.w3.org/2000/svg"><path d="M 10 88 A 12 12 0 1 1 10 112 A 12 12 0 1 1 10 88"/></svg>';

describe('parseXYWH', () => {
  it('reads integers, decimals, pixel: and combined fragments', () => {
    expect(parseXYWH('xywh=1,2,3,4')).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect(parseXYWH('xywh=1.5,2,3.25,4')).toEqual({ x: 1.5, y: 2, w: 3.25, h: 4 });
    expect(parseXYWH('xywh=pixel:1,2,3,4')).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect(parseXYWH('t=5,10&xywh=1,2,3,4')).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });
  it('rejects percent:, temporal-only and malformed values', () => {
    expect(parseXYWH('xywh=percent:1,2,3,4')).toBeNull();
    expect(parseXYWH('t=5,10')).toBeNull();
    expect(parseXYWH('xywh=a,b,c,d')).toBeNull();
    expect(parseXYWH(undefined as unknown as string)).toBeNull();
  });
});

describe('normalizeTargetSelector', () => {
  it('turns a single tiny xywh into a circle Mirador reads as an svgSelector', () => {
    const a = run({ type: 'FragmentSelector', value: 'xywh=100,200,1,1' });
    expect(a.target.selector.type).toBe('SvgSelector');
    expect(item(a).svgSelector.value).toContain('<path');
  });

  it('leaves a regular xywh alone and Mirador reads it', () => {
    const a = run({ type: 'FragmentSelector', value: 'xywh=10,20,300,400' });
    expect(a.target.selector).toEqual({ type: 'FragmentSelector', value: 'xywh=10,20,300,400' });
    expect(item(a).fragmentSelector).toEqual([10, 20, 300, 400]);
  });

  it('appends a circle to a PointSelector-only target (single or array)', () => {
    for (const sel of [
      { type: 'PointSelector', x: 10, y: 100 },
      [{ type: 'PointSelector', x: 10, y: 100 }],
    ]) {
      const a = run(sel);
      expect(a.target.selector).toHaveLength(2);
      expect(a.target.selector[0].type).toBe('PointSelector');
      expect(item(a).svgSelector.value).toBe(
        (a.target.selector[1] as { value: string }).value
      );
      expect(item(a).svgSelector.value).toContain('M 10 88');
    }
  });

  it('ignores a PointSelector without usable coordinates (temporal point)', () => {
    const sel = [{ type: 'PointSelector', t: 12 }];
    expect(run(sel).target.selector).toEqual(sel);
    expect(run([{ type: 'PointSelector', x: 'NaN', y: 3 }]).target.selector).toHaveLength(1);
  });

  it('prefers an existing SvgSelector in an array (no-op)', () => {
    const sel = [
      { type: 'PointSelector', x: 10, y: 100 },
      { type: 'SvgSelector', value: CIRCLE },
    ];
    const a = run(sel);
    expect(a.target.selector).toEqual(sel);
    expect(item(a).svgSelector.value).toBe(CIRCLE);
  });

  it('does not circle a tiny xywh when an SvgSelector is present', () => {
    const sel = [
      { type: 'SvgSelector', value: CIRCLE },
      { type: 'FragmentSelector', value: 'xywh=1,1,2,2' },
    ];
    expect(run(sel).target.selector).toEqual(sel);
  });

  it('rebuilds a polygon as a path from numbers only', () => {
    const a = run([
      {
        type: 'SvgSelector',
        value:
          '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><polygon points="-10.5,20 30,40 50,-60" onclick="x()"/></svg>',
      },
      { type: 'FragmentSelector', value: 'xywh=0,0,60,100' },
    ]);
    const svg = item(a).svgSelector.value as string;
    expect(svg).toContain('<path d="M -10.5 20 L 30 40 L 50 -60 Z"');
    expect(svg).not.toMatch(/onload|onclick|polygon|alert/);
    expect(item(a).fragmentSelector).toEqual([0, 0, 60, 100]);
  });

  it('keeps a polyline open and unfilled', () => {
    const svg = item(run({ type: 'SvgSelector', value: '<svg><polyline points="0 0 10 10 20 0"/></svg>' })).svgSelector
      .value as string;
    expect(svg).toContain('d="M 0 0 L 10 10 L 20 0"');
    expect(svg).toContain('fill="none"');
  });

  it('drops a malformed polygon SVG and keeps the fragment bbox', () => {
    for (const points of ['1,2 3', 'a,b c,d e,f', '1,2 3,4', '']) {
      const a = run([
        { type: 'SvgSelector', value: `<svg><polygon points="${points}"/></svg>` },
        { type: 'FragmentSelector', value: 'xywh=1,2,30,40' },
      ]);
      expect(a.target.selector).toEqual([{ type: 'FragmentSelector', value: 'xywh=1,2,30,40' }]);
      expect(item(a).svgSelector).toBeUndefined();
    }
  });

  it('removes the selector when a lone SVG polygon is malformed', () => {
    const a = run({ type: 'SvgSelector', value: '<svg><polygon points="x"/></svg>' });
    expect(a.target.selector).toBeUndefined();
    expect(item(a).selector).toEqual([]);
  });

  it('canonicalises pixel: so Mirador can read it, and leaves percent: alone', () => {
    const a = run({ type: 'FragmentSelector', value: 'xywh=pixel:10,20,300,400' });
    expect(a.target.selector.value).toBe('xywh=10,20,300,400');
    expect(item(a).fragmentSelector).toEqual([10, 20, 300, 400]);

    const pct = run({ type: 'FragmentSelector', value: 'xywh=percent:10,20,30,40' });
    expect(pct.target.selector.value).toBe('xywh=percent:10,20,30,40');
  });

  it('keeps a t= part and handles decimals', () => {
    expect(run({ type: 'FragmentSelector', value: 'xywh=pixel:1,2,30,40&t=5,9' }).target.selector.value).toBe(
      'xywh=1,2,30,40&t=5,9'
    );
    const a = run({ type: 'FragmentSelector', value: 'xywh=10.5,20.5,0.5,0.5' });
    expect(a.target.selector.type).toBe('SvgSelector');
    expect(item(a).svgSelector.value).toContain('M 10.75 8.75');
    expect(run({ type: 'FragmentSelector', value: 't=5,9' }).target.selector.value).toBe('t=5,9');
  });

  it('is idempotent', () => {
    for (const sel of [
      { type: 'FragmentSelector', value: 'xywh=100,200,1,1' },
      { type: 'PointSelector', x: 10, y: 100 },
      [{ type: 'SvgSelector', value: '<svg><polygon points="0,0 10,0 10,10"/></svg>' }],
      { type: 'FragmentSelector', value: 'xywh=pixel:1,2,3,4' },
    ]) {
      const once = run(sel);
      const twice = JSON.parse(JSON.stringify(once));
      normalizeTargetSelector(twice);
      expect(twice).toEqual(once);
    }
  });

  it('does not throw on malformed input and does not mutate the original target', () => {
    for (const t of [undefined, null, 'str', 5, [], { selector: null }, { selector: [null, 3, 'x', {}] }]) {
      expect(() => normalizeTargetSelector({ target: t })).not.toThrow();
    }
    const target = { source: SRC, selector: { type: 'PointSelector', x: 1, y: 2 } };
    normalizeTargetSelector({ target });
    expect(target.selector).toEqual({ type: 'PointSelector', x: 1, y: 2 });
  });

  it('leaves the real v3 page (point + circle array) unchanged, twice', () => {
    const page = JSON.parse(JSON.stringify(v3Annotations));
    const before = JSON.parse(JSON.stringify(page.items));
    transformPointAnnotations(page);
    transformPointAnnotations(page);
    const pointed = page.items.filter((i: { target: { selector?: unknown } }) => Array.isArray(i.target.selector));
    expect(pointed.length).toBeGreaterThan(0);
    for (const p of pointed) {
      const original = before.find((b: { id: string }) => b.id === p.id);
      expect(p.target.selector).toEqual(original.target.selector);
    }
  });
});

describe('embedded pages (panel path)', () => {
  it('applies the selector pass to annotations read from the store', () => {
    const state = {
      'https://iiif.example.org/page/1': {
        json: {
          type: 'AnnotationPage',
          items: [ann({ type: 'PointSelector', x: 5, y: 50 })],
        },
      },
    };
    const res = normalizeAnnotationResources(state);
    const target = res['a'].target as unknown as { selector: { type: string }[] };
    expect(target.selector.map((s) => s.type)).toEqual(['PointSelector', 'SvgSelector']);
    // The store's own JSON is untouched.
    expect(state['https://iiif.example.org/page/1'].json.items[0].target.selector).toEqual({
      type: 'PointSelector',
      x: 5,
      y: 50,
    });
  });
});

describe('normalizeTargetSelector hardening', () => {
  const svg = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

  it('leaves an SVG untouched when a polygon sits beside other shapes', () => {
    const value = svg('<g><polygon points="0,0 10,0 10,10"/><circle cx="100" cy="100" r="5"/><path d="M 200 200 L 300 300"/></g>');
    expect(run({ type: 'SvgSelector', value }).target.selector.value).toBe(value);
  });

  it('keeps a producer fill="none" and stroke when rebuilding', () => {
    const value = svg('<polygon points="0,0 10,0 10,10" fill="none" stroke="#ff0000" stroke-width="4"/>');
    const out = run({ type: 'SvgSelector', value }).target.selector.value;
    expect(out).toContain('fill="none"');
    expect(out).toContain('stroke="#ff0000"');
    expect(out).toContain('stroke-width="4"');
  });

  it('ignores polygons inside comments and CDATA', () => {
    const value = svg('<!-- <polygon points="1"/> --><polygon points="0,0 1,0 1,1"/>');
    const out = run({ type: 'SvgSelector', value }).target.selector.value;
    expect(out).toContain('M 0 0 L 1 0 L 1 1 Z');
  });

  it('keeps a t= part next to a tiny xywh by appending the circle', () => {
    const a = run({ type: 'FragmentSelector', value: 'xywh=1,2,1,1&t=5,9' });
    expect(a.target.selector.map((s: { type: string }) => s.type)).toEqual(['FragmentSelector', 'SvgSelector']);
    expect(a.target.selector[0].value).toBe('xywh=1,2,1,1&t=5,9');
  });

  it('stays linear on hostile SVG input', () => {
    const t = Date.now();
    run({ type: 'SvgSelector', value: '<polygon '.repeat(40000) });
    run({ type: 'SvgSelector', value: `<svg><polygon points="${'1'.repeat(300000)}"/></svg>` });
    expect(Date.now() - t).toBeLessThan(1000);
  });
});
