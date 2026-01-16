/**
 * Type declarations for Mirador
 * Since Mirador doesn't ship with TypeScript types, we declare them here
 */

declare module 'mirador' {
  import type { Dispatch, Store } from 'redux';

  // Mirador addWindow thunk action creator
  export function addWindow(config: {
    manifestId: string;
    [key: string]: unknown;
  }): (dispatch: Dispatch, getState: () => unknown) => void;

  // Mirador viewer factory
  export function viewer(
    config: unknown,
    plugins?: unknown[]
  ): {
    store: Store;
    actions: Record<string, unknown>;
  };

  // Default export
  const Mirador: {
    viewer: typeof viewer;
  };
  export default Mirador;
}
