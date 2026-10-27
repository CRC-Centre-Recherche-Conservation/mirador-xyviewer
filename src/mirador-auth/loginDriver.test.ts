import { describe, it, expect, vi, afterEach } from 'vitest';

// Stub Mirador's action creator so we can assert what gets dispatched.
vi.mock('mirador', () => ({
  resolveAccessTokenRequest: (authServiceId: string, tokenServiceId: string, json: unknown) => ({
    type: 'mirador/RECEIVE_ACCESS_TOKEN',
    authServiceId,
    tokenServiceId,
    json,
  }),
}));

import {
  acquireTokenViaSession,
  requestAccessTokenViaIframe,
  runIiifAuthLogin,
  withOrigin,
} from './loginDriver';

const TOKEN_URL = 'https://auth.museum/token';
const ENC_ORIGIN = encodeURIComponent(window.location.origin);

afterEach(() => {
  vi.useRealTimers();
  document.querySelectorAll('iframe').forEach((f) => f.remove());
});

describe('requestAccessTokenViaIframe', () => {
  it('resolves with the token payload on a matching postMessage', async () => {
    const p = requestAccessTokenViaIframe(TOKEN_URL);
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { messageId: TOKEN_URL, accessToken: 'TKN', expiresIn: 3600 },
        origin: 'https://auth.museum',
      }),
    );
    await expect(p).resolves.toMatchObject({ accessToken: 'TKN', expiresIn: 3600 });
  });

  it('appends a hidden iframe carrying origin + messageId, and removes it on resolve', async () => {
    const p = requestAccessTokenViaIframe(TOKEN_URL);
    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute('src')).toBe(
      `${TOKEN_URL}?origin=${ENC_ORIGIN}&messageId=${encodeURIComponent(TOKEN_URL)}`,
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { messageId: TOKEN_URL, accessToken: 'TKN' },
        origin: 'https://auth.museum',
      }),
    );
    await p;
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('ignores a correctly-correlated message from the WRONG origin (anti-injection)', async () => {
    vi.useFakeTimers();
    const p = requestAccessTokenViaIframe(TOKEN_URL, { timeoutMs: 1000 });
    const assertion = expect(p).rejects.toThrow(/timed out/i);
    // Right messageId (knowable from the manifest) but a foreign origin — e.g. the
    // attacker popup we opened. Must be rejected, not accepted as a token.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { messageId: TOKEN_URL, accessToken: 'EVIL' },
        origin: 'https://evil.example',
      }),
    );
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('ignores malformed message data (null / string / number)', async () => {
    vi.useFakeTimers();
    const p = requestAccessTokenViaIframe(TOKEN_URL, { timeoutMs: 1000 });
    const assertion = expect(p).rejects.toThrow(/timed out/i);
    for (const bad of [null, 'string', 42]) {
      window.dispatchEvent(new MessageEvent('message', { data: bad, origin: 'https://auth.museum' }));
    }
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('ignores a message whose messageId does not match', async () => {
    vi.useFakeTimers();
    const p = requestAccessTokenViaIframe(TOKEN_URL, { timeoutMs: 1000 });
    const assertion = expect(p).rejects.toThrow(/timed out/i);
    window.dispatchEvent(new MessageEvent('message', { data: { messageId: 'other', accessToken: 'X' } }));
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('rejects (and cleans up) on timeout', async () => {
    vi.useFakeTimers();
    const p = requestAccessTokenViaIframe(TOKEN_URL, { timeoutMs: 500 });
    const assertion = expect(p).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
    expect(document.querySelector('iframe')).toBeNull();
  });
});

describe('acquireTokenViaSession', () => {
  const discovered = {
    authServiceId: 'https://auth.museum/login',
    profile: 'http://iiif.io/api/auth/1/login',
    tokenServiceId: TOKEN_URL,
  };

  it('dispatches and resolves true when the token service returns a token (valid session)', async () => {
    const dispatch = vi.fn();
    const p = acquireTokenViaSession(discovered, dispatch);
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { messageId: TOKEN_URL, accessToken: 'TKN' },
        origin: 'https://auth.museum',
      }),
    );
    await expect(p).resolves.toBe(true);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ json: expect.objectContaining({ accessToken: 'TKN' }) }),
    );
  });

  it('resolves false without dispatching when the token service returns no token (no session)', async () => {
    const dispatch = vi.fn();
    const p = acquireTokenViaSession(discovered, dispatch);
    window.dispatchEvent(
      new MessageEvent('message', { data: { messageId: TOKEN_URL }, origin: 'https://auth.museum' }),
    );
    await expect(p).resolves.toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('resolves false on timeout (token service silent) — never throws', async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const p = acquireTokenViaSession(discovered, dispatch, { tokenTimeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(500);
    await expect(p).resolves.toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('runIiifAuthLogin', () => {
  const interactive = {
    authServiceId: 'https://auth.museum/login',
    profile: 'http://iiif.io/api/auth/1/login',
    tokenServiceId: TOKEN_URL,
  };
  const external = {
    authServiceId: 'https://auth.museum/ext',
    profile: 'http://iiif.io/api/auth/1/external',
    tokenServiceId: TOKEN_URL,
  };

  it('opens the access window synchronously from the gesture, then requests + dispatches the token', async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const win = { closed: false };
    const openWindow = vi.fn(() => win);

    const p = runIiifAuthLogin(interactive, dispatch, { openWindow, pollIntervalMs: 10, tokenTimeoutMs: 5000 });
    // The window opens directly from the call — no awaited silent pre-attempt that would
    // consume the user gesture and get the popup blocked.
    expect(openWindow).toHaveBeenCalledWith(`https://auth.museum/login?origin=${ENC_ORIGIN}`);

    win.closed = true; // user finished authenticating; the login page closed
    await vi.advanceTimersByTimeAsync(10); // poll detects close → token iframe is set up

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { messageId: TOKEN_URL, accessToken: 'TKN' },
        origin: 'https://auth.museum',
      }),
    );
    await p;

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenServiceId: TOKEN_URL,
        json: expect.objectContaining({ accessToken: 'TKN' }),
      }),
    );
  });

  it('opens a centered popup window (not a new tab) by default', async () => {
    vi.useFakeTimers();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ closed: true } as Window);
    const dispatch = vi.fn();

    const p = runIiifAuthLogin(interactive, dispatch, { pollIntervalMs: 10, tokenTimeoutMs: 5000 });
    // The popup opens synchronously from the gesture (no awaited silent pre-attempt).
    expect(openSpy).toHaveBeenCalledWith(
      `https://auth.museum/login?origin=${ENC_ORIGIN}`,
      'iiif-auth-login',
      expect.stringContaining('popup'),
    );

    await vi.advanceTimersByTimeAsync(10); // window already "closed" → poll resolves → token iframe
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { messageId: TOKEN_URL, accessToken: 'TKN' },
        origin: 'https://auth.museum',
      }),
    );
    await p;
    openSpy.mockRestore();
  });

  it('rejects fast when the interactive login window is blocked (popup blocker)', async () => {
    const dispatch = vi.fn();
    await expect(
      runIiifAuthLogin(interactive, dispatch, { openWindow: () => null, tokenTimeoutMs: 50 }),
    ).rejects.toThrow(/blocked/i);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('skips the window for non-interactive (external/kiosk) profiles and dispatches the token', async () => {
    const dispatch = vi.fn();
    const openWindow = vi.fn();
    const p = runIiifAuthLogin(external, dispatch, { openWindow });
    expect(openWindow).not.toHaveBeenCalled();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { messageId: TOKEN_URL, accessToken: 'EXT' },
        origin: 'https://auth.museum',
      }),
    );
    await p;

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ json: expect.objectContaining({ accessToken: 'EXT' }) }),
    );
  });
});

