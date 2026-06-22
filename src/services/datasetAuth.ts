/**
 * Dataset auth-handler registry.
 *
 * A module-level singleton (mirrors `configureDatasetRequests`) so a host — or the
 * `mirador-auth` subexport — can register the Sign-in handler the Mirador-embedded
 * `DatasetBody` invokes on a 401/403, without coupling to the React component layer.
 */
import type { DatasetBody as DatasetBodyType } from '../types/iiif';

/** Handler invoked when an auth-protected dataset needs the user to sign in. */
export type DatasetAuthHandler = (body: DatasetBodyType) => void | Promise<void>;

let registeredAuthHandler: DatasetAuthHandler | undefined;

/**
 * Register a global sign-in handler for auth-protected datasets. Used with the Mirador
 * plugin, where the host can't pass props to the internally-rendered panel; the
 * per-component `onAuthRequired` prop overrides it. Pass `undefined` to reset.
 */
export function configureDatasetAuth(handler: DatasetAuthHandler | undefined): void {
  registeredAuthHandler = handler;
}

/** The currently registered global handler, if any. */
export function getRegisteredAuthHandler(): DatasetAuthHandler | undefined {
  return registeredAuthHandler;
}
