/**
 * Reload Mirador's image canvas after an IIIF Auth login.
 *
 * Mirador's `OpenSeadragonTileSource` adds its tiled image once (effect keyed on viewer+url),
 * so an in-place info-response refetch after login never reloads OSD — the canvas keeps the
 * tiles that 401'd before login. We watch for the degraded → authed transition and remount the
 * tile source (remove + re-request the info response) so OSD re-adds it against the authed service.
 */
import { removeInfoResponse, requestInfoResponse } from 'mirador';

/** A Redux-like store; a real Mirador store satisfies this structurally. */
export interface MiradorSubscribableStore {
  getState(): unknown;
  dispatch(action: unknown): unknown;
  subscribe(listener: () => void): () => void;
}

interface InfoResponseEntry {
  degraded?: boolean;
  json?: unknown;
}

/**
 * Pure transition detector: given the degraded flags seen on the previous tick and the
 * current info responses, return the infoIds that just went degraded → authed (and now carry
 * json). Only transitions count — an image that was authed from the start loads on its own.
 */
export function selectNewlyAuthedInfoIds(
  previousDegraded: Map<string, boolean>,
  infoResponses: Record<string, InfoResponseEntry>,
): string[] {
  const ids: string[] = [];
  for (const [infoId, entry] of Object.entries(infoResponses)) {
    const wasDegraded = previousDegraded.get(infoId) === true;
    const stillDegraded = entry?.degraded === true;
    if (wasDegraded && !stillDegraded && entry?.json) ids.push(infoId);
  }
  return ids;
}

/**
 * Subscribe to `store` and, whenever a protected image's info response transitions
 * degraded → authed, remount its OSD tile source so the now-authed tiles load. Returns the
 * Redux unsubscribe (call it to tear down, e.g. on HMR).
 */
export function wireMiradorImageAuthReload(store: MiradorSubscribableStore): () => void {
  const previousDegraded = new Map<string, boolean>();
  const pending = new Set<string>();

  return store.subscribe(() => {
    const infoResponses =
      (store.getState() as { infoResponses?: Record<string, InfoResponseEntry> }).infoResponses ?? {};

    const toReload = selectNewlyAuthedInfoIds(previousDegraded, infoResponses);

    // Re-seed from this tick so the same transition isn't re-detected (the remove/re-request loops otherwise).
    previousDegraded.clear();
    for (const [infoId, entry] of Object.entries(infoResponses)) {
      previousDegraded.set(infoId, entry?.degraded === true);
    }

    for (const infoId of toReload) {
      if (pending.has(infoId)) continue;
      pending.add(infoId);
      // Defer: don't dispatch re-entrantly from a store subscriber.
      Promise.resolve().then(() => {
        store.dispatch(removeInfoResponse(infoId));
        store.dispatch(requestInfoResponse(infoId));
        pending.delete(infoId);
      });
    }
  });
}
