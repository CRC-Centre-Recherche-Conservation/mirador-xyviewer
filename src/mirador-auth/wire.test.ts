import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatasetRequestProvider } from '../types/dataset';

// Stub Mirador's token selector (heavy bundle) + action creator.
vi.mock('mirador', () => ({
  getAccessTokens: (state: { accessTokens?: unknown }) => state?.accessTokens ?? {},
  resolveAccessTokenRequest: (a: string, t: string, json: unknown) => ({ type: 'RECEIVE', a, t, json }),
}));

// Capture the provider + auth handler that wireMiradorDatasetAuth registers.
const { configureDatasetRequests, configureDatasetAuth } = vi.hoisted(() => ({
  configureDatasetRequests: vi.fn(),
  configureDatasetAuth: vi.fn(),
}));
vi.mock('../services', () => ({ configureDatasetRequests, configureDatasetAuth }));

import { wireMiradorDatasetAuth } from './wire';
import type { DatasetAuthHandler } from '../services/datasetAuth';

const storeWith = (entries: Record<string, unknown>) => ({
  getState: () => ({ accessTokens: entries }),
  dispatch: vi.fn(),
});
/** The most recently registered provider / auth handler. */
const provider = (): DatasetRequestProvider => configureDatasetRequests.mock.calls.at(-1)![0];
const authHandler = (): DatasetAuthHandler => configureDatasetAuth.mock.calls.at(-1)![0];

beforeEach(() => {
  configureDatasetRequests.mockClear();
  configureDatasetAuth.mockClear();
});

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

describe('wireMiradorDatasetAuth — login trigger (Phase 2)', () => {
  const SERVICE = {
    '@id': 'https://auth.museum/login',
    profile: 'http://iiif.io/api/auth/1/login',
    service: [{ '@id': 'https://auth.museum/token', profile: 'http://iiif.io/api/auth/1/token' }],
  };

  it('registers a configureDatasetAuth handler', () => {
    wireMiradorDatasetAuth(storeWith({}), { trustedOrigins: ['https://data.lab'] });
    expect(configureDatasetAuth).toHaveBeenCalledTimes(1);
    expect(typeof authHandler()).toBe('function');
  });

  it('drives the login with the discovered service when the body declares one', async () => {
    const driver = vi.fn().mockResolvedValue(undefined);
    const store = storeWith({});
    wireMiradorDatasetAuth(store, {
      trustedOrigins: ['https://data.lab', 'https://auth.museum'],
      loginDriver: driver,
    });
    await authHandler()({ type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv', service: SERVICE });
    expect(driver).toHaveBeenCalledWith(
      expect.objectContaining({
        authServiceId: 'https://auth.museum/login',
        tokenServiceId: 'https://auth.museum/token',
      }),
      store.dispatch,
    );
  });

  it('does not drive a login when the declared service origin is not trusted', async () => {
    const driver = vi.fn();
    // auth.museum (the SERVICE origin) is NOT in trustedOrigins → must not open a popup / store a token.
    wireMiradorDatasetAuth(storeWith({}), { trustedOrigins: ['https://data.lab'], loginDriver: driver });
    await authHandler()({ type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv', service: SERVICE });
    expect(driver).not.toHaveBeenCalled();
  });

  it('does not drive a login over a cleartext http service origin', async () => {
    const driver = vi.fn();
    const httpService = {
      '@id': 'http://auth.lab/login',
      profile: 'http://iiif.io/api/auth/1/login',
      service: [{ '@id': 'http://auth.lab/token', profile: 'http://iiif.io/api/auth/1/token' }],
    };
    wireMiradorDatasetAuth(storeWith({}), {
      trustedOrigins: ['https://data.lab', 'http://auth.lab'],
      loginDriver: driver,
    });
    await authHandler()({ type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv', service: httpService });
    expect(driver).not.toHaveBeenCalled();
  });

  it('no-ops when the body declares no auth service', async () => {
    const driver = vi.fn();
    wireMiradorDatasetAuth(storeWith({}), { trustedOrigins: ['https://data.lab'], loginDriver: driver });
    await authHandler()({ type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv' });
    expect(driver).not.toHaveBeenCalled();
  });

  it('swallows a login-driver error (handler resolves, never rejects)', async () => {
    const driver = vi.fn().mockRejectedValue(new Error('boom'));
    wireMiradorDatasetAuth(storeWith({}), {
      trustedOrigins: ['https://data.lab', 'https://auth.museum'],
      loginDriver: driver,
    });
    await expect(
      authHandler()({ type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv', service: SERVICE }),
    ).resolves.toBeUndefined();
  });

  it('handler resolves on driver success (so DatasetBody auto-retries)', async () => {
    const driver = vi.fn().mockResolvedValue(undefined);
    wireMiradorDatasetAuth(storeWith({}), {
      trustedOrigins: ['https://data.lab', 'https://auth.museum'],
      loginDriver: driver,
    });
    await expect(
      authHandler()({ type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv', service: SERVICE }),
    ).resolves.toBeUndefined();
  });

  it('teardown resets both the provider and the auth handler', () => {
    const teardown = wireMiradorDatasetAuth(storeWith({}), { trustedOrigins: ['https://data.lab'] });
    teardown();
    expect(configureDatasetRequests).toHaveBeenLastCalledWith(undefined);
    expect(configureDatasetAuth).toHaveBeenLastCalledWith(undefined);
  });
});
