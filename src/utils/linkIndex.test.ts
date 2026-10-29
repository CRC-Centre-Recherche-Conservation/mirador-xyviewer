import { describe, it, expect } from 'vitest';
import {
  baseAnnotationId,
  buildLinkRows,
  citingEntries,
  collectLinkingBodies,
  EMPTY_LINK_INDEX,
  getLinkIndex,
  hoverGroup,
  linkedIdsOnCanvas,
  manifestCanvases,
  metadataValue,
  resolveLinkedAnnotationId,
} from './linkIndex';
import type { AnnotationBody, IIIFAnnotation, SpecificResourceBody } from '../types/iiif';
import type { MiradorState } from '../types/mirador';
import characterizations from '../test/fixtures/annotations/manuspectrum-characterizations-page.json';
import analyses from '../test/fixtures/annotations/manuspectrum-analyses-page.json';

const CANVAS = 'https://arca.irht.cnrs.fr/iiif/81855/canvas/canvas-1372508';
const OTHER = 'https://arca.irht.cnrs.fr/iiif/81855/canvas/canvas-2';
const MANIFEST = 'https://example.org/manifest';

const manifest = {
  id: MANIFEST,
  type: 'Manifest',
  items: [
    { id: CANVAS, type: 'Canvas', label: { en: ['f. 009'] }, width: 3000, height: 4000 },
    { id: OTHER, type: 'Canvas', label: { en: ['f. 010'] }, width: 3000, height: 4000 },
  ],
};

function stateWith(annotations: MiradorState['annotations']): MiradorState {
  return {
    windows: { w1: { id: 'w1', manifestId: MANIFEST, canvasId: CANVAS } },
    manifests: { [MANIFEST]: { id: MANIFEST, json: manifest } },
    annotations,
    config: {},
    workspace: {},
  } as unknown as MiradorState;
}


/** The analyses page as the producer would emit it for another canvas (their targets name it). */
const analysesTargeting = (canvasId: string) => ({
  ...analyses,
  items: (analyses.items as unknown as Array<{ target: { source: { id: string } } }>).map((a) => ({
    ...a,
    target: { ...a.target, source: { ...a.target.source, id: canvasId } },
  })),
});

const realState = () =>
  stateWith({
    [CANVAS]: {
      chars: { json: characterizations },
      analyses: { json: analyses },
    },
  });

const [lapis, redLead] = characterizations.items as unknown as IIIFAnnotation[];
const analysisItems = analyses.items as unknown as IIIFAnnotation[];

describe('baseAnnotationId / resolveLinkedAnnotationId', () => {
  it('folds #target-N to the base id', () => {
    expect(baseAnnotationId('a#target-0')).toBe('a');
    expect(baseAnnotationId('a#other')).toBe('a#other');
  });
  it('resolves an exact id, else the first expansion', () => {
    expect(resolveLinkedAnnotationId('a', ['b', 'a'])).toBe('a');
    expect(resolveLinkedAnnotationId('a', ['a#target-1', 'a#target-0'])).toBe('a#target-1');
    expect(resolveLinkedAnnotationId('a', ['b'])).toBeUndefined();
    expect(resolveLinkedAnnotationId('', ['b'])).toBeUndefined();
  });
});

describe('collectLinkingBodies', () => {
  it('finds linking bodies inside Choice, Composite and List, and ignores other purposes', () => {
    const link = { type: 'SpecificResource', purpose: 'linking', source: 'x' };
    const body = [
      { type: 'SpecificResource', purpose: 'classifying', source: 'c' },
      { type: 'Composite', items: [link] },
      { type: 'Choice', items: [{ type: 'List', items: [{ ...link, source: 'y' }] }] },
    ] as unknown as AnnotationBody[];
    expect(collectLinkingBodies(body).map((b) => b.source)).toEqual(['x', 'y']);
  });
});

describe('manifestCanvases', () => {
  it('reads Presentation 3 and 2 canvases', () => {
    expect(manifestCanvases(manifest).map((c) => c.id)).toEqual([CANVAS, OTHER]);
    const v2 = { sequences: [{ canvases: [{ '@id': 'c1', label: 'one', width: 10, height: 20 }] }] };
    expect(manifestCanvases(v2)).toEqual([{ id: 'c1', label: 'one', width: 10, height: 20 }]);
    expect(manifestCanvases(undefined)).toEqual([]);
  });
});

