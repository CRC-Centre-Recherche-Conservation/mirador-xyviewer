import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatasetRequestProvider } from '../types/dataset';

// Stub Mirador's token selector (heavy bundle) — returns the `accessTokens` slice.
vi.mock('mirador', () => ({
  getAccessTokens: (state: { accessTokens?: unknown }) => state?.accessTokens ?? {},
}));

// Capture the provider that wireMiradorDatasetAuth registers with the fetcher.
const { configureDatasetRequests } = vi.hoisted(() => ({ configureDatasetRequests: vi.fn() }));
vi.mock('../services', () => ({ configureDatasetRequests }));

import { wireMiradorDatasetAuth } from './wire';

const storeWith = (entries: Record<string, unknown>) => ({ getState: () => ({ accessTokens: entries }) });
/** The most recently registered provider. */
const provider = (): DatasetRequestProvider => configureDatasetRequests.mock.calls.at(-1)![0];

beforeEach(() => configureDatasetRequests.mockClear());

describe('wireMiradorDatasetAuth', () => {
  it('registers a provider that injects Authorization: Bearer for a trusted, matching origin', () => {
    const store = storeWith({ 'https://data.lab/auth/token': { json: { accessToken: 'TKN' } } });
    wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab'] });
    expect(provider()('https://data.lab/d.csv')).toEqual({ headers: { Authorization: 'Bearer TKN' } });
  });

  it('does not inject anything for an untrusted origin', () => {
    const store = storeWith({ 'https://data.lab/auth/token': { json: { accessToken: 'TKN' } } });
    wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab'] });
    expect(provider()('https://evil.example/d.csv')).toBeUndefined();
  });

  it('falls back to credentialed cookies for a trusted origin when cookie:true and no token', () => {
    const store = storeWith({});
    wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab'], cookie: true });
    expect(provider()('https://data.lab/d.csv')).toEqual({ credentials: 'include' });
  });

  it('does not send cookies to an untrusted origin even with cookie:true', () => {
    const store = storeWith({});
    wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab'], cookie: true });
    expect(provider()('https://evil.example/d.csv')).toBeUndefined();
  });

  it('does not send cookies when cookie is not enabled', () => {
    const store = storeWith({});
    wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab'] });
    expect(provider()('https://data.lab/d.csv')).toBeUndefined();
  });

  it('prefers the token over the cookie fallback', () => {
    const store = storeWith({ 'https://data.lab/auth/token': { json: { accessToken: 'TKN' } } });
    wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab'], cookie: true });
    expect(provider()('https://data.lab/d.csv')).toEqual({ headers: { Authorization: 'Bearer TKN' } });
  });

  it('returns a teardown that resets the provider', () => {
    const store = storeWith({});
    const teardown = wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab'] });
    teardown();
    expect(configureDatasetRequests).toHaveBeenLastCalledWith(undefined);
  });

  it('does not send cookies over plaintext http:// (non-loopback) even when trusted', () => {
    const store = storeWith({});
    wireMiradorDatasetAuth(store, { trustedOrigins: ['http://data.lab'], cookie: true });
    expect(provider()('http://data.lab/d.csv')).toBeUndefined();
  });

  it('matches a trusted origin written with a trailing slash', () => {
    const store = storeWith({ 'https://data.lab/auth/token': { json: { accessToken: 'TKN' } } });
    wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab/'] });
    expect(provider()('https://data.lab/d.csv')).toEqual({ headers: { Authorization: 'Bearer TKN' } });
  });

  it('warns when no valid trusted origins are provided (silent-no-op footgun)', () => {
    const store = storeWith({});
    wireMiradorDatasetAuth(store, { trustedOrigins: [] });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('trustedOrigins'));
  });

  it('forwards the declared service from the request context to the resolver', () => {
    const store = storeWith({ 'https://auth.museum/token': { json: { accessToken: 'DECLARED' } } });
    wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab', 'https://auth.museum'] });
    const context = {
      service: {
        '@id': 'https://auth.museum/login',
        profile: 'http://iiif.io/api/auth/1/login',
        service: [{ '@id': 'https://auth.museum/token', profile: 'http://iiif.io/api/auth/1/token' }],
      },
    };
    // data.lab has no same-origin token; only the declared cross-origin service resolves it.
    expect(provider()('https://data.lab/d.csv', context)).toEqual({
      headers: { Authorization: 'Bearer DECLARED' },
    });
  });
});
