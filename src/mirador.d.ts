/**
 * Type declarations for Mirador
 * Since Mirador doesn't ship with TypeScript types, we declare them here
 */

declare module 'mirador' {
  import type { Dispatch, Store, AnyAction } from 'redux';

  // Mirador's HTML sanitizer component (rule sets: iiif, liberal, mirador2, noHtml).
  export const SanitizedHtml: import('react').ComponentType<{
    htmlString: string;
    ruleSet: string;
  }>;

  // Mirador addWindow thunk action creator
  export function addWindow(config: {
    manifestId: string;
    [key: string]: unknown;
  }): (dispatch: Dispatch, getState: () => unknown) => void;

  // Mirador's W3C annotation reader (selectors, motivations, body values)
  export class AnnotationItem {
    constructor(resource?: Record<string, unknown>);
    readonly id: string;
    readonly targetId: string | undefined;
    readonly svgSelector: Record<string, unknown> | string | null | undefined;
    readonly fragmentSelector: number[] | string | null | undefined;
  }

  // Mirador receiveManifest action creator - stores a manifest document under an id
  export function receiveManifest(manifestId: string, manifestJson: unknown): AnyAction;

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

  // Mirador annotation fetch action: (re)request one annotation page; clears its stored json.
  export function requestAnnotation(targetId: string, annotationId: string): AnyAction;

  // Mirador updateConfig action creator (arrays in the patch REPLACE the stored ones).
  export function updateConfig(config: Record<string, unknown>): AnyAction;

  // Mirador setCanvas action creator - shows a canvas in the window
  export function setCanvas(windowId: string, canvasId: string, newGroup?: unknown, options?: unknown): AnyAction;

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

  // Mirador's per-window OpenSeadragon viewer refs ({ current: viewer } once the viewer exists)
  export const OSDReferences: {
    get(windowId: string): { current?: unknown } | undefined;
  };

  // Mirador getCurrentCanvasWorld selector - the window's world; coordinates are canvas pixels
  export function getCurrentCanvasWorld(
    state: unknown,
    options: { windowId: string }
  ): { canvasIds?: string[]; canvasToWorldCoordinates(canvasId: string): number[]; canvasScale?(canvasId: string): number } | undefined;

  // Mirador getViewer selector - returns the window's viewport state ({ x, y, zoom, bounds, ... }), not the OSD instance
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
