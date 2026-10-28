/**
 * Trust gates shared by every consumer of Mirador's IIIF Auth tokens (datasets, annotation
 * pages): which origin may receive a credential or a login, and which token applies. One
 * implementation so all consumers follow identical rules.
 */
import {
  discoverAuthService,
  isSecureTransport,
  originOf,
  resolveMiradorToken,
} from './resolveToken';
import type { DiscoveredAuthService } from './resolveToken';
import { isBlockedHost } from './blocklist';
import type { BlocklistConfig } from './blocklist';

/** Trust options common to every wire (see the per-field docs on the public option types). */
export interface TrustOptions {
  trustedOrigins?: string[];
  blocklist?: BlocklistConfig;
}

/** The decisions a wire needs, bound to one {@link TrustOptions}. */
export interface TrustGates {
  /** Canonicalized, de-duplicated allowlist (empty in host-driven mode). */
  canonical: string[];
  /** True when `trustedOrigins` was omitted (host-driven default). */
  hostDriven: boolean;
  /** SSRF guard: true when `url`'s host is internal / non-public (and not allowed). */
  isBlocked(url: string): boolean;
  /**
   * The Mirador token reusable for `url` (optionally via the resource's declared `service`),
   * or `undefined`. Does not apply the blocklist; callers check {@link isBlocked} first.
   */
  tokenFor(state: unknown, url: string, service?: unknown): string | undefined;
  /** Secure transport, not blocked, and explicitly trusted (or host-driven). */
  trustedAndSecure(url: string): boolean;
  /**
   * The body's declared auth service, only if a login may be started for it: both service
   * URLs trusted and secure, and — host-driven — on the resource's OWN origin.
   */
  discoverTrusted(body: { id?: string; service?: unknown }): DiscoveredAuthService | undefined;
}

/**
 * Build the trust gates for `options`. `label` prefixes the setup warnings (e.g.
 * `wireMiradorDatasetAuth`).
 */
export function createTrustGates(options: TrustOptions, label: string): TrustGates {
  const { trustedOrigins, blocklist } = options;

  // Canonicalize once at setup; drop unparseable entries (a bare host or a trailing slash
  // would otherwise silently never match `new URL().origin` — a no-op footgun).
  const canonical = [...new Set((trustedOrigins ?? []).map(originOf).filter((o): o is string => o !== undefined))];
  // Host-driven only when the allowlist is OMITTED. An explicit list (incl. [] or all-invalid)
  // is a strict gate: [] is a deny-all kill-switch (no token / cookie / login attached anywhere).
  const hostDriven = trustedOrigins === undefined;
  // Warn only on a real misconfiguration: an allowlist was passed but every entry was
  // invalid. An omitted / empty list is the intentional host-driven default (no warning).
  if (trustedOrigins && trustedOrigins.length > 0 && canonical.length === 0) {
    console.warn(
      `[mirador-xyviewer/mirador-auth] ${label}: every trustedOrigins entry was ` +
        'invalid and ignored. Pass bare origins, e.g. ["https://data.lab.example"].',
    );
  }
  const cleartext = canonical.filter((o) => !isSecureTransport(o));
  if (cleartext.length) {
    console.warn(
      `[mirador-xyviewer/mirador-auth] ${label}: ignoring cleartext http origin(s) ` +
        `${cleartext.join(', ')} — tokens/cookies are only sent over https (or loopback).`,
    );
  }

  const isBlocked = (url: string): boolean => isBlockedHost(url, blocklist);

  const tokenFor = (state: unknown, url: string, service?: unknown): string | undefined =>
    resolveMiradorToken(state, {
      url,
      service,
      // Host-driven must reach the resolver as undefined; an explicit list (incl. [] → deny-all)
      // passes the canonical array.
      trustedOrigins: hostDriven ? undefined : canonical,
    });

  const trustedAndSecure = (url: string): boolean => {
    const o = originOf(url);
    if (o === undefined || !isSecureTransport(url) || isBlocked(url)) return false;
    // Explicit allowlist, or — host-driven — the resource's own declared (secure, public) origin.
    return hostDriven || canonical.includes(o);
  };

  // Never open a popup or acquire a token for an arbitrary manifest-declared host. Single
  // source for both the login and the Sign-in button visibility.
  const discoverTrusted = (body: { id?: string; service?: unknown }): DiscoveredAuthService | undefined => {
    const d = discoverAuthService(body.service);
    if (!d || !trustedAndSecure(d.authServiceId) || !trustedAndSecure(d.tokenServiceId)) return undefined;
    if (hostDriven) {
      // Host-driven mirrors the same-origin token-reuse rule (resolveToken path a): a login is
      // offered only for the resource's own origin; cross-origin login needs an explicit allowlist.
      const ownOrigin = body.id ? originOf(body.id) : undefined;
      if (!ownOrigin || originOf(d.authServiceId) !== ownOrigin || originOf(d.tokenServiceId) !== ownOrigin) {
        return undefined;
      }
    }
    return d;
  };

  return { canonical, hostDriven, isBlocked, tokenFor, trustedAndSecure, discoverTrusted };
}
