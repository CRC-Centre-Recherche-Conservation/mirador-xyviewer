import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import type { DiscoveredAuthService } from './resolveToken';

vi.mock('mirador', () => ({
  getAccessTokens: (state: { accessTokens?: unknown }) => state?.accessTokens ?? {},
  resolveAccessTokenRequest: (a: string, t: string, json: unknown) => ({ type: 'RECEIVE_TOKEN', a, t, json }),
  updateConfig: (config: unknown) => ({ type: 'UPDATE_CONFIG', config }),
  requestAnnotation: (targetId: string, annotationId: string) => ({ type: 'REQUEST_ANNOTATION', targetId, annotationId }),
}));

import { wireMiradorAnnotationAuth } from './annotationAuth';
import { getAnnotationAuth, configureAnnotationAuth } from '../services/annotationAuth';

const PAGE = 'https://iiif.example.org/annotations/canvas-1/page.json';
const TOKEN_SERVICE = 'https://iiif.example.org/auth/token';
const LOGIN_SERVICE = 'https://iiif.example.org/auth/login';
const SERVICE = [
  {
    '@id': LOGIN_SERVICE,
    profile: 'http://iiif.io/api/auth/1/login',
    service: [{ '@id': TOKEN_SERVICE, profile: 'http://iiif.io/api/auth/1/token' }],
  },
];
const withToken = (token: string, id = TOKEN_SERVICE) => ({ [id]: { json: { accessToken: token } } });

type State = {
  config: { requests: { preprocessors: Array<(u: string, o: RequestInit) => RequestInit | undefined> } };
  annotations: Record<string, Record<string, { isFetching?: boolean; json?: unknown; error?: unknown }>>;
  accessTokens: Record<string, unknown>;
};

