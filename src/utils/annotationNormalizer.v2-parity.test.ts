/**
 * v2 / Open Annotation parity: the normalizer maps v2 and v3 wire content to the
 * same model (SpecificResource bodies, purpose, Dataset extras, selectors,
 * motivations), and tolerates spec variants and malformed input.
 */
import { describe, it, expect } from 'vitest';
import { AnnotationItem } from 'mirador';
import { normalizeAnnotationList } from './annotationNormalizer';
import { annotationPostprocessor } from './annotationTransformer';
import type { AnnotationV3 } from '../types/iiif';
import v2Annotations from '../test/fixtures/annotations/v2-annotation-page.json';
import v3Annotations from '../test/fixtures/annotations/v3-annotation-page.json';
import v2Characterization from '../test/fixtures/annotations/v2-characterization-page.json';
import v3Characterization from '../test/fixtures/annotations/v3-characterization-page.json';

const CANVAS = 'https://host/canvas/1';

type Rec = Record<string, unknown>;
const bodiesOf = (a: AnnotationV3): Rec[] =>
  (Array.isArray(a.body) ? a.body : [a.body]) as unknown as Rec[];

/** Normalize a single v2 annotation carrying the given fields. */
const v2One = (fields: Rec): AnnotationV3 =>
  normalizeAnnotationList({
    '@type': 'sc:AnnotationList',
    resources: [{ '@id': 'a', '@type': 'oa:Annotation', on: CANVAS, ...fields }],
  })[0];

const v2Body = (resource: unknown): Rec => bodiesOf(v2One({ resource }))[0];
const v2Target = (on: unknown): Rec => v2One({ on, resource: { chars: 'x' } }).target as unknown as Rec;

describe('v2 oa:SpecificResource body', () => {
  it('maps a typed `full` to {id, type} and hoists the label and purpose', () => {
    expect(
      v2Body({
        '@type': 'oa:SpecificResource',
        full: { '@id': 'https://host/anno/1', '@type': 'oa:Annotation' },
        'oa:hasPurpose': { '@id': 'oa:linking' },
      })
    ).toEqual({
      type: 'SpecificResource',
      purpose: 'linking',
      source: { id: 'https://host/anno/1', type: 'Annotation' },
    });
  });

  it('maps an untyped `full` object to a string source with a language-map label', () => {
    expect(
      v2Body({
        '@type': 'oa:SpecificResource',
        full: {
          '@id': 'https://thesaurus/vermilion',
          label: [
            { '@value': 'vermilion', '@language': 'en' },
            { '@value': 'vermillon', '@language': 'fr' },
          ],
        },
        'oa:hasPurpose': { '@id': 'oa:classifying' },
      })
    ).toEqual({
      type: 'SpecificResource',
      purpose: 'classifying',
      source: 'https://thesaurus/vermilion',
      label: { en: ['vermilion'], fr: ['vermillon'] },
    });
  });

  it('accepts `full` as a string and purpose as a plain string, with or without the oa: key prefix', () => {
    for (const purposeKey of ['oa:hasPurpose', 'hasPurpose', 'purpose']) {
      expect(
        v2Body({ '@type': 'oa:SpecificResource', full: 'https://host/c', [purposeKey]: 'oa:tagging' })
      ).toEqual({ type: 'SpecificResource', purpose: 'tagging', source: 'https://host/c' });
    }
  });

  it('accepts an un-prefixed @type and a full-URI purpose', () => {
    expect(
      v2Body({
        '@type': 'SpecificResource',
        full: 'https://host/c',
        hasPurpose: { id: 'http://www.w3.org/ns/oa#describing' },
      })
    ).toMatchObject({ type: 'SpecificResource', purpose: 'describing' });
  });

  it('keeps several purposes as an array', () => {
    expect(
      v2Body({ '@type': 'oa:SpecificResource', full: 'https://host/c', 'oa:hasPurpose': ['oa:tagging', { '@id': 'oa:linking' }] })
    ).toMatchObject({ purpose: ['tagging', 'linking'] });
  });

  it('drops a body without an id and never throws', () => {
    for (const full of [undefined, {}, { label: 'x' }, 42, null]) {
      const annotation = v2One({ resource: [{ '@type': 'oa:SpecificResource', full }, { chars: 'kept' }] });
      expect(bodiesOf(annotation)).toEqual([{ type: 'TextualBody', value: 'kept' }]);
    }
  });
});

