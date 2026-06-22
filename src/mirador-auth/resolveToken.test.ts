import { describe, it, expect, vi } from 'vitest';

// `getAccessTokens` is Mirador's public selector over its token store. Stub it at the
// import boundary (Mirador's bundle is heavy and side-effectful) so this unit test
// exercises OUR matching/gating logic, not Mirador's internals. The stub returns the
// `accessTokens` slice — what the real selector does for the default (un-sliced) store.
vi.mock('mirador', () => ({
  getAccessTokens: (state: { accessTokens?: unknown }) => state?.accessTokens ?? {},
}));

import {
  discoverAuthService,
  originOf,
  resolveMiradorToken,
  tokenServiceIdFromDeclared,
} from './resolveToken';

/** A fake Mirador state carrying only the token slice this resolver reads. */
const stateWith = (entries: Record<string, unknown>) => ({ accessTokens: entries });

/** A IIIF Auth 1.0 access service (v2 wire) declaring a nested token service. */
const v2AuthService = {
  '@id': 'https://auth.museum/login',
  '@context': 'http://iiif.io/api/auth/1/context.json',
  profile: 'http://iiif.io/api/auth/1/login',
  service: [{ '@id': 'https://auth.museum/token', profile: 'http://iiif.io/api/auth/1/token' }],
};

