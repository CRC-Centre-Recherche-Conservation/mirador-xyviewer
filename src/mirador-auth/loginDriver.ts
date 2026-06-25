/**
 * Browser-side IIIF Auth 1.0 login driving. Replicates the minimal token-service
 * iframe+postMessage flow (rather than mounting Mirador's React `AccessTokenSender`
 * imperatively) so it works from a plain `configureDatasetAuth` callback and stays
 * fully unit-testable. The resulting token is still handed to Mirador via its own
 * `resolveAccessTokenRequest` action so it lands in Mirador's shared store.
 */
import { resolveAccessTokenRequest } from 'mirador';
import { originOf } from './resolveToken';
import type { DiscoveredAuthService } from './resolveToken';

/** Payload posted back by an IIIF Auth token service. */
export interface AccessTokenMessage {
  accessToken?: string;
  expiresIn?: number;
  error?: string;
  [key: string]: unknown;
}

/** Options for {@link requestAccessTokenViaIframe}. */
export interface RequestAccessTokenOptions {
  /** Reject after this many ms with no reply. Default 30000. */
  timeoutMs?: number;
  /** Correlation id echoed by the token service. Default: the token service URL. */
  messageId?: string;
}

/**
 * Load the token service in a hidden iframe and resolve with the access-token message
 * it posts back (the browser sends the access cookie with the iframe request, so this
 * only succeeds after the user has authenticated at the access service). Rejects on
 * timeout. Always removes the iframe and listener.
 */
export function requestAccessTokenViaIframe(
  tokenServiceUrl: string,
  options: RequestAccessTokenOptions = {},
): Promise<AccessTokenMessage> {
  const { timeoutMs = 30_000, messageId = tokenServiceUrl } = options;
  // The token service replies from its own origin; reject anything else (anti-injection):
  // we open a manifest-controlled login window whose opener is us, so a forged postMessage
  // with the (manifest-knowable) messageId must not be accepted unless it comes from the
  // token service origin.
  const expectedOrigin = originOf(tokenServiceUrl);

  return new Promise<AccessTokenMessage>((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    const sep = tokenServiceUrl.includes('?') ? '&' : '?';
    iframe.src =
      `${tokenServiceUrl}${sep}origin=${encodeURIComponent(window.location.origin)}` +
      `&messageId=${encodeURIComponent(messageId)}`;

    const cleanup = (): void => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      iframe.remove();
    };

    const onMessage = (event: MessageEvent): void => {
      if (!expectedOrigin || event.origin !== expectedOrigin) return;
      const data = event.data as AccessTokenMessage | undefined;
      if (!data || typeof data !== 'object' || data.messageId !== messageId) return;
      cleanup();
      resolve(data);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`IIIF Auth token request timed out: ${tokenServiceUrl}`));
    }, timeoutMs);

    window.addEventListener('message', onMessage);
    document.body.appendChild(iframe);
  });
}

/** Access-service profiles that require the user to act in an opened window. */
const INTERACTIVE_PROFILES = new Set([
  'http://iiif.io/api/auth/1/login',
  'http://iiif.io/api/auth/1/clickthrough',
  'http://iiif.io/api/auth/0/login',
  'http://iiif.io/api/auth/0/clickthrough',
]);

/** A minimal opened-window handle — `closed` is readable cross-origin. */
type OpenedWindow = { closed: boolean };

/**
 * Default access-window opener: a small CENTERED popup (passing width/height makes the
 * browser open a popup rather than a full tab). The fixed name reuses one popup if the user
 * clicks Sign in again instead of stacking tabs.
 */
function openLoginPopup(url: string): OpenedWindow | null {
  const width = 480;
  const height = 620;
  const left = window.screenX + Math.max(0, ((window.outerWidth || width) - width) / 2);
  const top = window.screenY + Math.max(0, ((window.outerHeight || height) - height) / 2);
  return window.open(url, 'iiif-auth-login', `popup,width=${width},height=${height},left=${left},top=${top}`);
}

