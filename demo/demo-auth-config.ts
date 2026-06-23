/**
 * Demo-only IIIF Auth topology — shared by the dev proxy (`vite-demo-auth.ts`, Node) and
 * the browser wiring (`demo-auth.ts`). Models INDEPENDENT auth services: each protected
 * resource sits behind its own service, so each needs its own login and yields its own
 * token (Mirador keys tokens by token-service id). Signing in for one does NOT unlock
 * another. NOT part of the published plugin.
 */

/** Protected f10 spectra (by file UUID) → their dataset auth service id. Two services. */
export const PROTECTED_DATASETS: Record<string, string> = {
  '3120f5ea-8d64-4afe-a7b5-9a45adc0d174': 'lab-a',
  'a73332ed-732e-41cd-a139-eb736a12b393': 'lab-a',
  'd1196080-7b15-4a1e-b08b-cf08547bfb1f': 'lab-b',
};

/** maXRF image filename fragment → its image auth service id (handled by Mirador). */
export const PROTECTED_IMAGE_SERVICES: Record<string, string> = {
  map2: 'maxrf-map2',
  map3: 'maxrf-map3',
};

/** Human labels for the services (shown in the mock login window / notices). */
export const SERVICE_LABELS: Record<string, string> = {
  'lab-a': 'CRC Lab — spectra access',
  'lab-b': 'Partner Lab — spectra access',
  'maxrf-map2': 'maXRF map 2 — imaging access',
  'maxrf-map3': 'maXRF map 3 — imaging access',
};

/** The (mock) bearer token a given service issues. */
export const tokenFor = (svc: string): string => `demo-token-${svc}`;

/** A IIIF Auth 1.0 access service (with nested token service) for `svc`, on `origin`. */
export const authServiceFor = (origin: string, svc: string): Record<string, unknown> => ({
  '@id': `${origin}/demo-auth/login?svc=${svc}`,
  '@context': 'http://iiif.io/api/auth/1/context.json',
  profile: 'http://iiif.io/api/auth/1/login',
  label: SERVICE_LABELS[svc] ?? `Demo IIIF Auth (${svc})`,
  service: [{ '@id': `${origin}/demo-auth/token?svc=${svc}`, profile: 'http://iiif.io/api/auth/1/token' }],
});

/** Which auth service (if any) a proxied `/lab` path requires. */
export function serviceForPath(path: string): string | undefined {
  const file = /^\/lab\/files\/([^/?]+)/.exec(path);
  if (file) return PROTECTED_DATASETS[file[1]];
  if (/^\/lab\/iiifserver\//.test(path)) {
    for (const [fragment, svc] of Object.entries(PROTECTED_IMAGE_SERVICES)) {
      if (path.includes(fragment)) return svc;
    }
  }
  return undefined;
}
