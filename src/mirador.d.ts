/**
 * Type declarations for Mirador
 * Since Mirador doesn't ship with TypeScript types, we declare them here
 */

declare module 'mirador' {
  import type { Dispatch, Store, AnyAction } from 'redux';

  // Mirador addWindow thunk action creator
  export function addWindow(config: {
    manifestId: string;
    [key: string]: unknown;
  }): (dispatch: Dispatch, getState: () => unknown) => void;

  // Mirador updateWindow action creator
  export function updateWindow(
    windowId: string,
    payload: Record<string, unknown>
  ): AnyAction;

  // Mirador updateViewport action creator - updates the viewport position/zoom
  export function updateViewport(
    windowId: string,
    payload: {
      x?: number;
      y?: number;
      zoom?: number;
      bounds?: [number, number, number, number];
    }
  ): AnyAction;

  // Mirador getViewer selector - returns OpenSeadragon viewer instance
  export function getViewer(
    state: unknown,
    options: { windowId: string }
  ): unknown;

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