describe('resolveMiradorToken', () => {
  it('returns the bearer token when a token-service origin matches a trusted content origin', () => {
    const state = stateWith({
      'https://data.lab/iiif/auth/token': { json: { accessToken: 'TKN-123' } },
    });
    expect(
      resolveMiradorToken(state, {
        url: 'https://data.lab/spectra/d.csv',
        trustedOrigins: ['https://data.lab'],
      }),
    ).toBe('TKN-123');
  });

  it('returns undefined when the content origin is NOT in trustedOrigins (security gate)', () => {
    const state = stateWith({
      'https://data.lab/iiif/auth/token': { json: { accessToken: 'TKN-123' } },
    });
    expect(
      resolveMiradorToken(state, {
        url: 'https://data.lab/spectra/d.csv',
        trustedOrigins: ['https://other.org'],
      }),
    ).toBeUndefined();
  });

  it('returns undefined when no token-service origin matches the content origin', () => {
    const state = stateWith({
      'https://images.museum/iiif/auth/token': { json: { accessToken: 'TKN-123' } },
    });
    expect(
      resolveMiradorToken(state, {
        url: 'https://data.lab/spectra/d.csv',
        trustedOrigins: ['https://data.lab'],
      }),
    ).toBeUndefined();
  });

  it('returns undefined when the matching token entry has no resolved accessToken yet', () => {
    const state = stateWith({
      'https://data.lab/iiif/auth/token': { isFetching: true, json: undefined },
    });
    expect(
      resolveMiradorToken(state, {
        url: 'https://data.lab/spectra/d.csv',
        trustedOrigins: ['https://data.lab'],
      }),
    ).toBeUndefined();
  });

  it('returns undefined for a malformed content URL', () => {
    const state = stateWith({ 'https://data.lab/t': { json: { accessToken: 'X' } } });
    expect(
      resolveMiradorToken(state, { url: 'not a url', trustedOrigins: ['https://data.lab'] }),
    ).toBeUndefined();
  });

  it('ignores a token whose entry is malformed (no json)', () => {
    const state = stateWith({ 'https://data.lab/t': { error: 'boom' } });
    expect(
      resolveMiradorToken(state, { url: 'https://data.lab/d.csv', trustedOrigins: ['https://data.lab'] }),
    ).toBeUndefined();
  });

  // — transport & origin canonicalization (review hardening) —

  it('does not return a token over plaintext http:// (non-loopback), even for a trusted origin', () => {
    const state = stateWith({ 'http://data.lab/t': { json: { accessToken: 'TKN' } } });
    expect(
      resolveMiradorToken(state, { url: 'http://data.lab/d.csv', trustedOrigins: ['http://data.lab'] }),
    ).toBeUndefined();
  });

  it('allows a token over http://localhost for local development', () => {
    const state = stateWith({ 'http://localhost:3000/t': { json: { accessToken: 'TKN' } } });
    expect(
      resolveMiradorToken(state, {
        url: 'http://localhost:3000/d.csv',
        trustedOrigins: ['http://localhost:3000'],
      }),
    ).toBe('TKN');
  });

  it('canonicalizes trusted origins (trailing slash / uppercase host) before matching', () => {
    const state = stateWith({ 'https://data.lab/t': { json: { accessToken: 'TKN' } } });
    expect(
      resolveMiradorToken(state, { url: 'https://data.lab/d.csv', trustedOrigins: ['https://DATA.LAB/'] }),
    ).toBe('TKN');
  });

  it('treats a trailing-dot FQDN as the bare host (no asymmetry vs the allowlist)', () => {
    const state = stateWith({ 'https://data.lab/t': { json: { accessToken: 'TKN' } } });
    expect(
      resolveMiradorToken(state, { url: 'https://data.lab./d.csv', trustedOrigins: ['https://data.lab'] }),
    ).toBe('TKN');
  });

  it('selects the matching token service among several', () => {
    const state = stateWith({
      'https://images.museum/t': { json: { accessToken: 'IMG' } },
      'https://data.lab/t': { json: { accessToken: 'DATA' } },
    });
    expect(
      resolveMiradorToken(state, { url: 'https://data.lab/d.csv', trustedOrigins: ['https://data.lab'] }),
    ).toBe('DATA');
  });

  // — Phase 1b: declared-service matching (spec-correct, cross-origin) —

  it('resolves a token via the declared auth service when content+auth origins are both trusted', () => {
    const state = stateWith({ 'https://auth.museum/token': { json: { accessToken: 'AUTH-TKN' } } });
    expect(
      resolveMiradorToken(state, {
        url: 'https://data.lab/d.csv',
        trustedOrigins: ['https://data.lab', 'https://auth.museum'],
        service: v2AuthService,
      }),
    ).toBe('AUTH-TKN');
  });

  it('does NOT use a declared token service whose origin is untrusted (anti-exfiltration)', () => {
    // A malicious resource declares a token service for a sensitive token we hold;
    // its origin is not trusted, so we must not forward that token to data.lab.
    const state = stateWith({ 'https://images.museum/token': { json: { accessToken: 'SENSITIVE' } } });
    expect(
      resolveMiradorToken(state, {
        url: 'https://data.lab/d.csv',
        trustedOrigins: ['https://data.lab'], // images.museum NOT trusted
        service: {
          '@id': 'https://images.museum/login',
          profile: 'http://iiif.io/api/auth/1/login',
          service: [{ '@id': 'https://images.museum/token', profile: 'http://iiif.io/api/auth/1/token' }],
        },
      }),
    ).toBeUndefined();
  });

  it('does NOT leak an untrusted declared token even when a trusted same-origin token exists', () => {
    // Mutation-killer for the `trusted.has(declaredOrigin)` gate: with a same-origin
    // HOST token also present, dropping the gate would wrongly return SENSITIVE.
    const state = stateWith({
      'https://images.museum/token': { json: { accessToken: 'SENSITIVE' } }, // untrusted origin
      'https://data.lab/token': { json: { accessToken: 'HOST' } }, // trusted, same-origin
    });
    const token = resolveMiradorToken(state, {
      url: 'https://data.lab/d.csv',
      trustedOrigins: ['https://data.lab'], // images.museum NOT trusted
      service: {
        '@id': 'https://images.museum/login',
        profile: 'http://iiif.io/api/auth/1/login',
        service: [{ '@id': 'https://images.museum/token', profile: 'http://iiif.io/api/auth/1/token' }],
      },
    });
    expect(token).not.toBe('SENSITIVE');
    expect(token).toBe('HOST');
  });

  it('prefers the declared service over host-inheritance', () => {
    const state = stateWith({
      'https://data.lab/token': { json: { accessToken: 'HOST' } },
      'https://auth.museum/token': { json: { accessToken: 'DECLARED' } },
    });
    expect(
      resolveMiradorToken(state, {
        url: 'https://data.lab/d.csv',
        trustedOrigins: ['https://data.lab', 'https://auth.museum'],
        service: v2AuthService,
      }),
    ).toBe('DECLARED');
  });

  it('falls back to host-inheritance when the declared service has no stored token', () => {
    const state = stateWith({ 'https://data.lab/token': { json: { accessToken: 'HOST' } } });
    expect(
      resolveMiradorToken(state, {
        url: 'https://data.lab/d.csv',
        trustedOrigins: ['https://data.lab', 'https://auth.museum'],
        service: v2AuthService, // declared auth.museum/token has no stored token
      }),
    ).toBe('HOST');
  });
});

