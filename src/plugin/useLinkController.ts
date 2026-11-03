/**
 * Actions behind linked annotations for one annotation panel: debounced multi-zone hover,
 * following a link (also to another canvas), the back link and framing the linked zones.
 * Mirador's SELECT_ANNOTATION only changes canvas for content-search hits, so a link to
 * another canvas dispatches `setCanvas` first and selects once that canvas has the annotation.
 */

import { useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { ReactReduxContext } from 'react-redux';
import { OSDReferences, getCurrentCanvasWorld, setCanvas, updateViewport } from 'mirador';
import type { IIIFAnnotation } from '../types/iiif';
import type { LinkContextValue, LinkTarget } from '../components/LinkContext';
import { linkNavigationStore } from '../state/linkNavigationStore';
import { normalizeAnnotationResources } from '../utils/annotationNormalizer';
import { annotationTitle } from '../utils/annotationTitle';
import { baseAnnotationId, hoverGroup, linkedIdsOnCanvas, type LinkIndex } from '../utils/linkIndex';
import { annotationBounds, frameBox, panIfOutOfView, unionBox, type Box, type WorldOffset } from './viewportFraming';

export const HOVER_DEBOUNCE_MS = 50;
export const NAVIGATION_TIMEOUT_MS = 5000;

/**
 * The cross-canvas wait of each window. It outlives the panel that started it (Mirador
 * remounts the panel when the canvas changes), so it is cancelled from here, not from a ref.
 */
const pendingWaits = new Map<string, () => void>();

/** Stops the wait for a link target still loading, if any. */
export function cancelPendingNavigation(windowId: string): void {
  pendingWaits.get(windowId)?.();
}

export interface LinkControllerParams {
  windowId: string;
  canvasId?: string;
  /** Canvases shown by the window (two in book view). */
  visibleCanvasIds?: string[];
  dispatch: (action: unknown) => void;
  selectAnnotation?: (windowId: string, annotationId: string) => void;
  hoverAnnotation?: (windowId: string, annotationIds: string[]) => void;
  hoveredAnnotationIds: string[];
  index: LinkIndex;
  canvasAnnotationIds: string[];
  annotationResources: Record<string, IIIFAnnotation>;
  hiddenIds: Set<string>;
  subtitleLabel?: string;
  prefs: string[];
}

interface StateShape {
  windows?: Record<string, { canvasId?: string } | undefined>;
  annotations?: Record<string, Record<string, { json?: unknown }>>;
  viewers?: Record<string, { x?: number; y?: number; zoom?: number } | undefined>;
}

const sameIds = (a: string[], b: string[]): boolean => a.length === b.length && a.every((id, i) => id === b[i]);

/** Where the canvas sits in Mirador's world (canvas pixels); the origin when unknown. */
function canvasOffset(state: unknown, windowId: string, canvasId: string): WorldOffset {
  try {
    const box = getCurrentCanvasWorld(state, { windowId })?.canvasToWorldCoordinates(canvasId);
    if (box && Number.isFinite(box[0]) && Number.isFinite(box[1])) return { x: box[0], y: box[1] };
  } catch {
    // no world yet
  }
  return { x: 0, y: 0 };
}

/** Width / height of the window's image area (4:3 when it cannot be measured). */
function containerAspect(windowId: string): number {
  const el = document.getElementById(windowId)?.querySelector('.openseadragon-container');
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? r.width / r.height : 4 / 3;
}

/** Highest zoom the window's viewer accepts, undefined when it is not available. */
function viewerMaxZoom(windowId: string): number | undefined {
  try {
    const viewer = (OSDReferences.get(windowId) as { current?: { viewport?: { getMaxZoom?: () => number } } } | undefined)?.current;
    const max = viewer?.viewport?.getMaxZoom?.();
    return typeof max === 'number' && Number.isFinite(max) && max > 0 ? max : undefined;
  } catch {
    return undefined;
  }
}

export function useLinkController(params: LinkControllerParams): {
  context: LinkContextValue;
  back: () => void;
} {
  const store = useContext(ReactReduxContext)?.store;
  const latest = useRef(params);
  latest.current = params;
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(hoverTimer.current);
    },
    [],
  );

  const hover = useCallback((ids: string[]) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      const p = latest.current;
      // Same zones already lit: no dispatch.
      if (!p.hoverAnnotation || sameIds(p.hoveredAnnotationIds, ids)) return;
      p.hoverAnnotation(p.windowId, ids);
    }, HOVER_DEBOUNCE_MS);
  }, []);

  const groupOf = useCallback((annotationId: string): string[] => {
    const { index, canvasAnnotationIds } = latest.current;
    const onCanvas = new Set(canvasAnnotationIds);
    return hoverGroup(index, annotationId, canvasAnnotationIds).filter((id) => onCanvas.has(id));
  }, []);

  const titleOf = useCallback((annotationId: string): string => {
    const { index, prefs } = latest.current;
    return annotationTitle(index.entries.get(baseAnnotationId(annotationId))?.resource, prefs);
  }, []);

  const frame = useCallback((boxes: Box[], pan: boolean) => {
    const p = latest.current;
    if (!p.canvasId) return;
    const state = store?.getState();
    const offset = canvasOffset(state, p.windowId, p.canvasId);
    const aspect = containerAspect(p.windowId);
    if (pan) {
      const view = (state as StateShape | undefined)?.viewers?.[p.windowId];
      if (!view || typeof view.x !== 'number' || typeof view.y !== 'number' || typeof view.zoom !== 'number') return;
      const next = panIfOutOfView(boxes[0], offset, { x: view.x, y: view.y, zoom: view.zoom }, aspect);
      if (next) p.dispatch(updateViewport(p.windowId, next));
      return;
    }
    const union = unionBox(boxes);
    if (union) p.dispatch(updateViewport(p.windowId, frameBox(union, offset, aspect, 0.1, viewerMaxZoom(p.windowId))));
  }, [store]);

  const select = useCallback((annotationId: string, panIntoView: boolean) => {
    const p = latest.current;
    p.selectAnnotation?.(p.windowId, annotationId);
    if (!panIntoView) return;
    const box = annotationBounds(p.annotationResources[annotationId]);
    if (box) frame([box], true);
  }, [frame]);

  const navigate = useCallback((to: { annotationId: string; canvasId?: string }) => {
    const p = latest.current;
    const { windowId } = p;
    cancelPendingNavigation(windowId);
    const shown = p.visibleCanvasIds?.length ? p.visibleCanvasIds : p.canvasId ? [p.canvasId] : [];
    if (!to.canvasId || to.canvasId === p.canvasId || shown.includes(to.canvasId)) {
      select(to.annotationId, true);
      return;
    }
    const canvasId = to.canvasId;
    p.dispatch(setCanvas(windowId, canvasId));
    const ready = (): boolean => {
      const st = store?.getState() as StateShape | undefined;
      if (!st) return true;
      return (
        st.windows?.[windowId]?.canvasId === canvasId &&
        !!normalizeAnnotationResources(st.annotations?.[canvasId])[to.annotationId]
      );
    };
    if (ready()) {
      select(to.annotationId, false);
      return;
    }
    let done = false;
    const finish = () => {
      done = true;
      unsubscribe();
      clearTimeout(timer);
      if (pendingWaits.get(windowId) === finish) pendingWaits.delete(windowId);
    };
    const unsubscribe = store!.subscribe(() => {
      if (done) return;
      // The window was closed meanwhile.
      if (!(store!.getState() as StateShape).windows?.[windowId]) return finish();
      if (!ready()) return;
      finish();
      select(to.annotationId, false);
    });
    const timer = setTimeout(() => {
      if (done) return;
      finish();
      linkNavigationStore.fail(windowId);
    }, NAVIGATION_TIMEOUT_MS);
    pendingWaits.set(windowId, finish);
  }, [store, select]);

  const follow = useCallback((ownerId: string | undefined, to: LinkTarget) => {
    const p = latest.current;
    const dest = { annotationId: to.annotationId, canvasId: to.canvasId ?? p.canvasId };
    if (ownerId && baseAnnotationId(ownerId) !== baseAnnotationId(dest.annotationId)) {
      linkNavigationStore.push(p.windowId, { annotationId: ownerId, canvasId: p.canvasId }, dest);
    }
    navigate(dest);
  }, [navigate]);

  const back = useCallback(() => {
    const p = latest.current;
    const origin = linkNavigationStore.pop(p.windowId);
    if (!origin) return;
    linkNavigationStore.setFocus(p.windowId, origin.annotationId);
    navigate({ annotationId: origin.annotationId, canvasId: origin.canvasId ?? p.canvasId });
  }, [navigate]);

  const showAll = useCallback((ownerId: string) => {
    const p = latest.current;
    const ids = [ownerId, ...linkedIdsOnCanvas(p.index, ownerId, p.canvasAnnotationIds)];
    const boxes = ids.map((id) => annotationBounds(p.annotationResources[id])).filter((b): b is Box => !!b);
    if (boxes.length > 0) frame(boxes, false);
  }, [frame]);

  const zoomTo = useCallback((annotationId: string) => {
    const box = annotationBounds(latest.current.annotationResources[annotationId]);
    if (box) frame([box], false);
  }, [frame]);

  const hasZone = useCallback(
    (annotationId: string) => !!annotationBounds(latest.current.annotationResources[annotationId]),
    [],
  );

  const { windowId, canvasId, index, canvasAnnotationIds, hiddenIds, subtitleLabel } = params;
  const context = useMemo<LinkContextValue>(
    () => ({ windowId, canvasId, index, canvasAnnotationIds, hiddenIds, subtitleLabel, hover, groupOf, follow, showAll, zoomTo, hasZone, titleOf }),
    [windowId, canvasId, index, canvasAnnotationIds, hiddenIds, subtitleLabel, hover, groupOf, follow, showAll, zoomTo, hasZone, titleOf],
  );

  return { context, back };
}
