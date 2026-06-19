/**
 * Dataset Fetcher Service
 * Secure async fetching with validation and caching
 */

import type {
  SpectrumData,
  DatasetFetchResult,
  DatasetRequestOptions,
  DatasetRequestProvider,
} from '../types/dataset';
import { ALLOWED_MIME_TYPES, MAX_DATASET_SIZE, isAllowedMimeType } from '../types/dataset';
import { isValidUrl, validateContentType } from '../utils/security';
import { datasetCache } from './datasetCache';
import { parseDataset } from './datasetParser';

/** Active abort controllers by URL */
const abortControllers = new Map<string, AbortController>();

/* -------------------------------------------------------------------------- */
/* IIIF Auth — opt-in request configuration                                   */
/* -------------------------------------------------------------------------- */

/** Host-provided resolver for per-URL request options (IIIF Auth). */
let requestProvider: DatasetRequestProvider | undefined;

/**
 * Register a resolver that supplies credentials/headers for dataset fetches,
 * enabling IIIF Auth (cookie or Bearer token) on access-controlled datasets.
 *
 * Opt-in: with no provider, fetches keep the secure default (`credentials:
 * 'omit'`, no auth headers). Call once at app setup; pass `undefined` to reset.
 *
 * @example
 * // Same-origin cookie auth:
 * configureDatasetRequests(() => ({ credentials: 'include' }));
 * @example
 * // Bearer token (e.g. read from your store):
 * configureDatasetRequests((url) => {
 *   const token = selectTokenForUrl(url);
 *   return token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
 * });
 */
export function configureDatasetRequests(provider: DatasetRequestProvider | undefined): void {
  requestProvider = provider;
}

/** Rejection for an auth/authorization failure (401/403) — surfaced as `authRequired`. */
class DatasetAuthError extends Error {
  readonly authRequired = true;
  constructor(message: string) {
    super(message);
    this.name = 'DatasetAuthError';
  }
}

/**
 * Resolve the effective request options for a URL: the registered provider's
 * result, with any per-call options taking precedence. Headers merge (per-call
 * wins); credentials default to the secure `'omit'`.
 */
async function resolveRequestOptions(
  url: string,
  perCall: DatasetRequestOptions | undefined
): Promise<{ credentials: RequestCredentials; headers: Record<string, string> }> {
  const fromProvider = requestProvider ? await requestProvider(url) : undefined;
  return {
    credentials: perCall?.credentials ?? fromProvider?.credentials ?? 'omit',
    headers: { ...fromProvider?.headers, ...perCall?.headers },
  };
}

/**
 * Abort any pending fetch for a URL
 */
export function abortFetch(url: string): void {
  const controller = abortControllers.get(url);
  if (controller) {
    controller.abort();
    abortControllers.delete(url);
  }
}

/**
 * Abort all pending fetches
 */
export function abortAllFetches(): void {
  for (const controller of abortControllers.values()) {
    controller.abort();
  }
  abortControllers.clear();
}

/**
 * Fetch and parse a dataset
 * Returns cached data if available, otherwise fetches
 */