describe('link index on the real ManuSpectrum page', () => {
  it('maps the two characterizations to their analyses and back', () => {
    const index = getLinkIndex(realState(), 'w1');
    expect(index.entries.size).toBe(16);
    expect(index.forward.get(lapis.id)).toHaveLength(5);
    expect(index.forward.get(redLead.id)).toHaveLength(3);
    const cited = index.forward.get(lapis.id)![0];
    expect(index.inverse.get(cited)).toEqual([lapis.id]);
    expect(citingEntries(index, cited).map((e) => e.id)).toEqual([lapis.id]);
    expect(citingEntries(index, lapis.id)).toEqual([]);
  });

  it('is memoized per annotation state and window', () => {
    const state = realState();
    expect(getLinkIndex(state, 'w1')).toBe(getLinkIndex(state, 'w1'));
    expect(getLinkIndex({ ...state, annotations: { ...state.annotations } }, 'w1')).not.toBe(getLinkIndex(state, 'w1'));
  });

  it('returns an empty index without annotations', () => {
    expect(getLinkIndex({ windows: {} } as unknown as MiradorState, 'w1')).toBe(EMPTY_LINK_INDEX);
  });

  it('groups the zone with the linked zones present on the canvas', () => {
    const index = getLinkIndex(realState(), 'w1');
    const ids = [lapis.id, ...analysisItems.map((a) => a.id)];
    const group = hoverGroup(index, lapis.id, ids);
    expect(group).toHaveLength(6);
    expect(group[0]).toBe(lapis.id);
    expect(linkedIdsOnCanvas(index, lapis.id, [lapis.id])).toEqual([]);
  });

  it('reads annotations of other canvases of the manifest', () => {
    const state = stateWith({
      [CANVAS]: { chars: { json: characterizations } },
      [OTHER]: { analyses: { json: analysesTargeting(OTHER) } },
    });
    const index = getLinkIndex(state, 'w1');
    expect(index.entries.get(index.forward.get(lapis.id)![0])?.canvasId).toBe(OTHER);
  });

  it('folds #target-N ids of a multi-target annotation into one entry', () => {
    const multi = {
      id: 'urn:multi',
      type: 'Annotation',
      motivation: 'supplementing',
      body: { type: 'SpecificResource', purpose: 'linking', source: { id: 'urn:t', type: 'Annotation' } },
      target: [
        { type: 'SpecificResource', source: CANVAS, selector: { type: 'FragmentSelector', value: 'xywh=1,1,10,10' } },
        { type: 'SpecificResource', source: CANVAS, selector: { type: 'FragmentSelector', value: 'xywh=50,50,10,10' } },
      ],
    };
    const t = { id: 'urn:t', type: 'Annotation', body: { type: 'TextualBody', value: 'x' }, target: CANVAS };
    const state = stateWith({ [CANVAS]: { l: { json: { type: 'AnnotationPage', items: [multi, t] } } } });
    const index = getLinkIndex(state, 'w1');
    expect(index.entries.get('urn:multi')?.ids).toEqual(['urn:multi#target-0', 'urn:multi#target-1']);
    expect(index.forward.get('urn:multi')).toEqual(['urn:t']);
    expect(citingEntries(index, 'urn:t').map((e) => e.id)).toEqual(['urn:multi']);
  });
});

