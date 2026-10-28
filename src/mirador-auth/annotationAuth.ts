/**
 * IIIF Auth for annotation pages.
 *
 * Mirador fetches annotation pages without credentials. This adds, for a trusted origin only:
 *  - a `requests.preprocessors` entry that sends `Authorization: Bearer <token>` on annotation
 *    page requests (never on manifests, info.json or search);
 *  - a store subscriber that re-requests a page once when a usable token appears (after a
 *    login), and, if a page we sent a token for comes back as an auth stub or a fetch error,
 *    deny-lists that (page, token) locally and re-requests the page once anonymously;
 *  - the handlers behind the annotation panel's "Sign in" notice.
 *
 * Mirador facts this relies on (4.2.2 - 4.3): preprocessors are read from the config at every
 * fetch (so one added after the viewer exists applies), are called as `(url, options)` and
 * return the new options; a 401 with a JSON body is stored like a success (so its declared
 * `service` is visible in the store), while any other non-2xx drops the body (no `service`).
 * Pages are stored by URL: one list per URL per session, the latest fetch wins.
 */
import { getAccessTokens, requestAnnotation, updateConfig } from 'mirador';
import { configureAnnotationAuth } from '../services/annotationAuth';
import type { AnnotationPageRef } from '../services/annotationAuth';
import type { BlocklistConfig } from './blocklist';
import type { MiradorSubscribableStore } from './imageAuthReload';
import { accessTokenForService, discoverAuthService } from './resolveToken';
import type { DiscoveredAuthService } from './resolveToken';
import { acquireTokenViaSession, runIiifAuthLogin } from './loginDriver';
import { createTrustGates } from './trust';

/** Options for {@link wireMiradorAnnotationAuth}. Trust semantics match `wireMiradorDatasetAuth`. */
export interface WireMiradorAnnotationAuthOptions {
  /**
   * Origins allowed to receive a token or a login. Omitted: host-driven (a token goes only to
   * the origin that issued it). `[]` denies everything. Bare `https://host[:port]` origins.
   */
  trustedOrigins?: string[];
  /** SSRF guard: hosts that are not public unicast are refused unless allowed here. */
  blocklist?: BlocklistConfig;
  /**
   * Try to reuse an existing session silently (token service only, no window) for a page that
   * declares a trusted service, once per service. Default `true`.
   */
  silent?: boolean;
  /** Override the login driver (testing / advanced). Defaults to {@link runIiifAuthLogin}. */
  loginDriver?: (discovered: DiscoveredAuthService, dispatch: (action: unknown) => void) => Promise<void>;
  /** Override the silent session re-acquirer (testing). Defaults to {@link acquireTokenViaSession}. */
  sessionAcquirer?: (discovered: DiscoveredAuthService, dispatch: (action: unknown) => void) => Promise<boolean>;
}

type Preprocessor = ((url: string, options: RequestInit) => RequestInit | undefined) & {
  __xyviewerAnnotationAuth?: true;
};

interface PageEntry {
  isFetching?: boolean;
  json?: unknown;
  error?: unknown;
}

interface MiradorStateShape {
  annotations?: Record<string, Record<string, PageEntry>>;
  config?: { requests?: { preprocessors?: Preprocessor[] } };
}

/** A page with at least one annotation. */
const hasAnnotations = (json: unknown): boolean => {
  if (Array.isArray(json)) return json.length > 0;
  if (typeof json !== 'object' || json === null) return false;
  const { items, resources } = json as { items?: unknown; resources?: unknown };
  return (Array.isArray(items) && items.length > 0) || (Array.isArray(resources) && resources.length > 0);
};

/**
 * An auth stub: no annotations and a declared IIIF Auth service. A bare `{}` or an empty
 * list without a service is a legitimate empty page, not a rejection.
 */
const isAuthStub = (json: unknown): boolean =>
  typeof json === 'object' && json !== null && !hasAnnotations(json) &&
  discoverAuthService((json as { service?: unknown }).service) !== undefined;

/** `Authorization` present in any `HeadersInit` shape? */
function hasAuthorization(headers: HeadersInit | undefined): boolean {
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has('authorization');
  if (Array.isArray(headers)) return headers.some(([k]) => k.toLowerCase() === 'authorization');
  return Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
}

/** Add the Bearer header, keeping the caller's header container type (plain object stays plain). */
function withBearer(headers: HeadersInit | undefined, token: string): HeadersInit {
  const value = `Bearer ${token}`;
  if (!headers) return { Authorization: value };
  if (headers instanceof Headers || Array.isArray(headers)) {
    const h = new Headers(headers);
    h.set('Authorization', value);
    return h;
  }
  return { ...headers, Authorization: value };
}

