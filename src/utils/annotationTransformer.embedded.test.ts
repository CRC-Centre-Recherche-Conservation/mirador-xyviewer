import { describe, it, expect } from 'vitest';
import { AnnotationItem } from 'mirador';
import {
  transformEmbeddedAnnotationPages,
  annotationPostprocessor,
  createAnnotationPostprocessor,
  MAX_EMBEDDED_ANNOTATIONS,
} from './annotationTransformer';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const CANVAS = 'https://iiif.example.org/m/canvas/1';
const anno = (id: string, target: unknown, body: unknown = { type: 'TextualBody', value: 'x' }) => ({
  id,
  type: 'Annotation',
  motivation: 'commenting',
  body,
  target,
});

const embeddedManifest = (): Any => ({
  '@context': 'http://iiif.io/api/presentation/3/context.json',
  id: 'https://iiif.example.org/m/manifest',
  type: 'Manifest',
  label: { en: ['M'] },
  items: [
    {
      id: CANVAS,
      type: 'Canvas',
      width: 4000,
      height: 3000,
      items: [],
      annotations: [
        {
          id: 'https://iiif.example.org/m/page/1',
          type: 'AnnotationPage',
          items: [
            anno('a-multi', [`${CANVAS}#xywh=10,10,100,100`, `${CANVAS}#xywh=300,300,50,50`]),
            anno('a-tiny', `${CANVAS}#xywh=500,600,1,1`),
            anno('a-point', {
              type: 'SpecificResource',
              source: CANVAS,
              selector: { type: 'PointSelector', x: 120, y: 340 },
            }),
          ],
        },
        { id: 'https://iiif.example.org/m/page/ref', type: 'AnnotationPage' },
      ],
    },
    { id: 'https://iiif.example.org/m/canvas/2', type: 'Canvas', items: [] },
  ],
});

