/**
 * Demo-only IIIF Auth simulation — one manifest federating several auth services
 * (see demo-auth-config.ts for the topology). Real data throughout, via the `/lab` proxy.
 * NOT part of the published plugin.
 *
 * Two mechanisms, because images and datasets fetch differently:
 *   - protected spectra (DATASETS) declare their auth service here; the plugin
 *     (`wireMiradorDatasetAuth`) shows "Sign in", runs that service's login, and attaches a
 *     bearer token;
 *   - protected maXRF IMAGES are handled by MIRADOR — their info.json returns 401 declaring
 *     the image auth service, so Mirador drives its own (cookie) login on the map.
 *
 * Both a login window's cookie AND its token are scoped to the SAME service id, so the
 * `crc-lab` service guards its map2 image (cookie) and its spectra (bearer) under ONE login:
 * sign in for either and the other unlocks (the plugin reuses the stored token; the image
 * reuses the cookie). `partner-lab` and `imaging-lab` stay isolated — each its own login.
 */
import { wireMiradorDatasetAuth, wireMiradorImageAuthReload } from '../src/mirador-auth';
import { authServiceFor, serviceForAnnotation } from './demo-auth-config';

const DEMO_ORIGIN = window.location.origin;
const BACKEND = 'http://192.168.122.250:8000';
const LAB = `${DEMO_ORIGIN}/lab`;
const TRUSTED_ORIGINS = [DEMO_ORIGIN];

/** Replace every backend URL (string value) with its `/lab` proxy form, in place. */
function rewriteInPlace(node: unknown): void {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (typeof node[i] === 'string') node[i] = (node[i] as string).split(BACKEND).join(LAB);
      else if (node[i] && typeof node[i] === 'object') rewriteInPlace(node[i]);
    }
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      if (typeof o[k] === 'string') o[k] = (o[k] as string).split(BACKEND).join(LAB);
      else if (o[k] && typeof o[k] === 'object') rewriteInPlace(o[k]);
    }
  }
}

/**
 * Declare each protected spectrum's auth service (matched by its ANNOTATION UUID) so the
 * plugin offers Sign-in and reuses the token. Image (manifest) annotations are skipped —
 * Mirador drives their cookie login via the proxy's 401 info.json.
 */
function declareDatasetServices(page: { items?: unknown[]; resources?: unknown[] }): void {
  for (const entry of (page.items ?? page.resources ?? []) as Record<string, unknown>[]) {
    const svc = serviceForAnnotation(page.items ? entry.id : entry['@id']);
    if (!svc) continue;
    const body = page.items ? (Array.isArray(entry.body) ? entry.body[0] : entry.body) : entry.resource;
    if (!body || typeof body !== 'object') continue;
    const b = body as Record<string, unknown>;
    const bodyId = page.items ? b.id : b['@id'];
    if (typeof bodyId === 'string' && bodyId.includes('/files/')) {
      b.service = authServiceFor(DEMO_ORIGIN, svc);
    }
  }
}

/**
 * Mirador postprocessor: route the real backend through `/lab` (annotations + maXRF
 * manifests) and declare each protected spectrum's own auth service. Register BEFORE
 * `annotationPostprocessor`. (The maXRF IMAGE auth is Mirador's — driven by the proxy's
 * 401 info.json, no preprocessor needed.)
 */
export function rewriteBackendUrls(_url: string, action: Record<string, unknown>): void {
  if (action.manifestJson) rewriteInPlace(action.manifestJson);
  if (action.annotationJson) {
    rewriteInPlace(action.annotationJson);
    declareDatasetServices(action.annotationJson as { items?: unknown[]; resources?: unknown[] });
  }
}

/** Wire the demo's dataset IIIF Auth (independent services). Call once after `Mirador.viewer`. */
export function setupDemoAuth(store: {
  getState(): unknown;
  dispatch(action: unknown): unknown;
  subscribe(listener: () => void): () => void;
}): void {
  // Local dev serves the demo (and its `/lab` proxy) from a loopback origin, which the SSRF
  // blocklist refuses by default — opt in so the demo's same-origin tokens attach. Harmless
  // on the deployed https origin. This is exactly the intended "dev loosens the default" path.
  wireMiradorDatasetAuth(store, {
    trustedOrigins: TRUSTED_ORIGINS,
    blocklist: { allow: ['loopback', 'localhost'] },
  });
  // Protected maXRF images are driven by Mirador's own login; reload the canvas once that
  // login lands so the first image appears without re-opening the window.
  wireMiradorImageAuthReload(store);
  // eslint-disable-next-line no-console
  console.log('%c[demo] IIIF Auth simulation active — federated services', 'color:#22c55e;font-weight:bold', {
    note: 'crc-lab: map2 image + spectra (one login). partner-lab: spectrum only. imaging-lab: map3 image only.',
  });
}
