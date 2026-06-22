/**
 * Dataset and Spectrum Types
 */

import type { IiifService } from './iiif';

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

/**
 * Per-request overrides for a dataset fetch. Lets a host opt into IIIF Auth for
 * access-controlled datasets/spectra without changing the secure default.
 *
 * The fetcher's default is `credentials: 'omit'` and no extra headers; values
 * here are merged over that default (see {@link DatasetRequestProvider}). For
 * cross-origin requests, `credentials: 'include'` additionally requires the
 * server to send `Access-Control-Allow-Credentials: true` and an explicit
 * `Access-Control-Allow-Origin`.
 */
export interface DatasetRequestOptions {
  /** Fetch credentials mode. Default `'omit'` (unchanged secure default). */
  credentials?: RequestCredentials;
  /** Extra request headers, e.g. `{ Authorization: 'Bearer …' }`. */
  headers?: Record<string, string>;
}

/**
 * Per-request context handed to a {@link DatasetRequestProvider}. Lets a provider do
 * precise IIIF Auth matching from the resource's declared service, not just its URL.
 */
export interface DatasetRequestContext {
  /** The dataset resource's declared IIIF Auth service(s), if any. */
  service?: IiifService | IiifService[];
}

/**
 * Resolves per-URL request options (sync or async). Registered once via
 * `configureDatasetRequests`; mirrors the spirit of Mirador's own
 * `requests.preprocessors`. Receives an optional {@link DatasetRequestContext} (the
 * resource's declared service). Return `undefined` to leave the secure default.
 */
export type DatasetRequestProvider = (
  url: string,
  context?: DatasetRequestContext
) => DatasetRequestOptions | undefined | Promise<DatasetRequestOptions | undefined>;

/** Fetch status */
export type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

/** Dataset fetch result */
export interface DatasetFetchResult {
  status: FetchStatus;
  data?: SpectrumData;
  error?: string;
  /** True when the fetch failed with 401/403 — i.e. the resource needs auth. */
  authRequired?: boolean;
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
