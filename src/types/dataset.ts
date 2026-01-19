/**
 * Dataset and Spectrum Types
 */

/** Allowed MIME types for dataset fetching */
export const ALLOWED_MIME_TYPES = [
  'text/csv',
  'text/plain',
  'text/tab-separated-values',
] as const;

export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];

/** Check if a MIME type is allowed */
export function isAllowedMimeType(mime: string | undefined): mime is AllowedMimeType {
  if (!mime) return false;
  const baseMime = mime.split(';')[0].trim().toLowerCase();
  return ALLOWED_MIME_TYPES.includes(baseMime as AllowedMimeType);
}

/** A single data point in a spectrum */
export interface DataPoint {
  x: number;
  y: number;
}

/** A single Y series with its data points and label */
export interface SeriesData {
  /** Series label (column name) */
  label: string;
  /** Y values for this series */
  yValues: number[];
}

/** Parsed spectrum data with support for multiple Y series */
export interface SpectrumData {
  /** Unique identifier (usually the URL) */
  id: string;
  /** Display label */
  label: string;
  /** X values (shared by all series) */
  xValues: number[];
  /** X-axis label (e.g., "Wavelength (nm)") */
  xLabel?: string;
  /** Multiple Y series */
  series: SeriesData[];
  /** Original MIME type */
  mimeType: string;
  /** @deprecated Use xValues and series instead */
  points: DataPoint[];
  /** @deprecated Use series[0].label instead */
  yLabel?: string;
}

/** Cache entry for datasets */
export interface CacheEntry {
  data: SpectrumData;
  timestamp: number;
  expiresAt: number;
}

/** Fetch status */
export type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

/** Dataset fetch result */
export interface DatasetFetchResult {
  status: FetchStatus;
  data?: SpectrumData;
  error?: string;
}

/** Plotly trace configuration */
export interface PlotlyTrace {
  x: number[];
  y: number[];
  type: 'scatter';
  mode: 'lines' | 'markers' | 'lines+markers';
  name: string;
  visible: boolean | 'legendonly';
  line?: {
    color?: string;
    width?: number;
  };
}

/** Plotly layout configuration */
export interface PlotlyLayout {
  title?: string;
  xaxis?: {
    title?: string;
    autorange?: boolean;
  };
  yaxis?: {
    title?: string;
    autorange?: boolean;
  };
  showlegend?: boolean;
  legend?: {
    x?: number;
    y?: number;
    xanchor?: 'left' | 'center' | 'right' | 'auto';
    yanchor?: 'top' | 'middle' | 'bottom' | 'auto';
    orientation?: 'h' | 'v';
    bgcolor?: string;
  };
  autosize?: boolean;
  margin?: {
    l?: number;
    r?: number;
    t?: number;
    b?: number;
  };
  paper_bgcolor?: string;
  plot_bgcolor?: string;
}

/** Maximum file size for datasets (5 MB) */
export const MAX_DATASET_SIZE = 5 * 1024 * 1024;

/** Maximum number of data points before downsampling */
export const MAX_DATA_POINTS = 10000;

/** Cache TTL in milliseconds (30 minutes) */
export const CACHE_TTL = 30 * 60 * 1000;
