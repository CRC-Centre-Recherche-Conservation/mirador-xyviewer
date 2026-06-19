/**
 * Branch-focused tests for the dataset fetcher (Pattern A′ — async/streaming).
 *
 * Every error/guard path is exercised: URL/MIME validation, cache hit,
 * pending-request dedup, HTTP errors, server Content-Type mismatch,
 * Content-Length and streamed-size limits, missing body, and abort.
 *
 * datasetParser and datasetCache are mocked so these tests isolate the
 * fetcher's own logic; global.fetch is stubbed per test (setup.ts already
 * assigns global.fetch = vi.fn()).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MAX_DATASET_SIZE } from '../types/dataset';
import type { SpectrumData } from '../types/dataset';

// --- Mocks -----------------------------------------------------------------
// `parsed` and `cache` are created inside vi.hoisted() so the vi.mock factories
// below — which Vitest hoists above normal top-level statements — can close over
// them without hitting a temporal-dead-zone ReferenceError.
const { parsed, cache } = vi.hoisted(() => {
  const parsed: SpectrumData = {
    id: 'http://example.org/d.csv',
    label: 'L',
    xValues: [1],
    xLabel: 'x',
    series: [{ label: 's', yValues: [1] }],
    mimeType: 'text/csv',
    points: [{ x: 1, y: 1 }],
  };
  const cache = {
    get: vi.fn<(url: string) => SpectrumData | null>(() => null),
    set: vi.fn(),
    getPendingRequest: vi.fn<(url: string) => Promise<SpectrumData> | null>(() => null),
    setPendingRequest: vi.fn(),
  };
  return { parsed, cache };
});

vi.mock('./datasetParser', () => ({
  parseDataset: vi.fn(() => parsed),
}));
vi.mock('./datasetCache', () => ({ datasetCache: cache }));

import { fetchDataset, configureDatasetRequests } from './datasetFetcher';

// --- Helpers ---------------------------------------------------------------
/** Build a minimal streamed Response stub for performFetch(). */
function streamResponse(
  body: string,
  { ok = true, status = 200, statusText = 'OK', headers = {} as Record<string, string> } = {},
): Response {
  const bytes = new TextEncoder().encode(body);
  let sent = false;
  return {
    ok,
    status,
    statusText,
    headers: { get: (k: string) => headers[k] ?? null },
    body: {
      getReader: () => ({
        read: async () =>
          sent ? { done: true, value: undefined } : ((sent = true), { done: false, value: bytes }),
        cancel: vi.fn(),
      }),
    },
  } as unknown as Response;
}

const URL_OK = 'https://example.org/d.csv';

beforeEach(() => {
  vi.clearAllMocks();
  cache.get.mockReturnValue(null);
  cache.getPendingRequest.mockReturnValue(null);
});

// --- Tests -----------------------------------------------------------------
describe('fetchDataset — validation guards', () => {
  it('rejects a non-http(s) URL', async () => {
    const res = await fetchDataset('ftp://x/y.csv', 'text/csv', 'L');
    expect(res.status).toBe('error');
    expect(res.error).toMatch(/Invalid URL/);
  });

  it('rejects a disallowed declared MIME type', async () => {
    const res = await fetchDataset(URL_OK, 'application/pdf', 'L');
    expect(res.status).toBe('error');
    expect(res.error).toMatch(/Unsupported MIME type/);
  });
});

