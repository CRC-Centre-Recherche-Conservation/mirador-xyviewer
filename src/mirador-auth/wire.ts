import { configureDatasetRequests } from '../services';
import type { DatasetRequestOptions, DatasetRequestProvider } from '../types/dataset';
import { isSecureTransport, originOf, resolveMiradorToken } from './resolveToken';

/**
 * Minimal shape of the Mirador Redux store this needs. The real `Mirador.viewer(...).store`
 * satisfies it structurally (no cast). Phase 1 reads state only; Phase 2 (login trigger)
 * will also use `subscribe`.
 */
export interface MiradorStoreLike {
  getState(): unknown;
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
 * Phase 1 only reuses an *existing* token; surfacing a "Sign in" button when none/expired
 * (to start a login) is Phase 2, wired separately via `configureDatasetAuth`.
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

  const provider: DatasetRequestProvider = (url): DatasetRequestOptions | undefined => {
    const token = resolveMiradorToken(store.getState(), { url, trustedOrigins: canonical });
    if (token) return { headers: { Authorization: `Bearer ${token}` } };

    if (cookie && isSecureTransport(url)) {
      const origin = originOf(url);
      if (origin && canonical.includes(origin)) return { credentials: 'include' };
    }
    return undefined;
  };

  configureDatasetRequests(provider);
  return () => configureDatasetRequests(undefined);
}
