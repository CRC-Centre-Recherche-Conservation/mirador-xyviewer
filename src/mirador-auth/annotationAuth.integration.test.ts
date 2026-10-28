/**
 * Whole chain: a mini Mirador (store + the annotation saga's fetch/preprocessor behaviour) +
 * wireMiradorAnnotationAuth + the plugin's sign-in selector, against a server that filters
 * annotation pages per reader.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('mirador', () => ({
  getAccessTokens: (s: { accessTokens?: unknown }) => s?.accessTokens ?? {},
  updateConfig: (config: unknown) => ({ type: 'UPDATE_CONFIG', config }),
  requestAnnotation: (targetId: string, annotationId: string) => ({ type: 'REQUEST_ANNOTATION', targetId, annotationId }),
  resolveAccessTokenRequest: (_a: string, t: string, json: { accessToken: string }) => ({ type: 'TOKEN', t, json }),
  addWindow: vi.fn(),
  SanitizedHtml: () => null,
}));

import { wireMiradorAnnotationAuth } from './annotationAuth';
import { configureAnnotationAuth, getAnnotationAuth } from '../services/annotationAuth';
import { findSignInPage } from '../plugin/ConnectedScientificAnnotationPlugin';

const PAGE = 'https://iiif.example.org/annotations/c1/page.json';
const TOKEN_SERVICE = 'https://iiif.example.org/auth/token';
const SERVICE = [
  {
    id: 'https://iiif.example.org/auth/login',
    type: 'AuthCookieService1',
    profile: 'http://iiif.io/api/auth/1/login',
    service: [{ id: TOKEN_SERVICE, type: 'AuthTokenService1', profile: 'http://iiif.io/api/auth/1/token' }],
  },
];
const item = (n: number) => ({ id: `urn:a:${n}`, type: 'Annotation', motivation: 'commenting', body: { type: 'TextualBody', value: `n${n}` }, target: 'c1' });

/* eslint-disable @typescript-eslint/no-explicit-any -- loose mini-store shapes */
type Mode = '401' | 'anonymous-200' | 'open';

/** Mini Mirador: store + REQUEST_ANNOTATION saga (preprocessors, fetch, 401 stored as success). */
function mirador(mode: Mode) {
  let state: Record<string, any> = { config: { requests: { preprocessors: [] } }, annotations: {}, accessTokens: {} };
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const fetched: Array<{ url: string; auth?: string }> = [];
  const server = (auth: string | undefined): { status: number; body: unknown } => {
    if (mode === 'open') return { status: 200, body: { type: 'AnnotationPage', id: PAGE, items: [item(1)] } };
    if (auth === 'Bearer GOOD') return { status: 200, body: { type: 'AnnotationPage', id: PAGE, items: [item(1), item(2)] } };
    if (mode === '401') return { status: 401, body: { type: 'AnnotationPage', id: PAGE, service: SERVICE } };
    return { status: 200, body: { type: 'AnnotationPage', id: PAGE, items: [item(1)], service: SERVICE } };
  };
  const runSaga = async (targetId: string, url: string) => {
    let init: RequestInit = {};
    for (const p of state.config.requests.preprocessors) init = p(url, init) || init;
    const auth = (init.headers as Record<string, string> | undefined)?.Authorization;
    fetched.push({ url, auth });
    const { body } = server(auth);
    state = { ...state, annotations: { ...state.annotations, [targetId]: { [url]: { id: url, isFetching: false, json: body } } } };
    notify();
  };
  const store = {
    getState: () => state,
    subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
    dispatch: (a: any) => {
      if (a.type === 'UPDATE_CONFIG') state = { ...state, config: { requests: { ...state.config.requests, ...a.config.requests } } };
      if (a.type === 'TOKEN') state = { ...state, accessTokens: { ...state.accessTokens, [a.t]: { json: a.json } } };
      if (a.type === 'REQUEST_ANNOTATION') {
        state = { ...state, annotations: { ...state.annotations, [a.targetId]: { [a.annotationId]: { id: a.annotationId, isFetching: true } } } };
        notify();
        void runSaga(a.targetId, a.annotationId);
        return a;
      }
      notify();
      return a;
    },
  };
  return { store, fetched, state: () => state };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const itemsOf = (m: ReturnType<typeof mirador>) => (m.state().annotations.c1[PAGE].json.items ?? []).length;
const loginDriver = (m: ReturnType<typeof mirador>) =>
  vi.fn(async (_d: unknown, dispatch: (a: unknown) => void) => {
    dispatch({ type: 'TOKEN', t: TOKEN_SERVICE, json: { accessToken: 'GOOD' } });
    void m;
  });

afterEach(() => configureAnnotationAuth(undefined));

describe('annotation auth, whole chain', () => {
  it.each<Mode>(['401', 'anonymous-200'])('%s: offers Sign in, then a login yields the full list', async (mode) => {
    const m = mirador(mode);
    const driver = loginDriver(m);
    wireMiradorAnnotationAuth(m.store, { loginDriver: driver, silent: false });
    m.store.dispatch({ type: 'REQUEST_ANNOTATION', targetId: 'c1', annotationId: PAGE });
    await flush();

    expect(m.fetched).toEqual([{ url: PAGE, auth: undefined }]);
    const page = findSignInPage(m.state().annotations.c1);
    expect(page).toBeDefined();
    expect(itemsOf(m)).toBe(mode === '401' ? 0 : 1);

    await getAnnotationAuth()!.signIn(page!);
    await flush();

    expect(driver).toHaveBeenCalledTimes(1);
    expect(m.fetched).toHaveLength(2);
    expect(m.fetched[1]).toEqual({ url: PAGE, auth: 'Bearer GOOD' });
    expect(itemsOf(m)).toBe(2);
    // Signed in: the notice goes away.
    expect(findSignInPage(m.state().annotations.c1)).toBeUndefined();
  });

  it('a reader already signed in gets the full list on the first request', async () => {
    const m = mirador('401');
    m.store.dispatch({ type: 'TOKEN', t: TOKEN_SERVICE, json: { accessToken: 'GOOD' } });
    wireMiradorAnnotationAuth(m.store, { silent: false });
    m.store.dispatch({ type: 'REQUEST_ANNOTATION', targetId: 'c1', annotationId: PAGE });
    await flush();
    expect(m.fetched).toEqual([{ url: PAGE, auth: 'Bearer GOOD' }]);
    expect(itemsOf(m)).toBe(2);
    expect(findSignInPage(m.state().annotations.c1)).toBeUndefined();
  });

  it('a stale token is dropped after one anonymous refetch and Sign in is offered', async () => {
    const m = mirador('401');
    m.store.dispatch({ type: 'TOKEN', t: TOKEN_SERVICE, json: { accessToken: 'STALE' } });
    wireMiradorAnnotationAuth(m.store, { silent: false });
    m.store.dispatch({ type: 'REQUEST_ANNOTATION', targetId: 'c1', annotationId: PAGE });
    await flush();
    await flush();
    expect(m.fetched).toEqual([
      { url: PAGE, auth: 'Bearer STALE' },
      { url: PAGE, auth: undefined },
    ]);
    expect(findSignInPage(m.state().annotations.c1)).toBeDefined();
  });

  it('an open server declaring no service: nothing offered, nothing refetched', async () => {
    const m = mirador('open');
    wireMiradorAnnotationAuth(m.store, { silent: false });
    m.store.dispatch({ type: 'REQUEST_ANNOTATION', targetId: 'c1', annotationId: PAGE });
    await flush();
    expect(m.fetched).toHaveLength(1);
    expect(findSignInPage(m.state().annotations.c1)).toBeUndefined();
  });
});
