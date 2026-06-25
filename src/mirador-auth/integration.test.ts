import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock ONLY Mirador's selector; let services + the real fetcher run end-to-end so this
// verifies the seam the feature exists to drive: wire → configureDatasetRequests →
// fetchDataset → outgoing fetch headers.
vi.mock('mirador', () => ({
  getAccessTokens: (s: { accessTokens?: unknown }) => s?.accessTokens ?? {},
}));

import { wireMiradorDatasetAuth } from './wire';
import { configureDatasetRequests, fetchDataset } from '../services';

/** Minimal streamed CSV Response so performFetch() can read a body. */
const csvResponse = (): Response => {
  const bytes = new TextEncoder().encode('x,y\n1,2');
  let sent = false;
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => null },
    body: {
      getReader: () => ({
        read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: bytes })),
        cancel: vi.fn(),
      }),
    },
  } as unknown as Response;
};

const lastInit = () =>
  (vi.mocked(global.fetch).mock.calls.at(-1)?.[1] ?? {}) as RequestInit & { headers: Record<string, string> };

const storeWith = (entries: Record<string, unknown>) => ({
  getState: () => ({ accessTokens: entries }),
  dispatch: vi.fn(),
});

// Reset the module-level provider so tests don't leak the wiring into each other.
afterEach(() => configureDatasetRequests(undefined));

describe('mirador-auth ⇄ dataset fetcher (real seam)', () => {
  it('attaches Authorization: Bearer on the outgoing fetch for a trusted, matching origin', async () => {
    vi.mocked(global.fetch).mockResolvedValue(csvResponse());
    const store = storeWith({ 'https://data.lab/auth/token': { json: { accessToken: 'TKN' } } });
    wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab'] });

    await fetchDataset('https://data.lab/d.csv', 'text/csv', 'L'); // distinct URLs avoid cache hits
    expect(lastInit().headers.Authorization).toBe('Bearer TKN');
  });

  it('attaches no Authorization header for an untrusted origin (secure default preserved)', async () => {
    vi.mocked(global.fetch).mockResolvedValue(csvResponse());
    const store = storeWith({ 'https://data.lab/auth/token': { json: { accessToken: 'TKN' } } });
    wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab'] });

    await fetchDataset('https://evil.example/d.csv', 'text/csv', 'L');
    expect(lastInit().headers.Authorization).toBeUndefined();
    expect(lastInit().credentials).toBe('omit');
  });

  it('stops injecting after teardown', async () => {
    vi.mocked(global.fetch).mockResolvedValue(csvResponse());
    const store = storeWith({ 'https://data.lab/auth/token': { json: { accessToken: 'TKN' } } });
    const teardown = wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab'] });
    teardown();

    await fetchDataset('https://data.lab/after-teardown.csv', 'text/csv', 'L');
    expect(lastInit().headers.Authorization).toBeUndefined();
  });

  it('attaches a declared cross-origin token via the request service context (Phase 1b)', async () => {
    vi.mocked(global.fetch).mockResolvedValue(csvResponse());
    const store = storeWith({ 'https://auth.museum/token': { json: { accessToken: 'X-TKN' } } });
    wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab', 'https://auth.museum'] });

    await fetchDataset('https://data.lab/declared.csv', 'text/csv', 'L', undefined, {
      service: {
        '@id': 'https://auth.museum/login',
        profile: 'http://iiif.io/api/auth/1/login',
        service: [{ '@id': 'https://auth.museum/token', profile: 'http://iiif.io/api/auth/1/token' }],
      },
    });
    expect(lastInit().headers.Authorization).toBe('Bearer X-TKN');
  });
});
