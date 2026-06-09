/**
 * Tests for the IIIF annotation normalizer.
 *
 * Covers the adapter registry (recognition + selection), Presentation 3 / 2
 * field mapping (annotation/body/target/seeAlso/localized values), multi-body,
 * duplicate-id safety, mixed containers, robustness, a v2/v3 round-trip
 * equivalence assertion, and registry extensibility for a future format.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  v2ValueToLocalized,
  normalizeAnnotationList,
  normalizeAnnotationResources,
  adapterFor,
  registerAnnotationAdapter,
  ANNOTATION_ADAPTERS,
  type AnnotationAdapter,
} from './annotationNormalizer';
import { getLocalizedString } from './localization';
import type { AnnotationBody, AnnotationTarget } from '../types/iiif';

const firstBody = (body: AnnotationBody | AnnotationBody[]): AnnotationBody =>
  Array.isArray(body) ? body[0] : body;

describe('adapterFor — registry recognition', () => {
  it('selects the Presentation 3 adapter for items[] or AnnotationPage', () => {
    expect(adapterFor({ items: [] })?.name).toBe('iiif-presentation-3');
    expect(adapterFor({ type: 'AnnotationPage' })?.name).toBe('iiif-presentation-3');
  });

  it('selects the Presentation 2 adapter for resources[] or sc:AnnotationList', () => {
    expect(adapterFor({ resources: [] })?.name).toBe('iiif-presentation-2');
    expect(adapterFor({ '@type': 'sc:AnnotationList' })?.name).toBe('iiif-presentation-2');
  });

  it('prefers @context to declare the version (string or array)', () => {
    // v2 list recognized by its Presentation 2 @context (the authoritative cue).
    expect(adapterFor({ '@context': 'http://iiif.io/api/presentation/2/context.json' })?.name)
      .toBe('iiif-presentation-2');
    // v3 page recognized by the W3C Web Annotation @context.
    expect(adapterFor({ '@context': 'http://www.w3.org/ns/anno.jsonld' })?.name)
      .toBe('iiif-presentation-3');
    // v3 recognized by the Presentation 3 @context, including the array form.
    expect(adapterFor({ '@context': ['http://iiif.io/api/presentation/3/context.json'] })?.name)
      .toBe('iiif-presentation-3');
  });

  it('returns undefined for an unrecognized / non-object container', () => {
    expect(adapterFor({ something: 'else' })).toBeUndefined();
    expect(adapterFor(null)).toBeUndefined();
    expect(adapterFor(42)).toBeUndefined();
  });
});

describe('v2ValueToLocalized', () => {
  it('passes plain strings through', () => {
    expect(v2ValueToLocalized('hello')).toBe('hello');
  });

  it('converts a single {@value,@language}', () => {
    const loc = v2ValueToLocalized({ '@value': 'XRF point 1', '@language': 'en' });
    expect(loc).toEqual({ en: ['XRF point 1'] });
    expect(getLocalizedString(loc as Record<string, string[]>)).toBe('XRF point 1');
  });

  it('uses "none" when no @language', () => {
    expect(v2ValueToLocalized({ '@value': 'x' })).toEqual({ none: ['x'] });
  });

  it('merges an array of value forms', () => {
    const loc = v2ValueToLocalized([
      { '@value': 'XRF point 1', '@language': 'en' },
      { '@value': 'Point XRF 1', '@language': 'fr' },
    ]);
    expect(loc).toEqual({ en: ['XRF point 1'], fr: ['Point XRF 1'] });
    expect(getLocalizedString(loc as Record<string, string[]>, ['fr'])).toBe('Point XRF 1');
  });

  it('returns undefined for undefined', () => {
    expect(v2ValueToLocalized(undefined)).toBeUndefined();
  });
});

describe('normalizeAnnotationList — v3 passthrough', () => {
  it('keeps v3 annotations ~unchanged, keyed by id downstream', () => {
    const page = {
      type: 'AnnotationPage',
      items: [
        {
          id: 'anno-1',
          type: 'Annotation',
          motivation: 'commenting',
          body: { type: 'Dataset', id: 'd1', format: 'text/csv' },
          target: { type: 'SpecificResource', source: 'c1', selector: { type: 'FragmentSelector', value: 'xywh=1,2,3,4' } },
        },
      ],
    };
    const result = normalizeAnnotationList(page);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('anno-1');
    expect(result[0].type).toBe('Annotation');
    expect(firstBody(result[0].body)).toMatchObject({ type: 'Dataset', id: 'd1', format: 'text/csv' });
  });
});

describe('normalizeAnnotationList — v2 list', () => {
  const v2List = {
    '@type': 'sc:AnnotationList',
    '@id': 'list-1',
    label: 'Page 10',
    resources: [
      {
        '@id': 'anno-a',
        '@type': 'oa:Annotation',
        motivation: 'oa:commenting',
        on: 'https://iiif.unicaen.fr/AVRANCHES_MS059_0010.tif#xywh=1345,2656,1,1',
        resource: { '@id': 'd-csv', '@type': 'dctypes:Dataset', format: 'text/csv' },
        label: 'CSV point',
      },
    ],
  };

  it('keys by @id and sets type Annotation', () => {
    const result = normalizeAnnotationList(v2List);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('anno-a');
    expect(result[0].type).toBe('Annotation');
    expect(result[0].motivation).toBe('oa:commenting');
  });
});

describe('normalizeAnnotationList — body mapping', () => {
  const wrap = (resource: unknown) => ({
    resources: [{ '@id': 'a', '@type': 'oa:Annotation', on: 'c#xywh=0,0,1,1', resource }],
  });
  const bodyOf = (resource: unknown) => firstBody(normalizeAnnotationList(wrap(resource))[0].body);

  it('dctypes:Dataset + text/csv → Dataset, format preserved', () => {
    expect(bodyOf({ '@id': 'x', '@type': 'dctypes:Dataset', format: 'text/csv' })).toMatchObject({
      type: 'Dataset', id: 'x', format: 'text/csv',
    });
  });

  it('text/txt → normalized to text/plain', () => {
    expect(bodyOf({ '@id': 'x', '@type': 'dctypes:Dataset', format: 'text/txt' })).toMatchObject({
      type: 'Dataset', format: 'text/plain',
    });
  });

  it('application/octet-stream stays Dataset, format preserved', () => {
    expect(bodyOf({ '@id': 'x', '@type': 'dctypes:Dataset', format: 'application/octet-stream' })).toMatchObject({
      type: 'Dataset', format: 'application/octet-stream',
    });
  });

  it('dctypes:Dataset with missing format still → Dataset', () => {
    expect(bodyOf({ '@id': 'x', '@type': 'dctypes:Dataset' })).toMatchObject({ type: 'Dataset', id: 'x' });
  });

  it('cnt:ContentAsText + chars → TextualBody (no @id)', () => {
    expect(bodyOf({ '@type': 'cnt:ContentAsText', chars: 'some text', format: 'text/plain' })).toMatchObject({
      type: 'TextualBody', value: 'some text', format: 'text/plain',
    });
  });

  it('chars present without @type → TextualBody', () => {
    expect(bodyOf({ chars: 'inline' })).toMatchObject({ type: 'TextualBody', value: 'inline' });
  });

  it('sc:Manifest → Manifest', () => {
    expect(bodyOf({ '@id': 'm', '@type': 'sc:Manifest', format: 'application/ld+json' })).toMatchObject({
      type: 'Manifest', id: 'm',
    });
  });

  it('application/ld+json without @type → Manifest', () => {
    expect(bodyOf({ '@id': 'm', format: 'application/ld+json' })).toMatchObject({ type: 'Manifest', id: 'm' });
  });

  it('bare v3 @type passes through', () => {
    expect(bodyOf({ '@id': 'd', '@type': 'Dataset', format: 'text/csv' })).toMatchObject({
      type: 'Dataset', id: 'd', format: 'text/csv',
    });
  });

  it('unknown namespaced @type → prefix stripped, no throw', () => {
    expect(() => bodyOf({ '@id': 'u', '@type': 'foo:Bar' })).not.toThrow();
    expect(bodyOf({ '@id': 'u', '@type': 'foo:Bar' })).toMatchObject({ type: 'Bar', id: 'u' });
  });

  it('multi-body array → body array', () => {
    const result = normalizeAnnotationList({
      resources: [{
        '@id': 'a', '@type': 'oa:Annotation', on: 'c#xywh=0,0,1,1',
        resource: [
          { '@id': 'd', '@type': 'dctypes:Dataset', format: 'text/csv' },
          { '@type': 'cnt:ContentAsText', chars: 'note' },
        ],
      }],
    });
    const body = result[0].body;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect((body as AnnotationBody[])[0].type).toBe('Dataset');
    expect((body as AnnotationBody[])[1].type).toBe('TextualBody');
  });
});

describe('normalizeAnnotationList — target mapping', () => {
  const targetOf = (on: unknown): AnnotationTarget | string => {
    const r = normalizeAnnotationList({
      resources: [{ '@id': 'a', '@type': 'oa:Annotation', on, resource: { chars: 'x' } }],
    });
    return r[0].target;
  };

  it('string with #xywh → SpecificResource + FragmentSelector', () => {
    const t = targetOf('https://host/img.tif#xywh=1345,2656,1,1') as AnnotationTarget;
    expect(t).toMatchObject({
      type: 'SpecificResource',
      source: 'https://host/img.tif',
      selector: { type: 'FragmentSelector', value: 'xywh=1345,2656,1,1' },
    });
  });

  it('string without fragment → returned as-is', () => {
    expect(targetOf('https://host/img.tif')).toBe('https://host/img.tif');
  });

  it('object form → SpecificResource from full + selector value', () => {
    const t = targetOf({
      full: 'https://host/canvas',
      selector: { '@type': 'oa:FragmentSelector', value: 'xywh=10,20,30,40' },
    }) as AnnotationTarget;
    expect(t).toMatchObject({
      type: 'SpecificResource',
      source: 'https://host/canvas',
      selector: { type: 'FragmentSelector', value: 'xywh=10,20,30,40' },
    });
  });

  it('object form falls back to selector chars', () => {
    const t = targetOf({
      full: 'https://host/canvas',
      selector: { chars: 'xywh=1,2,3,4' },
    }) as AnnotationTarget;
    expect((t.selector as { value: string }).value).toBe('xywh=1,2,3,4');
  });
});

describe('normalizeAnnotationList — seeAlso', () => {
  const seeAlsoOf = (seeAlso: unknown) =>
    normalizeAnnotationList({
      resources: [{ '@id': 'a', '@type': 'oa:Annotation', on: 'c#xywh=0,0,1,1', resource: { chars: 'x' }, seeAlso }],
    })[0].seeAlso;

  it('string @id → id string', () => {
    const sa = seeAlsoOf({ '@id': 'https://x/report.html', '@type': 'dctypes:Text', format: 'text/html', label: 'Report' });
    const entry = Array.isArray(sa) ? sa[0] : sa;
    expect(entry?.id).toBe('https://x/report.html');
    expect(entry?.format).toBe('text/html');
  });

  it('object @id { url, url_label } preserved, NOT stringified', () => {
    const sa = seeAlsoOf({ '@id': { url: 'https://doi.org/10.x', url_label: 'Citation' }, format: 'text/html' });
    const entry = Array.isArray(sa) ? sa[0] : sa;
    expect(entry?.id).toEqual({ url: 'https://doi.org/10.x', url_label: 'Citation' });
    expect(JSON.stringify(entry?.id)).not.toContain('[object Object]');
  });
});

describe('normalizeAnnotationList — localized values resolvable downstream', () => {
  it('handles {@value,@language} label and metadata', () => {
    const result = normalizeAnnotationList({
      resources: [{
        '@id': 'a', '@type': 'oa:Annotation', on: 'c#xywh=0,0,1,1', resource: { chars: 'x' },
        label: [{ '@value': 'XRF point 1', '@language': 'en' }, { '@value': 'Point XRF 1', '@language': 'fr' }],
        metadata: [{ label: { '@value': 'Technique', '@language': 'en' }, value: 'XRF' }],
      }],
    });
    expect(getLocalizedString(result[0].label)).toBe('XRF point 1');
    expect(getLocalizedString(result[0].metadata![0].label)).toBe('Technique');
    expect(getLocalizedString(result[0].metadata![0].value)).toBe('XRF');
  });

  it('handles plain-string labels and metadata', () => {
    const result = normalizeAnnotationList({
      resources: [{
        '@id': 'a', '@type': 'oa:Annotation', on: 'c#xywh=0,0,1,1', resource: { chars: 'x' },
        label: 'Plain label',
        metadata: [{ label: 'Author', value: 'Jane Doe' }],
      }],
    });
    expect(getLocalizedString(result[0].label)).toBe('Plain label');
    expect(getLocalizedString(result[0].metadata![0].value)).toBe('Jane Doe');
  });
});

describe('normalizeAnnotationResources', () => {
  it('returns {} for missing / null / non-object input', () => {
    expect(normalizeAnnotationResources(undefined)).toEqual({});
    expect(normalizeAnnotationResources(null as unknown as undefined)).toEqual({});
    expect(normalizeAnnotationResources({})).toEqual({});
  });

  it('skips canvases with missing json without throwing', () => {
    expect(normalizeAnnotationResources({ c1: {}, c2: { json: null } })).toEqual({});
  });

  it('merges a v2 list and a v3 page under the same canvas', () => {
    const map = normalizeAnnotationResources({
      v2canvas: {
        json: {
          '@type': 'sc:AnnotationList',
          resources: [{ '@id': 'v2-1', '@type': 'oa:Annotation', on: 'c#xywh=0,0,1,1', resource: { chars: 'x' } }],
        },
      },
      v3canvas: {
        json: {
          type: 'AnnotationPage',
          items: [{ id: 'v3-1', type: 'Annotation', body: { type: 'TextualBody', value: 'y' }, target: 'c' }],
        },
      },
    });
    expect(Object.keys(map).sort()).toEqual(['v2-1', 'v3-1']);
    expect(map['v2-1'].type).toBe('Annotation');
    expect(map['v3-1'].type).toBe('Annotation');
  });

  it('keeps all four duplicate-@id annotations (none dropped)', () => {
    const sameId = (xywh: string) => ({
      '@id': 'e6438d16-micro-imaging',
      '@type': 'oa:Annotation',
      on: `https://host/img.tif#xywh=${xywh}`,
      resource: { '@id': 'd', '@type': 'dctypes:Dataset', format: 'application/octet-stream' },
      label: 'Micro Imaging',
    });
    const map = normalizeAnnotationResources({
      c1: {
        json: {
          '@type': 'sc:AnnotationList',
          resources: [
            sameId('100,100,10,10'),
            sameId('200,200,10,10'),
            sameId('300,300,10,10'),
            sameId('400,400,10,10'),
          ],
        },
      },
    });
    expect(Object.keys(map)).toHaveLength(4);
    expect(map['e6438d16-micro-imaging']).toBeDefined();
    expect(map['e6438d16-micro-imaging#target-1']).toBeDefined();
    expect(map['e6438d16-micro-imaging#target-3']).toBeDefined();
    // suffixed entries carry the suffixed id
    expect(map['e6438d16-micro-imaging#target-1'].id).toBe('e6438d16-micro-imaging#target-1');
  });
});

describe('normalizeAnnotationList — robustness', () => {
  it('returns [] for null / garbage / empty resources, never throws', () => {
    expect(normalizeAnnotationList(null)).toEqual([]);
    expect(normalizeAnnotationList(42)).toEqual([]);
    expect(normalizeAnnotationList({ resources: [] })).toEqual([]);
    expect(normalizeAnnotationList({ items: [] })).toEqual([]);
    expect(() => normalizeAnnotationList({ resources: [null, 'junk', {}] })).not.toThrow();
  });

  it('drops annotations with no usable id', () => {
    expect(normalizeAnnotationList({ resources: [{ '@type': 'oa:Annotation', resource: { chars: 'x' } }] })).toEqual([]);
  });
});

describe('round-trip — v2 and equivalent v3 normalize to deep-equal (modulo id)', () => {
  it('produces the same normalized annotation', () => {
    const v2 = {
      '@type': 'sc:AnnotationList',
      '@id': 'list',
      resources: [
        {
          '@id': 'rt-v2',
          '@type': 'oa:Annotation',
          motivation: 'commenting',
          on: 'https://host/img.tif#xywh=10,20,30,40',
          resource: { '@id': 'd1', '@type': 'dctypes:Dataset', format: 'text/csv' },
          label: 'Point 1',
          metadata: [{ label: 'Technique', value: 'XRF' }],
          seeAlso: { '@id': 'https://host/report.html', '@type': 'dctypes:Text', format: 'text/html', label: 'Report' },
        },
      ],
    };
    const v3 = {
      type: 'AnnotationPage',
      items: [
        {
          id: 'rt-v3',
          type: 'Annotation',
          motivation: 'commenting',
          target: {
            type: 'SpecificResource',
            source: 'https://host/img.tif',
            selector: { type: 'FragmentSelector', value: 'xywh=10,20,30,40' },
          },
          body: { type: 'Dataset', id: 'd1', format: 'text/csv' },
          label: { none: ['Point 1'] },
          metadata: [{ label: { none: ['Technique'] }, value: { none: ['XRF'] } }],
          seeAlso: { id: 'https://host/report.html', type: 'dctypes:Text', format: 'text/html', label: { none: ['Report'] } },
        },
      ],
    };

    const stripId = (a: Record<string, unknown>) => {
      const rest = { ...a };
      delete rest.id;
      return rest;
    };
    const fromV2 = normalizeAnnotationList(v2)[0] as unknown as Record<string, unknown>;
    const fromV3 = normalizeAnnotationList(v3)[0] as unknown as Record<string, unknown>;

    expect(stripId(fromV2)).toEqual(stripId(fromV3));
  });
});

describe('registry extensibility — a future IIIF format via registerAnnotationAdapter', () => {
  afterEach(() => {
    // Restore the registry so the prepended fake adapter does not pollute other tests.
    ANNOTATION_ADAPTERS.shift();
  });

  it('reads a made-up Presentation 4 container into the normalized model with no code change', () => {
    // A deliberately different wire shape: container `annotationCollection`, ids `iri`,
    // bodies `resources2`, target `region`. None of these are known to the normalizer.
    const presentation4Adapter: AnnotationAdapter = {
      name: 'iiif-presentation-4-fake',
      matches: (page) => Array.isArray(page.annotationCollection),
      listAnnotations: (page) =>
        Array.isArray(page.annotationCollection) ? page.annotationCollection : [],
      id: (a) => (typeof a.iri === 'string' ? a.iri : undefined),
      motivation: (a) => a.purpose,
      bodies: (a) => (Array.isArray(a.resources2) ? a.resources2 : []),
      target: (a) => a.region,
      label: (a) => a.title,
      metadata: () => undefined,
      seeAlso: () => undefined,
    };
    registerAnnotationAdapter(presentation4Adapter);

    // Prepended adapter wins.
    expect(adapterFor({ annotationCollection: [] })?.name).toBe('iiif-presentation-4-fake');

    const result = normalizeAnnotationList({
      annotationCollection: [
        {
          iri: 'v4-anno-1',
          purpose: 'commenting',
          title: 'Future point',
          resources2: [{ type: 'TextualBody', value: 'A point' }],
          region: 'https://host/img.tif#xywh=10,20,1,1',
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('v4-anno-1');
    expect(result[0].type).toBe('Annotation');
    expect(result[0].motivation).toBe('commenting');
    expect(getLocalizedString(result[0].label)).toBe('Future point');
    expect(firstBody(result[0].body)).toMatchObject({ type: 'TextualBody', value: 'A point' });
    expect(result[0].target).toMatchObject({
      type: 'SpecificResource',
      source: 'https://host/img.tif',
      selector: { type: 'FragmentSelector', value: 'xywh=10,20,1,1' },
    });
  });
});
