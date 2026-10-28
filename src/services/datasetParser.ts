/**
 * Dataset Parser Service
 * Parse CSV/TSV data into spectrum format
 */

import Papa from 'papaparse';
import type { DataPoint, SpectrumData, SeriesData } from '../types/dataset';
import type { LocalizedString } from '../types/iiif';
import type { XyReading, XyCorrection } from '../types/xyReading';
import { MAX_DATA_POINTS } from '../types/dataset';
import { parseXyReading, XY_MAX_COLUMN_INDEX } from '../utils/xyReading';

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

interface MeasurementColumn {
  col: number;
  axis: 'left' | 'right';
  labelMap?: LocalizedString;
}

/** Where the columns come from and which corrections apply. */
interface ReadingPlan {
  xCol: number;
  measures: MeasurementColumn[];
  referenceCol?: number;
  darkCol?: number;
  corrections: XyCorrection[];
}

/**
 * Resolve the xyReading column roles against the file. Returns null when they cannot be
 * honoured (no x / no measurement, ambiguous x, index outside the file).
 */
function planFromRoles(reading: XyReading, width: number): ReadingPlan | null {
  const cols = reading.columns;
  if (!cols) return null;
  if (cols.some(c => c.index >= width)) return null;
  const xs = cols.filter(c => c.role === 'x');
  if (xs.length !== 1) return null;
  const ref = cols.filter(c => c.role === 'reference');
  const dark = cols.filter(c => c.role === 'dark');
  if (ref.length > 1 || dark.length > 1) return null;
  const measures: MeasurementColumn[] = cols
    .filter(c => c.role === 'yLeft' || c.role === 'yRight')
    .map((c, i) => ({
      col: c.index,
      axis: c.role === 'yRight' ? 'right' : 'left',
      labelMap: reading.y?.[i]?.label,
    }));
  if (measures.length === 0) return null;
  const corrections = reading.corrections ?? [];
  if (corrections.length > 0 && ref.length === 0) return null;
  return {
    xCol: xs[0].index,
    measures,
    referenceCol: ref[0]?.index,
    darkCol: dark[0]?.index,
    corrections,
  };
}

const MAX_COLUMNS = XY_MAX_COLUMN_INDEX + 1;

const toNumber = (cell: string | undefined): number => parseFloat(cell as string);

/**
 * Parse CSV/TSV content into spectrum data.
 *
 * `xyReading` is the optional, untrusted extension object of the Dataset body: used when
 * valid, otherwise the file is read exactly as before. One that cannot be honoured (unknown
 * correction, unusable columns) is set aside whole, apart from the dialect.
 */