describe('withOrigin', () => {
  it('adds ? when there is no query', () => {
    expect(withOrigin('https://a.example/login')).toBe(`https://a.example/login?origin=${ENC_ORIGIN}`);
  });

  it('adds & when a query exists and keeps the fragment last', () => {
    expect(withOrigin('https://a.example/t?x=1#f')).toBe(`https://a.example/t?x=1&origin=${ENC_ORIGIN}#f`);
  });

  it('replaces an existing origin param, including a percent-encoded key', () => {
    expect(withOrigin('https://a.example/t?origin=https%3A%2F%2Fevil&x=1')).toBe(
      `https://a.example/t?x=1&origin=${ENC_ORIGIN}`,
    );
    expect(withOrigin('https://a.example/t?%6Frigin=evil')).toBe(`https://a.example/t?origin=${ENC_ORIGIN}`);
  });

  it('adds extra params and replaces an existing one of the same key', () => {
    expect(withOrigin('https://a.example/t?messageId=x#f', { messageId: 'a b' })).toBe(
      `https://a.example/t?origin=${ENC_ORIGIN}&messageId=a+b#f`,
    );
  });

  it('falls back to string append for a non-absolute URL', () => {
    expect(withOrigin('/login?x=1#f')).toBe(`/login?x=1&origin=${ENC_ORIGIN}#f`);
    expect(withOrigin('/login')).toBe(`/login?origin=${ENC_ORIGIN}`);
  });
});

describe('token iframe URL with an existing query', () => {
  it('carries exactly one origin and one messageId, fragment last', () => {
    const url = 'https://auth.museum/token?x=1&origin=evil&messageId=old#f';
    const p = requestAccessTokenViaIframe(url, { timeoutMs: 100, messageId: 'm' });
    const src = new URL(document.querySelector('iframe')!.getAttribute('src')!);
    expect(src.searchParams.getAll('origin')).toEqual([window.location.origin]);
    expect(src.searchParams.getAll('messageId')).toEqual(['m']);
    expect(src.searchParams.get('x')).toBe('1');
    expect(src.hash).toBe('#f');
    p.catch(() => {});
  });
});
