/**
 * Tests for MetadataFiltersPlugin (Pattern A + C+).
 *
 * Covers extractAnnotationsWithMetadata and mapStateToProps — the latter walks the
 * same windows->annotations shape and additionally derives canvasId + filtersEnabled.
 */
import { describe, it, expect } from 'vitest';
import {
  extractAnnotationsWithMetadata,
  mapStateToProps,
  metadataFiltersPlugin,
} from './MetadataFiltersPlugin';
import {
  miradorState,
  datasetAnnotation,
  datasetAnnotationV2,
  textualAnnotation,
  v2List,
  stateForCanvas,
} from '../test/fixtures/miradorState';

describe('extractAnnotationsWithMetadata', () => {
  it('maps resources to {id, metadata, body}', () => {
    const result = extractAnnotationsWithMetadata({
      [datasetAnnotation.id]: datasetAnnotation,
      [textualAnnotation.id]: textualAnnotation,
    });
    expect(result).toEqual([
      { id: 'anno-dataset', metadata: datasetAnnotation.metadata, body: datasetAnnotation.body },
      { id: 'anno-text', metadata: undefined, body: textualAnnotation.body },
    ]);
  });
});

describe('mapStateToProps', () => {
  it('derives canvasId, filtersEnabled and the annotation resources', () => {
    const props = mapStateToProps(miradorState, { windowId: 'window-1' });
    expect(props.canvasId).toBe('canvas-1');
    expect(props.filtersEnabled).toBe(true);
    expect(Object.keys(props.annotationResources!).sort()).toEqual(['anno-dataset', 'anno-text']);
  });

  it('normalizes a v2 sc:AnnotationList and extracts its metadata', () => {
    const state = stateForCanvas(v2List('list-1', datasetAnnotationV2));

    const props = mapStateToProps(state, { windowId: 'window-1' });
    const anno = props.annotationResources!['anno-dataset'];
    expect(anno?.type).toBe('Annotation');
    expect(anno?.body).toEqual(datasetAnnotation.body);

    // v2 metadata is normalized to the v3 LocalizedString-map shape and extracted.
    expect(extractAnnotationsWithMetadata(props.annotationResources!)).toEqual([
      { id: 'anno-dataset', metadata: datasetAnnotation.metadata, body: datasetAnnotation.body },
    ]);
  });

  it('respects filtersEnabled:false on the window', () => {
    const props = mapStateToProps(miradorState, { windowId: 'window-disabled' });
    expect(props.filtersEnabled).toBe(false);
  });

  it('returns empty resources and undefined canvasId for an unknown window', () => {
    const props = mapStateToProps(miradorState, { windowId: 'nope' });
    expect(props.canvasId).toBeUndefined();
    expect(props.annotationResources).toEqual({});
    expect(props.filtersEnabled).toBe(true); // undefined !== false
  });
});

describe('mapStateToProps propertyGroupOf', () => {
  it('passes a function through and drops other values', () => {
    const fn = () => 'G';
    const run = (propertyGroupOf: unknown) =>
      mapStateToProps(
        { ...miradorState, config: { ...miradorState.config, scientificAnnotations: { propertyGroupOf } } } as never,
        { windowId: 'window-1' },
      ).propertyGroupOf;
    expect(run(fn)).toBe(fn);
    expect(run('x')).toBeUndefined();
  });
});

describe('mapStateToProps language', () => {
  it('passes Mirador config.language through', () => {
    const state = { ...miradorState, config: { ...miradorState.config, language: 'fr' } };
    expect(mapStateToProps(state, { windowId: 'window-1' }).language).toBe('fr');
  });
});

describe('plugin export', () => {
  it('is the panel plugin plus the canvas overlay plugin', () => {
    expect(Array.isArray(metadataFiltersPlugin)).toBe(true);
    const [panel, overlay] = metadataFiltersPlugin;
    expect(panel.target).toBe('OpenSeadragonViewer');
    expect(panel.mode).toBe('add');
    expect(typeof panel.mapStateToProps).toBe('function');
    expect(overlay.target).toBe('AnnotationsOverlay');
    expect(overlay.mode).toBe('wrap');
  });

  it('yields both targets once flattened like Mirador does, nested or spread', () => {
    // Mirador's filterValidPlugins spreads array elements into the plugin list.
    const flatten = (plugins: unknown[]) => plugins.flatMap((p) => (Array.isArray(p) ? p : [p]));
    for (const plugins of [[metadataFiltersPlugin], [...metadataFiltersPlugin]]) {
      const valid = flatten(plugins) as Array<{ target: string; component: unknown }>;
      expect(valid.every((p) => p.component)).toBe(true);
      expect(valid.map((p) => p.target)).toEqual([
        'OpenSeadragonViewer',
        'AnnotationsOverlay',
      ]);
    }
  });
});

describe('mapStateToProps extendFiltersToLinked', () => {
  it('defaults to true and only false turns it off', () => {
    const run = (extendFiltersToLinked: unknown) =>
      mapStateToProps(
        { ...miradorState, config: { ...miradorState.config, scientificAnnotations: { extendFiltersToLinked } } } as never,
        { windowId: 'window-1' },
      ).extendFiltersToLinked;
    expect(run(undefined)).toBe(true);
    expect(run(false)).toBe(false);
  });
});
