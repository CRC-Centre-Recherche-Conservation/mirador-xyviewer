# IIIF Auth integration (developer guide)

How to unlock **access-controlled datasets/spectra** in mirador-xyviewer by reusing
Mirador's own IIIF Authorization session — so a single sign-in unlocks protected images
*and* their datasets.

> Targets **IIIF Authorization Flow 1.0/0.x**, matching the client bundled in Mirador 4.
> Auth 2.0 (probe service) is out of scope — see [Limitations](#limitations).

- [Why](#why)
- [Quick start](#quick-start)
- [What it does](#what-it-does)
- [Trust model (read this)](#trust-model)
- [Split content/auth domains](#split-contentauth-domains)
- [API reference](#api-reference)
- [Lower-level escape hatches](#lower-level-escape-hatches)
- [Server-side prerequisites (CORS)](#server-side-prerequisites-cors)
- [What the user sees](#what-the-user-sees)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)

## Why

Manifests, images and their `info.json` go through **Mirador**, which already implements
the IIIF Auth 1.0 flow (cookie + access-token services) and stores the resulting token.
**Dataset/spectrum files, however, are fetched by this plugin directly** — so by default
they don't carry that auth, and an access-controlled dataset returns `401/403`.

The `mirador-xyviewer/mirador-auth` subexport bridges the two: it makes dataset fetches
**reuse the token Mirador already holds**, and lets the dataset "Sign in" affordance
**start a login** for datasets that have no visible image. No second login, no parallel
token store.

> It is an **optional** subexport: only this entry imports Mirador's auth-state shape, so
> the core plugin stays decoupled. Import it only if you want this behaviour.

## Quick start

```typescript
import Mirador from 'mirador';
import { scientificAnnotationPlugin } from 'mirador-xyviewer';
import { wireMiradorDatasetAuth } from 'mirador-xyviewer/mirador-auth';

const { store } = Mirador.viewer(config, [scientificAnnotationPlugin]);

// Once, at setup. `trustedOrigins` is a REQUIRED allowlist (anti-leak); no wildcard.
const teardown = wireMiradorDatasetAuth(store, {
  trustedOrigins: ['https://data.lab.example'],
});

// `teardown()` unregisters everything (handy for tests / hot reload).
```

That's it. Datasets on a trusted origin now load with the reused token, and protected
datasets get a working "Sign in" button.

## What it does

`wireMiradorDatasetAuth` wires two sides:

**Read side — token reuse.** On every dataset fetch, it attaches
`Authorization: Bearer <token>` when a Mirador access token matches the content origin:

- **host-inheritance** — a token whose token-service origin equals the dataset origin
  (the common single-institution case); or
- **declared service** — the token service the resource *declares* in its IIIF auth
  `service` (the spec-correct path, which also works cross-origin — see below).

If no token matches, the fetch keeps the secure default (`credentials: 'omit'`, no header).

**Write side — login trigger.** When a dataset fetch fails with `401/403`, the panel shows
a quiet **protected record** with a **Sign in** button. Clicking it (for a resource that
declares its auth `service`) opens the IIIF Auth login window, retrieves the token into
Mirador's store, and **auto-retries** the fetch. Datasets that declare no (trusted) auth
service fall back to a manual "Open resource" → "Try again" path.

## Trust model

Security is gated on `trustedOrigins`. Nothing is attached or sent to an origin you don't
list. Specifically:

| Rule | Behaviour |
|---|---|
| **Allowlist required** | A token/cookie is attached only to an origin in `trustedOrigins`. No wildcard. |
| **https only** | Cleartext `http://` is refused (a bearer token must not cross plaintext), except loopback (`localhost`/`127.0.0.1`) for local dev. |
| **Canonical origins** | Entries are normalized (case, default port, trailing slash, trailing dot); URLs carrying userinfo (`https://a@b/`) are rejected. |
| **Anti-exfiltration** | For a *declared* cross-origin service, **both** the content origin **and** the declared token-service origin must be trusted — a malicious manifest can't name an unrelated token service to exfiltrate a token. |
| **Origin-checked token** | The token-service `postMessage` reply during login is accepted only from the token-service origin. |
| **Gated login** | A login (popup + token storage) is driven only to a trusted, https auth/token origin — never to an arbitrary manifest-declared host. |

These gates are independent of the UI: hiding the Sign-in button is a convenience; the
read/login/store paths enforce the gates themselves.

## Split content/auth domains

The headline of the *declared-service* path is the cross-origin case: dataset content on
one host, the IIIF auth/token service on another (e.g. spectra on `data.lab`, login on
`auth.museum`). Trust **both** origins:

```typescript
wireMiradorDatasetAuth(store, {
  trustedOrigins: ['https://data.lab.example', 'https://auth.example'],
});
```

If only the content origin is trusted, the declared path is skipped (the token-service
origin gate fails) and the dataset falls back to the protected-record notice.

For this to resolve, the dataset resource must declare its IIIF auth `service` (the access
service nesting its `…/auth/1/token` service), and the user must already hold that token in
Mirador (e.g. from a protected image) — or start a login via Sign in.

## API reference

### `wireMiradorDatasetAuth(store, options)`

From `mirador-xyviewer/mirador-auth`. Registers the read provider **and** the login
handler; returns a teardown that clears both.

```typescript
function wireMiradorDatasetAuth(
  store: { getState(): unknown; dispatch(action: unknown): unknown },  // Mirador's Redux store
  options: WireMiradorDatasetAuthOptions,
): () => void;

interface WireMiradorDatasetAuthOptions {
  /** REQUIRED allowlist of content (and declared auth) origins. Bare origins; no wildcard. */
  trustedOrigins: string[];
  /** Fall back to `credentials: 'include'` (browser cookies) for trusted https origins with no token. Default false. */
  cookie?: boolean;
  /** Override the login driver (advanced / testing). Defaults to the built-in IIIF Auth 1.0 flow. */
  loginDriver?: (discovered, dispatch) => Promise<void>;
}
```

### `resolveMiradorToken(state, options)`

From `mirador-xyviewer/mirador-auth`. The shared resolver — the single place that knows
Mirador's token-store shape. Useful if you drive requests yourself.

```typescript
function resolveMiradorToken(
  state: unknown,                              // Mirador store state
  options: { url: string; trustedOrigins: string[]; service?: unknown },
): string | undefined;                         // the bearer token, or undefined
```

## Lower-level escape hatches

If you're not on Mirador's store (custom auth layer), or want manual control, the **core**
package exposes the seams `wireMiradorDatasetAuth` builds on:

```typescript
import { configureDatasetRequests, configureDatasetAuth } from 'mirador-xyviewer';

// Read side: supply credentials/headers per dataset URL (sync or async).
// `ctx.service` carries the resource's declared IIIF auth service when present.
configureDatasetRequests((url, ctx) => {
  const token = myTokenFor(url, ctx?.service);
  return token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
});

// Write side: run your own login on Sign-in. Return a Promise → the panel auto-retries
// when it resolves. The optional `canStartLogin` predicate gates the Sign-in button.
configureDatasetAuth(
  async (body) => { await myLogin(body); },
  { canStartLogin: (body) => Boolean(body.service) },
);
```

`wireMiradorDatasetAuth` takes exclusive ownership of these slots — use it **or** the
manual calls, not both. Pass `undefined` to reset either.

**Per-component override.** When you render `<DatasetBody>` / `<AnnotationBodyRenderer>`
yourself, the `requestOptions` and `onAuthRequired` props take precedence over the global
registries.

**Types** (from `mirador-xyviewer`): `DatasetRequestOptions`, `DatasetRequestContext`,
`DatasetRequestProvider`, `DatasetAuthHandler`, `IiifService`.

## Server-side prerequisites (CORS)

The plugin fetches datasets cross-origin, so the data host must cooperate:

- **Bearer token** — a cross-origin request carrying `Authorization` is not a simple
  request; it triggers a `OPTIONS` preflight. The server must return
  `Access-Control-Allow-Headers: Authorization` (and `Access-Control-Allow-Origin`).
- **Cookie** (`cookie: true`) — additionally requires
  `Access-Control-Allow-Credentials: true` and an explicit (non-`*`)
  `Access-Control-Allow-Origin`.

## What the user sees

- A protected dataset is shown as a quiet **protected record** (a sealed readout, not a red
  error) naming the host, with **Sign in** / **Open resource** / **Try again**.
- Clicking **Sign in** opens the login window; while it's open the button shows
  **"Signing in…"** (disabled) and the copy points to the new window. On success the
  dataset loads automatically.
- If the dataset declares no (trusted) auth service, no Sign-in button is shown — only the
  manual "Open resource" + "Try again" fallback.
- The login window opens directly from the click, so popup blockers allow it.

## Limitations

- **IIIF Auth 2.0 (probe service)** — not supported: the bundled Mirador 4 implements
  1.0/0.x only. A 2.0 service should be detected and degraded to the manual
  `onAuthRequired` affordance.
- **Auth on manifest / annotations / content-search** — not implemented (an optional,
  deferred phase; this is an area the IIIF spec itself has paused). Only image `info.json`
  (handled by Mirador) and datasets are covered.
- **Cache** — the dataset cache is keyed by URL only (one auth context per URL per
  session), which holds for a viewer.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Token not attached to a dataset | Its origin isn't in `trustedOrigins`, isn't `https`, or no matching token is in Mirador's store yet (sign in for the image first). |
| Cross-host dataset stays locked | Add **both** the content origin and the declared token-service origin to `trustedOrigins`; the resource must declare its auth `service`. |
| "Sign in" button missing | The resource declares no (trusted) auth service — by design; use "Open resource". |
| Nothing happens / `Login window was blocked` | Allow popups for the site (the popup is opened from your click). |
| `401` after signing in | Server CORS: it must allow the `Authorization` header (preflight); or the token-service origin isn't trusted. |
| `http` origin ignored (a console warning fires) | Bearer tokens aren't sent over cleartext — use `https` (loopback excepted). |

---

See also: [IIIF Annotations](./IIIF-ANNOTATIONS.md#protected-datasets-iiif-auth) ·
[Developer Guide](./DEVELOPER-GUIDE.md) · [Mirador Configuration](./MIRADOR-CONFIGURATION.md)
