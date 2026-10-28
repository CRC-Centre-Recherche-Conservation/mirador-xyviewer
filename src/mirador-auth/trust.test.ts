import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('mirador', () => ({
  getAccessTokens: (s: { accessTokens?: unknown }) => s?.accessTokens ?? {},
}));

import { createTrustGates } from './trust';

const state = { accessTokens: { 'https://iiif.example.org/token': { json: { accessToken: 'T' } } } };
const service = (host: string) => ({
  '@id': `https://${host}/login`,
  profile: 'http://iiif.io/api/auth/1/login',
  service: [{ '@id': `https://${host}/token`, profile: 'http://iiif.io/api/auth/1/token' }],
});

afterEach(() => vi.restoreAllMocks());

describe('createTrustGates', () => {
  it('host-driven (omitted list): same-origin token only', () => {
    const g = createTrustGates({}, 'test');
    expect(g.hostDriven).toBe(true);
    expect(g.tokenFor(state, 'https://iiif.example.org/p.json')).toBe('T');
    expect(g.tokenFor(state, 'https://other.example.org/p.json')).toBeUndefined();
  });

  it('explicit list is a strict gate; [] denies everything', () => {
    expect(createTrustGates({ trustedOrigins: ['https://iiif.example.org/'] }, 't').tokenFor(state, 'https://iiif.example.org/p')).toBe('T');
    const none = createTrustGates({ trustedOrigins: [] }, 't');
    expect(none.tokenFor(state, 'https://iiif.example.org/p')).toBeUndefined();
    expect(none.trustedAndSecure('https://iiif.example.org/p')).toBe(false);
  });

  it('warns on an all-invalid list and on cleartext origins', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    createTrustGates({ trustedOrigins: ['not a url'] }, 'lbl');
    createTrustGates({ trustedOrigins: ['http://insecure.example.org'] }, 'lbl');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toContain('lbl');
  });

  it('blocks internal hosts and honours the allow override', () => {
    expect(createTrustGates({}, 't').isBlocked('https://192.168.1.4/x')).toBe(true);
    expect(createTrustGates({ blocklist: { allow: ['192.168.1.4'] } }, 't').isBlocked('https://192.168.1.4/x')).toBe(false);
  });

  it('discoverTrusted: host-driven requires the resource own origin; allowlist enables cross-origin', () => {
    const own = { id: 'https://iiif.example.org/p.json', service: service('iiif.example.org') };
    const cross = { id: 'https://iiif.example.org/p.json', service: service('auth.example.org') };
    const hostDriven = createTrustGates({}, 't');
    expect(hostDriven.discoverTrusted(own)).toBeDefined();
    expect(hostDriven.discoverTrusted(cross)).toBeUndefined();
    expect(hostDriven.discoverTrusted({ service: service('iiif.example.org') })).toBeUndefined();
    const explicit = createTrustGates({ trustedOrigins: ['https://iiif.example.org', 'https://auth.example.org'] }, 't');
    expect(explicit.discoverTrusted(cross)).toBeDefined();
  });
});