/** All `[targetId, pageUrl, entry]` rows of Mirador's `annotations` state. */
function pagesOf(state: unknown): Array<[string, string, PageEntry]> {
  const rows: Array<[string, string, PageEntry]> = [];
  const annotations = (state as MiradorStateShape | undefined)?.annotations;
  if (!annotations || typeof annotations !== 'object') return rows;
  for (const [targetId, pages] of Object.entries(annotations)) {
    if (!pages || typeof pages !== 'object') continue;
    for (const [pageUrl, entry] of Object.entries(pages)) {
      if (entry && typeof entry === 'object') rows.push([targetId, pageUrl, entry]);
    }
  }
  return rows;
}

/** The live wire: a newer call supersedes older ones (HMR, double setup) instead of fighting over the config. */
let activeWire: symbol | undefined;

/**
 * Make annotation pages follow the reader's IIIF Auth session. Opt-in and separate from
 * `wireMiradorDatasetAuth` (it needs a store with `subscribe`); the two can be used together.
 * Returns a teardown that removes only this wire's preprocessor and handlers.
 *
 * @example
 * const { store } = Mirador.viewer(config, [scientificAnnotationPlugin]);
 * wireMiradorAnnotationAuth(store, { trustedOrigins: ['https://annotations.lab.example'] });
 */
