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

  it('does NOT warn for omitted (host-driven) or explicit-empty (deny-all) trustedOrigins', () => {
    wireMiradorDatasetAuth(storeWith({}), {});
    wireMiradorDatasetAuth(storeWith({}), { trustedOrigins: [] });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('warns when trustedOrigins were provided but every entry is invalid (footgun)', () => {
    wireMiradorDatasetAuth(storeWith({}), { trustedOrigins: ['not-a-url', 'data.lab'] });
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

  it('still drives the login when a (now-stale) service token is in the store', async () => {
    const driver = vi.fn().mockResolvedValue(undefined);
    // A token is present, but the handler is only ever invoked AFTER the server rejected a
    // request that carried it — so a stored token must not be trusted as a valid session.
    const store = storeWith({ 'https://auth.museum/token': { json: { accessToken: 'STALE' } } });
    wireMiradorDatasetAuth(store, {
      trustedOrigins: ['https://data.lab', 'https://auth.museum'],
      loginDriver: driver,
    });
    await authHandler()({ type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv', service: SERVICE });
    expect(driver).toHaveBeenCalled();
  });

  it('still re-acquires silently on 401 even when a stale token is stored', async () => {
    const sessionAcquirer = vi.fn().mockResolvedValue(true);
    const store = storeWith({ 'https://auth.museum/token': { json: { accessToken: 'STALE' } } });
    wireMiradorDatasetAuth(store, {
      trustedOrigins: ['https://data.lab', 'https://auth.museum'],
      sessionAcquirer,
    });
    await authHandler()(
      { type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv', service: SERVICE },
      { interactive: false },
    );
    expect(sessionAcquirer).toHaveBeenCalled();
  });

  it('reuses the session silently (no window) when called with interactive:false', async () => {
    const driver = vi.fn();
    const sessionAcquirer = vi.fn().mockResolvedValue(true);
    wireMiradorDatasetAuth(storeWith({}), {
      trustedOrigins: ['https://data.lab', 'https://auth.museum'],
      loginDriver: driver,
      sessionAcquirer,
    });
    await authHandler()(
      { type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv', service: SERVICE },
      { interactive: false },
    );
    expect(sessionAcquirer).toHaveBeenCalled();
    expect(driver).not.toHaveBeenCalled(); // never opens a window in silent mode
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

  it('registers a canStartLogin predicate reflecting trusted discoverability', () => {
    wireMiradorDatasetAuth(storeWith({}), { trustedOrigins: ['https://data.lab', 'https://auth.museum'] });
    const opts = configureDatasetAuth.mock.calls.at(-1)![1] as { canStartLogin: (b: unknown) => boolean };
    expect(
      opts.canStartLogin({ type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv', service: SERVICE }),
    ).toBe(true);
    // no declared service → cannot start a login
    expect(opts.canStartLogin({ type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv' })).toBe(false);
  });

  it('canStartLogin is false when the declared service origin is not trusted', () => {
    wireMiradorDatasetAuth(storeWith({}), { trustedOrigins: ['https://data.lab'] }); // auth.museum NOT trusted
    const opts = configureDatasetAuth.mock.calls.at(-1)![1] as { canStartLogin: (b: unknown) => boolean };
    expect(
      opts.canStartLogin({ type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv', service: SERVICE }),
    ).toBe(false);
  });

  it('canStartLogin is false for a cleartext http service origin', () => {
    const httpService = {
      '@id': 'http://auth.lab/login',
      profile: 'http://iiif.io/api/auth/1/login',
      service: [{ '@id': 'http://auth.lab/token', profile: 'http://iiif.io/api/auth/1/token' }],
    };
    wireMiradorDatasetAuth(storeWith({}), { trustedOrigins: ['https://data.lab', 'http://auth.lab'] });
    const opts = configureDatasetAuth.mock.calls.at(-1)![1] as { canStartLogin: (b: unknown) => boolean };
    expect(
      opts.canStartLogin({ type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv', service: httpService }),
    ).toBe(false);
  });

  it('teardown resets both the provider and the auth handler', () => {
    const teardown = wireMiradorDatasetAuth(storeWith({}), { trustedOrigins: ['https://data.lab'] });
    teardown();
    expect(configureDatasetRequests).toHaveBeenLastCalledWith(undefined);
    expect(configureDatasetAuth).toHaveBeenLastCalledWith(undefined);
  });
});

describe('wireMiradorDatasetAuth — host-driven default & SSRF blocklist', () => {
  const publicService = {
    '@id': 'https://auth.museum/login',
    profile: 'http://iiif.io/api/auth/1/login',
    service: [{ '@id': 'https://auth.museum/token', profile: 'http://iiif.io/api/auth/1/token' }],
  };
  const internalService = {
    '@id': 'https://10.0.0.5/login',
    profile: 'http://iiif.io/api/auth/1/login',
    service: [{ '@id': 'https://10.0.0.5/token', profile: 'http://iiif.io/api/auth/1/token' }],
  };
  const sameOriginService = {
    '@id': 'https://data.lab/login',
    profile: 'http://iiif.io/api/auth/1/login',
    service: [{ '@id': 'https://data.lab/token', profile: 'http://iiif.io/api/auth/1/token' }],
  };

  it('host-driven (no trustedOrigins): injects a token for its own issuing origin', () => {
    const store = storeWith({ 'https://data.lab/token': { json: { accessToken: 'TKN' } } });
    wireMiradorDatasetAuth(store, {});
    expect(provider()('https://data.lab/d.csv')).toEqual({ headers: { Authorization: 'Bearer TKN' } });
  });

  it('host-driven: the cookie fallback stays off without an explicit allowlist', () => {
    wireMiradorDatasetAuth(storeWith({}), { cookie: true });
    expect(provider()('https://data.lab/d.csv')).toBeUndefined();
  });

  it('an explicit empty trustedOrigins is a deny-all kill-switch (no token, even same-origin)', () => {
    const store = storeWith({ 'https://data.lab/token': { json: { accessToken: 'TKN' } } });
    wireMiradorDatasetAuth(store, { trustedOrigins: [] });
    expect(provider()('https://data.lab/d.csv')).toBeUndefined();
  });

  it('does not inject a token for a private-network content host (SSRF guard)', () => {
    const store = storeWith({ 'https://10.0.0.5/token': { json: { accessToken: 'TKN' } } });
    wireMiradorDatasetAuth(store, { trustedOrigins: ['https://10.0.0.5'] });
    expect(provider()('https://10.0.0.5/d.csv')).toBeUndefined();
  });

  it('does not inject a token for a special-use internal content host', () => {
    const store = storeWith({ 'https://db.internal/token': { json: { accessToken: 'TKN' } } });
    wireMiradorDatasetAuth(store, { trustedOrigins: ['https://db.internal'] });
    expect(provider()('https://db.internal/d.csv')).toBeUndefined();
  });

  it('honors blocklist.allow so a loopback dev host can receive its token (the demo opt-in)', () => {
    const store = storeWith({ 'http://localhost:5173/token': { json: { accessToken: 'TKN' } } });
    wireMiradorDatasetAuth(store, {
      trustedOrigins: ['http://localhost:5173'],
      blocklist: { allow: ['localhost'] },
    });
    expect(provider()('http://localhost:5173/d.csv')).toEqual({ headers: { Authorization: 'Bearer TKN' } });
  });

  it("host-driven: drives a login for the resource's OWN-origin declared service", async () => {
    const driver = vi.fn().mockResolvedValue(undefined);
    wireMiradorDatasetAuth(storeWith({}), { loginDriver: driver });
    await authHandler()({ type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv', service: sameOriginService });
    expect(driver).toHaveBeenCalled();
  });

  it('host-driven: does NOT drive a login for a cross-origin declared service (needs an allowlist)', async () => {
    const driver = vi.fn();
    // body on data.lab, auth declared on auth.museum: never pop a login to a manifest-named
    // origin the operator never trusted — mirrors the same-origin token-reuse rule.
    wireMiradorDatasetAuth(storeWith({}), { loginDriver: driver });
    await authHandler()({ type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv', service: publicService });
    expect(driver).not.toHaveBeenCalled();
  });

  it('host-driven: does not drive a login for an internal declared service host (SSRF guard)', async () => {
    const driver = vi.fn();
    // same-origin as the (internal) body, so only the SSRF blocklist stops it.
    wireMiradorDatasetAuth(storeWith({}), { loginDriver: driver });
    await authHandler()({ type: 'Dataset', id: 'https://10.0.0.5/d.csv', format: 'text/csv', service: internalService });
    expect(driver).not.toHaveBeenCalled();
  });

  it('host-driven: canStartLogin is true for own-origin but false for a cross-origin declared service', () => {
    wireMiradorDatasetAuth(storeWith({}), {});
    const opts = configureDatasetAuth.mock.calls.at(-1)![1] as { canStartLogin: (b: unknown) => boolean };
    expect(
      opts.canStartLogin({ type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv', service: sameOriginService }),
    ).toBe(true);
    expect(
      opts.canStartLogin({ type: 'Dataset', id: 'https://data.lab/d.csv', format: 'text/csv', service: publicService }),
    ).toBe(false);
  });
});
