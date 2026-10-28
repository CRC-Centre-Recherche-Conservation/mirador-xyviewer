/**
 * MetadataFilterOverlayPlugin
 *
 * Applies the metadata filters to the shapes Mirador draws on the canvas: annotations
 * hidden by the filter (see filtersStore) are removed from the AnnotationsOverlay
 * `annotations` prop, in sync with the side-panel list. Wraps AnnotationsOverlay.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MiradorPlugin } from '../types/mirador';
import { filtersStore } from '../state/filtersStore';
import { containPlugin } from './containPlugin';

interface OverlayResource {
  id?: string;
  targetId?: string;
}

interface OverlayAnnotationList {
  resources?: OverlayResource[];
}

/** Hidden ids of a canvas, or undefined when no filter is active for it. */
type HiddenLookup = (canvasId: string) => ReadonlySet<string> | undefined;

/**
 * Removes the resources hidden by the filter from Mirador's annotation lists.
 * The selected annotation stays (as in the panel) and lists are never mutated: a
 * changed list is a prototype-linked copy, so Mirador's wrapper methods keep working.
 * Returns the input array itself when nothing is hidden.
 * @internal Exposed for tests; not part of the public API.
 */
export function filterOverlayAnnotations<T extends OverlayAnnotationList>(
  lists: T[],
  hiddenFor: HiddenLookup,
  selectedAnnotationId?: string | null,
): T[] {
  if (!Array.isArray(lists)) return lists;
  let changed = false;
  const out = lists.map((list) => {
    const resources = list?.resources;
    if (!Array.isArray(resources)) return list;
    const kept = resources.filter((res) => {
      const id = res?.id;
      if (typeof id !== 'string' || id === selectedAnnotationId || !res.targetId) return true;
      return !hiddenFor(res.targetId)?.has(id);
    });
    if (kept.length === resources.length) return list;
    changed = true;
    return Object.create(list, { resources: { value: kept, enumerable: true } }) as T;
  });
  return changed ? out : lists;
}

interface TargetProps {
  windowId: string;
  annotations?: OverlayAnnotationList[];
  selectedAnnotationId?: string | null;
  [key: string]: unknown;
}

interface PluginWrapperProps {
  targetProps: TargetProps;
  TargetComponent: React.ComponentType<TargetProps>;
  /** Rest of Mirador's wrap chain, when other plugins wrap the same target. */
  children?: React.ReactNode;
}

/**
 * Swaps `annotations` through the rest of the wrap chain. Each nested wrap element carries
 * its own copy (props and targetProps), so every level down to the target is updated;
 * this keeps the plugin independent of the order hosts register wrap plugins in.
 */
function withAnnotations(node: React.ReactNode, annotations: unknown): React.ReactNode {
  if (!React.isValidElement(node)) return node;
  const props = node.props as { targetProps?: object; children?: React.ReactNode };
  const next: Record<string, unknown> = { annotations };
  if (props.targetProps) next.targetProps = { ...props.targetProps, annotations };
  if (props.children) next.children = withAnnotations(props.children, annotations);
  return React.cloneElement(node, next);
}

/** Per-canvas lookup into filtersStore; only canvases whose filters are initialized. */
function storeLookup(windowId: string): HiddenLookup {
  return (canvasId) =>
    filtersStore.hasFiltersInitialized(windowId, canvasId)
      ? filtersStore.getHiddenAnnotationIds(windowId, canvasId)
      : undefined;
}

export const MetadataFilterOverlayPluginComponent: React.FC<PluginWrapperProps> = ({
  targetProps,
  TargetComponent,
  children,
}) => {
  const { windowId, annotations, selectedAnnotationId } = targetProps;
  const [version, setVersion] = useState(0);

  const filtered = useMemo(
    () => (annotations ? filterOverlayAnnotations(annotations, storeLookup(windowId), selectedAnnotationId) : annotations),
    // `version` forces a recompute when the store changes.
    [annotations, windowId, selectedAnnotationId, version],
  );
  const renderedRef = useRef(filtered);
  renderedRef.current = filtered;

  useEffect(() => {
    const unsubscribe = filtersStore.subscribe((event) => {
      // Only events that can change what is hidden; UI-only ones (toggle-group) would churn the overlay.
      if (event.windowId === windowId
        && (event.type === 'update-hidden' || event.type === 'init' || event.type === 'clear')) {
        setVersion((v) => v + 1);
      }
    });
    // Catch up with filters initialized between render and subscription.
    if (annotations && renderedRef.current === annotations
      && filterOverlayAnnotations(annotations, storeLookup(windowId), selectedAnnotationId) !== annotations) {
      setVersion((v) => v + 1);
    }
    return unsubscribe;
  }, [windowId]);

  if (children) return <>{withAnnotations(children, filtered)}</>;
  return <TargetComponent {...targetProps} annotations={filtered} />;
};

/**
 * Plugin definition for Mirador. Internal: shipped as part of `metadataFiltersPlugin`
 * (a Mirador plugin has a single target, so the pair is exported as an array).
 */
export const metadataFilterOverlayPlugin: MiradorPlugin = containPlugin({
  target: 'AnnotationsOverlay',
  mode: 'wrap',
  name: 'MetadataFilterOverlayPlugin',
  component: MetadataFilterOverlayPluginComponent as unknown as React.ComponentType<{
    targetProps: Record<string, unknown>;
    TargetComponent: React.ComponentType<unknown>;
  }>,
});

export default metadataFilterOverlayPlugin;
