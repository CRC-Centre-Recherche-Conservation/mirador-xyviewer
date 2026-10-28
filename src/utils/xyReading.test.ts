import { describe, it, expect } from 'vitest';
import { parseXyReading, XY_DEFAULT_EPSILON, XY_MAX_COLUMNS } from './xyReading';
import v3 from '../test/fixtures/annotations/v3-annotation-page.json';

const base = { type: 'XYReading' };

describe('parseXyReading', () => {
  it('reads a full valid object', () => {
    const r = parseXyReading({
      ...base,
      dialect: { delimiter: ';', headerRowCount: 2, encoding: 'UTF-8' },
      columns: [
        { index: 0, role: 'x' },
        { index: 1, role: 'yLeft' },
        { index: 2, role: 'yRight' },
        { index: 3, role: 'reference' },
        { index: 4, role: 'dark' },
        { index: 5, role: 'ignore' },
      ],
      x: { label: { en: ['Wavelength (nm)'] }, reversed: true },
      y: [{ axis: 'left', label: { none: ['R'] } }, { axis: 'right' }],
      corrections: [{ type: 'reference-normalize', expression: '(y - dark) / (reference - dark)', darkDefault: 3, epsilon: 1e-6, onInvalid: 'drop-point' }],
      derivedFrom: { id: 'https://h.example/raw', type: 'Dataset', format: 'text/csv', label: { en: ['raw'] }, xyReading: { ...base, corrections: [] } },
    });
    expect(r).toMatchObject({
      dialect: { delimiter: ';', headerRowCount: 2, encoding: 'utf-8' },
      x: { reversed: true, label: { en: ['Wavelength (nm)'] } },
      corrections: [{ type: 'reference-normalize', darkDefault: 3, epsilon: 1e-6 }],
      derivedFrom: { id: 'https://h.example/raw', xyReading: { type: 'XYReading', corrections: [] } },
    });
    expect(r?.columns).toHaveLength(6);
    expect(r?.y).toHaveLength(2);
    expect(r?.hasUnsupportedCorrection).toBeUndefined();
  });

  it('accepts the fixture readings and their raw derivation', () => {
    const body = (v3 as { items: { body: unknown }[] }).items.flatMap(a => [a.body].flat() as { xyReading?: unknown }[]).find(b => b?.xyReading);
    const r = parseXyReading(body?.xyReading);
    expect(r?.columns).toEqual([{ index: 0, role: 'x' }, { index: 1, role: 'yLeft' }]);
    expect(r?.derivedFrom?.xyReading?.corrections).toEqual([]);
  });

  it('fills correction defaults', () => {
    const r = parseXyReading({ ...base, corrections: [{ type: 'reference-normalize' }] });
    expect(r?.corrections).toEqual([{ type: 'reference-normalize', darkDefault: 0, epsilon: XY_DEFAULT_EPSILON }]);
  });

  it('keeps an empty corrections list distinct from an absent one', () => {
    expect(parseXyReading({ ...base, corrections: [] })?.corrections).toEqual([]);
    expect(parseXyReading(base)?.corrections).toBeUndefined();
  });

  it.each([undefined, null, 0, 'x', [], [base], {}, { type: 'Other' }, { type: 'xyreading' }])(
    'returns null for %j',
    (input) => {
      expect(parseXyReading(input)).toBeNull();
    }
  );

  it('ignores unknown keys', () => {
    const r = parseXyReading({ ...base, future: 1, x: { reversed: true, other: 2 } });
    expect(r).toEqual({ type: 'XYReading', x: { reversed: true } });
  });

  it('flags unknown correction types and options without dropping the known ones', () => {
    const r = parseXyReading({
      ...base,
      corrections: [{ type: 'reference-normalize' }, { type: 'baseline-subtract' }],
    });
    expect(r?.hasUnsupportedCorrection).toBe(true);
    expect(r?.corrections).toHaveLength(1);
    for (const bad of [
      { type: 'reference-normalize', onInvalid: 'interpolate' },
      { type: 'reference-normalize', epsilon: -1 },
      { type: 'reference-normalize', epsilon: 'a' },
      { type: 'reference-normalize', darkDefault: Infinity },
      { type: 'reference-normalize', darkDefault: null },
      'reference-normalize',
      null,
    ]) {
      expect(parseXyReading({ ...base, corrections: [bad] })?.hasUnsupportedCorrection).toBe(true);
    }
    expect(parseXyReading({ ...base, corrections: 'none' })?.hasUnsupportedCorrection).toBe(true);
    expect(parseXyReading({ ...base, corrections: new Array(100).fill({ type: 'reference-normalize' }) })?.hasUnsupportedCorrection).toBe(true);
  });

  it('drops the whole column map when any entry is invalid', () => {
    const ok = { index: 0, role: 'x' };
    for (const bad of [
      { index: -1, role: 'yLeft' },
      { index: 1.5, role: 'yLeft' },
      { index: 1e9, role: 'yLeft' },
      { index: '1', role: 'yLeft' },
      { index: NaN, role: 'yLeft' },
      { index: 1, role: 'banana' },
      { index: 1 },
      { index: 0, role: 'yLeft' }, // duplicate index
      'x',
      null,
    ]) {
      expect(parseXyReading({ ...base, columns: [ok, bad] })?.columns).toBeUndefined();
    }
    expect(parseXyReading({ ...base, columns: [] })?.columns).toBeUndefined();
    const many = Array.from({ length: XY_MAX_COLUMNS + 1 }, (_, i) => ({ index: i, role: 'ignore' }));
    expect(parseXyReading({ ...base, columns: many })?.columns).toBeUndefined();
  });

  it('only accepts sane dialects', () => {
    const d = (dialect: unknown) => parseXyReading({ ...base, dialect })?.dialect;
    expect(d({ delimiter: '\t' })).toEqual({ delimiter: '\t' });
    expect(d({ delimiter: '|' })).toEqual({ delimiter: '|' });
    for (const delimiter of [',,', '', '"', 'a', '1', '\n', '\r', 5, null]) {
      expect(d({ delimiter })).toBeUndefined();
    }
    expect(d({ headerRowCount: 0 })).toEqual({ headerRowCount: 0 });
    for (const headerRowCount of [-1, 1.5, 1e6, '1', null, NaN]) {
      expect(d({ headerRowCount })).toBeUndefined();
    }
    expect(d({ encoding: 'iso-8859-1' })).toEqual({ encoding: 'iso-8859-1' });
    for (const encoding of ['not-an-encoding', '', 5, 'x'.repeat(100)]) {
      expect(d({ encoding })).toBeUndefined();
    }
    expect(d('csv')).toBeUndefined();
  });

  it('sanitizes language maps', () => {
    const r = parseXyReading({
      ...base,
      x: { label: { en: ['ok', 5, ''], fr: 'not-an-array', de: [], '__proto__': ['p'], none: ['y'.repeat(2000)] } },
    });
    expect(Object.keys(r!.x!.label!)).toEqual(['en', 'none']);
    expect(r!.x!.label!.en).toEqual(['ok']);
    expect(r!.x!.label!.none[0]).toHaveLength(512);
    expect(parseXyReading({ ...base, x: { label: ['a'] } })?.x).toBeUndefined();
    const huge = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`l${i}`, ['v']]));
    expect(Object.keys(parseXyReading({ ...base, x: { label: huge } })!.x!.label!)).toHaveLength(32);
  });

  it('keeps y entries positional', () => {
    const r = parseXyReading({ ...base, y: [null, { axis: 'right', label: { en: ['B'] } }, { axis: 'up' }] });
    expect(r?.y).toEqual([{}, { axis: 'right', label: { en: ['B'] } }, {}]);
  });

  it('validates derivedFrom', () => {
    const d = (derivedFrom: unknown) => parseXyReading({ ...base, derivedFrom })?.derivedFrom;
    expect(d({ id: 'https://h/raw', type: 'Dataset' })).toEqual({ id: 'https://h/raw', type: 'Dataset' });
    for (const bad of [
      { id: 'ftp://h/raw', type: 'Dataset' },
      { id: 'javascript:alert(1)', type: 'Dataset' },
      { id: 'data:text/csv,a', type: 'Dataset' },
      { id: '//h/raw', type: 'Dataset' },
      { id: 'https://h/raw', type: 'Manifest' },
      { id: 'https://h/' + 'a'.repeat(3000), type: 'Dataset' },
      { id: 5, type: 'Dataset' },
      { type: 'Dataset' },
      'https://h/raw',
    ]) {
      expect(d(bad)).toBeUndefined();
    }
  });

  it('bounds derivedFrom nesting', () => {
    let nested: unknown = { ...base };
    for (let i = 0; i < 10; i++) {
      nested = { ...base, derivedFrom: { id: 'https://h/raw', type: 'Dataset', xyReading: nested } };
    }
    let depth = 0;
    let cur: ReturnType<typeof parseXyReading> = parseXyReading(nested);
    while (cur?.derivedFrom?.xyReading) {
      cur = cur.derivedFrom.xyReading;
      depth++;
    }
    expect(depth).toBeLessThanOrEqual(2);
  });

  it('never throws on hostile input', () => {
    const cyc: Record<string, unknown> = { ...base };
    cyc.x = cyc;
    const hostile = [
      cyc,
      { ...base, get columns() { throw new Error('boom'); } },
      JSON.parse('{"type":"XYReading","__proto__":{"polluted":true},"x":{"__proto__":{"reversed":true}}}'),
      { ...base, columns: new Proxy([], { get() { throw new Error('proxy'); } }) },
    ];
    for (const h of hostile) expect(() => parseXyReading(h)).not.toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(parseXyReading(JSON.parse('{"type":"XYReading","x":{"__proto__":{"reversed":true}}}'))?.x?.reversed).toBeUndefined();
  });

  it('round-trips its own output', () => {
    const once = parseXyReading({ ...base, corrections: [{ type: 'x' }], columns: [{ index: 0, role: 'x' }] });
    expect(parseXyReading(once)).toEqual(once);
  });
});
