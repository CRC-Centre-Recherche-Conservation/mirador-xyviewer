import { describe, it, expect } from 'vitest';
import { transformEmbeddedAnnotationPages } from './annotationTransformer';
import { normalizeAnnotationList } from './annotationNormalizer';
import { parseXyReading, bodyResourceIds } from './xyReading';
import { parseDataset } from '../services/datasetParser';
import { datasetCacheKey } from '../services/datasetFetcher';
import v2 from '../test/fixtures/annotations/v2-annotation-page.json';
import v3 from '../test/fixtures/annotations/v3-annotation-page.json';

/* eslint-disable @typescript-eslint/no-explicit-any */
const CANVAS = 'https://iiif.example.org/m/canvas/1';
const reading = {
  type: 'XYReading',
  columns: [{ index: 0, role: 'x' }, { index: 1, role: 'yLeft' }],
  x: { reversed: true },
};

const datasetBodies = (annos: any[]): any[] =>
  annos.flatMap((a) => [a.body].flat()).filter((b) => b?.type === 'Dataset' && b?.xyReading);

describe('xyReading through the annotation pipeline', () => {
  it('keeps a working reading on an embedded annotation page without @context', () => {
    const manifest = {
      '@context': 'http://iiif.io/api/presentation/3/context.json',
      id: 'https://iiif.example.org/m/manifest',
      type: 'Manifest',
      items: [
        {
          id: CANVAS,
          type: 'Canvas',
          items: [],
          annotations: [
            {
              id: 'https://iiif.example.org/m/page/1',
              type: 'AnnotationPage',
              items: [
                {
                  id: 'a1',
                  type: 'Annotation',
                  motivation: 'describing',
                  target: `${CANVAS}#xywh=10,10,100,100`,
                  body: { type: 'Dataset', id: 'https://h.example/d.csv', format: 'text/csv', xyReading: reading },
                },
              ],
            },
          ],
        },
      ],
    };
    const out = transformEmbeddedAnnotationPages(manifest) as any;
    const page = out.items[0].annotations[0];
    expect(page['@context']).toBeUndefined();
    const bodies = datasetBodies(normalizeAnnotationList(page));
    expect(bodies).toHaveLength(1);
    const parsed = parseXyReading(bodies[0].xyReading);
    expect(parsed?.x?.reversed).toBe(true);
    const data = parseDataset('x,a\n1,10\n2,20', bodies[0].id, 'L', 'text/csv', bodies[0].xyReading);
    expect(data.xValues).toEqual([2, 1]);
  });

  it('parses a v2 dctypes:Dataset reading to the same value as v3', () => {
    const pick = (page: unknown) => datasetBodies(normalizeAnnotationList(page))[0];
    const b2 = pick(v2);
    const b3 = pick(v3);
    expect(b2).toBeDefined();
    expect(b3).toBeDefined();
    expect(parseXyReading(b2.xyReading)).toEqual(parseXyReading(b3.xyReading));
  });

  it('two bodies sharing one URL with different readings get different data and cache keys', () => {
    const url = 'https://h.example/shared.csv';
    const csv = 'wavelength,a\n100,1\n200,2\n300,3';
    const plain = { type: 'XYReading', x: { reversed: false } };
    const rev = { type: 'XYReading', x: { reversed: true } };
    expect(datasetCacheKey(url, plain)).not.toBe(datasetCacheKey(url, rev));
    const a = parseDataset(csv, url, 'L', 'text/csv', plain);
    const b = parseDataset(csv, url, 'L', 'text/csv', rev);
    expect(b.xReversed).toBe(true);
    expect(a.xReversed).toBeFalsy();
  });

  it('collects body ids and raw-file ids, through nested Choice/Composite', () => {
    const r = { type: 'XYReading', derivedFrom: { id: 'https://h.example/raw', type: 'Dataset' } };
    const ids = bodyResourceIds([
      { id: 'https://h.example/a', type: 'Dataset', xyReading: r },
      { type: 'Choice', items: [{ id: 'https://h.example/b' }, { type: 'Composite', items: [{ id: 'https://h.example/c' }] }] },
      { id: 'urn:x:1' },
      { id: 'ftp://h.example/f' },
    ]);
    expect([...ids].sort()).toEqual(['https://h.example/a', 'https://h.example/b', 'https://h.example/c', 'https://h.example/raw']);
    expect(bodyResourceIds(undefined).size).toBe(0);
  });

  it('stops walking nested items past the depth cap', () => {
    let deep: unknown = { id: 'https://h.example/deep' };
    for (let i = 0; i < 8; i++) deep = { type: 'Choice', items: [deep] };
    expect(bodyResourceIds(deep).size).toBe(0);
  });
});