/** Dependencies for {@link runIiifAuthLogin}, injectable for testing. */
export interface RunLoginDeps {
  /** Open the access (login) window. Default: `window.open(url, '_blank')`. */
  openWindow?: (url: string) => OpenedWindow | null;
  /** Poll interval (ms) for detecting the login window closing. Default 500. */
  pollIntervalMs?: number;
  /** Max wait (ms) for the login window to close. Default 300000 (5 min). */
  windowTimeoutMs?: number;
  /** Token-request timeout (ms), forwarded to the iframe request. */
  tokenTimeoutMs?: number;
}

/** Resolve once `win.closed` is true, polling at `pollIntervalMs`; reject after `windowTimeoutMs`. */
function waitForWindowClose(win: OpenedWindow, deps: RunLoginDeps): Promise<void> {
  const { pollIntervalMs = 500, windowTimeoutMs = 300_000 } = deps;
  return new Promise<void>((resolve, reject) => {
    const poll = setInterval(() => {
      if (win.closed) {
        clearInterval(poll);
        clearTimeout(timeout);
        resolve();
      }
    }, pollIntervalMs);
    const timeout = setTimeout(() => {
      clearInterval(poll);
      reject(new Error('IIIF Auth login window was not closed in time'));
    }, windowTimeoutMs);
  });
}

/**
 * Try to obtain a token from an EXISTING session, without prompting: hit the token service
 * (which returns a token only if the access cookie is already valid) and, if it yields one,
 * land it in Mirador's store. Returns whether a token was acquired. This is the silent
 * re-acquisition that restores access after a reload (the cookie persists; the short-lived
 * token is re-derived) — exactly how a viewer keeps IIIF Auth alive without a re-login.
 * Never throws: a timeout / no-token reply just means "no valid session" → `false`.
 */
export async function acquireTokenViaSession(
  discovered: DiscoveredAuthService,
  dispatch: (action: unknown) => void,
  deps: { tokenTimeoutMs?: number } = {},
): Promise<boolean> {
  const { authServiceId, tokenServiceId } = discovered;
  try {
    const message = await requestAccessTokenViaIframe(tokenServiceId, {
      timeoutMs: deps.tokenTimeoutMs ?? 8_000,
    });
    if (message.accessToken) {
      dispatch(resolveAccessTokenRequest(authServiceId, tokenServiceId, message));
      return true;
    }
  } catch {
    // timeout / no reply → treat as "no session"
  }
  return false;
}

/**
 * Drive a IIIF Auth 1.0 login for a declared access service and land the token in
 * Mirador's store. For an interactive profile (login/clickthrough) open the access window
 * SYNCHRONOUSLY from the user gesture — so popup blockers allow it — and wait for the user
 * to finish; for kiosk/external go straight to the token service. Silent session reuse is
 * NOT retried here: it is handled upstream ({@link acquireTokenViaSession} via the wire's
 * `interactive === false` path, and DatasetBody's one-shot silent attempt before Sign in).
 * Awaiting it before `window.open` would consume the gesture and get the popup blocked.
 * Rejects if the window or token times out.
 */
export async function runIiifAuthLogin(
  discovered: DiscoveredAuthService,
  dispatch: (action: unknown) => void,
  deps: RunLoginDeps = {},
): Promise<void> {
  const { authServiceId, profile, tokenServiceId } = discovered;

  if (INTERACTIVE_PROFILES.has(profile)) {
    const openWindow = deps.openWindow ?? openLoginPopup;
    const win = openWindow(authServiceId);
    // Fail fast on a blocked popup instead of falling through to a ~30s token-iframe timeout.
    if (!win) throw new Error('IIIF Auth login window was blocked — allow popups for this site');
    await waitForWindowClose(win, deps);
  }

  const message = await requestAccessTokenViaIframe(tokenServiceId, { timeoutMs: deps.tokenTimeoutMs });
  dispatch(resolveAccessTokenRequest(authServiceId, tokenServiceId, message));
}
