/**
 * Shared fixtures for plugin mapStateToProps tests.
 *
 * Models the exact shape the plugins traverse: windows[id].canvasId ->
 * annotations[canvasId][resId].json, where json is either a v3 AnnotationPage
 * (with items[]) or a single v2 annotation (with id).
 */
import type { MiradorState } from '../../types/mirador';
import type { IIIFAnnotation } from '../../types/iiif';

export const datasetAnnotation: IIIFAnnotation = {
  id: 'anno-dataset',
  type: 'Annotation',
  body: { type: 'Dataset', id: 'https://ex.org/d.csv', format: 'text/csv' },
  target: 'canvas-1',
  metadata: [{ label: { none: ['Technique'] }, value: { none: ['XRF'] } }],
};

export const textualAnnotation: IIIFAnnotation = {
  id: 'anno-text',
  type: 'Annotation',
  body: { type: 'TextualBody', value: 'hello' },
  target: 'canvas-1',
};

/** windows['window-1'] -> canvas-1; annotations on canvas-1 in both v3 and v2 shapes. */
export const miradorState: MiradorState = {
  windows: {
    'window-1': { id: 'window-1', canvasId: 'canvas-1' },
    'window-disabled': { id: 'window-disabled', canvasId: 'canvas-1', filtersEnabled: false },
    'window-empty': { id: 'window-empty', canvasId: 'canvas-empty' },
  },
  manifests: {},
  annotations: {
    'canvas-1': {
      'res-v3': { json: { type: 'AnnotationPage', items: [datasetAnnotation] } },
      'res-v2': { json: textualAnnotation },
    },
    'canvas-empty': {},
  },
  config: {},
  workspace: {},
};
