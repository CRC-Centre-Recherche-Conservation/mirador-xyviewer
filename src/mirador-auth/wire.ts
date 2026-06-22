import { configureDatasetAuth, configureDatasetRequests } from '../services';
import type { DatasetRequestOptions, DatasetRequestProvider } from '../types/dataset';
import {
  discoverAuthService,
  isSecureTransport,
  originOf,
  resolveMiradorToken,
} from './resolveToken';
import type { DiscoveredAuthService } from './resolveToken';
import { runIiifAuthLogin } from './loginDriver';

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
   * Required allowlist of content origins permitted to receive a token or cookie.
   * Anti-leak gate — nothing is attached to an origin outside this list. No wildcard.
   * Pass bare origins (`https://host[:port]`); path/case/trailing-slash are normalized,
   * and cleartext http (except loopback) is ignored.
   */
  trustedOrigins: string[];
  /**
   * When `true`, fall back to `credentials: 'include'` (browser cookies) for trusted,
   * https origins that have no reusable token. Off by default (secure default is
   * `credentials: 'omit'`). Cross-origin credentialed requests additionally need the
   * server to send `Access-Control-Allow-Credentials: true` + an explicit origin.
   */
  cookie?: boolean;
  /**
   * Override the login driver (testing / advanced). Defaults to the built-in IIIF Auth
   * 1.0 flow ({@link runIiifAuthLogin}): open the access window, fetch the token, and
   * dispatch it into Mirador's store.
   */
  loginDriver?: (discovered: DiscoveredAuthService, dispatch: (action: unknown) => void) => Promise<void>;
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
  const { trustedOrigins, cookie = false } = options;

  // Canonicalize once at setup; drop unparseable entries (a bare host or a trailing
  // slash would otherwise silently never match `new URL().origin` — a no-op footgun).
  const canonical = [...new Set(trustedOrigins.map(originOf).filter((o): o is string => o !== undefined))];
  if (canonical.length === 0) {
    console.warn(
      '[mirador-xyviewer/mirador-auth] wireMiradorDatasetAuth: no valid trustedOrigins — no ' +
        'dataset will receive a token. Pass bare origins, e.g. ["https://data.lab.example"].',
    );
  } else {
    const cleartext = canonical.filter((o) => !isSecureTransport(o));
    if (cleartext.length) {
      console.warn(
        `[mirador-xyviewer/mirador-auth] wireMiradorDatasetAuth: ignoring cleartext http origin(s) ` +
          `${cleartext.join(', ')} — tokens/cookies are only sent over https (or loopback).`,
      );
    }
  }

  const provider: DatasetRequestProvider = (url, context): DatasetRequestOptions | undefined => {
    const token = resolveMiradorToken(store.getState(), {
      url,
      service: context?.service,
      trustedOrigins: canonical,
    });
    if (token) return { headers: { Authorization: `Bearer ${token}` } };

    if (cookie && isSecureTransport(url)) {
      const origin = originOf(url);
      if (origin && canonical.includes(origin)) return { credentials: 'include' };
    }
    return undefined;
  };

  // Write side: the Sign-in affordance starts a login for a resource that declares its
  // auth service, then resolves so DatasetBody auto-retries.
  const drive = options.loginDriver ?? runIiifAuthLogin;
  const trustedAndSecure = (url: string): boolean => {
    const o = originOf(url);
    return o !== undefined && canonical.includes(o) && isSecureTransport(url);
  };
  // The body's declared auth service, but only if it's on a trusted, https origin (same
  // gate as token reuse): never open a popup or store a token for an arbitrary
  // manifest-declared host. Single source for both the login and the button visibility.
  const discoverTrusted = (body: { service?: unknown }): DiscoveredAuthService | undefined => {
    const d = discoverAuthService(body.service);
    if (!d || !trustedAndSecure(d.authServiceId) || !trustedAndSecure(d.tokenServiceId)) return undefined;
    return d;
  };

  configureDatasetAuth(
    async (body) => {
      const discovered = discoverTrusted(body);
      if (!discovered) return; // no trusted declared service → manual "Open resource" + "Try again"
      try {
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