describe('fetchDataset — cache and dedup', () => {
  it('returns cached data without fetching', async () => {
    cache.get.mockReturnValue(parsed);
    const res = await fetchDataset(URL_OK, 'text/csv', 'L');
    expect(res).toEqual({ status: 'success', data: parsed });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('awaits a pending request and returns its data', async () => {
    cache.getPendingRequest.mockReturnValue(Promise.resolve(parsed));
    const res = await fetchDataset(URL_OK, 'text/csv', 'L');
    expect(res).toEqual({ status: 'success', data: parsed });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('surfaces an error from a failing pending request', async () => {
    cache.getPendingRequest.mockReturnValue(Promise.reject(new Error('boom')));
    const res = await fetchDataset(URL_OK, 'text/csv', 'L');
    expect(res).toEqual({ status: 'error', error: 'boom' });
  });
});

describe('fetchDataset — network and response guards', () => {
  it('fetches, parses, caches, and returns on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue(streamResponse('x,y\n1,2'));
    const res = await fetchDataset(URL_OK, 'text/csv', 'L');
    expect(res).toEqual({ status: 'success', data: parsed });
    expect(cache.set).toHaveBeenCalledWith(URL_OK, parsed);
  });

  it('errors on a non-ok HTTP status', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      streamResponse('', { ok: false, status: 404, statusText: 'Not Found' }),
    );
    const res = await fetchDataset(URL_OK, 'text/csv', 'L');
    expect(res.status).toBe('error');
    expect(res.error).toMatch(/HTTP 404/);
    expect(res.authRequired).toBeFalsy();
  });

  it('errors when the server Content-Type is not allowed', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      streamResponse('x', { headers: { 'Content-Type': 'application/pdf' } }),
    );
    const res = await fetchDataset(URL_OK, 'text/csv', 'L');
    expect(res.status).toBe('error');
    expect(res.error).toMatch(/invalid Content-Type/);
  });

  it('errors when Content-Length exceeds the max', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      streamResponse('x', { headers: { 'Content-Length': String(MAX_DATASET_SIZE + 1) } }),
    );
    const res = await fetchDataset(URL_OK, 'text/csv', 'L');
    expect(res.status).toBe('error');
    expect(res.error).toMatch(/too large/);
  });

  it('errors when the streamed body exceeds the max', async () => {
    // One chunk larger than the limit triggers the in-stream guard + reader.cancel().
    const big = 'a'.repeat(MAX_DATASET_SIZE + 1);
    vi.mocked(global.fetch).mockResolvedValue(streamResponse(big));
    const res = await fetchDataset(URL_OK, 'text/csv', 'L');
    expect(res.status).toBe('error');
    expect(res.error).toMatch(/exceeds maximum size/);
  });

  it('errors when the response has no readable body', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => null },
      body: null,
    } as unknown as Response);
    const res = await fetchDataset(URL_OK, 'text/csv', 'L');
    expect(res.status).toBe('error');
    expect(res.error).toMatch(/Unable to read response body/);
  });

  it('maps an AbortError to "Request aborted"', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    vi.mocked(global.fetch).mockRejectedValue(abort);
    const res = await fetchDataset(URL_OK, 'text/csv', 'L');
    expect(res).toEqual({ status: 'error', error: 'Request aborted' });
  });
});

describe('fetchDataset — IIIF Auth request options', () => {
  /** RequestInit passed to the most recent global.fetch call. */
  const lastInit = () =>
    (vi.mocked(global.fetch).mock.calls.at(-1)?.[1] ?? {}) as RequestInit & {
      headers: Record<string, string>;
    };

  // Reset the module-level provider so cases don't leak into one another.
  afterEach(() => configureDatasetRequests(undefined));

  it('omits credentials and sends no auth header by default', async () => {
    vi.mocked(global.fetch).mockResolvedValue(streamResponse('x,y\n1,2'));
    await fetchDataset(URL_OK, 'text/csv', 'L');
    const init = lastInit();
    expect(init.credentials).toBe('omit');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('applies credentials and headers from a registered provider', async () => {
    vi.mocked(global.fetch).mockResolvedValue(streamResponse('x,y\n1,2'));
    configureDatasetRequests(() => ({
      credentials: 'include',
      headers: { Authorization: 'Bearer abc' },
    }));
    await fetchDataset(URL_OK, 'text/csv', 'L');
    const init = lastInit();
    expect(init.credentials).toBe('include');
    expect(init.headers.Authorization).toBe('Bearer abc');
    // The Accept header is preserved alongside the injected ones.
    expect(init.headers.Accept).toContain('text/csv');
  });

  it('awaits an async provider', async () => {
    vi.mocked(global.fetch).mockResolvedValue(streamResponse('x,y\n1,2'));
    configureDatasetRequests(async () => ({ headers: { Authorization: 'Bearer async' } }));
    await fetchDataset(URL_OK, 'text/csv', 'L');
    expect(lastInit().headers.Authorization).toBe('Bearer async');
  });

  it('lets per-call options override the provider', async () => {
    vi.mocked(global.fetch).mockResolvedValue(streamResponse('x,y\n1,2'));
    configureDatasetRequests(() => ({
      credentials: 'include',
      headers: { Authorization: 'Bearer provider' },
    }));
    await fetchDataset(URL_OK, 'text/csv', 'L', {
      credentials: 'same-origin',
      headers: { Authorization: 'Bearer percall' },
    });
    const init = lastInit();
    expect(init.credentials).toBe('same-origin');
    expect(init.headers.Authorization).toBe('Bearer percall');
  });

  it('returns a user-facing message and logs a dev hint on 401', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.mocked(global.fetch).mockResolvedValue(
      streamResponse('', { ok: false, status: 401, statusText: 'Unauthorized' }),
    );
    const res = await fetchDataset(URL_OK, 'text/csv', 'L');
    expect(res.status).toBe('error');
    expect(res.authRequired).toBe(true);
    // User sees a friendly message; the dev API hint stays out of the UI.
    expect(res.error).toMatch(/sign in/i);
    expect(res.error).not.toMatch(/configureDatasetRequests/);
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('configureDatasetRequests'));
    debug.mockRestore();
  });
});
