/**
 * Demo-only IIIF Auth topology — ONE table keyed by ANNOTATION UUID (a fixed identifier,
 * not a fragile filename pattern). Shared by the dev proxy (`vite-demo-auth.ts`, Node) and
 * the browser wiring (`demo-auth.ts`). NOT part of the published plugin.
 *
 * The point of the demo: one manifest (folio 10) federates resources from several
 * databases, each behind its own auth service. A single service can guard resources of
 * different TYPES at once, so signing into it unlocks them together; a different DB needs
 * its own login. Three services:
 *
 *   - `crc-lab`     — maXRF **map2** image (cookie) + two **spectra** (bearer). One login
 *                     unlocks all three (image + datasets from the same lab DB).
 *   - `partner-lab` — one spectrum (bearer) from another DB. Its own login.
 *   - `imaging-lab` — maXRF **map3** image (cookie) from a third DB. Its own login.
 *
 * The annotation UUID is the source of truth; the proxy resolves each annotation's body at
 * startup — a `/manifest/<id>` (it protects that manifest's exact images) or a
 * `/files/<id>` dataset — so nothing depends on how the image files happen to be named.
 */

/** Annotation UUID → auth service id. The single source of truth (folio 10 annotations). */
export const PROTECTED_ANNOTATIONS: Record<string, string> = {
  'ec7d6140-60a1-49ee-9933-752b8685c356': 'crc-lab',     // maXRF map2 manifest (image)
  '0cb63a98-7435-4319-9b56-ce6c2640fc16': 'crc-lab',     // spectrum FORS_007 (dataset)
  '7df0e285-c772-486a-b918-060741eb535a': 'crc-lab',     // spectrum (dataset)
  '621bdff8-3d60-415f-8033-c50c1d31f8d9': 'partner-lab', // spectrum (dataset) — another DB
  'ff7dcee2-cdce-4a44-b163-90a7fa17ad4f': 'imaging-lab', // maXRF map3 manifest (image) — a third DB
};

/** Human labels for the services (shown in the mock login window / notices). */
export const SERVICE_LABELS: Record<string, string> = {
  'crc-lab': 'CRC Lab — maXRF map 2 + spectra',
  'partner-lab': 'Partner Lab — spectra access',
  'imaging-lab': 'Imaging Lab — maXRF map 3',
};

/**
 * Token / session lifetimes. IIIF Auth 1.0 specifies the token's `expiresIn` (a short-lived
 * access token); it does NOT specify the access cookie's lifetime — that's the auth server's
 * session policy, so we pick a sensible longer one. Short token + longer session = the token
 * is re-derived silently from the still-valid session, no re-login (until the session ends).
 */
export const TOKEN_TTL_MS = 60_000; // 60s access token (IIIF expiresIn)
export const SESSION_TTL_S = 3600; // 1h access-cookie session (server policy, not IIIF)

/**
 * Issue a (mock) short-lived bearer for `svc`: the expiry is embedded so the resource server
 * can validate it statelessly (like a JWT `exp`, without the signature — it's a demo).
 */
export const issueToken = (svc: string, nowMs: number): string => `demo-token-${svc}.${nowMs + TOKEN_TTL_MS}`;

/** Validate a bearer for `svc`: right service AND not past its embedded expiry. */
export function validateToken(svc: string, token: string, nowMs: number): boolean {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return false;
  const expiresAt = Number(token.slice(dot + 1));
  return token.slice(0, dot) === `demo-token-${svc}` && Number.isFinite(expiresAt) && nowMs < expiresAt;
}

/** A IIIF Auth 1.0 access service (with nested token service) for `svc`, on `origin`. */
export const authServiceFor = (origin: string, svc: string): Record<string, unknown> => ({
  '@id': `${origin}/demo-auth/login?svc=${svc}`,
  '@context': 'http://iiif.io/api/auth/1/context.json',
  profile: 'http://iiif.io/api/auth/1/login',
  label: SERVICE_LABELS[svc] ?? `Demo IIIF Auth (${svc})`,
  service: [{ '@id': `${origin}/demo-auth/token?svc=${svc}`, profile: 'http://iiif.io/api/auth/1/token' }],
});

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The auth service required by an annotation (matched by its UUID), or `undefined`. */
export function serviceForAnnotation(annotationId: unknown): string | undefined {
  if (typeof annotationId !== 'string') return undefined;
  const m = UUID_RE.exec(annotationId);
  return m ? PROTECTED_ANNOTATIONS[m[0].toLowerCase()] : undefined;
}

/**
 * Stable key for an IIIF Image service: the `iiif/<v>/<file>` path under `/iiifserver/`,
 * shared by a service `@id` and any tile/info request derived from it. `undefined` if the
 * URL/path is not an iiifserver image. Used to map protected images ←→ incoming requests.
 */
export function iiifServiceKey(urlOrPath: string): string | undefined {
  const after = urlOrPath.split('/iiifserver/')[1];
  if (!after) return undefined;
  const segs = after.split(/[/?#]/).filter(Boolean);
  return segs.length >= 3 ? segs.slice(0, 3).join('/') : undefined;
}

/** Every image-service key (`iiif/<v>/<file>`) declared by a IIIF Presentation 2 manifest. */
export function imageServiceKeysFromManifest(manifest: unknown): string[] {
  const keys = new Set<string>();
  const m = manifest as { sequences?: { canvases?: Record<string, unknown>[] }[] };
  for (const seq of m?.sequences ?? []) {
    for (const canvas of seq.canvases ?? []) {
      for (const image of (canvas.images as Record<string, unknown>[]) ?? []) {
        const resource = image.resource as { service?: unknown } | undefined;
        const svc = Array.isArray(resource?.service) ? resource?.service[0] : resource?.service;
        const id = (svc as { '@id'?: string })?.['@id'];
        const key = typeof id === 'string' ? iiifServiceKey(id) : undefined;
        if (key) keys.add(key);
      }
    }
  }
  return [...keys];
}
