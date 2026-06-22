import { describe, it, expect, vi } from 'vitest';

// `getAccessTokens` is Mirador's public selector over its token store. Stub it at the
// import boundary (Mirador's bundle is heavy and side-effectful) so this unit test
// exercises OUR matching/gating logic, not Mirador's internals. The stub returns the
// `accessTokens` slice — what the real selector does for the default (un-sliced) store.
vi.mock('mirador', () => ({
  getAccessTokens: (state: { accessTokens?: unknown }) => state?.accessTokens ?? {},
}));

import { resolveMiradorToken } from './resolveToken';

/** A fake Mirador state carrying only the token slice this resolver reads. */
const stateWith = (entries: Record<string, unknown>) => ({ accessTokens: entries });

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
});
