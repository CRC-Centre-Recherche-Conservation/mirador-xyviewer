/**
 * Dataset Parser Service
 * Parse CSV/TSV data into spectrum format
 */

import Papa from 'papaparse';
import type { DataPoint, SpectrumData } from '../types/dataset';
import { MAX_DATA_POINTS } from '../types/dataset';

/** Column name patterns for X axis */
const X_COLUMN_PATTERNS = [
  /^x$/i,
  /^wavelength/i,
  /^wavenumber/i,
  /^energy/i,
  /^frequency/i,
  /^channel/i,
  /^position/i,
  /^time/i,
  /^index/i,
  /^nm$/i,
  /^ev$/i,
  /^kev$/i,
];

/** Column name patterns for Y axis */
const Y_COLUMN_PATTERNS = [
  /^y$/i,
  /^intensity/i,
  /^counts?$/i,
  /^signal/i,
  /^absorbance/i,
  /^transmittance/i,
  /^reflectance/i,
  /^value/i,
  /^amplitude/i,
];

/**
 * Detect the delimiter from content
 */
function detectDelimiter(content: string): string {
  const firstLine = content.split('\n')[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;

  if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
  if (semicolonCount > commaCount) return ';';
  return ',';
}

/**
 * Find the best matching column for X or Y axis
 */
function findColumn(headers: string[], patterns: RegExp[]): number {
  for (const pattern of patterns) {
    const index = headers.findIndex(h => pattern.test(h.trim()));
    if (index !== -1) return index;
  }
  return -1;
}

/**
 * Downsample data points using Largest Triangle Three Buckets algorithm
 * Preserves visual shape while reducing point count
 */
function downsample(points: DataPoint[], targetCount: number): DataPoint[] {
  if (points.length <= targetCount) return points;

  const sampled: DataPoint[] = [];
  const bucketSize = (points.length - 2) / (targetCount - 2);

  // Always keep first point
  sampled.push(points[0]);

  let a = 0; // Previous selected point index

  for (let i = 0; i < targetCount - 2; i++) {
    // Calculate bucket range
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, points.length - 1);

    // Calculate average point for next bucket (for triangle area calculation)
    let avgX = 0;
    let avgY = 0;
    const nextBucketStart = Math.floor((i + 2) * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, points.length);
    const nextBucketCount = nextBucketEnd - nextBucketStart;

    if (nextBucketCount > 0) {
      for (let j = nextBucketStart; j < nextBucketEnd; j++) {
        avgX += points[j].x;
        avgY += points[j].y;
      }
      avgX /= nextBucketCount;
      avgY /= nextBucketCount;
    }

    // Find point in current bucket with largest triangle area
    let maxArea = -1;
    let maxAreaIndex = bucketStart;

    const pointA = points[a];

    for (let j = bucketStart; j < bucketEnd; j++) {
      const area = Math.abs(
        (pointA.x - avgX) * (points[j].y - pointA.y) -
        (pointA.x - points[j].x) * (avgY - pointA.y)
      ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        maxAreaIndex = j;
      }
    }

    sampled.push(points[maxAreaIndex]);
    a = maxAreaIndex;
  }

  // Always keep last point
  sampled.push(points[points.length - 1]);

  return sampled;
}

/**
 * Check if a row contains non-numeric values (i.e., is a header/metadata row)
 */
function isNonNumericRow(row: string[]): boolean {
  return row.some(cell => {
    const trimmed = cell.trim();
    if (trimmed === '') return false;
    return isNaN(parseFloat(trimmed));
  });
}

/**
 * Parse CSV/TSV content into spectrum data
 */
export function parseDataset(
  content: string,
  id: string,
  label: string,
  mimeType: string
): SpectrumData {
  const delimiter = mimeType === 'text/tab-separated-values' ? '\t' : detectDelimiter(content);

  const result = Papa.parse<string[]>(content, {
    delimiter,
    skipEmptyLines: true,
    dynamicTyping: false, // We'll handle conversion ourselves for better control
  });

  if (result.errors.length > 0) {
    console.warn('CSV parsing warnings:', result.errors);
  }

  const rows = result.data;
  if (rows.length < 1) {
    throw new Error('Dataset is empty');
  }

  // Find where numeric data starts by skipping any header/metadata rows
  // Headers can be on line 1, 2, or 3 - skip all non-numeric rows at the beginning
  let lastHeaderIndex = -1;
  const maxHeaderCheck = Math.min(5, rows.length - 1); // Check up to 5 rows

  for (let i = 0; i < maxHeaderCheck; i++) {
    if (isNonNumericRow(rows[i])) {
      lastHeaderIndex = i;
    } else {
      break; // Found first numeric row, stop
    }
  }

  const dataStartIndex = lastHeaderIndex + 1;
  let headers: string[];
  let dataRows: string[][];

  if (lastHeaderIndex >= 0) {
    // Use the last header row for column names
    headers = rows[lastHeaderIndex].map(h => h.trim());
    dataRows = rows.slice(dataStartIndex);
  } else {
    // No headers at all - all rows are data, use default column names
    headers = rows[0].map((_, i) => `Column ${i + 1}`);
    dataRows = rows;
  }

  // Find X and Y columns
  let xCol = findColumn(headers, X_COLUMN_PATTERNS);
  let yCol = findColumn(headers, Y_COLUMN_PATTERNS);

  // Default: first column is X, second is Y
  if (xCol === -1) xCol = 0;
  if (yCol === -1) yCol = xCol === 0 ? 1 : 0;

  // Ensure we have at least 2 columns
  if (headers.length < 2) {
    throw new Error('Dataset must contain at least two columns (X and Y)');
  }

  // Parse data points
  const points: DataPoint[] = [];

  for (const row of dataRows) {
    const xVal = parseFloat(row[xCol]);
    const yVal = parseFloat(row[yCol]);

    if (!isNaN(xVal) && !isNaN(yVal) && isFinite(xVal) && isFinite(yVal)) {
      points.push({ x: xVal, y: yVal });
    }
  }

  if (points.length === 0) {
    throw new Error('No valid numeric data points found in dataset');
  }

  // Sort by X value
  points.sort((a, b) => a.x - b.x);

  // Downsample if necessary
  const finalPoints = points.length > MAX_DATA_POINTS
    ? downsample(points, MAX_DATA_POINTS)
    : points;

  return {
    id,
    label,
    points: finalPoints,
    xLabel: headers[xCol],
    yLabel: headers[yCol],
    mimeType,
  };
}
