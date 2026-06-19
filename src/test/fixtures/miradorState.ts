/**
 * Shared fixtures for plugin mapStateToProps tests.
 *
 * Mirrors the shape the plugins traverse: windows[id].canvasId ->
 * annotations[canvasId][resId].json, where json is a v3 AnnotationPage (items)
 * or a v2 sc:AnnotationList (resources). Both normalize, via
 * normalizeAnnotationResources, to the same internal v3 model.
 */
import type { MiradorState, MiradorAnnotationEntry } from '../../types/mirador';
import type {
  AnnotationV2,
  AnnotationV3,
  AnnotationListV2,
  AnnotationPageV3,
} from '../../types/iiif';

/* Normalized (v3) annotations — these double as valid v3 wire input. */
export const datasetAnnotation: AnnotationV3 = {
  id: 'anno-dataset',
  type: 'Annotation',
  body: { type: 'Dataset', id: 'https://ex.org/d.csv', format: 'text/csv' },
  target: 'canvas-1',
  metadata: [{ label: { none: ['Technique'] }, value: { none: ['XRF'] } }],
};

export const textualAnnotation: AnnotationV3 = {
  id: 'anno-text',
  type: 'Annotation',
  body: { type: 'TextualBody', value: 'hello' },
  target: 'canvas-1',
};

/* Raw v2 wire twins — each normalizes to the matching v3 fixture above. */
export const datasetAnnotationV2: AnnotationV2 = {
  '@type': 'oa:Annotation',
  '@id': 'anno-dataset',
  motivation: 'oa:commenting',
  on: 'https://host/img.tif#xywh=10,20,1,1',
  resource: {
    '@id': 'https://ex.org/d.csv',
    '@type': 'dctypes:Dataset',
    format: 'text/csv',
    label: 'CSV A',
  },
  metadata: [{ label: 'Technique', value: 'XRF' }],
};

export const textualAnnotationV2: AnnotationV2 = {
  '@type': 'oa:Annotation',
  '@id': 'anno-text',
  motivation: 'oa:commenting',
  on: 'canvas-1',
  resource: { '@type': 'cnt:ContentAsText', chars: 'hello' },
};

/* Container builders so v2 and v3 entries read symmetrically. */
export const v3Page = (...items: AnnotationV3[]): AnnotationPageV3 => ({ type: 'AnnotationPage', items });
export const v2List = (id: string, ...resources: AnnotationV2[]): AnnotationListV2 => ({
  '@type': 'sc:AnnotationList',
  '@id': id,
  resources,
});

/** Minimal single-window/single-canvas state carrying the given annotation containers. */
export function stateForCanvas(...containers: unknown[]): MiradorState {
  const entries: Record<string, MiradorAnnotationEntry> = {};
  containers.forEach((json, i) => {
    entries[`res-${i}`] = { json };
  });
  return {
    windows: { 'window-1': { id: 'window-1', canvasId: 'canvas-1' } },
    manifests: {},
    annotations: { 'canvas-1': entries },
    config: {},
    workspace: {},
  };
}

/** windows['window-1'] -> canvas-1, which carries one v3 page and one v2 list. */
export const miradorState: MiradorState = {
  windows: {
    'window-1': { id: 'window-1', canvasId: 'canvas-1' },
    'window-disabled': { id: 'window-disabled', canvasId: 'canvas-1', filtersEnabled: false },
    'window-empty': { id: 'window-empty', canvasId: 'canvas-empty' },
  },
  manifests: {},
  annotations: {
    'canvas-1': {
      'res-v3': { json: v3Page(datasetAnnotation) },
      'res-v2': { json: v2List('list-canvas-1', textualAnnotationV2) },
    },
    'canvas-empty': {},
  },
  config: {},
  workspace: {},
};
