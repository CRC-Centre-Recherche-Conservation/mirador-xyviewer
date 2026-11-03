/**
 * PointMarkersPlugin
 *
 * Draws point annotations as DOM markers (see PointMarkersOverlay) instead of Mirador's 1 px
 * canvas circle. Wraps AnnotationsOverlay: the points leave its `annotations` prop (areas stay
 * canvas-drawn and hit-tested by Mirador) and the markers are rendered from the same props.
 * Host options: `config.scientificAnnotations.pointMarkers` (see resolvePointMarkerConfig).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { connect } from 'react-redux';
import type { MiradorPlugin, MiradorState } from '../types/mirador';
import type { IIIFAnnotation } from '../types/iiif';
import { filtersStore } from '../state/filtersStore';
import { annotationTitle } from '../utils/annotationTitle';
import { resolvePreferredLanguages } from '../utils/localization';
import { containPlugin } from './containPlugin';
import { storeLookup, withAnnotations, type OverlayAnnotationList } from './overlayChain';
import { PointMarkersOverlay, type MarkerColors } from './PointMarkersOverlay';
import {
  computePointMarkers,
  resolvePointMarkerConfig,
  splitPointResources,
  type PointMarker,
} from './pointMarkers';

interface PaletteEntry {
  strokeStyle?: string;
}

interface TargetProps {
  windowId: string;
  annotations?: OverlayAnnotationList[];
  canvasWorld?: { canvases?: Array<{ id?: string }> };
  hoveredAnnotationIds?: string[];
  selectedAnnotationId?: string | null;
  highlightAllAnnotations?: boolean;
  palette?: { annotations?: Record<'default' | 'hovered' | 'selected', PaletteEntry | undefined> };
  hoverAnnotation?: (windowId: string, ids: string[]) => void;
  selectAnnotation?: (windowId: string, id: string) => void;
  deselectAnnotation?: (windowId: string, id: string) => void;
  [key: string]: unknown;
}

interface PluginWrapperProps {
  targetProps: TargetProps;
  TargetComponent: React.ComponentType<TargetProps>;
  /** Rest of Mirador's wrap chain, when other plugins wrap the same target. */
  children?: React.ReactNode;
  /** `config.scientificAnnotations.pointMarkers`. */
  pointMarkersConfig?: unknown;
  language?: string;
}

const FALLBACK_COLORS: MarkerColors = { default: '#00BFFF', hovered: '#BF00FF', selected: '#ffff00' };
const noop = () => {};

export const PointMarkersPluginComponent: React.FC<PluginWrapperProps> = ({
  targetProps,
  TargetComponent,
  children,
  pointMarkersConfig,
  language,
}) => {
  const {
    windowId,
    annotations,
    canvasWorld,
    hoveredAnnotationIds,
    selectedAnnotationId,
    highlightAllAnnotations,
    palette,
  } = targetProps;
  const [version, setVersion] = useState(0);
  const config = useMemo(() => resolvePointMarkerConfig(pointMarkersConfig), [pointMarkersConfig]);
  const split = useMemo(() => splitPointResources(annotations ?? []), [annotations]);

  // The metadata filter hides markers too: follow it like the filter plugin does.
  useEffect(
    () =>
      filtersStore.subscribe((event) => {
        if (event.windowId === windowId
          && (event.type === 'update-hidden' || event.type === 'init' || event.type === 'clear')) {
          setVersion((v) => v + 1);
        }
      }),
    [windowId],
  );

  const canvasIds = canvasWorld?.canvases?.map((c) => c.id).filter((id): id is string => typeof id === 'string');
  const canvasKey = canvasIds?.join('\n') ?? '';
  const markers = useMemo(
    () =>
      computePointMarkers({
        points: split.points,
        visibleCanvasIds: canvasIds,
        hiddenFor: storeLookup(windowId),
        hovered: hoveredAnnotationIds ?? [],
        selected: selectedAnnotationId,
        highlightAll: !!highlightAllAnnotations,
        maxMarkers: config.maxMarkers,
      }),
    // `version` forces a recompute when the filter changes.
    [split, canvasKey, windowId, hoveredAnnotationIds, selectedAnnotationId, highlightAllAnnotations, config, version],
  );

  const colors: MarkerColors = {
    default: config.colors.default ?? palette?.annotations?.default?.strokeStyle ?? FALLBACK_COLORS.default,
    hovered: config.colors.hovered ?? palette?.annotations?.hovered?.strokeStyle ?? FALLBACK_COLORS.hovered,
    selected: config.colors.selected ?? palette?.annotations?.selected?.strokeStyle ?? FALLBACK_COLORS.selected,
  };
  const prefs = useMemo(() => resolvePreferredLanguages(language), [language]);
  const titleOf = (m: PointMarker) =>
    annotationTitle((m.resource as { resource?: IIIFAnnotation }).resource, prefs);

  // Points are not passed on; the unsplit lists stay available to plugins nested below.
  const extra = { unsplitAnnotations: annotations };
  const overlay = (
    <PointMarkersOverlay
      windowId={windowId}
      markers={markers}
      config={config}
      colors={colors}
      titleOf={titleOf}
      hoverAnnotation={targetProps.hoverAnnotation ?? noop}
      selectAnnotation={targetProps.selectAnnotation ?? noop}
      deselectAnnotation={targetProps.deselectAnnotation ?? noop}
      selectedAnnotationId={selectedAnnotationId}
    />
  );

  return (
    <>
      {children
        ? withAnnotations(children, split.areas, extra)
        : <TargetComponent {...targetProps} annotations={split.areas} />}
      {overlay}
    </>
  );
};

/** @internal Exposed for tests; not part of the public API. */
export function mapStateToProps(state: MiradorState) {
  return {
    pointMarkersConfig: state.config?.scientificAnnotations?.pointMarkers,
    language: state.config?.language,
  };
}

export const ConnectedPointMarkersPlugin = connect(mapStateToProps)(
  PointMarkersPluginComponent as unknown as React.ComponentType<PluginWrapperProps>,
);

/** Plugin definition for Mirador. */
export const pointMarkersPlugin: MiradorPlugin = containPlugin({
  target: 'AnnotationsOverlay',
  mode: 'wrap',
  name: 'PointMarkersPlugin',
  component: ConnectedPointMarkersPlugin as unknown as React.ComponentType<{
    targetProps: Record<string, unknown>;
    TargetComponent: React.ComponentType<unknown>;
  }>,
  mapStateToProps: mapStateToProps as unknown as MiradorPlugin['mapStateToProps'],
});

export default pointMarkersPlugin;