export function wireMiradorAnnotationAuth(
  store: MiradorSubscribableStore,
  options: WireMiradorAnnotationAuthOptions = {},
): () => void {
  const { silent = true } = options;
  const me = Symbol('annotation-auth');
  activeWire = me;
  const gates = createTrustGates(options, 'wireMiradorAnnotationAuth');
  const drive = options.loginDriver ?? runIiifAuthLogin;
  const acquireSession = options.sessionAcquirer ?? acquireTokenViaSession;

  /** Service block each page URL declared in an earlier response (a refetch clears the store's copy). */
  const declared = new Map<string, unknown>();
  /** Token last sent per page URL. */
  const sent = new Map<string, string>();
  /** `url|token` pairs a page refused: never sent again for that page (local deny-list). */
  const rejected = new Set<string>();
  const pairKey = (url: string, token: string): string => `${url}\0${token}`;
  /** Page URLs whose next request must be anonymous. */
  const anonymousNext = new Set<string>();
  /** `target|url|token` already re-requested: at most once per token. */
  const refetched = new Set<string>();
  const silentTried = new Set<string>();

  const isAnnotationFetch = (state: unknown, url: string): boolean =>
    pagesOf(state).some(([, pageUrl, entry]) => pageUrl === url && entry.isFetching === true);

  const usable = (url: string, token: string | undefined): token is string =>
    token !== undefined && !rejected.has(pairKey(url, token));

  const preprocessor: Preprocessor = (url, init) => {
    const state = store.getState();
    // Only annotation page requests: Mirador marks the page as fetching before the saga runs.
    if (!isAnnotationFetch(state, url) || gates.isBlocked(url)) return init;
    if (hasAuthorization(init?.headers)) return init; // never override the host's own header
    if (anonymousNext.delete(url)) {
      sent.delete(url);
      return { ...init, cache: init?.cache ?? 'no-store' };
    }
    const token = gates.tokenFor(state, url, declared.get(url));
    if (!usable(url, token)) {
      sent.delete(url);
      return init;
    }
    sent.set(url, token);
    // Per-reader responses must not be served from / stored in the shared HTTP cache.
    return { ...init, headers: withBearer(init?.headers, token), cache: init?.cache ?? 'no-store' };
  };
  preprocessor.__xyviewerAnnotationAuth = true;

  /** Put our preprocessor in `requests.preprocessors` (replacing any stale copy); no-op if present. */
  const ensureRegistered = (state: unknown): void => {
    const current = (state as MiradorStateShape).config?.requests?.preprocessors ?? [];
    if (current.includes(preprocessor)) return;
    const others = current.filter((p) => !p.__xyviewerAnnotationAuth);
    store.dispatch(updateConfig({ requests: { preprocessors: [...others, preprocessor] } }));
  };

  const refetch = (targetId: string, url: string): void => {
    // Defer: never dispatch re-entrantly from a store subscriber.
    void Promise.resolve().then(() => store.dispatch(requestAnnotation(targetId, url)));
  };

  const tryRefetch = (targetId: string, url: string, token: string): void => {
    const key = `${targetId}\0${url}\0${token}`;
    if (refetched.has(key)) return;
    refetched.add(key);
    refetch(targetId, url);
  };

  // Inputs of the last full pass: Redux actions like viewport updates change none of them.
  let seen: { annotations?: unknown; tokens?: unknown; requests?: unknown } = {};

  const tick = (force = false): void => {
    if (activeWire !== me) return; // superseded by a newer wire
    const state = store.getState();
    const inputs = {
      annotations: (state as MiradorStateShape).annotations,
      tokens: getAccessTokens(state),
      requests: (state as MiradorStateShape).config?.requests,
    };
    if (!force && inputs.annotations === seen.annotations && inputs.tokens === seen.tokens && inputs.requests === seen.requests) {
      return;
    }
    seen = inputs;
    ensureRegistered(state);

    for (const [targetId, url, entry] of pagesOf(state)) {
      if (entry.isFetching) continue;
      const json = entry.json as { service?: unknown } | undefined;
      if (json && typeof json === 'object' && json.service) declared.set(url, json.service);

      // We sent a token and the page answered with an auth stub, or failed (a 403, a non-JSON
      // 401, a CORS preflight refusing `Authorization`): deny the token for this page and fall
      // back to one anonymous request. Per page, since a 401 is a per-resource answer.
      const sentToken = sent.get(url);
      if (sentToken && (isAuthStub(json) || (json === undefined && entry.error !== undefined))) {
        sent.delete(url);
        if (!rejected.has(pairKey(url, sentToken))) {
          rejected.add(pairKey(url, sentToken));
          anonymousNext.add(url);
          refetch(targetId, url);
        }
        continue;
      }

      if (gates.isBlocked(url)) continue;
      const token = gates.tokenFor(state, url, declared.get(url));
      // A usable token we did not send with the stored response: fetch again, once per token.
      if (usable(url, token) && sent.get(url) !== token) tryRefetch(targetId, url, token);

      // Only a page we may send a token to can drive a silent session check.
      if (silent && json?.service && gates.trustedAndSecure(url)) {
        const d = gates.discoverTrusted({ id: url, service: json.service });
        if (d && !silentTried.has(d.tokenServiceId) && accessTokenForService(state, d.tokenServiceId) === undefined) {
          silentTried.add(d.tokenServiceId);
          void acquireSession(d, store.dispatch).catch(() => undefined);
        }
      }
    }
  };

  /** A page whose body was dropped by a fetch error falls back to the service it declared earlier. */
  const withDeclared = (page: AnnotationPageRef): AnnotationPageRef =>
    page.service ? page : { id: page.id, service: declared.get(page.id) };

  const canSignIn = (ref: AnnotationPageRef): boolean => {
    const page = withDeclared(ref);
    // The page itself must be eligible, not just the service it declares.
    if (gates.isBlocked(page.id) || !gates.trustedAndSecure(page.id)) return false;
    const d = gates.discoverTrusted(page);
    if (!d) return false;
    const token = accessTokenForService(store.getState(), d.tokenServiceId);
    // Signed in, but this page refused the token: a fresh login is still worth offering.
    return !usable(page.id, token);
  };

  const signIn = async (ref: AnnotationPageRef): Promise<void> => {
    const page = withDeclared(ref);
    if (gates.isBlocked(page.id) || !gates.trustedAndSecure(page.id)) return;
    const d = gates.discoverTrusted(page);
    if (!d) return;
    try {
      await drive(d, store.dispatch);
    } catch (err) {
      // Never reject: the notice awaits this.
      console.debug('[mirador-xyviewer/mirador-auth] IIIF login did not complete:', err);
    }
    // An explicit login earns this page one more try, even if the server hands back the same token.
    for (const key of [...rejected]) if (key.startsWith(`${page.id}\0`)) rejected.delete(key);
    for (const key of [...refetched]) if (key.split('\0')[1] === page.id) refetched.delete(key);
    tick(true);
  };

  const unsubscribe = store.subscribe(() => tick());
  configureAnnotationAuth({ canSignIn, signIn });
  tick(true);

  return () => {
    unsubscribe();
    if (activeWire !== me) return; // a newer wire owns the config and handlers now
    activeWire = undefined;
    configureAnnotationAuth(undefined);
    const current = (store.getState() as MiradorStateShape).config?.requests?.preprocessors;
    if (current?.includes(preprocessor)) {
      store.dispatch(updateConfig({ requests: { preprocessors: current.filter((p) => p !== preprocessor) } }));
    }
  };
}
