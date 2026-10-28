/**
 * Tests for ConnectedScientificAnnotationPlugin (Pattern A + C+).
 *
 * Covers the pure body/metadata helpers and — the bug-prone bit — mapStateToProps,
 * which walks windows[id].canvasId -> annotations[canvasId][res].json and extracts
 * individual annotations from both v3 (AnnotationPage/items[]) and v2
 * (sc:AnnotationList/resources[]) shapes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { configureAnnotationAuth } from '../services/annotationAuth';
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
  it('passes Mirador config.language through', () => {
    const state = { ...miradorState, config: { ...miradorState.config, language: 'fr' } };
    expect(mapStateToProps(state, { targetProps: { windowId: 'window-1' } }).language).toBe('fr');
  });

  it('passes config.scientificAnnotations.labels through', () => {
    const labels = { evidence: 'Proof', purposes: { classifying: 'Class' } };
    const state = { ...miradorState, config: { ...miradorState.config, scientificAnnotations: { labels } } };
    const props = { targetProps: { windowId: 'window-1' } };
    const out = mapStateToProps(state, props).labels;
    expect(out).toEqual(labels);
    expect(mapStateToProps(state, props).labels).toBe(out);
  });

  it('drops malformed labels from an imported config', () => {
    const labels = { evidence: {}, evidenceUnavailable: [{ a: 1 }], purposes: ['x'] };
    const state = { ...miradorState, config: { ...miradorState.config, scientificAnnotations: { labels } } } as unknown as typeof miradorState;
    const out = mapStateToProps(state, { targetProps: { windowId: 'window-1' } }).labels;
    expect(out).toEqual({ evidence: undefined, evidenceUnavailable: undefined, purposes: undefined });
    const bad = { ...miradorState, config: { ...miradorState.config, scientificAnnotations: { labels: 'x' } } } as unknown as typeof miradorState;
    expect(mapStateToProps(bad, { targetProps: { windowId: 'window-1' } }).labels).toBeUndefined();
  });

  it('leaves labels undefined without the config key', () => {
    expect(mapStateToProps(miradorState, { targetProps: { windowId: 'window-1' } }).labels).toBeUndefined();
  });

  it('targets CanvasAnnotations in wrap mode with mapStateToProps wired', () => {
    expect(scientificAnnotationPlugin.target).toBe('CanvasAnnotations');
    expect(scientificAnnotationPlugin.mode).toBe('wrap');
    expect(typeof scientificAnnotationPlugin.mapStateToProps).toBe('function');
  });
});

describe('findSignInPage / mapStateToProps signInPage', () => {
  const service = [{ '@id': 'https://iiif.example.org/login', profile: 'http://iiif.io/api/auth/1/login' }];
  const pageUrl = 'https://iiif.example.org/p.json';
  const stateWith = (entry: unknown) =>
    ({ windows: { w: { id: 'w', canvasId: 'c' } }, annotations: { c: { [pageUrl]: entry } } }) as never;

  afterEach(() => configureAnnotationAuth(undefined));

  it('is undefined when no handler is registered', () => {
    const props = mapStateToProps(stateWith({ id: pageUrl, json: { service } }), { targetProps: { windowId: 'w' } });
    expect(props.signInPage).toBeUndefined();
  });

  it('returns the page when the handler offers sign-in, with a stable reference', () => {
    const canSignIn = vi.fn(() => true);
    configureAnnotationAuth({ canSignIn, signIn: vi.fn() });
    const state = stateWith({ id: pageUrl, json: { type: 'AnnotationPage', service } });
    const a = mapStateToProps(state, { targetProps: { windowId: 'w' } }).signInPage;
    const b = mapStateToProps(state, { targetProps: { windowId: 'w' } }).signInPage;
    expect(a).toEqual({ id: pageUrl, service });
    expect(b).toBe(a);
  });

  it('offers nothing without a declared service or when the handler declines', () => {
    configureAnnotationAuth({ canSignIn: () => false, signIn: vi.fn() });
    expect(mapStateToProps(stateWith({ id: pageUrl, json: { service } }), { targetProps: { windowId: 'w' } }).signInPage).toBeUndefined();
    configureAnnotationAuth({ canSignIn: () => true, signIn: vi.fn() });
    expect(mapStateToProps(stateWith({ id: pageUrl, json: { items: [] } }), { targetProps: { windowId: 'w' } }).signInPage).toBeUndefined();
  });

  it('does not crash on a page Mirador stored as an error (no json) and hands the handler a service-less ref', () => {
    const canSignIn = vi.fn(() => true);
    configureAnnotationAuth({ canSignIn, signIn: vi.fn() });
    const props = mapStateToProps(stateWith({ id: pageUrl, error: '403 Forbidden', isFetching: false }), {
      targetProps: { windowId: 'w' },
    });
    expect(canSignIn).toHaveBeenCalledWith({ id: pageUrl, service: undefined });
    expect(props.annotationResources).toEqual({});
  });

  it('reads the canvas from targetProps (book view) before the window canvas', () => {
    configureAnnotationAuth({ canSignIn: () => true, signIn: vi.fn() });
    const state = {
      windows: { w: { canvasId: 'canvas-1' } },
      annotations: { 'canvas-2': { [pageUrl]: { id: pageUrl, json: { service } } } },
    } as unknown as Parameters<typeof mapStateToProps>[0];
    expect(mapStateToProps(state, { targetProps: { windowId: 'w' } }).signInPage).toBeUndefined();
    expect(mapStateToProps(state, { targetProps: { windowId: 'w', canvasId: 'canvas-2' } }).signInPage).toEqual({ id: pageUrl, service });
  });
});
