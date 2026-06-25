/**
 * mirador-xyviewer/mirador-auth
 *
 * Optional subexport that wires the plugin's dataset auth to **Mirador's own IIIF
 * Authorization session**, so one login unlocks protected images *and* same-host
 * datasets. Importing this entry (not the core) is the only place that couples to
 * Mirador's auth-state shape — keep it that way.
 *
 * @example
 * import { wireMiradorDatasetAuth } from 'mirador-xyviewer/mirador-auth';
 *
 * const { store } = Mirador.viewer(config, [scientificAnnotationPlugin]);
 * wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab.example'] });
 */
export { resolveMiradorToken } from './resolveToken';
export type { ResolveTokenOptions } from './resolveToken';
export { wireMiradorDatasetAuth } from './wire';
export type { MiradorStoreLike, WireMiradorDatasetAuthOptions } from './wire';
export { wireMiradorImageAuthReload } from './imageAuthReload';
export type { MiradorSubscribableStore } from './imageAuthReload';
export { isBlockedHost } from './blocklist';
export type { BlocklistConfig } from './blocklist';