describe('v2 purpose on other bodies', () => {
  it('adds purpose to a TextualBody', () => {
    expect(
      v2Body({ '@type': 'cnt:ContentAsText', chars: 'hi', language: 'en', 'oa:hasPurpose': { '@id': 'oa:describing' } })
    ).toEqual({ type: 'TextualBody', value: 'hi', language: 'en', purpose: 'describing' });
  });

  it('adds purpose to a Dataset', () => {
    expect(
      v2Body({ '@id': 'https://host/d.csv', '@type': 'dctypes:Dataset', format: 'text/csv', 'oa:hasPurpose': 'oa:describing' })
    ).toMatchObject({ type: 'Dataset', purpose: 'describing' });
  });

  it('maps oa:Tag to a tagging TextualBody unless a purpose is declared', () => {
    expect(v2Body({ '@type': 'oa:Tag', chars: 'red' })).toEqual({ type: 'TextualBody', value: 'red', purpose: 'tagging' });
    expect(v2Body({ '@type': 'oa:Tag', chars: 'red', purpose: 'describing' })).toMatchObject({ purpose: 'describing' });
  });

  it('leaves purpose off when none is declared', () => {
    expect(v2Body({ chars: 'x' })).not.toHaveProperty('purpose');
  });
});

describe('v2 dctypes:Dataset body', () => {
  const xyReading = { type: 'XYReading', columns: [{ index: 0, role: 'x' }] };

  it('keeps xyReading and other unmapped keys, maps license to rights, leaks no @id/@type', () => {
    const body = v2Body({
      '@id': 'https://host/d.csv',
      '@type': 'dctypes:Dataset',
      format: 'text/csv',
      label: [{ '@value': 'Series', '@language': 'en' }],
      license: 'https://creativecommons.org/licenses/by/4.0/',
      xyReading,
      custom: 1,
    });
    expect(body).toEqual({
      type: 'Dataset',
      id: 'https://host/d.csv',
      format: 'text/csv',
      label: { en: ['Series'] },
      rights: 'https://creativecommons.org/licenses/by/4.0/',
      xyReading,
      custom: 1,
    });
    expect(body).not.toHaveProperty('@id');
    expect(body).not.toHaveProperty('@type');
  });

  it('keeps an explicit rights over license', () => {
    expect(
      v2Body({ '@id': 'd', '@type': 'dctypes:Dataset', format: 'text/csv', rights: 'r', license: 'l' })
    ).toMatchObject({ rights: 'r' });
  });

  it('explicit normalized keys win over same-named wire keys', () => {
    expect(
      v2Body({ '@id': 'd', '@type': 'dctypes:Dataset', format: 'text/csv', type: 'Other', id: 'other' })
    ).toMatchObject({ type: 'Dataset', id: 'd' });
  });

  it('keeps extras on a Dataset recognized by MIME type only', () => {
    expect(v2Body({ '@id': 'd', format: 'text/csv', xyReading })).toMatchObject({ type: 'Dataset', xyReading });
  });
});

