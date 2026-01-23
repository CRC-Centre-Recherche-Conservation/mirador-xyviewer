/**
 * Dataset Fetcher Service
 * Secure async fetching with validation and caching
 */

import type { SpectrumData, DatasetFetchResult } from '../types/dataset';
import { ALLOWED_MIME_TYPES, MAX_DATASET_SIZE, isAllowedMimeType } from '../types/dataset';
import { isValidUrl, validateContentType } from '../utils/security';
import { datasetCache } from './datasetCache';
import { parseDataset } from './datasetParser';

/** Active abort controllers by URL */
const abortControllers = new Map<string, AbortController>();

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
  label: string
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
      };
    }
  }

  // Create new fetch request
  const controller = new AbortController();
  abortControllers.set(url, controller);

  const fetchPromise = performFetch(url, declaredMimeType, label, controller.signal);
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
  signal: AbortSignal
): Promise<SpectrumData> {
  const response = await fetch(url, {
    method: 'GET',
    signal,
    headers: {
      'Accept': ALLOWED_MIME_TYPES.join(', '),
    },
    // Prevent credentials from being sent to avoid CORS issues
    credentials: 'omit',
  });

  if (!response.ok) {
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