describe('transformEmbeddedAnnotationPages', () => {
  it('expands multi-target and circles tiny xywh / PointSelector', () => {
    const input = embeddedManifest();
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = transformEmbeddedAnnotationPages(input) as Any;

    expect(input).toEqual(snapshot); // never mutated
    expect(out).not.toBe(input);
    const items = out.items[0].annotations[0].items as Any[];
    expect(items.map((i) => i.id)).toEqual(['a-multi#target-0', 'a-multi#target-1', 'a-tiny', 'a-point']);
    const tiny = items[2].target.selector;
    expect(JSON.stringify(tiny)).toContain('SvgSelector');
    expect(JSON.stringify(items[3].target.selector)).toContain('SvgSelector');
    // untouched siblings keep identity
    expect(out.items[1]).toBe(input.items[1]);
    expect(out.items[0].annotations[1]).toBe(input.items[0].annotations[1]);
  });

  it('returns the same object when no canvas embeds items', () => {
    const m = embeddedManifest();
    m.items[0].annotations = [m.items[0].annotations[1]];
    const copy = JSON.parse(JSON.stringify(m));
    const out = transformEmbeddedAnnotationPages(m);
    expect(out).toBe(m);
    expect(out).toEqual(copy);
  });

  it('is a no-op for non-manifests', () => {
    expect(transformEmbeddedAnnotationPages(null)).toBeNull();
    expect(transformEmbeddedAnnotationPages('x')).toBe('x');
    const coll = { type: 'Collection', items: [{ id: 'u', type: 'Manifest' }] };
    expect(transformEmbeddedAnnotationPages(coll)).toBe(coll);
  });

  it('never throws on malformed embedded pages', () => {
    const bad: Any = {
      type: 'Manifest',
      items: [
        null,
        'x',
        { type: 'Canvas', annotations: 'nope' },
        { type: 'Canvas', annotations: [null, 3, { items: 'str' }, { items: [null, 1, {}] }] },
        { type: 'Canvas', annotations: [{ type: 'AnnotationPage', items: [{ id: 'z', target: { selector: 7 } }] }] },
      ],
    };
    expect(() => transformEmbeddedAnnotationPages(bad)).not.toThrow();
    const trap = { type: 'Manifest', get items(): never { throw new Error('boom'); } };
    expect(transformEmbeddedAnnotationPages(trap)).toBe(trap);
  });

  it('leaves pages over the annotation budget as shipped', () => {
    const many = Array.from({ length: MAX_EMBEDDED_ANNOTATIONS + 1 }, (_, i) =>
      anno(`n${i}`, `${CANVAS}#xywh=1,1,1,1`)
    );
    const m: Any = {
      type: 'Manifest',
      items: [{ type: 'Canvas', annotations: [{ type: 'AnnotationPage', items: many }] }],
    };
    expect(transformEmbeddedAnnotationPages(m)).toBe(m);
  });

  it('leaves a v2 manifest byte-identical (Mirador fetches otherContent by @id)', () => {
    const list = {
      '@id': 'https://iiif.example.org/list/emb',
      '@type': 'sc:AnnotationList',
      resources: [
        {
          '@id': 'https://iiif.example.org/a/1',
          '@type': 'oa:Annotation',
          resource: { '@type': 'cnt:ContentAsText', chars: 'hi' },
          on: `${CANVAS}#xywh=5,5,1,1`,
        },
      ],
    };
    const m: Any = {
      '@type': 'sc:Manifest',
      sequences: [{ canvases: [{ '@id': CANVAS, '@type': 'sc:Canvas', otherContent: [list] }] }],
    };
    const snapshot = JSON.parse(JSON.stringify(m));
    const out = transformEmbeddedAnnotationPages(m) as Any;
    expect(out).toBe(m);
    expect(m).toEqual(snapshot);
    expect(out.sequences[0].canvases[0].otherContent[0]['@id']).toBe(list['@id']);
  });

  it('ignores untyped or differently typed objects, as Mirador does', () => {
    const m: Any = {
      type: 'Manifest',
      items: [
        {
          type: 'Canvas',
          annotations: [
            { items: [anno('u1', `${CANVAS}#xywh=1,1,1,1`)] },
            { type: 'Other', items: [anno('u2', `${CANVAS}#xywh=1,1,1,1`)] },
          ],
        },
      ],
    };
    expect(transformEmbeddedAnnotationPages(m)).toBe(m);
  });

  it('returns the same object when the pass changes nothing', () => {
    const m: Any = {
      type: 'Manifest',
      items: [{ type: 'Canvas', annotations: [{ id: 'p', type: 'AnnotationPage', items: [{ foo: 1 }] }] }],
    };
    expect(transformEmbeddedAnnotationPages(m)).toBe(m);
  });

  it('charges the budget per target', () => {
    const targets = Array.from({ length: MAX_EMBEDDED_ANNOTATIONS + 1 }, (_, i) => `${CANVAS}#xywh=${i},1,5,5`);
    const m: Any = {
      type: 'Manifest',
      items: [{ type: 'Canvas', annotations: [{ id: 'p', type: 'AnnotationPage', items: [anno('big', targets)] }] }],
    };
    expect(transformEmbeddedAnnotationPages(m)).toBe(m);
  });

  it('yields separate, drawable Mirador AnnotationItems and keeps page id/type', () => {
    const out = transformEmbeddedAnnotationPages(embeddedManifest()) as Any;
    const page = out.items[0].annotations[0];
    // Mirador's canvasAnnotationPages filter and saga key
    expect(page.type).toBe('AnnotationPage');
    expect(page.id).toBe('https://iiif.example.org/m/page/1');

    const byId = Object.fromEntries(
      (page.items as Any[]).map((a) => [a.id, new AnnotationItem(a)])
    ) as Record<string, Any>;
    expect(byId['a-multi#target-0'].fragmentSelector).toEqual([10, 10, 100, 100]);
    expect(byId['a-multi#target-1'].fragmentSelector).toEqual([300, 300, 50, 50]);
    for (const id of ['a-tiny', 'a-point']) {
      expect(byId[id].svgSelector).toBeTruthy();
      expect(byId[id].svgSelector.value).toMatch(/<path|<circle/);
    }
  });

  it('stays fast on a large manifest without embedded pages', () => {
    const m: Any = {
      type: 'Manifest',
      items: Array.from({ length: 5000 }, (_, i) => ({
        id: `https://iiif.example.org/c/${i}`,
        type: 'Canvas',
        items: [],
        annotations: [{ id: `https://iiif.example.org/p/${i}`, type: 'AnnotationPage' }],
      })),
    };
    const t = performance.now();
    const out = transformEmbeddedAnnotationPages(m);
    expect(performance.now() - t).toBeLessThan(100);
    expect(out).toBe(m);
  });
});

describe('postprocessors and manifests', () => {
  it.each([
    ['default', annotationPostprocessor],
    ['custom radius', createAnnotationPostprocessor(8)],
  ])('%s transforms action.manifestJson', (_n, pp) => {
    const action: Any = { manifestJson: embeddedManifest() };
    pp('https://iiif.example.org/m', action);
    expect(action.manifestJson.items[0].annotations[0].items).toHaveLength(4);
  });

  it('keeps a manifest without embedded pages identical', () => {
    const manifestJson = { type: 'Manifest', items: [{ type: 'Canvas' }] };
    const action: Any = { manifestJson };
    annotationPostprocessor('u', action);
    expect(action.manifestJson).toBe(manifestJson);
  });

  it('does not touch search, info or other responses', () => {
    const search = { searchJson: { '@context': 'http://iiif.io/api/search/1/context.json', resources: [{ x: 1 }], hits: [] } };
    const info = { infoJson: { '@id': 'u', width: 1, height: 1 } };
    const s = JSON.stringify(search);
    const i = JSON.stringify(info);
    annotationPostprocessor('u', search);
    annotationPostprocessor('u', info);
    expect(JSON.stringify(search)).toBe(s);
    expect(JSON.stringify(info)).toBe(i);
  });

  it('still transforms fetched annotation pages', () => {
    const action: Any = {
      annotationJson: { type: 'AnnotationPage', items: [anno('p', `${CANVAS}#xywh=1,1,1,1`)] },
    };
    annotationPostprocessor('u', action);
    expect(JSON.stringify(action.annotationJson.items[0].target)).toContain('SvgSelector');
  });
});
