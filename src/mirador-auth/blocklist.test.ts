import { describe, it, expect } from 'vitest';

import { isBlockedHost } from './blocklist';

// SSRF defense-in-depth: refuse credentials to internal / non-public targets. The host is
// taken from `new URL(url).hostname` (which canonicalizes alternate IPv4 encodings) and
// classified with ipaddr.js — only public unicast is allowed through by default.
describe('isBlockedHost — default classification', () => {
  it('blocks a loopback IPv4 literal', () => {
    expect(isBlockedHost('http://127.0.0.1/d.csv')).toBe(true);
  });

  it('blocks the RFC1918 private ranges', () => {
    expect(isBlockedHost('https://10.0.0.1/d.csv')).toBe(true);
    expect(isBlockedHost('https://192.168.1.10/d.csv')).toBe(true);
    expect(isBlockedHost('https://172.16.0.1/d.csv')).toBe(true);
  });

  it('blocks the link-local range, incl. the cloud metadata address', () => {
    expect(isBlockedHost('http://169.254.169.254/latest/meta-data/')).toBe(true);
  });

  it('allows a public unicast IPv4', () => {
    expect(isBlockedHost('https://8.8.8.8/d.csv')).toBe(false);
  });

  it('allows an ordinary public hostname', () => {
    expect(isBlockedHost('https://data.lab.example/spectra/d.csv')).toBe(false);
  });

  it('blocks the IPv6 loopback', () => {
    expect(isBlockedHost('https://[::1]/d.csv')).toBe(true);
  });

  it('blocks IPv6 unique-local (fc00::/7)', () => {
    expect(isBlockedHost('https://[fc00::1]/d.csv')).toBe(true);
    expect(isBlockedHost('https://[fd12:3456::1]/d.csv')).toBe(true);
  });

  it('blocks an IPv4-mapped IPv6 pointing at a private address (bypass guard)', () => {
    expect(isBlockedHost('https://[::ffff:10.0.0.1]/d.csv')).toBe(true);
  });

  it('allows an IPv4-mapped IPv6 pointing at a PUBLIC address (unwrap is load-bearing)', () => {
    // Dies if the IPv4-mapped unwrap is removed: a mapped public addr is range "ipv4Mapped"
    // (≠ unicast) and would be wrongly blocked without the unwrap.
    expect(isBlockedHost('https://[::ffff:8.8.8.8]/d.csv')).toBe(false);
  });

  it('matches an IPv4 CIDR allow against an IPv4-mapped host (only via the unwrap)', () => {
    expect(isBlockedHost('https://[::ffff:127.0.0.1]/d.csv', { allow: ['127.0.0.0/8'] })).toBe(false);
  });

  it('blocks IPv4-COMPATIBLE IPv6 (::a.b.c.d) pointing at internal addresses', () => {
    expect(isBlockedHost('http://[::169.254.169.254]/latest/meta-data/')).toBe(true); // cloud metadata
    expect(isBlockedHost('http://[::127.0.0.1]/x')).toBe(true); // loopback
    expect(isBlockedHost('https://[::10.0.0.1]/x')).toBe(true); // RFC1918
  });

  it('blocks alternate IPv4 encodings (hex / decimal / octal) after URL canonicalization', () => {
    expect(isBlockedHost('http://0x7f000001/d.csv')).toBe(true); // hex 127.0.0.1
    expect(isBlockedHost('http://2130706433/d.csv')).toBe(true); // decimal 127.0.0.1
    expect(isBlockedHost('http://0177.0.0.1/d.csv')).toBe(true); // octal 127.0.0.1
  });

  it('blocks an unparseable URL (fail-closed)', () => {
    expect(isBlockedHost('not a url')).toBe(true);
  });
});

