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

/**
 * Predicate: can a login actually be started for this body? Lets `DatasetBody` hide the
 * "Sign in" button (falling back to the manual "Open resource" notice) when the handler
 * would no-op — e.g. the resource declares no auth service, or an untrusted one.
 */
export type DatasetAuthAvailability = (body: DatasetBodyType) => boolean;

interface RegisteredAuth {
  handler: DatasetAuthHandler;
  canStartLogin?: DatasetAuthAvailability;
}

let registered: RegisteredAuth | undefined;

/**
 * Register a global sign-in handler for auth-protected datasets. Used with the Mirador
 * plugin, where the host can't pass props to the internally-rendered panel; the
 * per-component `onAuthRequired` prop overrides it. Pass `undefined` to reset. The optional
 * `canStartLogin` predicate gates the Sign-in button per body.
 */
export function configureDatasetAuth(
  handler: DatasetAuthHandler | undefined,
  options?: { canStartLogin?: DatasetAuthAvailability },
): void {
  registered = handler ? { handler, canStartLogin: options?.canStartLogin } : undefined;
}

/** The currently registered global handler, if any. */
export function getRegisteredAuthHandler(): DatasetAuthHandler | undefined {
  return registered?.handler;
}

/** The currently registered availability predicate, if any. */
export function getRegisteredCanStartLogin(): DatasetAuthAvailability | undefined {
  return registered?.canStartLogin;
}
