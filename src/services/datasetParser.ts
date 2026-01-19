/**
 * Dataset Parser Service
 * Parse CSV/TSV data into spectrum format
 */

import Papa from 'papaparse';
import type { DataPoint, SpectrumData, SeriesData } from '../types/dataset';
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


/**
 * Detect the delimiter from content
 */
function detectDelimiter(content: string): string | null {
  // Find first non-empty line
  const lines = content.split('\n');
  let firstLine = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      firstLine = trimmed;
      break;
    }
  }

  if (!firstLine) return ',';

  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;

  // Check for space-separated values (2+ spaces between values, or space between number-like patterns)
  const hasMultipleSpaces = /\S\s{2,}\S/.test(firstLine);
  const spaceSeparatedPattern = /[\d.]+\s+[\d.]+/.test(firstLine);
  const isSpaceSeparated = hasMultipleSpaces || (spaceSeparatedPattern && tabCount === 0 && commaCount === 0 && semicolonCount === 0);

  if (tabCount > 0 && tabCount >= commaCount && tabCount >= semicolonCount) return '\t';
  if (semicolonCount > 0 && semicolonCount > commaCount) return ';';
  if (commaCount > 0) return ',';
  if (isSpaceSeparated) return null; // Signal to use space parsing
  return ',';
}

/**
 * Pre-process content to normalize space-separated values
 * Converts multiple spaces/whitespace to tabs for consistent parsing
 */
function normalizeSpaceSeparated(content: string): string {
  return content
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      // Replace any sequence of whitespace (spaces, tabs) with a single tab
      return trimmed.replace(/\s+/g, '\t');
    })
    .filter(line => line.length > 0)
    .join('\n');
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
  let processedContent = content;
  let delimiter: string;

  if (mimeType === 'text/tab-separated-values') {
    delimiter = '\t';
  } else {
    const detectedDelimiter = detectDelimiter(content);
    if (detectedDelimiter === null) {
      // Space-separated: normalize to tabs
      processedContent = normalizeSpaceSeparated(content);
      delimiter = '\t';
    } else {
      delimiter = detectedDelimiter;
    }
  }

  const result = Papa.parse<string[]>(processedContent, {
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

  // Find X column
  let xCol = findColumn(headers, X_COLUMN_PATTERNS);
  if (xCol === -1) xCol = 0; // Default: first column is X

  // All other columns are Y series
  const yColumns: number[] = [];
  for (let i = 0; i < headers.length; i++) {
    if (i !== xCol) {
      yColumns.push(i);
    }
  }

  // Ensure we have at least 1 Y column
  if (yColumns.length === 0) {
    throw new Error('Dataset must contain at least two columns (X and Y)');
  }

  // Parse data - extract X values and Y values for each series
  const rawData: { x: number; yValues: number[] }[] = [];

  for (const row of dataRows) {
    const xVal = parseFloat(row[xCol]);
    if (isNaN(xVal) || !isFinite(xVal)) continue;

    const yValues: number[] = [];
    let hasValidY = false;

    for (const yCol of yColumns) {
      const yVal = parseFloat(row[yCol]);
      if (!isNaN(yVal) && isFinite(yVal)) {
        yValues.push(yVal);
        hasValidY = true;
      } else {
        yValues.push(NaN); // Keep alignment
      }
    }

    if (hasValidY) {
      rawData.push({ x: xVal, yValues });
    }
  }

  if (rawData.length === 0) {
    throw new Error('No valid numeric data points found in dataset');
  }

  // Sort by X value
  rawData.sort((a, b) => a.x - b.x);

  // Extract X values
  let xValues = rawData.map(d => d.x);

  // Build series data
  let series: SeriesData[] = yColumns.map((yCol, idx) => ({
    label: headers[yCol],
    yValues: rawData.map(d => d.yValues[idx]),
  }));

  // Build legacy points (using first Y series) for backward compatibility
  let points: DataPoint[] = rawData.map((d) => ({
    x: d.x,
    y: d.yValues[0],
  })).filter(p => !isNaN(p.y));

  // Downsample if necessary
  if (xValues.length > MAX_DATA_POINTS) {
    // Build points for downsampling algorithm
    const tempPoints = rawData.map(d => ({ x: d.x, y: d.yValues[0] }));
    const sampledPoints = downsample(tempPoints.filter(p => !isNaN(p.y)), MAX_DATA_POINTS);

    // Get the indices of sampled points
    const sampledXSet = new Set(sampledPoints.map(p => p.x));
    const sampledIndices: number[] = [];
    rawData.forEach((d, i) => {
      if (sampledXSet.has(d.x)) {
        sampledIndices.push(i);
      }
    });

    // Apply same sampling to all series
    xValues = sampledIndices.map(i => rawData[i].x);
    series = series.map(s => ({
      label: s.label,
      yValues: sampledIndices.map(i => s.yValues[i]),
    }));
    points = sampledPoints;
  }

  return {
    id,
    label,
    xValues,
    xLabel: headers[xCol],
    series,
    mimeType,
    // Legacy fields for backward compatibility
    points,
    yLabel: series[0]?.label,
  };
}
