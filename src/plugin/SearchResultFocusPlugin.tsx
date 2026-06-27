/**
 * SearchResultFocusPlugin
 *
 * Opt-in. When a IIIF Content Search hit is selected, switches the window's left
 * sidebar to the Annotations panel — so the scientific body (spectrum/metadata)
 * for the searched annotation is shown without manually changing tabs. Hosts that
 * do not want this behavior simply omit the plugin.
 */
import React, { useEffect, useRef } from 'react';
import { connect } from 'react-redux';
import {
  getSelectedAnnotationId,
  getSearchAnnotationsForWindow,
  getCompanionWindowsForPosition,
  updateCompanionWindow as miradorUpdateCompanionWindow,
} from 'mirador';
import type { MiradorState, MiradorPlugin } from '../types/mirador';
import type { Dispatch, AnyAction } from 'redux';

/**
 * True when the current selection is a search-result annotation and the left
 * sidebar is not already showing the annotations panel.
 * @internal Exposed for tests; not part of the public API.
 */
export function shouldFocusAnnotations(
  selectedAnnotationId: string | null | undefined,
  searchAnnotationIds: Set<string>,
  leftCompanionContent: string | undefined,
): boolean {
  return (
    !!selectedAnnotationId &&
    searchAnnotationIds.has(selectedAnnotationId) &&
    leftCompanionContent !== 'annotations'
  );
}

interface TargetProps {
  windowId: string;
}

interface PluginWrapperProps {
  targetProps: TargetProps;
  TargetComponent: React.ComponentType<TargetProps>;
  selectedAnnotationId?: string | null;
  searchAnnotationIds: Set<string>;
  leftCompanionWindowId?: string;
  leftCompanionContent?: string;
  updateCompanionWindow: (windowId: string, companionWindowId: string, payload: { content: string }) => void;
}

/**
 * Side-effecting wrapper that focuses the Annotations panel on a search-hit
 * selection. Rendered via the connected plugin; exported only for tests.
 * @internal Exposed for tests; not part of the public API.
 */
const SearchResultFocusPluginComponent: React.FC<PluginWrapperProps> = ({
  targetProps,
  TargetComponent,
  selectedAnnotationId,
  searchAnnotationIds,
  leftCompanionWindowId,
  leftCompanionContent,
  updateCompanionWindow,
}) => {
  const { windowId } = targetProps;
  const prevSelectedIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (
      selectedAnnotationId &&
      selectedAnnotationId !== prevSelectedIdRef.current &&
      leftCompanionWindowId &&
      shouldFocusAnnotations(selectedAnnotationId, searchAnnotationIds, leftCompanionContent)
    ) {
      updateCompanionWindow(windowId, leftCompanionWindowId, { content: 'annotations' });
    }
    prevSelectedIdRef.current = selectedAnnotationId;
  }, [
    selectedAnnotationId,
    searchAnnotationIds,
    leftCompanionWindowId,
    leftCompanionContent,
    windowId,
    updateCompanionWindow,
  ]);

  return <TargetComponent {...targetProps} />;
};

interface SearchAnnotationList {
  resources?: Array<{ id?: string }>;
}

/**
 * @internal Exposed for tests; not part of the public API.
 */
export function mapStateToProps(state: MiradorState, { targetProps }: { targetProps: { windowId: string } }) {
  const { windowId } = targetProps;
  const selectedAnnotationId = getSelectedAnnotationId(state, { windowId }) as string | null | undefined;
  const lists = (getSearchAnnotationsForWindow(state, { windowId }) as SearchAnnotationList[]) || [];
  const searchAnnotationIds = new Set<string>(
    lists.flatMap((l) => (l.resources ?? []).map((r) => r.id).filter((id): id is string => typeof id === 'string')),
  );
  const left = ((getCompanionWindowsForPosition(state, { windowId, position: 'left' }) as Array<{ id?: string; content?: string }>) || [])[0];
  return {
    selectedAnnotationId,
    searchAnnotationIds,
    leftCompanionWindowId: left?.id,
    leftCompanionContent: left?.content,
  };
}

function mapDispatchToProps(dispatch: Dispatch<AnyAction>) {
  return {
    updateCompanionWindow: (windowId: string, companionWindowId: string, payload: { content: string }) =>
      dispatch(miradorUpdateCompanionWindow(windowId, companionWindowId, payload) as unknown as AnyAction),
  };
}

export const ConnectedSearchResultFocusPlugin = connect(
  mapStateToProps,
  mapDispatchToProps,
)(SearchResultFocusPluginComponent);

export const searchResultFocusPlugin: MiradorPlugin = {
  target: 'AnnotationsOverlay',
  mode: 'wrap',
  name: 'SearchResultFocusPlugin',
  component: ConnectedSearchResultFocusPlugin as unknown as React.ComponentType<{
    targetProps: Record<string, unknown>;
    TargetComponent: React.ComponentType<unknown>;
  }>,
  mapStateToProps: mapStateToProps as MiradorPlugin['mapStateToProps'],
  mapDispatchToProps: mapDispatchToProps as unknown as MiradorPlugin['mapDispatchToProps'],
};

export { SearchResultFocusPluginComponent };
export default searchResultFocusPlugin;