export async function fetchDataset(
  url: string,
  declaredMimeType: string,
  label: string,
  options?: DatasetRequestOptions
): Promise<DatasetFetchResult> {
  // Validate URL
  if (!isValidUrl(url)) {
    return {
      status: 'error',
      error: 'Invalid URL: Only http/https protocols are allowed',
    };
  }

  // Validate declared MIME type
  if (!isAllowedMimeType(declaredMimeType)) {
    return {
      status: 'error',
      error: `Unsupported MIME type: ${declaredMimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
    };
  }

  // Check cache first
  const cached = datasetCache.get(url);
  if (cached) {
    return { status: 'success', data: cached };
  }

  // Check for pending request
  const pending = datasetCache.getPendingRequest(url);
  if (pending) {
    try {
      const data = await pending;
      return { status: 'success', data };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Request failed',
        ...(error instanceof DatasetAuthError ? { authRequired: true } : {}),
      };
    }
  }

  // Create new fetch request
  const controller = new AbortController();
  abortControllers.set(url, controller);

  // Note: cache and in-flight dedup are keyed by URL only — one auth context per
  // URL per session is assumed, which holds for a viewer.
  const fetchPromise = performFetch(url, declaredMimeType, label, controller.signal, options);
  datasetCache.setPendingRequest(url, fetchPromise);

  try {
    const data = await fetchPromise;
    return { status: 'success', data };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { status: 'error', error: 'Request aborted' };
    }
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to fetch dataset',
      ...(error instanceof DatasetAuthError ? { authRequired: true } : {}),
    };
  } finally {
    abortControllers.delete(url);
  }
}

/**
 * Internal fetch implementation
 */
async function performFetch(
  url: string,
  declaredMimeType: string,
  label: string,
  signal: AbortSignal,
  options?: DatasetRequestOptions
): Promise<SpectrumData> {
  // Default: credentials 'omit' + no auth headers (avoids cross-origin CORS
  // friction). A host opts into IIIF Auth — cookie or Bearer token — via
  // configureDatasetRequests / per-call options.
  const { credentials, headers } = await resolveRequestOptions(url, options);
  const response = await fetch(url, {
    method: 'GET',
    signal,
    headers: {
      'Accept': ALLOWED_MIME_TYPES.join(', '),
      ...headers,
    },
    credentials,
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      // The thrown message surfaces in the DatasetBody Alert, so keep it
      // user-facing; the developer hint goes to the console instead.
      console.debug(
        `[XYViewer] ${response.status} fetching dataset ${url}. If it is access-controlled, ` +
          'provide credentials via configureDatasetRequests().'
      );
      throw new DatasetAuthError('Access denied — you may need to sign in to view this dataset.');
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  // Validate Content-Type from server
  const contentType = response.headers.get('Content-Type');
  if (contentType && !validateContentType(contentType, ALLOWED_MIME_TYPES)) {
    throw new Error(`Server returned invalid Content-Type: ${contentType}`);
  }

  // Check Content-Length if available
  const contentLength = response.headers.get('Content-Length');
  if (contentLength && parseInt(contentLength, 10) > MAX_DATASET_SIZE) {
    throw new Error(`Dataset too large: ${contentLength} bytes (max: ${MAX_DATASET_SIZE})`);
  }

  // Read response with size limit
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Unable to read response body');
  }

  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  let done = false;
  while (!done) {
    const result = await reader.read();
    done = result.done;

    if (done || !result.value) break;
    const value = result.value;

    totalSize += value.length;
    if (totalSize > MAX_DATASET_SIZE) {
      reader.cancel();
      throw new Error(`Dataset exceeds maximum size of ${MAX_DATASET_SIZE} bytes`);
    }

    chunks.push(value);
  }

  // Decode to string
  const decoder = new TextDecoder('utf-8');
  const content = chunks.map(chunk => decoder.decode(chunk, { stream: true })).join('')
    + decoder.decode();

  // Determine actual MIME type (prefer server response, fall back to declared)
  const actualMimeType = contentType?.split(';')[0].trim() || declaredMimeType;

  // Parse the dataset
  const data = parseDataset(content, url, label, actualMimeType);

  // Cache the result
  datasetCache.set(url, data);

  return data;
}

/**
 * Prevalidate a dataset URL without fetching
 * Useful for showing validation status in UI
 */
export function validateDatasetUrl(url: string, mimeType: string): { valid: boolean; error?: string } {
  if (!isValidUrl(url)) {
    return { valid: false, error: 'Invalid URL: Only http/https protocols are allowed' };
  }

  if (!isAllowedMimeType(mimeType)) {
    return { valid: false, error: `Unsupported MIME type: ${mimeType}` };
  }

  return { valid: true };
}
