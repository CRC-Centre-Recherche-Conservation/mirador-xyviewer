import { getAccessTokens } from 'mirador';

/** Parameters for resolving a reusable Mirador access token for a content URL. */
export interface ResolveTokenOptions {
  /** The content URL being fetched (dataset, manifest, annotation…). */
  url: string;
  /**
   * Optional allowlist of content origins permitted to receive a token. When provided —
   * **even as an empty array** — it is an explicit anti-leak gate: a token is only ever
   * returned for a listed origin (no wildcard), so `[]` is a deny-all kill-switch, and a
   * non-empty list is what enables cross-origin (declared-service) reuse. When **omitted**, a
   * host-driven default applies: a token is returned only for the exact origin of the service
   * that issued it (IIIF spec — a token goes back to its own service's origin). Entries are
   * canonicalized (case, default port, trailing slash/dot) before matching.
   */
  trustedOrigins?: string[];
  /**
   * Optional: the resource's declared IIIF Auth `service` block. When present, the
   * token is resolved from the declared token service (the spec-correct path, which
   * also works cross-origin) in preference to host-inheritance — but only if that
   * token service's origin is itself trusted (anti-exfiltration). Typed `unknown` on
   * purpose: it originates from untrusted wire JSON and is narrowed defensively by
   * {@link tokenServiceIdFromDeclared}.
   */
  service?: unknown;
}

/**
 * The bearer token Mirador holds for a token-service id, or `undefined`. Like
 * {@link resolveMiradorToken} this is the only place that knows the token-store shape —
 * but ungated: callers that already hold a trusted token-service id (e.g. a resource's
 * own declared service) use it to check session reuse, not to attach a token to a URL.
 */
export function accessTokenForService(state: unknown, tokenServiceId: string): string | undefined {
  return getAccessTokens(state)[tokenServiceId]?.json?.accessToken;
}

/** IIIF Auth token-service profiles (1.0 and the legacy 0.x). */
const TOKEN_PROFILES = new Set([
  'http://iiif.io/api/auth/1/token',
  'http://iiif.io/api/auth/0/token',
]);

/** IIIF Auth access-service profiles (the interaction patterns), 1.0 and 0.x. */
const ACCESS_PROFILES = new Set([
  'http://iiif.io/api/auth/1/login',
  'http://iiif.io/api/auth/1/clickthrough',
  'http://iiif.io/api/auth/1/kiosk',
  'http://iiif.io/api/auth/1/external',
  'http://iiif.io/api/auth/0/login',
  'http://iiif.io/api/auth/0/clickthrough',
  'http://iiif.io/api/auth/0/kiosk',
  'http://iiif.io/api/auth/0/external',
]);

// Pick the first profile string that is one of `allowed` — like `hasTokenProfile`, scan the
// whole array rather than blindly taking index 0 (a spec-allowed `['custom', '…/login']` must
// still resolve the IIIF Auth profile).
const profileOf = (s: Record<string, unknown>, allowed: Set<string>): string | undefined => {
  const p = s.profile;
  if (typeof p === 'string') return allowed.has(p) ? p : undefined;
  if (Array.isArray(p)) return p.find((x): x is string => typeof x === 'string' && allowed.has(x));
  return undefined;
};

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

const idOf = (s: Record<string, unknown>): string | undefined => {
  const id = s['@id'] ?? s.id;
  return typeof id === 'string' ? id : undefined;
};

const hasTokenProfile = (s: Record<string, unknown>): boolean => {
  const p = s.profile;
  if (typeof p === 'string') return TOKEN_PROFILES.has(p);
  return Array.isArray(p) && p.some((x) => typeof x === 'string' && TOKEN_PROFILES.has(x));
};

/**
 * The token-service id declared inside a resource's IIIF Auth `service` block, or
 * `undefined`. The token service (profile `auth/1/token`, or legacy `/0/token`) is
 * normally nested under the access (login/clickthrough/…) service; handles v2 (`@id`)
 * and v3 (`id`) wire shapes, single objects and arrays.
 */
export function tokenServiceIdFromDeclared(service: unknown): string | undefined {
  for (const access of asArray(service)) {
    if (typeof access !== 'object' || access === null) continue;
    const a = access as Record<string, unknown>;
    for (const nested of asArray(a.service)) {
      if (typeof nested === 'object' && nested !== null && hasTokenProfile(nested as Record<string, unknown>)) {
        const id = idOf(nested as Record<string, unknown>);
        if (id) return id;
      }
    }
    // Defensive: a token service asserted directly on the access object.
    if (hasTokenProfile(a)) {
      const id = idOf(a);
      if (id) return id;
    }
  }
  return undefined;
}

