import { configureDatasetAuth, configureDatasetRequests } from '../services';
import type { DatasetRequestOptions, DatasetRequestProvider } from '../types/dataset';
import {
  discoverAuthService,
  isSecureTransport,
  originOf,
  resolveMiradorToken,
} from './resolveToken';
import type { DiscoveredAuthService } from './resolveToken';
import { acquireTokenViaSession, runIiifAuthLogin } from './loginDriver';
import { isBlockedHost } from './blocklist';
import type { BlocklistConfig } from './blocklist';

/**
 * Minimal shape of the Mirador Redux store this needs. The real `Mirador.viewer(...).store`
 * satisfies it structurally (no cast): `getState` for token matching, `dispatch` to land a
 * newly-acquired token in Mirador's store during a login.
 */
export interface MiradorStoreLike {
  getState(): unknown;
  dispatch(action: unknown): unknown;
}

/** Options for {@link wireMiradorDatasetAuth}. */
export interface WireMiradorDatasetAuthOptions {
  /**
   * Optional allowlist of content origins permitted to receive a token or cookie. When
   * provided, it is an explicit anti-leak gate (nothing is attached outside it; no wildcard)
   * and is required for cross-origin reuse and for the `cookie` fallback. When omitted or
   * empty, a **host-driven default** applies: a token is reused only for the exact origin
   * that issued it, and a login is offered only for a resource's own declared (secure,
   * non-internal) service. Pass bare origins (`https://host[:port]`); path/case/trailing-slash
   * are normalized, and cleartext http (except loopback) is ignored.
   */
  trustedOrigins?: string[];
  /**
   * When `true`, fall back to `credentials: 'include'` (browser cookies) for trusted,
   * https origins that have no reusable token. Off by default (secure default is
   * `credentials: 'omit'`). Requires an explicit `trustedOrigins` (a cookie target can't be
   * derived from a token). Cross-origin credentialed requests additionally need the server
   * to send `Access-Control-Allow-Credentials: true` + an explicit origin.
   */
  cookie?: boolean;
  /**
   * SSRF defense-in-depth. Before attaching a credential to — or opening a login for — a
   * dataset host, hosts that are not public unicast (private / reserved / loopback /
   * link-local IP literals, and special-use internal names) are refused. This is a SECONDARY
   * guard; the primary protection is the origin scoping above + CORS, and it cannot stop
   * DNS-rebinding or a public name that resolves internally. Extend with `deny`, or relax
   * with `allow` (e.g. `{ allow: ['localhost'] }` for local development).
   */
  blocklist?: BlocklistConfig;
  /**
   * Override the login driver (testing / advanced). Defaults to the built-in IIIF Auth
   * 1.0 flow ({@link runIiifAuthLogin}): open the access window, fetch the token, and
   * dispatch it into Mirador's store.
   */
  loginDriver?: (discovered: DiscoveredAuthService, dispatch: (action: unknown) => void) => Promise<void>;
  /**
   * Override the silent session re-acquirer (testing). Defaults to
   * {@link acquireTokenViaSession}: hit the token service and reuse a still-valid session
   * (after a reload) without prompting. Returns whether a token was obtained.
   */
  sessionAcquirer?: (discovered: DiscoveredAuthService, dispatch: (action: unknown) => void) => Promise<boolean>;
}

/**
 * Make the plugin's datasets reuse Mirador's IIIF Auth session: once the user is
 * authenticated (e.g. for protected images), same-host datasets load with the stored
 * token — no second login.
 *
 * Registers a read-side request provider (via `configureDatasetRequests`) that, per
 * dataset fetch, returns `Authorization: Bearer <token>` when a Mirador token matches
 * the (trusted, https) content origin, an optional cookie fallback, or nothing.
 *
 * **Takes exclusive ownership of the `configureDatasetRequests` slot** (a single
 * provider, not a chain): don't combine with a manual `configureDatasetRequests` call.
 * The returned teardown clears the provider (handy for tests / hot reload).
 *
 * Also registers a `configureDatasetAuth` handler so the dataset "Sign in" affordance can
 * start a IIIF Auth login for a resource that declares its auth `service` (incl. image-less
 * / cross-host datasets): it drives the login, lands the token in Mirador's store, and the
 * panel auto-retries. Resources with no declared service fall back to the manual "Open
 * resource" + "Try again" path. The teardown clears both registries.
 *
 * @example
 * const { store } = Mirador.viewer(config, [scientificAnnotationPlugin]);
 * wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab.example'] });
 */
