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
  it('maps resources to {id, metadata}', () => {
    const result = extractAnnotationsWithMetadata({
      [datasetAnnotation.id]: datasetAnnotation,
      [textualAnnotation.id]: textualAnnotation,
    });
    expect(result).toEqual([
      { id: 'anno-dataset', metadata: datasetAnnotation.metadata },
      { id: 'anno-text', metadata: undefined },
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
      { id: 'anno-dataset', metadata: datasetAnnotation.metadata },
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

describe('plugin export', () => {
  it('targets OpenSeadragonViewer in add mode with mapStateToProps wired', () => {
    expect(metadataFiltersPlugin.target).toBe('OpenSeadragonViewer');
    expect(metadataFiltersPlugin.mode).toBe('add');
    expect(typeof metadataFiltersPlugin.mapStateToProps).toBe('function');
  });
});