/** A resource's declared IIIF Auth access service plus its nested token service. */
export interface DiscoveredAuthService {
  /** Access (login/clickthrough/kiosk/external) service id — where the user authenticates. */
  authServiceId: string;
  /** The access service's IIIF Auth profile URI. */
  profile: string;
  /** Nested token service id — the key Mirador's `accessTokens` store uses. */
  tokenServiceId: string;
}

/**
 * Extract the IIIF Auth access service (and its nested token service) a resource
 * declares — what Phase 2 needs to drive a login. Returns `undefined` unless an
 * access service (a login/clickthrough/kiosk/external profile) with a nested token
 * service is declared.
 */
export function discoverAuthService(service: unknown): DiscoveredAuthService | undefined {
  for (const access of asArray(service)) {
    if (typeof access !== 'object' || access === null) continue;
    const a = access as Record<string, unknown>;
    const profile = profileOf(a, ACCESS_PROFILES);
    const authServiceId = idOf(a);
    if (!profile || !authServiceId) continue;
    for (const nested of asArray(a.service)) {
      if (typeof nested === 'object' && nested !== null && hasTokenProfile(nested as Record<string, unknown>)) {
        const tokenServiceId = idOf(nested as Record<string, unknown>);
        if (tokenServiceId) return { authServiceId, profile, tokenServiceId };
      }
    }
  }
  return undefined;
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
  // An origin never carries credentials; reject userinfo so a misconfigured trusted
  // entry like `https://data.lab@auth.museum` can't silently trust the wrong host.
  if (!u.hostname || u.username || u.password) return undefined;
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
 * Find a Mirador IIIF-Auth access token reusable for `url`, gated by trust and a secure
 * transport.
 *
 * Strategy: (a) when the resource declares its auth `service` and that token service's
 * origin is trusted, use the declared token service (spec-correct, works cross-origin);
 * else (b) **host-inheritance** — a token whose service origin matches the content origin.
 *
 * Trust has two modes (see {@link ResolveTokenOptions.trustedOrigins}): an **explicit**
 * allowlist (required for cross-origin reuse), or the **host-driven default** (no list) in
 * which a token is only ever returned for the exact origin that issued it. The https
 * requirement always applies.
 *
 * This is the single place that knows Mirador's token-store shape
 * (`getAccessTokens(state)[tokenServiceId].json.accessToken`); all consumers go through
 * it, so a future Mirador shape change is a one-file fix.
 */
export function resolveMiradorToken(state: unknown, opts: ResolveTokenOptions): string | undefined {
  const contentOrigin = originOf(opts.url);
  if (!contentOrigin || !isSecureTransport(opts.url)) return undefined;

  // Explicit allowlist (provided, even []) vs host-driven default (omitted). An explicit list
  // — including a deliberately empty or all-invalid one — is a strict gate: only a listed
  // origin gets a token, so [] denies all. Omitted falls back to host-driven, where each path
  // below only returns a token bound to the content's own origin.
  const explicit = opts.trustedOrigins !== undefined;
  const trusted = new Set((opts.trustedOrigins ?? []).map(originOf).filter((o): o is string => o !== undefined));
  if (explicit && !trusted.has(contentOrigin)) return undefined;

  const tokens = getAccessTokens(state);

  // (a) Spec-correct: the resource declares its auth service. Explicit mode requires that
  //     token service's origin to be trusted (else a malicious resource could name an
  //     unrelated token-service id to exfiltrate a token); host-driven mode requires it to
  //     BE the content's own origin (cross-origin reuse needs an explicit allowlist).
  const declaredId = opts.service ? tokenServiceIdFromDeclared(opts.service) : undefined;
  if (declaredId) {
    const declaredOrigin = originOf(declaredId);
    if (declaredOrigin) {
      const declaredTrusted = explicit ? trusted.has(declaredOrigin) : declaredOrigin === contentOrigin;
      if (declaredTrusted) {
        const token = tokens[declaredId]?.json?.accessToken;
        if (token) return token;
      }
    }
  }

  // (b) Host-inheritance: first token service whose origin matches the content origin wins
  //     (store order). Inherently same-origin, so it is the host-driven default and needs no
  //     allowlist — within one origin it trusts every path, so avoid on multi-tenant hosts.
  for (const [tokenServiceId, entry] of Object.entries(tokens)) {
    const token = entry.json?.accessToken;
    if (token && originOf(tokenServiceId) === contentOrigin) return token;
  }
  return undefined;
}