function makeStore(patch: Partial<State> = {}) {
  let state: State = { config: { requests: { preprocessors: [] } }, annotations: {}, accessTokens: {}, ...patch };
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const dispatched: Array<{ type: string; [k: string]: unknown }> = [];
  const store = {
    getState: () => state,
    dispatch: vi.fn((a: { type: string; [k: string]: unknown }) => {
      dispatched.push(a);
      if (a.type === 'UPDATE_CONFIG') {
        const cfg = a.config as State['config'];
        state = { ...state, config: { requests: { ...state.config.requests, ...cfg.requests } } };
      } else if (a.type === 'REQUEST_ANNOTATION') {
        state = {
          ...state,
          annotations: {
            ...state.annotations,
            [a.targetId as string]: { ...state.annotations[a.targetId as string], [a.annotationId as string]: { isFetching: true } },
          },
        };
      }
      notify();
      return a;
    }),
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  return {
    store,
    dispatched,
    /** Replace state parts and notify subscribers. */
    set(next: Partial<State>) {
      state = { ...state, ...next };
      notify();
    },
    respond(url: string, json: unknown, target = 'canvas-1') {
      state = { ...state, annotations: { ...state.annotations, [target]: { ...state.annotations[target], [url]: { isFetching: false, json } } } };
      notify();
    },
    respondError(url: string, error = '403 Forbidden', target = 'canvas-1') {
      state = { ...state, annotations: { ...state.annotations, [target]: { ...state.annotations[target], [url]: { isFetching: false, error } } } };
      notify();
    },
    startFetch(url: string, target = 'canvas-1') {
      state = { ...state, annotations: { ...state.annotations, [target]: { ...state.annotations[target], [url]: { isFetching: true } } } };
    },
    pre: () => state.config.requests.preprocessors,
  };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const requests = (d: Array<{ type: string }>) => d.filter((a) => a.type === 'REQUEST_ANNOTATION');
const authHeader = (o: RequestInit | undefined) => (o?.headers as Record<string, string> | undefined)?.Authorization;

/** Wire and return the harness plus a helper running our preprocessor for `url` as an in-flight page fetch. */
function setup(opts: Parameters<typeof wireMiradorAnnotationAuth>[1] = {}, patch: Partial<State> = {}) {
  const h = makeStore(patch);
  const teardown = wireMiradorAnnotationAuth(h.store, { silent: false, ...opts });
  const run = (url: string, init: RequestInit = {}, fetching = true) => {
    if (fetching) h.startFetch(url);
    return h.pre()[0](url, init);
  };
  return { ...h, teardown, run };
}

afterEach(() => configureAnnotationAuth(undefined));

describe('gate matrix', () => {
  const tokens = {
    ...withToken('TKN'),
    'http://insecure.example.org/auth/token': { json: { accessToken: 'HTTP' } },
  };

  it('attaches the Bearer token to a trusted annotation page and sets cache: no-store', () => {
    const { run } = setup({}, { accessTokens: tokens });
    const out = run(PAGE);
    expect(authHeader(out)).toBe('Bearer TKN');
    expect(out?.cache).toBe('no-store');
  });

  it.each([
    ['info.json', 'https://iiif.example.org/iiif/img/info.json'],
    ['manifest', 'https://iiif.example.org/manifests/m1'],
    ['search', 'https://iiif.example.org/search?q=a'],
  ])('never attaches to a %s request (not an annotation fetch)', (_n, url) => {
    const { run } = setup({}, { accessTokens: tokens });
    const init = { headers: { Accept: 'x' } };
    expect(run(url, init, false)).toBe(init);
  });

  it('refuses a blocklisted host', () => {
    const { run } = setup({}, { accessTokens: { 'https://10.0.0.5/auth/token': { json: { accessToken: 'T' } } } });
    expect(authHeader(run('https://10.0.0.5/page.json'))).toBeUndefined();
  });

  it('refuses an origin outside an explicit allowlist', () => {
    const { run } = setup({ trustedOrigins: ['https://other.example.org'] }, { accessTokens: tokens });
    expect(authHeader(run(PAGE))).toBeUndefined();
  });

  it('refuses http on a non-loopback host even when allowlisted', () => {
    const { run } = setup({ trustedOrigins: ['http://insecure.example.org'] }, { accessTokens: tokens });
    expect(authHeader(run('http://insecure.example.org/page.json'))).toBeUndefined();
  });

  it('[] allowlist is deny-all', () => {
    const { run } = setup({ trustedOrigins: [] }, { accessTokens: tokens });
    expect(authHeader(run(PAGE))).toBeUndefined();
  });

  it('allows loopback http when the blocklist is relaxed', () => {
    const { run } = setup(
      { blocklist: { allow: ['localhost'] } },
      { accessTokens: { 'http://localhost:3000/auth/token': { json: { accessToken: 'L' } } } },
    );
    expect(authHeader(run('http://localhost:3000/page.json'))).toBe('Bearer L');
  });

  it('does not send a token already rejected by the server', async () => {
    const h = setup({}, { accessTokens: tokens });
    h.run(PAGE);
    h.respond(PAGE, { type: 'AnnotationPage', service: SERVICE }); // stub: token rejected
    await flush();
    h.startFetch(PAGE);
    expect(authHeader(h.pre()[0](PAGE, {}))).toBeUndefined();
  });

  it('uses the previously declared cross-origin service with an explicit allowlist', async () => {
    const page = 'https://annotations.example.org/p.json';
    const ts = 'https://auth.example.org/token';
    const service = [{ '@id': 'https://auth.example.org/login', profile: 'http://iiif.io/api/auth/1/login', service: [{ '@id': ts, profile: 'http://iiif.io/api/auth/1/token' }] }];
    const h = setup(
      { trustedOrigins: ['https://annotations.example.org', 'https://auth.example.org'] },
      { accessTokens: {} },
    );
    h.respond(page, { type: 'AnnotationPage', items: [], service });
    h.set({ accessTokens: withToken('X', ts) });
    await flush();
    expect(requests(h.dispatched)).toHaveLength(1);
    expect(authHeader(h.run(page))).toBe('Bearer X');
  });
});

describe('header handling', () => {
  it('keeps an existing Authorization header (any case) untouched', () => {
    const { run } = setup({}, { accessTokens: withToken('TKN') });
    const init = { headers: { authorization: 'Basic abc' } };
    expect(run(PAGE, init)).toBe(init);
  });

  it('keeps an existing Authorization on a Headers instance', () => {
    const { run } = setup({}, { accessTokens: withToken('TKN') });
    const init = { headers: new Headers({ Authorization: 'Basic abc' }) };
    expect(run(PAGE, init)).toBe(init);
  });

  it('preserves other headers and the container type', () => {
    const { run } = setup({}, { accessTokens: withToken('TKN') });
    expect(run(PAGE, { headers: { Accept: 'application/json' } })?.headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer TKN',
    });
    const out = run(PAGE, { headers: new Headers({ Accept: 'a' }) });
    expect((out?.headers as Headers).get('authorization')).toBe('Bearer TKN');
    expect((out?.headers as Headers).get('accept')).toBe('a');
  });

  it('does not override a caller-chosen cache mode', () => {
    const { run } = setup({}, { accessTokens: withToken('TKN') });
    expect(run(PAGE, { cache: 'reload' })?.cache).toBe('reload');
  });

  it('no token: returns the options untouched', () => {
    const { run } = setup();
    const init = {};
    expect(run(PAGE, init)).toBe(init);
  });
});

describe('registration', () => {
  it('registers once, replaces a previous wire copy, and keeps host preprocessors', () => {
    const host = vi.fn();
    const h = makeStore({ config: { requests: { preprocessors: [host] } } });
    const t1 = wireMiradorAnnotationAuth(h.store, { silent: false });
    const t2 = wireMiradorAnnotationAuth(h.store, { silent: false });
    expect(h.pre()).toHaveLength(2);
    expect(h.pre()[0]).toBe(host);
    t1(); // stale teardown must not remove the live copy
    expect(h.pre()).toHaveLength(2);
    t2();
    expect(h.pre()).toEqual([host]);
    expect(getAnnotationAuth()).toBeUndefined();
  });

  it('re-asserts the preprocessor after a SET_CONFIG dropped it', () => {
    const h = setup();
    h.set({ config: { requests: { preprocessors: [] } } });
    expect(h.pre()).toHaveLength(1);
  });

  it('does not re-register on every tick', () => {
    const h = setup();
    const calls = h.store.dispatch.mock.calls.length;
    h.set({});
    h.set({});
    expect(h.store.dispatch.mock.calls.length).toBe(calls);
  });

  it('teardown unsubscribes', async () => {
    const h = setup({}, { annotations: { 'canvas-1': { [PAGE]: { isFetching: false, json: { items: [] } } } } });
    h.teardown();
    h.set({ accessTokens: withToken('TKN') });
    await flush();
    expect(requests(h.dispatched)).toHaveLength(0);
  });
});

describe('token appears', () => {
  it('re-requests the affected page exactly once', async () => {
    const h = setup({}, { annotations: { 'canvas-1': { [PAGE]: { isFetching: false, json: { type: 'AnnotationPage', items: [] } } } } });
    h.set({ accessTokens: withToken('TKN') });
    await flush();
    h.set({});
    await flush();
    expect(requests(h.dispatched)).toEqual([{ type: 'REQUEST_ANNOTATION', targetId: 'canvas-1', annotationId: PAGE }]);
  });

  it('re-requests again for a new token', async () => {
    const h = setup({}, { annotations: { 'canvas-1': { [PAGE]: { isFetching: false, json: { items: [] } } } } });
    h.set({ accessTokens: withToken('A') });
    await flush();
    h.respond(PAGE, { items: [{}] });
    h.set({ accessTokens: withToken('B') });
    await flush();
    expect(requests(h.dispatched)).toHaveLength(2);
  });

  it('does not re-request a page already fetched with that token', async () => {
    const h = setup({}, { accessTokens: withToken('TKN') });
    h.run(PAGE);
    h.respond(PAGE, { items: [{}] });
    await flush();
    expect(requests(h.dispatched)).toHaveLength(0);
  });

  it('ignores pages on untrusted origins', async () => {
    const h = setup({ trustedOrigins: ['https://other.example.org'] }, { annotations: { 'canvas-1': { [PAGE]: { isFetching: false, json: { items: [] } } } } });
    h.set({ accessTokens: withToken('TKN') });
    await flush();
    expect(requests(h.dispatched)).toHaveLength(0);
  });
});

describe('rejected token', () => {
  it('deny-lists the token and re-requests anonymously exactly once, without looping', async () => {
    const h = setup({}, { accessTokens: withToken('BAD') });
    expect(authHeader(h.run(PAGE))).toBe('Bearer BAD');
    h.respond(PAGE, { type: 'AnnotationPage', id: PAGE, service: SERVICE }); // 401 stub: no items
    await flush();
    expect(requests(h.dispatched)).toHaveLength(1);

    // The anonymous refetch carries no Authorization and bypasses the HTTP cache.
    const out = h.pre()[0](PAGE, {});
    expect(authHeader(out)).toBeUndefined();
    expect(out?.cache).toBe('no-store');
    h.respond(PAGE, { type: 'AnnotationPage', service: SERVICE });
    h.set({});
    await flush();
    expect(requests(h.dispatched)).toHaveLength(1);
  });

  it('ignores a stub for a page we sent no token for', async () => {
    const h = setup();
    h.run(PAGE);
    h.respond(PAGE, { type: 'AnnotationPage', service: SERVICE });
    await flush();
    expect(requests(h.dispatched)).toHaveLength(0);
  });

  it('falls back to one anonymous refetch when a request sent with a token failed without a body', async () => {
    const h = setup({}, { accessTokens: withToken('TKN') });
    expect(authHeader(h.run(PAGE))).toBe('Bearer TKN');
    h.respondError(PAGE);
    await flush();
    expect(requests(h.dispatched)).toHaveLength(1);
    expect(authHeader(h.pre()[0](PAGE, {}))).toBeUndefined();
    h.respondError(PAGE); // the anonymous request fails too: no loop
    await flush();
    expect(requests(h.dispatched)).toHaveLength(1);
  });

  it('keeps the token for an empty page without a service (v2 list without resources, bare {})', async () => {
    const h = setup({}, { accessTokens: withToken('TKN') });
    h.run(PAGE);
    h.respond(PAGE, { '@type': 'sc:AnnotationList' });
    await flush();
    expect(requests(h.dispatched)).toHaveLength(0);
    h.startFetch(PAGE);
    expect(authHeader(h.pre()[0](PAGE, {}))).toBe('Bearer TKN');
    h.respond(PAGE, {});
    await flush();
    expect(requests(h.dispatched)).toHaveLength(0);
  });

  it('treats an empty page that declares a service as an auth stub', async () => {
    const h = setup({}, { accessTokens: withToken('TKN') });
    h.run(PAGE);
    h.respond(PAGE, { type: 'AnnotationPage', items: [], service: SERVICE });
    await flush();
    expect(requests(h.dispatched)).toHaveLength(1);
  });

  it('is per page: one page refusing the token does not stop it reaching another', async () => {
    const other = 'https://iiif.example.org/annotations/canvas-1/page2.json';
    const h = setup({}, { accessTokens: withToken('TKN') });
    h.run(PAGE);
    h.run(other);
    h.respond(PAGE, { type: 'AnnotationPage', service: SERVICE });
    await flush();
    h.startFetch(PAGE);
    expect(authHeader(h.pre()[0](PAGE, {}))).toBeUndefined();
    h.startFetch(other);
    expect(authHeader(h.pre()[0](other, {}))).toBe('Bearer TKN');
  });

  it('re-requests every page in flight with the same rejected token anonymously', async () => {
    const other = 'https://iiif.example.org/annotations/canvas-1/page2.json';
    const h = setup({}, { accessTokens: withToken('TKN') });
    h.run(PAGE);
    h.run(other);
    h.respond(PAGE, { type: 'AnnotationPage', service: SERVICE });
    h.respond(other, { type: 'AnnotationPage', service: SERVICE });
    await flush();
    expect(requests(h.dispatched)).toHaveLength(2);
  });

  it('keeps a token whose response has items (including an empty list)', async () => {
    const h = setup({}, { accessTokens: withToken('TKN') });
    h.run(PAGE);
    h.respond(PAGE, { type: 'AnnotationPage', items: [] });
    await flush();
    h.startFetch(PAGE);
    expect(authHeader(h.pre()[0](PAGE, {}))).toBe('Bearer TKN');
  });
});

describe('sign-in handlers', () => {
  const page = { id: PAGE, service: SERVICE };

  it('offers sign-in for a trusted declared service when signed out', () => {
    setup();
    expect(getAnnotationAuth()!.canSignIn(page)).toBe(true);
  });

  it('offers nothing when no service is declared', () => {
    setup();
    expect(getAnnotationAuth()!.canSignIn({ id: PAGE })).toBe(false);
    expect(getAnnotationAuth()!.canSignIn({ id: PAGE, service: [{ '@id': 'x', profile: 'other' }] })).toBe(false);
  });

  it('offers nothing for an untrusted or cross-origin service in host-driven mode', () => {
    setup();
    const foreign = [{ '@id': 'https://evil.example.net/login', profile: 'http://iiif.io/api/auth/1/login', service: [{ '@id': 'https://evil.example.net/token', profile: 'http://iiif.io/api/auth/1/token' }] }];
    expect(getAnnotationAuth()!.canSignIn({ id: PAGE, service: foreign })).toBe(false);
    configureAnnotationAuth(undefined);
    setup({ trustedOrigins: [] });
    expect(getAnnotationAuth()!.canSignIn(page)).toBe(false);
  });

  it('hides sign-in once a usable token exists, shows it again when that token was rejected', async () => {
    const h = setup({}, { accessTokens: withToken('TKN') });
    expect(getAnnotationAuth()!.canSignIn(page)).toBe(false);
    h.run(PAGE);
    h.respond(PAGE, { service: SERVICE });
    await flush();
    expect(getAnnotationAuth()!.canSignIn(page)).toBe(true);
  });

  it('signing in again with the same token re-requests the page that refused it, once', async () => {
    const loginDriver = vi.fn().mockResolvedValue(undefined);
    const h = setup({ loginDriver }, { accessTokens: withToken('SAME') });
    h.run(PAGE);
    h.respond(PAGE, { type: 'AnnotationPage', service: SERVICE });
    await flush();
    expect(requests(h.dispatched)).toHaveLength(1); // anonymous retry
    h.respond(PAGE, { type: 'AnnotationPage', service: SERVICE });
    expect(getAnnotationAuth()!.canSignIn(page)).toBe(true);
    await getAnnotationAuth()!.signIn(page);
    await flush();
    expect(requests(h.dispatched)).toHaveLength(2);
  });

  it('offers nothing for a page on an untrusted origin that declares a trusted service', () => {
    setup({ trustedOrigins: ['https://iiif.example.org'] });
    expect(getAnnotationAuth()!.canSignIn({ id: 'https://third-party.example.net/p.json', service: SERVICE })).toBe(false);
  });

  it('falls back to the earlier declared service for a page stored as an error', async () => {
    const h = setup({}, { annotations: { 'canvas-1': { [PAGE]: { isFetching: false, json: { service: SERVICE } } } } });
    h.respondError(PAGE);
    expect(getAnnotationAuth()!.canSignIn({ id: PAGE })).toBe(true);
  });

  it('401 + service -> sign in -> login lands a token -> page re-requested', async () => {
    const loginDriver = vi.fn();
    const h = setup({ loginDriver }, { annotations: { 'canvas-1': { [PAGE]: { isFetching: false, json: { type: 'AnnotationPage', service: SERVICE } } } } });
    loginDriver.mockImplementation(async () => {
      h.set({ accessTokens: withToken('NEW') });
    });
    await getAnnotationAuth()!.signIn(page);
    await flush();
    expect(loginDriver).toHaveBeenCalledWith(
      { authServiceId: LOGIN_SERVICE, profile: 'http://iiif.io/api/auth/1/login', tokenServiceId: TOKEN_SERVICE },
      h.store.dispatch,
    );
    expect(requests(h.dispatched)).toHaveLength(1);
  });

  it('sign-in swallows a failed login and does nothing for an untrusted page', async () => {
    const loginDriver = vi.fn().mockRejectedValue(new Error('closed'));
    setup({ loginDriver });
    await expect(getAnnotationAuth()!.signIn(page)).resolves.toBeUndefined();
    loginDriver.mockClear();
    await getAnnotationAuth()!.signIn({ id: PAGE });
    expect(loginDriver).not.toHaveBeenCalled();
  });
});

describe('silent session reuse', () => {
  let acquire: Mock<(d: DiscoveredAuthService, dispatch: (a: unknown) => void) => Promise<boolean>>;
  beforeEach(() => {
    acquire = vi.fn(() => Promise.resolve(false));
  });

  it('tries the token service once per service for a page declaring a trusted service', () => {
    const h = makeStore({ annotations: { 'canvas-1': { [PAGE]: { isFetching: false, json: { items: [], service: SERVICE } } } } });
    wireMiradorAnnotationAuth(h.store, { sessionAcquirer: acquire });
    h.set({});
    expect(acquire).toHaveBeenCalledTimes(1);
  });

  it('is skipped for a page on an untrusted origin', () => {
    const h = makeStore({ annotations: { 'canvas-1': { 'https://third-party.example.net/p.json': { isFetching: false, json: { items: [], service: SERVICE } } } } });
    wireMiradorAnnotationAuth(h.store, { sessionAcquirer: acquire, trustedOrigins: ['https://iiif.example.org'] });
    expect(acquire).not.toHaveBeenCalled();
  });

  it('is skipped when silent is false or no service is declared', () => {
    const a = makeStore({ annotations: { 'canvas-1': { [PAGE]: { isFetching: false, json: { items: [], service: SERVICE } } } } });
    wireMiradorAnnotationAuth(a.store, { sessionAcquirer: acquire, silent: false });
    const b = makeStore({ annotations: { 'canvas-1': { [PAGE]: { isFetching: false, json: { items: [] } } } } });
    wireMiradorAnnotationAuth(b.store, { sessionAcquirer: acquire });
    expect(acquire).not.toHaveBeenCalled();
  });
});