describe('v2 target selectors', () => {
  const fragment = { '@type': 'oa:FragmentSelector', value: 'xywh=1,2,24,24' };
  const svg = { '@type': 'oa:SvgSelector', value: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>' };
  const on = (selector: unknown) => ({ '@type': 'oa:SpecificResource', full: CANVAS, selector });
  const normFragment = { type: 'FragmentSelector', value: 'xywh=1,2,24,24' };
  const normSvg = { type: 'SvgSelector', value: svg.value };

  it('flattens oa:Choice into [default, item]', () => {
    expect(v2Target(on({ '@type': 'oa:Choice', default: fragment, item: svg }))).toEqual({
      type: 'SpecificResource',
      source: CANVAS,
      selector: [normFragment, normSvg],
    });
  });

  it('accepts item as an array and flattens every entry', () => {
    const extra = { '@type': 'oa:SvgSelector', value: '<svg/>' };
    const t = v2Target(on({ '@type': 'oa:Choice', default: fragment, item: [svg, extra] }));
    expect(t.selector).toEqual([normFragment, normSvg, { type: 'SvgSelector', value: '<svg/>' }]);
  });

  it('accepts a Choice without default', () => {
    expect(v2Target(on({ '@type': 'oa:Choice', item: svg })).selector).toEqual(normSvg);
  });

  it('accepts a Choice with an un-prefixed type and `items`', () => {
    expect(v2Target(on({ type: 'Choice', default: fragment, items: [svg] })).selector).toEqual([normFragment, normSvg]);
  });

  it('keeps a single selector as an object and several as an array', () => {
    expect(v2Target(on(fragment)).selector).toEqual(normFragment);
    expect(v2Target(on([fragment, svg])).selector).toEqual([normFragment, normSvg]);
  });

  it('drops Fragment/Svg selectors without a string value', () => {
    const t = v2Target(
      on({ '@type': 'oa:Choice', default: { '@type': 'oa:FragmentSelector' }, item: [{ '@type': 'oa:SvgSelector', value: 3 }, svg] })
    );
    expect(t.selector).toEqual(normSvg);
    expect(v2Target(on({ '@type': 'oa:FragmentSelector' }))).not.toHaveProperty('selector');
  });

  it('keeps selectors that carry no value (point) and falls back to chars', () => {
    expect(v2Target(on({ '@type': 'oa:PointSelector', x: 1, y: 2 })).selector).toEqual({ type: 'PointSelector', x: 1, y: 2 });
    expect(v2Target(on({ chars: 'xywh=5,6,7,8' })).selector).toEqual({ type: 'FragmentSelector', value: 'xywh=5,6,7,8' });
  });

  it('takes a `full` object as the source and tolerates junk targets', () => {
    expect(v2Target({ full: { '@id': CANVAS, '@type': 'sc:Canvas' } }).source).toEqual({ id: CANVAS, type: 'Canvas' });
    for (const junk of [null, 12, [], [null, 3], { selector: 5 }]) {
      expect(() => v2One({ on: junk })).not.toThrow();
    }
  });

  it('normalizes selectors of a v3 target too (Choice, prefixes, value-less)', () => {
    const [annotation] = normalizeAnnotationList({
      type: 'AnnotationPage',
      items: [
        {
          id: 'a',
          type: 'Annotation',
          body: [],
          target: {
            type: 'SpecificResource',
            source: CANVAS,
            selector: [{ type: 'FragmentSelector' }, { type: 'oa:Choice', default: normFragment, item: normSvg }],
          },
        },
      ],
    });
    expect((annotation.target as unknown as Rec).selector).toEqual([normFragment, normSvg]);
  });
});

describe('motivation mapping', () => {
  const motivation = (m: unknown) =>
    normalizeAnnotationList({ resources: [{ '@id': 'a', motivation: m, on: CANVAS }] })[0].motivation;

  it('strips a leading oa:', () => {
    expect(motivation('oa:commenting')).toBe('commenting');
    expect(motivation('oa:classifying')).toBe('classifying');
  });

  it('keeps sc:painting and bare motivations', () => {
    expect(motivation('sc:painting')).toBe('sc:painting');
    expect(motivation('supplementing')).toBe('supplementing');
  });

  it('handles arrays, object forms and full URIs', () => {
    expect(motivation(['oa:commenting', 'sc:painting', 'tagging'])).toEqual(['commenting', 'sc:painting', 'tagging']);
    expect(motivation({ '@id': 'oa:linking' })).toBe('linking');
    expect(motivation('http://www.w3.org/ns/oa#describing')).toBe('describing');
  });

  it('omits missing or unusable motivations', () => {
    expect(motivation(undefined)).toBeUndefined();
    expect(motivation(5)).toBeUndefined();
    expect(motivation([])).toBeUndefined();
  });

  it('applies to v3 annotations as well', () => {
    const [a] = normalizeAnnotationList({ items: [{ id: 'a', type: 'Annotation', motivation: ['oa:tagging'], body: [], target: CANVAS }] });
    expect(a.motivation).toEqual(['tagging']);
  });
});

describe('unknown v3 annotation properties are preserved', () => {
  const page = {
    type: 'AnnotationPage',
    items: [
      {
        id: 'a',
        type: 'Annotation',
        bodyValue: 'plain comment',
        created: '2024-01-01T00:00:00Z',
        creator: { id: 'https://host/u/1', type: 'Person' },
        rights: 'https://creativecommons.org/licenses/by/4.0/',
        stylesheet: { type: 'CssStylesheet', value: '.x { color: red }' },
        motivation: 'oa:commenting',
        target: CANVAS,
      },
    ],
  };

  it('keeps bodyValue, created, creator, rights and stylesheet', () => {
    const [a] = normalizeAnnotationList(page) as unknown as Rec[];
    expect(a).toMatchObject({
      bodyValue: 'plain comment',
      created: '2024-01-01T00:00:00Z',
      creator: { id: 'https://host/u/1', type: 'Person' },
      rights: 'https://creativecommons.org/licenses/by/4.0/',
      stylesheet: { type: 'CssStylesheet', value: '.x { color: red }' },
    });
  });

  it('lets the normalized keys win over unknown ones', () => {
    const [a] = normalizeAnnotationList(page);
    expect(a).toMatchObject({ id: 'a', type: 'Annotation', motivation: 'commenting', body: [], target: CANVAS });
  });

  it('does not leak v2 wire keys', () => {
    const a = v2One({ created: 'x', resource: { chars: 'x' } }) as unknown as Rec;
    expect(a).not.toHaveProperty('@type');
    expect(a).not.toHaveProperty('resource');
  });
});

describe('v2 / v3 parity', () => {
  const stripId = (a: AnnotationV3) => {
    const rest: Rec = { ...a };
    delete rest.id;
    return rest;
  };

  it('normalizes the same content written in v2 and v3 to equivalent output', () => {
    const xyReading = { type: 'XYReading', columns: [{ index: 0, role: 'x' }] };
    const svgValue = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
    const v2 = normalizeAnnotationList({
      '@type': 'sc:AnnotationList',
      resources: [
        {
          '@id': 'v2-a',
          '@type': 'oa:Annotation',
          motivation: 'oa:classifying',
          label: [{ '@value': 'Red', '@language': 'en' }],
          resource: [
            { '@type': 'cnt:ContentAsText', chars: 'Red pigment', format: 'text/plain', language: 'en', 'oa:hasPurpose': { '@id': 'oa:describing' } },
            {
              '@type': 'oa:SpecificResource',
              full: { '@id': 'https://thesaurus/vermilion', label: [{ '@value': 'vermilion', '@language': 'en' }] },
              'oa:hasPurpose': { '@id': 'oa:classifying' },
            },
            {
              '@type': 'oa:SpecificResource',
              full: { '@id': 'https://host/anno/2', '@type': 'oa:Annotation' },
              'oa:hasPurpose': { '@id': 'oa:linking' },
            },
            { '@id': 'https://host/d.csv', '@type': 'dctypes:Dataset', format: 'text/csv', license: 'https://cc/by', xyReading },
          ],
          on: {
            '@type': 'oa:SpecificResource',
            full: CANVAS,
            selector: {
              '@type': 'oa:Choice',
              default: { '@type': 'oa:FragmentSelector', value: 'xywh=1,2,24,24' },
              item: { '@type': 'oa:SvgSelector', value: svgValue },
            },
          },
        },
      ],
    });
    const v3 = normalizeAnnotationList({
      type: 'AnnotationPage',
      items: [
        {
          id: 'v3-a',
          type: 'Annotation',
          motivation: 'classifying',
          label: { en: ['Red'] },
          body: [
            { type: 'TextualBody', value: 'Red pigment', format: 'text/plain', language: 'en', purpose: 'describing' },
            { type: 'SpecificResource', purpose: 'classifying', source: 'https://thesaurus/vermilion', label: { en: ['vermilion'] } },
            { type: 'SpecificResource', purpose: 'linking', source: { id: 'https://host/anno/2', type: 'Annotation' } },
            { type: 'Dataset', id: 'https://host/d.csv', format: 'text/csv', rights: 'https://cc/by', xyReading },
          ],
          target: {
            type: 'SpecificResource',
            source: CANVAS,
            selector: [
              { type: 'FragmentSelector', value: 'xywh=1,2,24,24' },
              { type: 'SvgSelector', value: svgValue },
            ],
          },
        },
      ],
    });
    expect(stripId(v2[0])).toEqual(stripId(v3[0]));
  });

  it('maps the v2 characterization fixture bodies and motivation to the v3 fixture', () => {
    const [fromV2] = normalizeAnnotationList(v2Characterization);
    const [fromV3] = normalizeAnnotationList(v3Characterization);
    expect(fromV2.motivation).toBe(fromV3.motivation);
    expect(fromV2.label).toEqual(fromV3.label);
    // Annotation ids embed the API version; everything else must match.
    const sameVersion = (bodies: Rec[]) => JSON.parse(JSON.stringify(bodies).replace(/\/iiif\/v[23]\//g, '/iiif/vN/'));
    expect(sameVersion(bodiesOf(fromV2))).toEqual(sameVersion(bodiesOf(fromV3)));
  });

  it('keeps the linking body of the characterization fixture', () => {
    const [annotation] = normalizeAnnotationList(v2Characterization);
    const linking = bodiesOf(annotation).filter((b) => b.purpose === 'linking');
    expect(linking.length).toBeGreaterThan(0);
    expect(linking[0]).toMatchObject({ type: 'SpecificResource', source: { type: 'Annotation' } });
  });

  it('maps the v2 annotation fixture: Choice point, body-less rectangle, Dataset extras', () => {
    const [point, rect] = normalizeAnnotationList(v2Annotations);
    const body = bodiesOf(point)[0];
    expect(body).toMatchObject({ type: 'Dataset', format: 'text/csv' });
    expect(body).toHaveProperty('xyReading');
    expect(body).toHaveProperty('rights');
    expect(body).not.toHaveProperty('@id');
    expect(point.motivation).toBe('commenting');
    expect((point.target as unknown as Rec).selector).toMatchObject([
      { type: 'FragmentSelector', value: 'xywh=1979,2797,24,24' },
      { type: 'SvgSelector' },
    ]);

    expect(rect.body).toEqual([]);
    expect(rect.target).toMatchObject({
      type: 'SpecificResource',
      selector: { type: 'FragmentSelector', value: 'xywh=1866,2684,390,434' },
    });
  });

  it('keeps v3 fixture annotations unchanged in shape (point + body-less rectangle)', () => {
    const [point, rect] = normalizeAnnotationList(v3Annotations);
    expect(bodiesOf(point)[0]).toHaveProperty('xyReading');
    expect(rect.body).toEqual([]);
  });
});

describe('Mirador AnnotationItem reads the normalized v2 output', () => {
  it('finds svgSelector and fragmentSelector on the Choice point', () => {
    const [point] = normalizeAnnotationList(v2Annotations);
    const item = new AnnotationItem(point as unknown as Record<string, unknown>);
    expect(item.svgSelector).toBeTruthy();
    expect(item.fragmentSelector).toEqual([1979, 2797, 24, 24]);
  });

  it('reads the same values after the request postprocessor', () => {
    const action = { annotationJson: JSON.parse(JSON.stringify(v2Annotations)) };
    annotationPostprocessor('http://host/list', action);
    const [point] = (action.annotationJson as { items: AnnotationV3[] }).items;
    const item = new AnnotationItem(point as unknown as Record<string, unknown>);
    expect(item.svgSelector).toBeTruthy();
    expect(item.fragmentSelector).toEqual([1979, 2797, 24, 24]);
  });

  it('reads the body-less rectangle', () => {
    const rect = normalizeAnnotationList(v2Annotations)[1];
    const item = new AnnotationItem(rect as unknown as Record<string, unknown>);
    expect(item.fragmentSelector).toEqual([1866, 2684, 390, 434]);
  });
});

describe('hostile producer input', () => {
  it('does not overflow the stack on deeply nested oa:Choice selectors', () => {
    let sel: Rec = { '@type': 'oa:FragmentSelector', value: 'xywh=1,2,3,4' };
    for (let i = 0; i < 20000; i++) sel = { '@type': 'oa:Choice', default: sel };
    expect(() => v2Target({ '@type': 'oa:SpecificResource', full: CANVAS, selector: sel })).not.toThrow();
  });

  it('accepts prototype-named @language values in localized labels', () => {
    for (const lang of ['constructor', '__proto__', 'toString']) {
      const label = v2One({ resource: { chars: 'x' }, label: [{ '@value': 'v', '@language': lang }] }).label as Rec;
      expect(Object.getPrototypeOf(label)).toBe(Object.prototype);
    }
    const anno = v2One({ resource: { chars: 'x' }, label: [{ '@value': 'v', '@language': 'constructor' }] });
    expect(Object.keys(anno.label as Rec)).toEqual(['constructor']);
  });

  it('ignores a __proto__ key on a parsed Dataset body and still maps license to rights', () => {
    const resource = JSON.parse(
      '{"@id":"https://host/d.csv","@type":"dctypes:Dataset","format":"text/csv","license":"https://l","__proto__":{"rights":"x"}}'
    );
    const body = v2Body(resource);
    expect(body).toMatchObject({ type: 'Dataset', rights: 'https://l' });
    expect(Object.prototype.hasOwnProperty.call(body, '__proto__')).toBe(false);
  });
});

describe('v2 oa:SpecificResource body selector', () => {
  it('keeps the region selected on the body source', () => {
    expect(
      v2Body({
        '@type': 'oa:SpecificResource',
        full: 'https://img/1',
        selector: { '@type': 'oa:FragmentSelector', value: 'xywh=1,2,3,4' },
      })
    ).toEqual({ type: 'SpecificResource', source: 'https://img/1', selector: { type: 'FragmentSelector', value: 'xywh=1,2,3,4' } });
  });
});

describe('fixture parity of targets and selectors', () => {
  const canvasId = (t: unknown): string => {
    const src = (t as Rec).source;
    return typeof src === 'string' ? src : (src as Rec).id as string;
  };
  const selectorPairs = (t: unknown): [unknown, unknown][] => {
    const sel = (t as Rec).selector;
    return (Array.isArray(sel) ? sel : sel ? [sel] : []).map((x: Rec) => [x.type, x.value]);
  };

  it.each([
    ['annotation page', v2Annotations, v3Annotations],
    ['characterization page', v2Characterization, v3Characterization],
  ])('v2 and v3 %s share canvas and selectors', (_name, v2, v3) => {
    const a = normalizeAnnotationList(v2);
    const b = normalizeAnnotationList(v3);
    expect(a).toHaveLength(b.length);
    a.forEach((x, i) => {
      expect(canvasId(x.target)).toBe(canvasId(b[i].target));
      // The v3 producer describes a point as PointSelector (no value) where v2 uses an xywh fragment.
      const v3Pairs = selectorPairs(b[i].target).filter(([t]) => t !== 'PointSelector');
      const hasFragment = v3Pairs.some(([t]) => t === 'FragmentSelector');
      const v2Pairs = selectorPairs(x.target).filter(([t]) => hasFragment || t !== 'FragmentSelector');
      expect(v2Pairs).toEqual(v3Pairs);
    });
  });
});
