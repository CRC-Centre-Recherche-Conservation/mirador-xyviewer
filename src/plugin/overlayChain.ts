/**
 * Helpers shared by the plugins that wrap Mirador's AnnotationsOverlay and swap its
 * `annotations` prop (metadata filter, point markers).
 */

import React from 'react';
import { filtersStore } from '../state/filtersStore';

/** Hidden ids of a canvas, or undefined when no filter is active for it. */
export type HiddenLookup = (canvasId: string) => ReadonlySet<string> | undefined;

/** Resource and list shapes Mirador hands to the overlay (only what the plugins read). */
export interface OverlayResource {
  id?: string;
  targetId?: string;
}

export interface OverlayAnnotationList {
  resources?: OverlayResource[];
}

/**
 * Swaps `annotations` through the rest of the wrap chain. Each nested wrap element carries
 * its own copy (props and targetProps), so every level down to the target is updated;
 * this keeps the plugin independent of the order hosts register wrap plugins in.
 * `extra` is merged into the nested `targetProps` only.
 */
export function withAnnotations(
  node: React.ReactNode,
  annotations: unknown,
  extra?: Record<string, unknown>,
): React.ReactNode {
  if (!React.isValidElement(node)) return node;
  const props = node.props as { targetProps?: object; children?: React.ReactNode };
  const next: Record<string, unknown> = { annotations };
  if (props.targetProps) next.targetProps = { ...props.targetProps, ...extra, annotations };
  if (props.children) next.children = withAnnotations(props.children, annotations, extra);
  return React.cloneElement(node, next);
}

/** Per-canvas lookup into filtersStore; only canvases whose filters are initialized. */
export function storeLookup(windowId: string): HiddenLookup {
  return (canvasId) =>
    filtersStore.hasFiltersInitialized(windowId, canvasId)
      ? filtersStore.getHiddenAnnotationIds(windowId, canvasId)
      : undefined;
}