describe('isBlockedHost — host-extensible deny / allow', () => {
  it('deny blocks an otherwise-public hostname', () => {
    expect(isBlockedHost('https://intranet.corp/x', { deny: ['intranet.corp'] })).toBe(true);
  });

  it('deny blocks a public IP via a CIDR range', () => {
    // 8.8.8.8 is public unicast (allowed by default); the deny CIDR blocks it.
    expect(isBlockedHost('https://8.8.8.8/x', { deny: ['8.8.8.0/24'] })).toBe(true);
  });

  it('allow exempts loopback by range name (local dev)', () => {
    expect(isBlockedHost('http://127.0.0.1/x', { allow: ['loopback'] })).toBe(false);
    expect(isBlockedHost('http://[::1]/x', { allow: ['loopback'] })).toBe(false);
  });

  it('allow exempts a private range by CIDR', () => {
    expect(isBlockedHost('https://10.1.2.3/x', { allow: ['10.0.0.0/8'] })).toBe(false);
  });

  it('allow wins over deny and over the defaults (precedence)', () => {
    expect(isBlockedHost('https://8.8.8.8/x', { deny: ['8.8.8.0/24'], allow: ['8.8.8.8'] })).toBe(false);
  });

  it('a CIDR of the wrong IP family never matches (no throw)', () => {
    // An IPv6 host against an IPv4 deny CIDR must simply not match, not throw.
    expect(isBlockedHost('https://[2001:4860:4860::8888]/x', { deny: ['10.0.0.0/8'] })).toBe(false);
  });

  it('deny of an exact name still matches the trailing-dot FQDN form', () => {
    // new URL().hostname keeps the trailing dot for names; a deny must not be bypassed by it.
    expect(isBlockedHost('https://intranet.corp/x', { deny: ['intranet.corp'] })).toBe(true);
    expect(isBlockedHost('https://intranet.corp./x', { deny: ['intranet.corp'] })).toBe(true);
    expect(isBlockedHost('https://intranet.corp../x', { deny: ['intranet.corp'] })).toBe(true); // double dot
  });

  it('matches an exact-IP deny/allow entry against the IPv6 form that unwraps to it', () => {
    // deny '8.8.8.8' must catch the IPv4-mapped form; allow '10.0.0.1' must exempt the mapped form.
    expect(isBlockedHost('https://[::ffff:8.8.8.8]/x', { deny: ['8.8.8.8'] })).toBe(true);
    expect(isBlockedHost('https://[::ffff:10.0.0.1]/x', { allow: ['10.0.0.1'] })).toBe(false);
  });
});

describe('isBlockedHost — special-use internal names', () => {
  it('blocks the bare localhost name', () => {
    expect(isBlockedHost('http://localhost:5173/x')).toBe(true);
  });

  it('blocks a *.localhost subdomain (RFC 6761)', () => {
    expect(isBlockedHost('http://api.localhost/x')).toBe(true);
  });

  it('blocks mDNS .local and the reserved .internal / .home.arpa suffixes', () => {
    expect(isBlockedHost('http://printer.local/x')).toBe(true);
    expect(isBlockedHost('https://db.internal/x')).toBe(true);
    expect(isBlockedHost('http://router.home.arpa/x')).toBe(true);
  });

  it('allow exempts localhost by exact hostname (the local-dev opt-in)', () => {
    expect(isBlockedHost('http://localhost:5173/x', { allow: ['localhost'] })).toBe(false);
  });

  it('does not block an ordinary public multi-label name', () => {
    expect(isBlockedHost('https://data.lab/x')).toBe(false); // the suite's stock host
    expect(isBlockedHost('https://data.lab.example/x')).toBe(false);
  });

  it('handles internal-name boundary cases (trailing dot, case-fold, near-miss substrings)', () => {
    expect(isBlockedHost('http://db.internal./x')).toBe(true); // trailing-dot FQDN still internal
    expect(isBlockedHost('http://db.internal../x')).toBe(true); // double trailing dot
    expect(isBlockedHost('http://DB.Internal/x')).toBe(true); // case-insensitive
    expect(isBlockedHost('https://localhostx/x')).toBe(false); // not the bare localhost
    expect(isBlockedHost('https://notlocalhost.example/x')).toBe(false); // not a .localhost suffix
  });
});
