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

  // Mirador info-response action creators (used to remount an OSD tile source after auth).
  export function requestInfoResponse(
    infoId: string,
    imageResource?: unknown,
    windowId?: string
  ): AnyAction;
  export function removeInfoResponse(infoId: string): AnyAction;

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

  /**
   * A Mirador IIIF Auth token-store entry. Keyed (in the store) by token-service id;
   * the bearer token lives at `.json.accessToken` (see state/reducers/accessTokens.js).
   */
  export interface MiradorAccessTokenEntry {
    authId?: string;
    id?: string;
    isFetching?: boolean;
    json?: { accessToken?: string; expiresIn?: number; [key: string]: unknown };
    error?: string;
    success?: boolean;
  }

  // Mirador getAccessTokens selector - the IIIF Auth token store, keyed by token-service id.
  export function getAccessTokens(state: unknown): Record<string, MiradorAccessTokenEntry>;

  // Mirador resolveAccessTokenRequest action creator - stores the token under its service id
  // (dispatches RECEIVE_ACCESS_TOKEN when `json.accessToken` is present).
  export function resolveAccessTokenRequest(
    authId: string,
    tokenServiceId: string,
    json: unknown
  ): AnyAction;

  // Mirador selectors used by SearchResultFocusPlugin
  export function getSelectedAnnotationId(
    state: unknown,
    options: { windowId: string }
  ): string | null | undefined;

  export function getSearchAnnotationsForWindow(
    state: unknown,
    options: { windowId: string }
  ): Array<{ resources?: Array<{ id?: string }> }>;

  export function getCompanionWindowsForPosition(
    state: unknown,
    options: { windowId: string; position: string }
  ): Array<{ id?: string; content?: string }>;

  // Mirador updateCompanionWindow action creator
  export function updateCompanionWindow(
    windowId: string,
    companionWindowId: string,
    payload: { content: string; [key: string]: unknown }
  ): AnyAction;

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