export function parseDataset(
  content: string,
  id: string,
  label: string,
  mimeType: string,
  xyReading?: unknown
): SpectrumData {
  let reading = parseXyReading(xyReading);
  const dialect = reading?.dialect;

  let processedContent = content;
  let delimiter: string;

  if (dialect?.delimiter) {
    delimiter = dialect.delimiter;
  } else if (mimeType === 'text/tab-separated-values') {
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

  // Find where numeric data starts by skipping any header/metadata rows. A declared
  // headerRowCount replaces the sniffing; otherwise skip the non-numeric rows at the start
  // (headers can be on line 1, 2, or 3).
  let lastHeaderIndex = -1;
  const declaredHeaders = dialect?.headerRowCount;
  if (declaredHeaders !== undefined && declaredHeaders < rows.length) {
    lastHeaderIndex = declaredHeaders - 1;
  } else {
    const maxHeaderCheck = Math.min(5, rows.length - 1); // Check up to 5 rows
    for (let i = 0; i < maxHeaderCheck; i++) {
      if (isNonNumericRow(rows[i])) {
        lastHeaderIndex = i;
      } else {
        break; // Found first numeric row, stop
      }
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
  // A reading's roles can point past the header, so bound the columns it may address; files
  // read without a reading keep every column.
  const columnCap = reading ? MAX_COLUMNS : Infinity;
  if (headers.length > columnCap) headers = headers.slice(0, columnCap);
  const width = Math.min(columnCap, dataRows.reduce((w, r) => Math.max(w, r.length), headers.length));

  let plan: ReadingPlan | null = null;
  let readingIgnored: SpectrumData['readingIgnored'];
  if (reading) {
    const hasCorrections = (reading.corrections?.length ?? 0) > 0;
    if (!reading.hasUnsupportedCorrection && reading.columns) plan = planFromRoles(reading, width);
    if (plan) for (let i = headers.length; i < width; i++) headers.push(`Column ${i + 1}`);
    // A correction that cannot be applied must not leave raw data under a corrected title.
    if (reading.hasUnsupportedCorrection || (hasCorrections && !plan)) {
      readingIgnored = 'unsupported-correction';
    }
    // Columns or corrections that cannot be honoured: read the file as published.
    if (readingIgnored || ((reading.columns || reading.columnsInvalid) && !plan)) {
      reading = { type: 'XYReading', dialect: reading.dialect };
    }
  }

  let xCol: number;
  let measures: MeasurementColumn[];
  if (plan) {
    xCol = plan.xCol;
    measures = plan.measures;
  } else {
    // Find X column
    xCol = findColumn(headers, X_COLUMN_PATTERNS);
    if (xCol === -1) xCol = 0; // Default: first column is X
    // All other columns are Y series
    measures = [];
    for (let i = 0; i < headers.length; i++) {
      if (i === xCol) continue;
      const spec = reading?.y?.[measures.length];
      measures.push({ col: i, axis: spec?.axis ?? 'left', labelMap: spec?.label });
    }
  }

  // Ensure we have at least 1 Y column
  if (measures.length === 0) {
    throw new Error('Dataset must contain at least two columns (X and Y)');
  }

  const corrections = plan?.corrections ?? [];
  const { referenceCol, darkCol } = plan ?? {};

  // Parse data - extract X values and Y values for each series
  const rawData: { x: number; yValues: number[] }[] = [];

  for (const row of dataRows) {
    const xVal = toNumber(row[xCol]);
    if (!Number.isFinite(xVal)) continue;

    const yValues: number[] = measures.map(m => toNumber(row[m.col]));

    if (corrections.length > 0 && referenceCol !== undefined) {
      const ref = toNumber(row[referenceCol]);
      const darkCell = darkCol !== undefined ? toNumber(row[darkCol]) : undefined;
      let keep = Number.isFinite(ref) && (darkCell === undefined || Number.isFinite(darkCell));
      for (const c of corrections) {
        if (!keep) break;
        const dark = darkCell ?? c.darkDefault;
        const denominator = ref - dark;
        if (!Number.isFinite(denominator) || Math.abs(denominator) < c.epsilon) {
          keep = false;
          break;
        }
        for (let i = 0; i < yValues.length; i++) {
          const v = (yValues[i] - dark) / denominator;
          yValues[i] = Number.isFinite(v) ? v : NaN;
        }
      }
      if (!keep) continue;
    }

    let hasValidY = false;
    for (let i = 0; i < yValues.length; i++) {
      if (Number.isFinite(yValues[i])) hasValidY = true;
      else yValues[i] = NaN; // Keep alignment
    }

    if (hasValidY) {
      rawData.push({ x: xVal, yValues });
    }
  }

  if (rawData.length === 0) {
    throw new Error('No valid numeric data points found in dataset');
  }

  // Sort by X value (descending when the reading declares a reversed axis)
  const reversed = reading?.x?.reversed === true;
  rawData.sort((a, b) => (reversed ? b.x - a.x : a.x - b.x));

  // Extract X values
  let xValues = rawData.map(d => d.x);

  // Build series data
  let series: SeriesData[] = measures.map((m, idx) => ({
    label: headers[m.col],
    yValues: rawData.map(d => d.yValues[idx]),
    ...(m.labelMap ? { labelMap: m.labelMap } : {}),
    ...(m.axis === 'right' ? { axis: 'right' as const } : {}),
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
      ...s,
      yValues: sampledIndices.map(i => s.yValues[i]),
    }));
    points = sampledPoints;
  }

  return {
    id,
    label,
    xValues,
    xLabel: headers[xCol],
    ...(reading?.x?.label ? { xLabelMap: reading.x.label } : {}),
    ...(reversed ? { xReversed: true } : {}),
    ...(readingIgnored ? { readingIgnored } : {}),
    series,
    mimeType,
    // Legacy fields for backward compatibility
    points,
    yLabel: series[0]?.label,
  };
}