describe('tokenServiceIdFromDeclared', () => {
  it('extracts the nested token-service id from a v2 access service', () => {
    expect(tokenServiceIdFromDeclared(v2AuthService)).toBe('https://auth.museum/token');
  });

  it('extracts it from a v3 access service (id/type) and an array of services', () => {
    const v3 = {
      id: 'https://auth.museum/login',
      type: 'AuthAccessService1',
      profile: 'http://iiif.io/api/auth/1/login',
      service: [
        { id: 'https://auth.museum/token', type: 'AuthAccessTokenService1', profile: 'http://iiif.io/api/auth/1/token' },
      ],
    };
    expect(tokenServiceIdFromDeclared([v3])).toBe('https://auth.museum/token');
  });

  it('recognizes the auth/0/token profile', () => {
    const svc = {
      '@id': 'https://auth.museum/login',
      service: [{ '@id': 'https://auth.museum/token0', profile: 'http://iiif.io/api/auth/0/token' }],
    };
    expect(tokenServiceIdFromDeclared(svc)).toBe('https://auth.museum/token0');
  });

  it('returns undefined when no token service is declared', () => {
    expect(tokenServiceIdFromDeclared({ '@id': 'https://x/login', profile: '…/login' })).toBeUndefined();
  });

  it('returns undefined for undefined / malformed input', () => {
    expect(tokenServiceIdFromDeclared(undefined)).toBeUndefined();
    expect(tokenServiceIdFromDeclared(42)).toBeUndefined();
  });

  it('extracts a token service asserted directly on the access object', () => {
    expect(
      tokenServiceIdFromDeclared({ '@id': 'https://auth.museum/token', profile: 'http://iiif.io/api/auth/1/token' }),
    ).toBe('https://auth.museum/token');
  });

  it('recognizes a token profile given as an array', () => {
    expect(
      tokenServiceIdFromDeclared({
        '@id': 'https://auth.museum/login',
        service: [{ '@id': 'https://auth.museum/token', profile: ['http://iiif.io/api/auth/1/token', 'other'] }],
      }),
    ).toBe('https://auth.museum/token');
  });

  it('finds the token service on a later access service in the array', () => {
    expect(tokenServiceIdFromDeclared([{ '@id': 'https://a/login', service: [] }, v2AuthService])).toBe(
      'https://auth.museum/token',
    );
  });

  it('ignores a non-string token-service id', () => {
    expect(
      tokenServiceIdFromDeclared({
        '@id': 'https://auth.museum/login',
        service: [{ '@id': 42, profile: 'http://iiif.io/api/auth/1/token' }],
      }),
    ).toBeUndefined();
  });
});

describe('originOf', () => {
  it('canonicalizes a normal https URL to its origin', () => {
    expect(originOf('https://data.lab/path?q=1')).toBe('https://data.lab');
  });

  it('rejects a URL carrying userinfo (an origin never has credentials)', () => {
    // Guards a misconfigured trustedOrigins entry like 'https://data.lab@auth.museum'
    // from silently trusting the wrong host.
    expect(originOf('https://user:pass@data.lab/x')).toBeUndefined();
    expect(originOf('https://data.lab@auth.museum/x')).toBeUndefined();
  });
});

describe('discoverAuthService', () => {
  it('returns the access service id, profile, and nested token service id (v2 login)', () => {
    expect(discoverAuthService(v2AuthService)).toEqual({
      authServiceId: 'https://auth.museum/login',
      profile: 'http://iiif.io/api/auth/1/login',
      tokenServiceId: 'https://auth.museum/token',
    });
  });

  it('recognizes clickthrough / kiosk / external / 0.x access profiles', () => {
    for (const p of [
      'http://iiif.io/api/auth/1/clickthrough',
      'http://iiif.io/api/auth/1/kiosk',
      'http://iiif.io/api/auth/1/external',
      'http://iiif.io/api/auth/0/login',
    ]) {
      const svc = {
        '@id': 'https://auth.museum/x',
        profile: p,
        service: [{ '@id': 'https://auth.museum/token', profile: 'http://iiif.io/api/auth/1/token' }],
      };
      expect(discoverAuthService(svc)?.profile).toBe(p);
    }
  });

  it('returns undefined when the declared service is not an access service', () => {
    expect(
      discoverAuthService({ '@id': 'https://x/token', profile: 'http://iiif.io/api/auth/1/token' }),
    ).toBeUndefined();
    expect(
      discoverAuthService({ '@id': 'https://x/img', profile: 'http://iiif.io/api/image/2/level2.json' }),
    ).toBeUndefined();
  });

  it('returns undefined when the access service declares no token service', () => {
    expect(
      discoverAuthService({ '@id': 'https://auth.museum/login', profile: 'http://iiif.io/api/auth/1/login' }),
    ).toBeUndefined();
  });

  it('picks the access service from an array', () => {
    expect(discoverAuthService(['nonsense', v2AuthService])?.authServiceId).toBe('https://auth.museum/login');
  });

  it('returns undefined for malformed input', () => {
    expect(discoverAuthService(undefined)).toBeUndefined();
    expect(discoverAuthService(42)).toBeUndefined();
  });
});
