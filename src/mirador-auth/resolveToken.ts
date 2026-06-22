import { getAccessTokens } from 'mirador';

/** Parameters for resolving a reusable Mirador access token for a content URL. */
export interface ResolveTokenOptions {
  /** The content URL being fetched (dataset, manifest, annotation…). */
  url: string;
  /**
   * Allowlist of content origins permitted to receive a token. Required — a token
   * is never returned for an origin outside this list (anti-leak gate). No wildcard.
   * Entries are canonicalized (case, default port, trailing slash/dot) before matching.
   */
  trustedOrigins: string[];
}

/** Hostnames permitted to use plaintext http:// — local development only. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Canonical origin for trust comparison: lowercased host (via `URL`), default port
 * omitted, and a single trailing dot stripped so an FQDN (`data.lab.`) and its bare
 * form (`data.lab`) compare equal — closing both the silent-fail and the asymmetry
 * footguns. Returns `undefined` for an unparseable URL or one lacking a host (a bare
 * hostname, `data:`/`blob:` etc.).
 */
export function originOf(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (!u.hostname) return undefined;
  const host = u.hostname.replace(/\.$/, '');
  return `${u.protocol}//${host}${u.port ? `:${u.port}` : ''}`;
}

/**
 * Whether `url`'s transport may carry a bearer token / credentialed cookie: https
 * anywhere, or http only for loopback (local dev). Plaintext http to a real host is
 * refused — a reusable IIIF Auth token must never traverse cleartext (MITM theft).
 */
export function isSecureTransport(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || LOOPBACK_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Find a Mirador IIIF-Auth access token reusable for `url`, gated by `trustedOrigins`
 * and a secure transport.
 *
 * Strategy (Phase 1): **host-inheritance** — return the token of any token service
 * whose origin matches the content origin. This is a pragmatic heuristic (no IIIF-spec
 * sanction; within one origin it trusts every path, so avoid on multi-tenant hosts);
 * Phase 1b adds the spec-correct declared-`service` path. The `trustedOrigins` gate and
 * the https requirement always apply.
 *
 * This is the single place that knows Mirador's token-store shape
 * (`getAccessTokens(state)[tokenServiceId].json.accessToken`); all consumers go through
 * it, so a future Mirador shape change is a one-file fix.
 */
export function resolveMiradorToken(state: unknown, opts: ResolveTokenOptions): string | undefined {
  const contentOrigin = originOf(opts.url);
  if (!contentOrigin || !isSecureTransport(opts.url)) return undefined;

  const trusted = new Set(opts.trustedOrigins.map(originOf).filter((o): o is string => o !== undefined));
  if (!trusted.has(contentOrigin)) return undefined;

  const tokens = getAccessTokens(state);
  for (const [tokenServiceId, entry] of Object.entries(tokens)) {
    // First token service whose origin matches the content origin wins (store order).
    const token = entry.json?.accessToken;
    if (token && originOf(tokenServiceId) === contentOrigin) return token;
  }
  return undefined;
}
