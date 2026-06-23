/**
 * Demo-only IIIF Auth simulation — INDEPENDENT services, the real model.
 *
 * Each protected resource sits behind its own service (see demo-auth-config.ts), so each
 * needs its own login and yields its own token:
 *   - protected spectra get their DATASET auth service declared here; our plugin
 *     (`wireMiradorDatasetAuth`) shows "Sign in", runs that service's login, and reuses its
 *     token for same-service spectra;
 *   - protected maXRF IMAGES are handled by MIRADOR itself — their info.json (served by the
 *     proxy) returns a 401 declaring the image auth service, so Mirador drives its own login
 *     directly on the map (no spectrum needed).
 * Signing in for one service does NOT unlock another. Real data throughout, via the `/lab`
 * proxy. NOT part of the published plugin.
 */
import { wireMiradorDatasetAuth } from '../src/mirador-auth';
import { PROTECTED_DATASETS, authServiceFor } from './demo-auth-config';

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

/** The dataset auth service for a (rewritten) `/lab/files/<uuid>` URL, if it's protected. */
const datasetService = (id: unknown): string | undefined => {
  if (typeof id !== 'string') return undefined;
  const m = /\/lab\/files\/([^/?]+)/.exec(id);
  return m ? PROTECTED_DATASETS[m[1]] : undefined;
};

/** Declare each protected spectrum's own dataset auth service so the plugin offers Sign-in. */
function declareDatasetServices(page: { items?: unknown[]; resources?: unknown[] }): void {
  for (const entry of (page.items ?? page.resources ?? []) as Record<string, unknown>[]) {
    const body = page.items ? (Array.isArray(entry.body) ? entry.body[0] : entry.body) : entry.resource;
    if (!body || typeof body !== 'object') continue;
    const b = body as Record<string, unknown>;
    const svc = datasetService(page.items ? b.id : b['@id']);
    if (svc) b.service = authServiceFor(DEMO_ORIGIN, svc);
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
export function setupDemoAuth(store: { getState(): unknown; dispatch(action: unknown): unknown }): void {
  wireMiradorDatasetAuth(store, { trustedOrigins: TRUSTED_ORIGINS });
  // eslint-disable-next-line no-console
  console.log('%c[demo] IIIF Auth simulation active — independent services', 'color:#22c55e;font-weight:bold', {
    note: 'Spectra: 2 dataset services (plugin). maXRF maps: 2 image services (Mirador). Each its own login.',
  });
}
