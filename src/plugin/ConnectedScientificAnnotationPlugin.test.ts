/**
 * Tests for ConnectedScientificAnnotationPlugin (Pattern A + C+).
 *
 * Covers the pure body/metadata helpers and — the bug-prone bit — mapStateToProps,
 * which walks windows[id].canvasId -> annotations[canvasId][res].json and extracts
 * individual annotations from both v3 (AnnotationPage/items[]) and v2
 * (sc:AnnotationList/resources[]) shapes.
 */
import { describe, it, expect } from 'vitest';
import {
  isScientificBodyType,
  hasScientificBody,
  hasMetadata,
  shouldUseCustomRendering,
  mapStateToProps,
  scientificAnnotationPlugin,
} from './ConnectedScientificAnnotationPlugin';
import {
  miradorState,
  datasetAnnotation,
  datasetAnnotationV2,
  textualAnnotation,
  v2List,
  stateForCanvas,
} from '../test/fixtures/miradorState';

describe('helpers', () => {
  it('isScientificBodyType: only Manifest/Dataset are scientific', () => {
    expect(isScientificBodyType('Manifest')).toBe(true);
    expect(isScientificBodyType('Dataset')).toBe(true);
    expect(isScientificBodyType('TextualBody')).toBe(false);
    expect(isScientificBodyType(undefined)).toBe(false);
  });

  it('hasScientificBody: handles single body, array, and falsy', () => {
    expect(hasScientificBody({ type: 'Dataset' })).toBe(true);
    expect(hasScientificBody([{ type: 'TextualBody' }, { type: 'Manifest' }])).toBe(true);
    expect(hasScientificBody([{ type: 'TextualBody' }])).toBe(false);
    expect(hasScientificBody(null)).toBe(false);
  });

  it('hasMetadata: true only for a non-empty metadata array', () => {
    expect(hasMetadata(datasetAnnotation)).toBe(true);
    expect(hasMetadata(textualAnnotation)).toBe(false);
    expect(hasMetadata(undefined)).toBe(false);
  });

  it('shouldUseCustomRendering: scientific body OR metadata', () => {
    expect(shouldUseCustomRendering(datasetAnnotation)).toBe(true); // both
    expect(shouldUseCustomRendering(textualAnnotation)).toBe(false); // neither
    expect(shouldUseCustomRendering(undefined)).toBe(false);
  });
});

describe('mapStateToProps', () => {
  it('extracts annotations from v3 AnnotationPage (items[]) containers', () => {
    const props = mapStateToProps(miradorState, { targetProps: { windowId: 'window-1' } });
    expect(Object.keys(props.annotationResources).sort()).toEqual(['anno-dataset', 'anno-text']);
    expect(props.annotationResources['anno-dataset']).toEqual(datasetAnnotation);
  });

  it('normalizes a v2 sc:AnnotationList into the v3-shaped resource map', () => {
    const state = stateForCanvas(v2List('list-1', datasetAnnotationV2));

    const props = mapStateToProps(state, { targetProps: { windowId: 'window-1' } });
    const anno = props.annotationResources['anno-dataset'];
    expect(anno).toBeDefined();
    expect(anno.type).toBe('Annotation');
    // The v2 twin normalizes to the same body as the v3 fixture.
    expect(anno.body).toEqual(datasetAnnotation.body);
  });

  it('returns no resources when the window is unknown', () => {
    const props = mapStateToProps(miradorState, { targetProps: { windowId: 'nope' } });
    expect(props.annotationResources).toEqual({});
  });

  it('returns no resources when the canvas has no annotations', () => {
    const props = mapStateToProps(miradorState, { targetProps: { windowId: 'window-empty' } });
    expect(props.annotationResources).toEqual({});
  });
});

describe('plugin export', () => {
  it('targets CanvasAnnotations in wrap mode with mapStateToProps wired', () => {
    expect(scientificAnnotationPlugin.target).toBe('CanvasAnnotations');
    expect(scientificAnnotationPlugin.mode).toBe('wrap');
    expect(typeof scientificAnnotationPlugin.mapStateToProps).toBe('function');
  });
});