export function wireMiradorDatasetAuth(
  store: MiradorStoreLike,
  options: WireMiradorDatasetAuthOptions,
): () => void {
  const { trustedOrigins, cookie = false, blocklist } = options;

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
      '[mirador-xyviewer/mirador-auth] wireMiradorDatasetAuth: every trustedOrigins entry was ' +
        'invalid and ignored. Pass bare origins, e.g. ["https://data.lab.example"].',
    );
  }
  const cleartext = canonical.filter((o) => !isSecureTransport(o));
  if (cleartext.length) {
    console.warn(
      `[mirador-xyviewer/mirador-auth] wireMiradorDatasetAuth: ignoring cleartext http origin(s) ` +
        `${cleartext.join(', ')} — tokens/cookies are only sent over https (or loopback).`,
    );
  }

  const provider: DatasetRequestProvider = (url, context): DatasetRequestOptions | undefined => {
    // SSRF defense-in-depth — the single attach point for both fetchDataset and
    // fetchDatasetBlob (download): never attach a credential to an internal / non-public host.
    if (isBlockedHost(url, blocklist)) return undefined;

    const token = resolveMiradorToken(store.getState(), {
      url,
      service: context?.service,
      // Host-driven must reach the resolver as undefined; an explicit list (incl. [] → deny-all)
      // passes the canonical array.
      trustedOrigins: hostDriven ? undefined : canonical,
    });
    if (token) return { headers: { Authorization: `Bearer ${token}` } };

    // Cookie fallback requires an explicit allowlist (a cookie target can't be token-derived);
    // `canonical.includes` is already false in host-driven mode, so it stays off there.
    if (cookie && isSecureTransport(url)) {
      const origin = originOf(url);
      if (origin && canonical.includes(origin)) return { credentials: 'include' };
    }
    return undefined;
  };

  // Write side: the Sign-in affordance starts a login for a resource that declares its
  // auth service, then resolves so DatasetBody auto-retries.
  const drive = options.loginDriver ?? runIiifAuthLogin;
  const acquireSession = options.sessionAcquirer ?? acquireTokenViaSession;
  const trustedAndSecure = (url: string): boolean => {
    const o = originOf(url);
    if (o === undefined || !isSecureTransport(url) || isBlockedHost(url, blocklist)) return false;
    // Explicit allowlist, or — host-driven — the resource's own declared (secure, public) origin.
    return hostDriven || canonical.includes(o);
  };
  // The body's declared auth service, but only if it may be logged into: a secure, non-internal
  // origin that is either explicitly trusted or — host-driven — the resource's OWN origin. Never
  // open a popup or acquire a token for an arbitrary manifest-declared host. Single source for
  // both the login and the Sign-in button visibility.
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

  configureDatasetAuth(
    async (body, opts) => {
      const discovered = discoverTrusted(body);
      if (!discovered) return; // no trusted declared service → manual "Open resource" + "Try again"
      // No short-circuit on a stored token: this handler runs only AFTER a 401 on a request
      // that already carried that token, so a present token is the one the server just
      // rejected (stale). Always fall through to a silent re-acquire / interactive login —
      // the legitimate "session still valid" case is covered by acquireTokenViaSession inside
      // both paths (no window when the session holds).
      try {
        // Silent mode (DatasetBody's auto-attempt on 401): only reuse a still-valid session,
        // never open a window — this is what restores access after a reload without a click.
        if (opts?.interactive === false) {
          await acquireSession(discovered, store.dispatch);
          return;
        }
        await drive(discovered, store.dispatch);
      } catch (err) {
        // Never reject: the Sign-in affordance awaits this; a rejection would be unhandled.
        console.debug('[mirador-xyviewer/mirador-auth] IIIF login did not complete:', err);
      }
    },
    { canStartLogin: (body) => discoverTrusted(body) !== undefined },
  );

  configureDatasetRequests(provider);
  return () => {
    configureDatasetRequests(undefined);
    configureDatasetAuth(undefined);
  };
}