describe('buildLinkRows', () => {
  const state = realState();
  const index = getLinkIndex(state, 'w1');
  const canvasAnnotationIds = [lapis.id, redLead.id, ...analysisItems.map((a) => a.id)];
  const bodies = collectLinkingBodies(lapis.body);
  const env = { index, canvasId: CANVAS, canvasAnnotationIds, prefs: ['en'], subtitleLabel: 'Technique' };

  it('names every row with the label of the target, whole (no splitting on the dash)', () => {
    const rows = buildLinkRows(bodies, env);
    expect(rows).toHaveLength(5);
    const target = analysisItems.find((a) => a.id === (bodies[0].source as { id: string }).id)!;
    expect(rows[0].title).toBe((target.label as { en: string[] }).en[0]);
    expect(rows[0].title).toContain(' — ');
    expect(rows.every((r) => r.kind === 'here')).toBe(true);
  });

  it('uses the host-named metadata as subtitle', () => {
    const rows = buildLinkRows(bodies, env);
    expect(rows[0].subtitle).toBe('Raman microspectrometry');
    expect(buildLinkRows(bodies, { ...env, subtitleLabel: undefined })[0].subtitle).toBe('');
    expect(metadataValue(analysisItems[0], 'technique', ['en'])).toBe('X-ray microfluorescence');
    expect(metadataValue(analysisItems[0], 'Nope', ['en'])).toBe('');
  });

  it('collapses several bodies pointing to the same annotation', () => {
    const rows = buildLinkRows([...bodies, ...bodies], env);
    expect(rows).toHaveLength(5);
  });

  it('prefers the label of the body over the label of the target', () => {
    const named = { ...bodies[0], label: { en: ['Spectrum A'] } } as SpecificResourceBody;
    expect(buildLinkRows([named], env)[0].title).toBe('Spectrum A');
  });

  it('flags rows hidden by a filter, which stay selectable', () => {
    const id = (bodies[0].source as { id: string }).id;
    const [row] = buildLinkRows([bodies[0]], { ...env, hiddenIds: new Set([id]) });
    expect(row.hiddenByFilter).toBe(true);
    expect(row.annotationId).toBe(id);
  });

  it('marks a target of another canvas with that canvas label', () => {
    const split = stateWith({
      [CANVAS]: { chars: { json: characterizations } },
      [OTHER]: { analyses: { json: analysesTargeting(OTHER) } },
    });
    const i2 = getLinkIndex(split, 'w1');
    const [row] = buildLinkRows([bodies[0]], { ...env, index: i2, canvasAnnotationIds: [lapis.id] });
    expect(row.kind).toBe('other');
    expect(row.canvasId).toBe(OTHER);
    expect(row.canvasLabel).toBe('f. 010');
  });

  it('keeps an unloaded target as an unavailable row named by the id tail', () => {
    const lone = { type: 'SpecificResource', purpose: 'linking', source: { id: 'https://x.org/annotation/9f3c0000000000000e21', type: 'Annotation' } } as SpecificResourceBody;
    const [row] = buildLinkRows([lone], env);
    expect(row.kind).toBe('unavailable');
    expect(row.title).toBe('…000000000e21');
  });

  it('turns a non-annotation link into an external row', () => {
    const web = { type: 'SpecificResource', purpose: 'linking', source: { id: 'https://example.org/report', type: 'Text', label: { en: ['Report'] } } } as SpecificResourceBody;
    const [row] = buildLinkRows([web], env);
    expect(row).toMatchObject({ kind: 'external', href: 'https://example.org/report', title: 'Report' });
    const bad = { ...web, source: { id: 'javascript:alert(1)', type: 'Text' } } as SpecificResourceBody;
    expect(buildLinkRows([bad], env)[0].kind).toBe('unavailable');
  });
});

describe('canvas of an entry', () => {
  const page = (items: unknown[]) => ({ json: { type: 'AnnotationPage', id: 'p', items } });
  const ann = (id: string, canvas: string, body: unknown[] = []) => ({
    id,
    type: 'Annotation',
    motivation: 'commenting',
    body,
    target: { type: 'SpecificResource', source: canvas, selector: { type: 'FragmentSelector', value: 'xywh=1,2,3,4' } },
  });
  const link = (id: string) => ({ type: 'SpecificResource', purpose: 'linking', source: { id, type: 'Annotation' } });

  // One shared page, loaded only under CANVAS, holding annotations of both canvases.
  const shared = () =>
    stateWith({
      [CANVAS]: { shared: page([ann('x', CANVAS, [link('y')]), ann('y', OTHER)]) },
    } as unknown as MiradorState['annotations']);

  it('takes the canvas from the target, not from the page key', () => {
    const index = getLinkIndex(shared(), 'w1');
    expect(index.entries.get('x')?.canvasId).toBe(CANVAS);
    expect(index.entries.get('y')?.canvasId).toBe(OTHER);
  });

  it('makes a link to a target of another canvas an "other" row, even when listed under this page', () => {
    const index = getLinkIndex(shared(), 'w1');
    const rows = buildLinkRows(collectLinkingBodies(index.entries.get('x')!.resource.body), {
      index,
      canvasId: CANVAS,
      canvasAnnotationIds: ['x', 'y'],
      prefs: ['en'],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'other', canvasId: OTHER });
  });
});

describe('bounded work', () => {
  it('caps the links read per annotation', () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({ type: 'SpecificResource', purpose: 'linking', source: `a${i}` }));
    expect(collectLinkingBodies(many)).toHaveLength(500);
    expect(collectLinkingBodies([{ type: 'List', items: many }])).toHaveLength(500);
  });

  it('answers a hub of many links without scanning the canvas per link', () => {
    const N = 3000;
    const ids = Array.from({ length: N }, (_, i) => `a${i}`);
    const index = {
      ...EMPTY_LINK_INDEX,
      forward: new Map([['hub', ids]]),
    };
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) expect(linkedIdsOnCanvas(index, 'hub', ['hub', ...ids])).toHaveLength(N);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
