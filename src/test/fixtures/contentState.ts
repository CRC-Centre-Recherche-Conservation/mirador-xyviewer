/**
 * Content State fixtures. The first two mirror real states published by a
 * Content State producer (point + SVG circle, and an xywh rectangle), with
 * hosts neutralised. The rest are spec-valid variants.
 */
export const HOST = 'https://iiif.example.org';
export const MANIFEST = `${HOST}/iiif/v3/explorer-manifest?ids=an:1:-`;
export const CANVAS_A = `${HOST}/iiif/48912/canvas/canvas-1`;
export const CANVAS_B = `${HOST}/iiif/48912/canvas/canvas-2`;

const partOf = [{ id: MANIFEST, type: 'Manifest' }];

/** Point + SVG circle (path with two arcs) on one canvas. */
export const pointAndSvgState = {
  '@context': 'http://iiif.io/api/presentation/3/context.json',
  id: `${HOST}/iiif/v3/content-state/a/1`,
  type: 'Annotation',
  motivation: ['contentState'],
  target: {
    type: 'SpecificResource',
    source: { id: CANVAS_A, type: 'Canvas', partOf },
    selector: [
      { type: 'PointSelector', x: 669, y: 630 },
      {
        type: 'SvgSelector',
        value:
          '<svg xmlns="http://www.w3.org/2000/svg"><path d="M 669 618 A 12 12 0 1 1 669 642 A 12 12 0 1 1 669 618"/></svg>',
      },
    ],
  },
};

/** Rectangle through a FragmentSelector. */
export const fragmentState = {
  '@context': 'http://iiif.io/api/presentation/3/context.json',
  id: `${HOST}/iiif/v3/content-state/b/2`,
  type: 'Annotation',
  motivation: ['contentState'],
  target: {
    type: 'SpecificResource',
    source: { id: CANVAS_B, type: 'Canvas', partOf },
    selector: {
      type: 'FragmentSelector',
      conformsTo: 'http://www.w3.org/TR/media-frags/',
      value: 'xywh=630,1556,602,111',
    },
  },
};

/** Two canvases of one manifest (comparison). */
export const multiTargetState = {
  type: 'Annotation',
  motivation: 'contentState',
  target: [
    { id: `${CANVAS_A}#xywh=10,20,30,40`, type: 'Canvas', partOf },
    { id: CANVAS_B, type: 'Canvas', partOf },
  ],
};

export const manifestDoc = {
  id: MANIFEST,
  type: 'Manifest',
  items: [
    { id: CANVAS_A, type: 'Canvas', width: 2000, height: 1000, items: [] },
    { id: CANVAS_B, type: 'Canvas', width: 1000, height: 1000, items: [] },
  ],
};
