/**
 * Annotation-page auth registry.
 *
 * Module-level singleton (like `configureDatasetAuth`) so the `mirador-auth` subexport can
 * tell the annotation panel whether a Sign-in can be offered for an annotation page and how
 * to start it, without the core knowing anything about Mirador's auth state.
 */

/** An annotation page/list as Mirador stored it: its URL and any auth `service` it declared. */
export interface AnnotationPageRef {
  id: string;
  service?: unknown;
}

/** What the panel needs to offer (and run) a sign-in for an annotation page. */
export interface AnnotationAuthHandlers {
  /** Whether a login can be started for this page (trusted declared service, not signed in yet). */
  canSignIn(page: AnnotationPageRef): boolean;
  /** Start the login. Runs synchronously up to the popup so it keeps the click gesture. */
  signIn(page: AnnotationPageRef): void | Promise<void>;
}

let registered: AnnotationAuthHandlers | undefined;

/** Register the sign-in handlers for annotation pages; `undefined` resets. */
export function configureAnnotationAuth(handlers: AnnotationAuthHandlers | undefined): void {
  registered = handlers;
}

/** The registered handlers, if any. */
export function getAnnotationAuth(): AnnotationAuthHandlers | undefined {
  return registered;
}
