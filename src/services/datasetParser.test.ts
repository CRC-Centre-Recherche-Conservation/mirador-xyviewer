import { describe, it, expect } from 'vitest';
import { parseDataset } from './datasetParser';

describe('datasetParser', () => {
  describe('parseDataset', () => {
    it('should parse simple CSV with headers', () => {
      const csv = `wavelength,intensity
100,0.5
200,0.8
300,1.2`;

      const result = parseDataset(csv, 'test-id', 'Test Spectrum', 'text/csv');

      expect(result.id).toBe('test-id');
      expect(result.label).toBe('Test Spectrum');
      expect(result.xLabel).toBe('wavelength');
      expect(result.xValues).toEqual([100, 200, 300]);
      expect(result.series).toHaveLength(1);
      expect(result.series[0].label).toBe('intensity');
      expect(result.series[0].yValues).toEqual([0.5, 0.8, 1.2]);
    });

    it('should parse TSV data', () => {
      const tsv = `x\ty
1\t10
2\t20
3\t30`;

      const result = parseDataset(tsv, 'tsv-test', 'TSV Test', 'text/tab-separated-values');

      expect(result.xValues).toEqual([1, 2, 3]);
      expect(result.series[0].yValues).toEqual([10, 20, 30]);
    });

    it('should detect and parse tab-separated values', () => {
      const data = `x\ty
1\t100
2\t200`;

      const result = parseDataset(data, 'id', 'Label', 'text/csv');
      expect(result.xValues).toEqual([1, 2]);
    });

    it('should detect and parse semicolon-separated values', () => {
      const data = `x;y
1;10
2;20`;

      const result = parseDataset(data, 'id', 'Label', 'text/csv');
      expect(result.xValues).toEqual([1, 2]);
      expect(result.series[0].yValues).toEqual([10, 20]);
    });

    it('should parse space-separated values', () => {
      const data = `1  100
2  200
3  300`;

      const result = parseDataset(data, 'id', 'Label', 'text/csv');
      expect(result.xValues).toEqual([1, 2, 3]);
    });

    it('should handle multiple Y columns (series)', () => {
      const csv = `wavelength,series1,series2,series3
100,1,2,3
200,4,5,6
300,7,8,9`;

      const result = parseDataset(csv, 'id', 'Multi-series', 'text/csv');

      expect(result.series).toHaveLength(3);
      expect(result.series[0].label).toBe('series1');
      expect(result.series[1].label).toBe('series2');
      expect(result.series[2].label).toBe('series3');
      expect(result.series[0].yValues).toEqual([1, 4, 7]);
      expect(result.series[1].yValues).toEqual([2, 5, 8]);
      expect(result.series[2].yValues).toEqual([3, 6, 9]);
    });

    it('should recognize common X column names', () => {
      const patterns = [
        { header: 'wavelength', data: 'wavelength,y\n1,10' },
        { header: 'wavenumber', data: 'wavenumber,y\n1,10' },
        { header: 'energy', data: 'energy,y\n1,10' },
        { header: 'channel', data: 'channel,y\n1,10' },
        { header: 'nm', data: 'nm,y\n1,10' },
        { header: 'keV', data: 'keV,y\n1,10' },
      ];

      for (const { header, data } of patterns) {
        const result = parseDataset(data, 'id', 'Label', 'text/csv');
        expect(result.xLabel.toLowerCase()).toBe(header.toLowerCase());
      }
    });

    it('should default to first column as X if no pattern matches', () => {
      const csv = `custom_col,value
1,10
2,20`;

      const result = parseDataset(csv, 'id', 'Label', 'text/csv');
      expect(result.xLabel).toBe('custom_col');
    });

    it('should sort data by X values', () => {
      const csv = `x,y
3,30
1,10
2,20`;

      const result = parseDataset(csv, 'id', 'Label', 'text/csv');
      expect(result.xValues).toEqual([1, 2, 3]);
      expect(result.series[0].yValues).toEqual([10, 20, 30]);
    });

    it('should skip invalid/NaN values', () => {
      const csv = `x,y
1,10
invalid,20
3,30`;

      const result = parseDataset(csv, 'id', 'Label', 'text/csv');
      expect(result.xValues).toEqual([1, 3]);
      expect(result.series[0].yValues).toEqual([10, 30]);
    });

    it('should handle header rows with metadata', () => {
      const csv = `# This is a comment
Spectrum Data
x,y
1,10
2,20`;

      const result = parseDataset(csv, 'id', 'Label', 'text/csv');
      expect(result.xLabel).toBe('x');
      expect(result.xValues).toEqual([1, 2]);
    });

    it('should throw error for empty dataset', () => {
      expect(() => parseDataset('', 'id', 'Label', 'text/csv')).toThrow('Dataset is empty');
    });

    it('should throw error for single column data', () => {
      const csv = `x
1
2
3`;

      expect(() => parseDataset(csv, 'id', 'Label', 'text/csv')).toThrow(
        'Dataset must contain at least two columns'
      );
    });

    it('should throw error when no valid data points', () => {
      const csv = `x,y
a,b
c,d`;

      expect(() => parseDataset(csv, 'id', 'Label', 'text/csv')).toThrow(
        'No valid numeric data points found'
      );
    });

    it('should include legacy points field for backward compatibility', () => {
      const csv = `x,y
1,10
2,20`;

      const result = parseDataset(csv, 'id', 'Label', 'text/csv');
      expect(result.points).toEqual([
        { x: 1, y: 10 },
        { x: 2, y: 20 },
      ]);
      expect(result.yLabel).toBe('y');
    });

    it('should handle floating point values', () => {
      const csv = `x,y
1.5,0.123
2.7,0.456
3.9,0.789`;

      const result = parseDataset(csv, 'id', 'Label', 'text/csv');
      expect(result.xValues).toEqual([1.5, 2.7, 3.9]);
      expect(result.series[0].yValues).toEqual([0.123, 0.456, 0.789]);
    });

    it('should handle negative values', () => {
      const csv = `x,y
-10,5
0,10
10,-5`;

      const result = parseDataset(csv, 'id', 'Label', 'text/csv');
      expect(result.xValues).toEqual([-10, 0, 10]);
      expect(result.series[0].yValues).toEqual([5, 10, -5]);
    });
  });
});
