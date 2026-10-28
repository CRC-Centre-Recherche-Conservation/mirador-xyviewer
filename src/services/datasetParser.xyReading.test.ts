import { describe, it, expect } from 'vitest';
import { parseDataset } from './datasetParser';
import { MAX_DATA_POINTS } from '../types/dataset';

const R = (extra: Record<string, unknown>) => ({ type: 'XYReading', ...extra });
const cols = (...roles: string[]) => roles.map((role, index) => ({ index, role }));
const parse = (csv: string, reading: unknown, mime = 'text/csv') => parseDataset(csv, 'id', 'L', mime, reading);

describe('parseDataset with xyReading', () => {
  it('is unchanged without a reading, or with an unusable one', () => {
    const csv = 'wavelength,a\n300,3\n100,1\n200,2';
    const plain = parseDataset(csv, 'id', 'L', 'text/csv');
    expect(parse(csv, undefined)).toEqual(plain);
    expect(parse(csv, { type: 'Other', x: { reversed: true } })).toEqual(plain);
    expect(parse(csv, 'garbage')).toEqual(plain);
    expect(plain.xValues).toEqual([100, 200, 300]);
  });

  it('adds no phantom series for trailing delimiters without a reading', () => {
    const d = parseDataset('wavelength,intensity\n400,10,\n500,20,\n600,30,', 'id', 'L', 'text/csv');
    expect(d.series.map(x => x.label)).toEqual(['intensity']);
  });

  it('bounds the column count of untrusted rows', () => {
    const wide = `400,10${','.repeat(5000)}\n500,20`;
    const d = parseDataset(`w,a\n${wide}`, 'id', 'L', 'text/csv');
    expect(d.series).toHaveLength(1);
    expect(parse(`w,a\n${wide}`, R({})).series).toHaveLength(1);
    const wideHeader = parse(`w${',a'.repeat(5000)}\n1${',2'.repeat(5000)}`, R({}));
    expect(wideHeader.series.length).toBeLessThanOrEqual(1023);
  });

  it('sets labels and axis direction aside when the declared columns are invalid', () => {
    const d = parse('w,a\n1,2\n2,3', R({
      columns: [{ index: 0, role: 'x' }, { index: 1, role: 'yLeft' }, { index: 2, role: 'bogus' }],
      x: { label: { en: ['Energy'] }, reversed: true },
      y: [{ label: { en: ['Forged'] } }],
    }));
    expect(d.xLabelMap).toBeUndefined();
    expect(d.xReversed).toBeUndefined();
    expect(d.series[0].labelMap).toBeUndefined();
  });

  it('carries label maps and keeps CSV headers as fallback', () => {
    const d = parse('w,a\n1,2\n2,3', R({
      columns: cols('x', 'yLeft'),
      x: { label: { en: ['Wavelength'] } },
      y: [{ label: { fr: ['Réflectance'] } }],
    }));
    expect(d.xLabel).toBe('w');
    expect(d.xLabelMap).toEqual({ en: ['Wavelength'] });
    expect(d.series[0].label).toBe('a');
    expect(d.series[0].labelMap).toEqual({ fr: ['Réflectance'] });
  });

  it('sorts descending even when rows are unordered, and flags the axis when reversed', () => {
    const unordered = parse('w,a\n2,20\n3,30\n1,10', R({ x: { reversed: true } }));
    expect(unordered.xValues).toEqual([3, 2, 1]);
    const csv = 'w,a\n3,30\n2,20\n1,10';
    const d = parse(csv, R({ x: { reversed: true } }));
    expect(d.xValues).toEqual([3, 2, 1]);
    expect(d.series[0].yValues).toEqual([30, 20, 10]);
    expect(d.xReversed).toBe(true);
    const asc = parse(csv, R({ x: { reversed: false } }));
    expect(asc.xValues).toEqual([1, 2, 3]);
    expect(asc.xReversed).toBeUndefined();
  });

  it('reads every column of a wide file without a reading, caps it with one', () => {
    const cols = 1100;
    const csv = `x,${Array.from({ length: cols }, (_, i) => `s${i}`).join(',')}\n` +
      `1,${Array.from({ length: cols }, () => 1).join(',')}\n2,${Array.from({ length: cols }, () => 2).join(',')}`;
    expect(parse(csv, undefined).series).toHaveLength(cols);
    expect(parse(csv, R({})).series.length).toBeLessThan(cols);
  });

  it('assigns columns by role and does not plot reference/dark/ignore', () => {
    const csv = 'junk,x,l,r,ref,drk,skip\n9,1,10,100,5,1,0\n9,2,20,200,5,1,0';
    const d = parse(csv, R({
      columns: [
        { index: 0, role: 'ignore' }, { index: 1, role: 'x' }, { index: 2, role: 'yLeft' },
        { index: 3, role: 'yRight' }, { index: 4, role: 'reference' }, { index: 5, role: 'dark' },
        { index: 6, role: 'ignore' },
      ],
    }));
    expect(d.xValues).toEqual([1, 2]);
    expect(d.series.map(s => s.label)).toEqual(['l', 'r']);
    expect(d.series.map(s => s.axis)).toEqual([undefined, 'right']);
    expect(d.series[1].yValues).toEqual([100, 200]);
  });

  it('roles replace the X-header heuristic', () => {
    // Header "wavelength" would be picked as X by the regex; roles say column 1 is.
    const d = parse('wavelength,idx,y\n1,500,5\n2,600,6', R({ columns: cols('ignore', 'x', 'yLeft') }));
    expect(d.xValues).toEqual([500, 600]);
    expect(d.series.map(s => s.label)).toEqual(['y']);
  });

  it('applies y[i] labels and axis positionally without column roles', () => {
    const d = parse('x,a,b\n1,2,3\n2,3,4', R({ y: [{ label: { en: ['A'] } }, { axis: 'right', label: { en: ['B'] } }] }));
    expect(d.series[0].labelMap).toEqual({ en: ['A'] });
    expect(d.series[1].axis).toBe('right');
  });

  it('falls back to the file as published when the roles cannot be honoured', () => {
    const csv = 'x,a\n3,1\n1,2';
    const plain = parseDataset(csv, 'id', 'L', 'text/csv');
    for (const columns of [
      cols('x', 'yLeft', 'yLeft'), // beyond the file width
      cols('yLeft', 'yLeft'), // no x
      cols('x', 'x'), // ambiguous x
      cols('x', 'ignore'), // no measurement
    ]) {
      const d = parse(csv, R({ columns, x: { reversed: true, label: { en: ['X'] } } }));
      expect(d).toEqual(plain);
    }
  });

  describe('dialect', () => {
    it('uses the declared delimiter instead of sniffing', () => {
      // Sniffing finds no known delimiter here and would not split on '|'.
      const d = parse('a|b\n1.5|2\n3|4', R({ dialect: { delimiter: '|' } }));
      expect(d.xLabel).toBe('a');
      expect(d.xValues).toEqual([1.5, 3]);
    });

    it('a declared delimiter wins over a TSV mime type', () => {
      const d = parse('x;y\n1;2\n2;3', R({ dialect: { delimiter: ';' } }), 'text/tab-separated-values');
      expect(d.xValues).toEqual([1, 2]);
    });

    it('headerRowCount replaces header sniffing', () => {
      const csv = 'x,y\n1,2\n3,4';
      const none = parse(csv, R({ dialect: { headerRowCount: 0 } }));
      expect(none.xLabel).toBe('Column 1'); // sniffing alone would name it "x"
      expect(none.xValues).toEqual([1, 3]); // the non-numeric row is just skipped
      const two = parse('meta,meta\nx,y\n1,2\n2,3', R({ dialect: { headerRowCount: 2 } }));
      expect(two.xLabel).toBe('x');
      // A header row that looks numeric is still a header when declared.
      const numeric = parse('1,2\n3,4\n5,6', R({ dialect: { headerRowCount: 1 } }));
      expect(numeric.xValues).toEqual([3, 5]);
      expect(numeric.xLabel).toBe('1');
    });

    it('falls back to sniffing when headerRowCount exceeds the file', () => {
      expect(parse('x,y\n1,2', R({ dialect: { headerRowCount: 50 } })).xValues).toEqual([1]);
    });
  });

  describe('reference-normalize', () => {
    const corr = (extra: Record<string, unknown> = {}) => [{ type: 'reference-normalize', ...extra }];

    it('computes (y - dark) / (ref - dark) with a dark column', () => {
      const d = parse('x,y,ref,dark\n1,6,10,2\n2,10,10,2', R({
        columns: cols('x', 'yLeft', 'reference', 'dark'),
        corrections: corr(),
      }));
      expect(d.series[0].yValues).toEqual([0.5, 1]);
      expect(d.series).toHaveLength(1);
    });

    it('uses darkDefault (0 by default) without a dark column', () => {
      const csv = 'x,y,ref\n1,5,10\n2,8,16';
      const r = (extra?: Record<string, unknown>) => parse(csv, R({ columns: cols('x', 'yLeft', 'reference'), corrections: corr(extra) }));
      expect(r().series[0].yValues).toEqual([0.5, 0.5]);
      expect(r({ darkDefault: 1 }).series[0].yValues).toEqual([4 / 9, 7 / 15]);
    });

    it('drops rows with a missing or non-finite value', () => {
      const d = parse('x,y,ref\n1,5,10\n2,,10\n3,5,\n4,5,abc\n5,5,Infinity\n6,10,10', R({
        columns: cols('x', 'yLeft', 'reference'),
        corrections: corr(),
      }));
      // Row 2 has no y (all y invalid), rows 3-5 have no usable reference.
      expect(d.xValues).toEqual([1, 6]);
      expect(d.series[0].yValues).toEqual([0.5, 1]);
    });

    it('drops rows whose denominator is below epsilon', () => {
      const csv = 'x,y,ref,dark\n1,5,2,2\n2,5,2.0000001,2\n3,5,4,2';
      const cols4 = cols('x', 'yLeft', 'reference', 'dark');
      const dflt = parse(csv, R({ columns: cols4, corrections: corr() }));
      expect(dflt.xValues).toEqual([2, 3]); // exact zero dropped by the default epsilon
      const wide = parse(csv, R({ columns: cols4, corrections: corr({ epsilon: 1e-3 }) }));
      expect(wide.xValues).toEqual([3]);
    });

    it('applies corrections to every measurement, on either axis', () => {
      const d = parse('x,l,r,ref\n1,5,10,10', R({
        columns: cols('x', 'yLeft', 'yRight', 'reference'),
        corrections: corr(),
      }));
      expect(d.series.map(s => s.yValues)).toEqual([[0.5], [1]]);
      expect(d.series[1].axis).toBe('right');
    });

    it('an empty corrections list leaves the file as is', () => {
      const d = parse('x,y,ref\n1,5,10', R({ columns: cols('x', 'yLeft', 'reference'), corrections: [] }));
      expect(d.series[0].yValues).toEqual([5]);
      expect(d.readingIgnored).toBeUndefined();
    });

    it('plots raw with CSV headers and a flag on an unknown correction', () => {
      const csv = 'wavelength,y,ref\n2,5,10\n1,6,10';
      const d = parse(csv, R({
        columns: cols('x', 'yLeft', 'reference'),
        x: { label: { en: ['Corrected x'] }, reversed: true },
        y: [{ label: { en: ['Corrected y'] } }],
        corrections: [{ type: 'reference-normalize' }, { type: 'baseline-subtract' }],
      }));
      expect(d.readingIgnored).toBe('unsupported-correction');
      expect(d.xLabelMap).toBeUndefined();
      expect(d.xReversed).toBeUndefined();
      expect(d.series.map(s => s.label)).toEqual(['y', 'ref']);
      expect(d.series.every(s => !s.labelMap)).toBe(true);
      expect(d.series[0].yValues).toEqual([6, 5]); // sorted, uncorrected
    });

    it('still honours the dialect when the reading is set aside', () => {
      const d = parse('x;y\n1;2', R({ dialect: { delimiter: ';' }, corrections: [{ type: 'weird' }] }));
      expect(d.xValues).toEqual([1]);
      expect(d.readingIgnored).toBe('unsupported-correction');
    });

    it('treats a correction without a reference column as unsupported', () => {
      const d = parse('x,y\n1,2', R({ columns: cols('x', 'yLeft'), corrections: corr() }));
      expect(d.readingIgnored).toBe('unsupported-correction');
      expect(d.series[0].yValues).toEqual([2]);
      const noColumns = parse('x,y\n1,2', R({ corrections: corr() }));
      expect(noColumns.readingIgnored).toBe('unsupported-correction');
    });
  });

  it('still downsamples, keeping a reversed file in file order', () => {
    const n = MAX_DATA_POINTS * 2;
    const lines = ['w,a'];
    for (let i = n; i >= 1; i--) lines.push(`${i},${Math.sin(i / 50)}`);
    const d = parse(lines.join('\n'), R({ x: { reversed: true } }));
    expect(d.xValues.length).toBeLessThanOrEqual(MAX_DATA_POINTS);
    expect(d.xValues[0]).toBe(n);
    expect(d.xValues[d.xValues.length - 1]).toBe(1);
    expect(d.xValues.every((x, i, a) => i === 0 || x < a[i - 1])).toBe(true);
    expect(d.series[0].yValues).toHaveLength(d.xValues.length);
  });
});
