import { describe, it, expect } from 'vitest';
import {
  decodeContentState,
  encodeContentState,
  parseContentStateInput,
  parseContentStateQuery,
  contentStateTextFromDataTransfer,
  parseXywhFragment,
  svgSelectorBounds,
  selectorRegion,
  extractContentStateTargets,
  findCanvasSize,
  regionToBounds,
  buildMiradorWindows,
  CONTENT_STATE_MAX_BYTES,
  CONTENT_STATE_MAX_TARGETS,
} from './contentState';
import {
  HOST, MANIFEST, CANVAS_A, CANVAS_B, pointAndSvgState, fragmentState, multiTargetState, manifestDoc,
} from '../test/fixtures/contentState';

const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64');

describe('decodeContentState', () => {
  const json = JSON.stringify({ label: 'Éléphant – 象 "q"', type: 'Manifest', id: MANIFEST });

  it('round-trips non-ASCII through the spec encoding', () => {
    const enc = encodeContentState(JSON.parse(json));
    expect(enc).not.toMatch(/[+/=]/);
    expect(decodeContentState(enc)).toBe(json);
  });

  it('accepts padding, the standard alphabet and url-decoded plus signs', () => {
    const std = Buffer.from(encodeURIComponent(json)).toString('base64');
    expect(decodeContentState(std)).toBe(json);
    expect(decodeContentState(std.replace(/=+$/, ''))).toBe(json);
    expect(decodeContentState(std.replace(/\+/g, ' '))).toBe(json);
  });

  it('accepts legacy base64 of raw JSON, including non-ASCII', () => {
    expect(decodeContentState(b64(json))).toBe(json);
    expect(decodeContentState(b64('{"a":1}'))).toBe('{"a":1}');
  });

  it('returns null for garbage, non-JSON payloads and oversize input', () => {
    expect(decodeContentState('')).toBeNull();
    expect(decodeContentState('%%%not base64%%%')).toBeNull();
    expect(decodeContentState(b64('hello world'))).toBeNull();
    expect(decodeContentState('A'.repeat(CONTENT_STATE_MAX_BYTES + 1))).toBeNull();
    expect(decodeContentState(undefined as unknown as string)).toBeNull();
  });
});

describe('parseContentStateInput', () => {
  it('classifies unencoded JSON, URIs and encoded text', () => {
    expect(parseContentStateInput('{"type":"Manifest"}')).toEqual({ kind: 'json', json: { type: 'Manifest' } });
    expect(parseContentStateInput(' [1] ').kind).toBe('json');
    expect(parseContentStateInput(`${HOST}/cs.json`)).toEqual({ kind: 'uri', uri: `${HOST}/cs.json` });
    const enc = encodeContentState(fragmentState);
    expect(parseContentStateInput(enc)).toEqual({ kind: 'json', json: fragmentState });
  });

  it('refuses encoded text when disallowed', () => {
    const enc = encodeContentState(fragmentState);
    expect(parseContentStateInput(enc, { allowEncoded: false }).kind).toBe('invalid');
  });

  it('unwraps links carrying iiif-content, encoded or not', () => {
    const enc = encodeContentState(fragmentState);
    expect(parseContentStateInput(`https://viewer.example.org/?iiif-content=${enc}`))
      .toEqual({ kind: 'json', json: fragmentState });
    expect(parseContentStateInput(`https://viewer.example.org/?iiif-content=${encodeURIComponent(`${HOST}/cs`)}`))
      .toEqual({ kind: 'uri', uri: `${HOST}/cs` });
  });

  it.each([
    'javascript:alert(1)', 'data:application/json,{}', 'file:///etc/passwd', 'ftp://x.org/a', 'blob:https://x/1',
  ])('rejects the scheme in %s', (uri) => {
    expect(parseContentStateInput(uri).kind).toBe('invalid');
  });

  it('never throws on malformed input', () => {
    for (const bad of ['', '   ', '{', '[1,', '{"a":', 'null', '12', '😀', '\u0000', undefined, null, 5]) {
      expect(() => parseContentStateInput(bad as string)).not.toThrow();
      expect(parseContentStateInput(bad as string).kind).toBe('invalid');
    }
    expect(parseContentStateInput('x'.repeat(CONTENT_STATE_MAX_BYTES + 1)).kind).toBe('invalid');
  });
});

describe('parseContentStateQuery', () => {
  it('returns null without parameters', () => {
    expect(parseContentStateQuery('?foo=1')).toBeNull();
  });

  it('lets iiif-content win over manifest', () => {
    const q = `?manifest=${encodeURIComponent(`${HOST}/m.json`)}&iiif-content=${encodeURIComponent(`${HOST}/cs`)}`;
    expect(parseContentStateQuery(q)).toEqual({ kind: 'uri', uri: `${HOST}/cs` });
  });

  it('keeps standard-base64 plus signs that the query string turned into spaces', () => {
    const std = Buffer.from(encodeURIComponent('{"a":">>>"}')).toString('base64');
    const q = new URLSearchParams({ 'iiif-content': std });
    const parsed = parseContentStateQuery(`?iiif-content=${std}`);
    expect(parsed).toEqual({ kind: 'json', json: { a: '>>>' } });
    expect(parseContentStateQuery(q)).toEqual({ kind: 'json', json: { a: '>>>' } });
  });

  it('turns manifest (and canvas) into a content state', () => {
    expect(parseContentStateQuery(`?manifest=${encodeURIComponent(MANIFEST)}`))
      .toEqual({ kind: 'json', json: { id: MANIFEST, type: 'Manifest' } });
    const res = parseContentStateQuery(`?manifest=${encodeURIComponent(MANIFEST)}&canvas=${encodeURIComponent(CANVAS_A)}`);
    expect(extractContentStateTargets((res as { json: unknown }).json).targets)
      .toEqual([{ canvasId: CANVAS_A, manifestId: MANIFEST }]);
  });

  it('rejects a non-http manifest', () => {
    expect(parseContentStateQuery('?manifest=javascript:alert(1)')?.kind).toBe('invalid');
  });
});

describe('contentStateTextFromDataTransfer', () => {
  const dt = (data: Record<string, string>) => ({ getData: (t: string) => data[t] ?? '' });
  it('prefers the first URI of text/uri-list, skipping comments', () => {
    expect(contentStateTextFromDataTransfer(dt({ 'text/uri-list': `# c\r\n${HOST}/a\r\n${HOST}/b`, 'text/plain': 'x' })))
      .toBe(`${HOST}/a`);
  });
  it('falls back to text/plain and tolerates a missing or throwing transfer', () => {
    expect(contentStateTextFromDataTransfer(dt({ 'text/plain': ' {"a":1} ' }))).toBe('{"a":1}');
    expect(contentStateTextFromDataTransfer(null)).toBe('');
    expect(contentStateTextFromDataTransfer({ getData: () => { throw new Error('x'); } })).toBe('');
  });
});

describe('regions', () => {
  it('parses xywh in pixel and percent forms', () => {
    expect(parseXywhFragment('xywh=1,2,3,4')).toEqual({ x: 1, y: 2, width: 3, height: 4, unit: 'pixel' });
    expect(parseXywhFragment('#xywh=pixel:1.5,2,3,4&t=1')).toEqual({ x: 1.5, y: 2, width: 3, height: 4, unit: 'pixel' });
    expect(parseXywhFragment('xywh=percent:10,20,30.5,40')).toEqual({ x: 10, y: 20, width: 30.5, height: 40, unit: 'percent' });
  });

  it.each(['xywh=1,2,3', 'xywh=a,b,c,d', 'xywh=1,2,0,4', 'xywh=-1,2,3,4', 'xywh=percent:10,20,300,40', 't=3', 'xywh=1,2,3,Infinity'])(
    'rejects %s', (v) => expect(parseXywhFragment(v)).toBeUndefined()
  );

  it('handles Point, Fragment and ImageApi selectors', () => {
    expect(selectorRegion({ type: 'PointSelector', x: 5, y: 6 })).toEqual({ x: 5, y: 6, width: 0, height: 0, unit: 'pixel' });
    expect(selectorRegion({ type: 'PointSelector', x: 'a', y: 6 })).toBeUndefined();
    expect(selectorRegion({ type: 'ImageApiSelector', region: 'pct:10,10,50,50' })?.unit).toBe('percent');
    expect(selectorRegion({ type: 'ImageApiSelector', region: '1,2,3,4' })?.unit).toBe('pixel');
    expect(selectorRegion({ type: 'ImageApiSelector', region: 'full' })).toBeUndefined();
    expect(selectorRegion({ type: 'AudioContentSelector' })).toBeUndefined();
    expect(selectorRegion('xywh=1,2,3,4')).toBeUndefined();
  });

  it('computes the bbox of a circle drawn with arcs, using the arc radius', () => {
    expect(svgSelectorBounds(
      '<svg><path d="M 669 618 A 12 12 0 1 1 669 642 A 12 12 0 1 1 669 618"/></svg>'
    )).toEqual({ x: 657, y: 618, width: 24, height: 24, unit: 'pixel' });
  });

  it('computes the bbox of basic shapes and paths', () => {
    const r = (s: string) => svgSelectorBounds(`<svg>${s}</svg>`);
    expect(r('<rect x="10" y="20" width="30" height="40"/>')).toEqual({ x: 10, y: 20, width: 30, height: 40, unit: 'pixel' });
    expect(r('<circle cx="50" cy="50" r="10"/>')).toEqual({ x: 40, y: 40, width: 20, height: 20, unit: 'pixel' });
    expect(r('<ellipse cx="50" cy="50" rx="10" ry="5"/>')).toEqual({ x: 40, y: 45, width: 20, height: 10, unit: 'pixel' });
    expect(r('<line x1="1" y1="2" x2="11" y2="22"/>')).toEqual({ x: 1, y: 2, width: 10, height: 20, unit: 'pixel' });
    expect(r('<polygon points="0,0 10,0 10,5"/>')).toEqual({ x: 0, y: 0, width: 10, height: 5, unit: 'pixel' });
    expect(r("<path d='M10 10 h20 v30 H5 z'/>")).toEqual({ x: 5, y: 10, width: 25, height: 30, unit: 'pixel' });
    expect(r('<path d="m10 10 l5 5 5 -5 c1 1 2 2 3 3 s1 1 2 2 q1 1 2 2 t1 1"/>')).toBeDefined();
    expect(r('<path d="M0 0 a5 5 0 0 1 10 0"/>')).toEqual({ x: 0, y: 0, width: 10, height: 5, unit: 'pixel' });
  });

  it('returns undefined for empty, shapeless or garbage SVG without throwing', () => {
    for (const bad of ['', '<svg/>', '<path d="Z"/>', '<path d="M a b"/>', '<path d="X 1 2"/>', 'not svg', '<polygon points="a,b"/>']) {
      expect(() => svgSelectorBounds(bad)).not.toThrow();
      expect(svgSelectorBounds(bad)).toBeUndefined();
    }
    expect(svgSelectorBounds(undefined as unknown as string)).toBeUndefined();
  });

  it('never executes or reflects markup', () => {
    expect(svgSelectorBounds('<svg><script>alert(1)</script><rect x="1" y="1" width="2" height="2" onload="x()"/></svg>'))
      .toEqual({ x: 1, y: 1, width: 2, height: 2, unit: 'pixel' });
  });
});

describe('extractContentStateTargets', () => {
  it('reads the real point + SVG state (union of selectors)', () => {
    const { targets, warnings } = extractContentStateTargets(pointAndSvgState);
    expect(warnings).toEqual([]);
    expect(targets).toEqual([{
      canvasId: CANVAS_A, manifestId: MANIFEST,
      region: { x: 657, y: 618, width: 24, height: 24, unit: 'pixel' },
    }]);
  });

  it('reads the real fragment state', () => {
    expect(extractContentStateTargets(fragmentState).targets).toEqual([{
      canvasId: CANVAS_B, manifestId: MANIFEST,
      region: { x: 630, y: 1556, width: 602, height: 111, unit: 'pixel' },
    }]);
  });

  it('reads a bare target (§2.2.3) and an Annotation with another motivation (§2.2.4)', () => {
    expect(extractContentStateTargets(pointAndSvgState.target).targets).toHaveLength(1);
    const other = { ...fragmentState, motivation: 'commenting' };
    expect(extractContentStateTargets(other).targets[0].canvasId).toBe(CANVAS_B);
  });

  it('opens several windows worth of targets for an array target', () => {
    const { targets } = extractContentStateTargets(multiTargetState);
    expect(targets).toEqual([
      { canvasId: CANVAS_A, manifestId: MANIFEST, region: { x: 10, y: 20, width: 30, height: 40, unit: 'pixel' } },
      { canvasId: CANVAS_B, manifestId: MANIFEST },
    ]);
  });

  it('treats a top-level array as several states', () => {
    expect(extractContentStateTargets([fragmentState, pointAndSvgState]).targets).toHaveLength(2);
  });

  it('handles Manifest, Collection, Canvas and Range by type (§4)', () => {
    expect(extractContentStateTargets({ id: MANIFEST, type: 'Manifest' }).targets).toEqual([{ manifestId: MANIFEST }]);
    expect(extractContentStateTargets({ id: `${HOST}/c`, type: 'Collection' }).targets).toEqual([{ collectionId: `${HOST}/c` }]);
    expect(extractContentStateTargets({ id: CANVAS_A, type: 'Canvas', partOf: [{ id: MANIFEST, type: 'Manifest' }] }).targets)
      .toEqual([{ canvasId: CANVAS_A, manifestId: MANIFEST }]);
    expect(extractContentStateTargets({ id: `${HOST}/r`, type: 'Range', partOf: MANIFEST }).targets)
      .toEqual([{ rangeId: `${HOST}/r`, manifestId: MANIFEST }]);
    expect(extractContentStateTargets({
      id: `${HOST}/r`, type: 'Range', partOf: [{ id: MANIFEST, type: 'Manifest' }],
      items: [{ type: 'Range', items: [{ id: CANVAS_B, type: 'Canvas' }] }],
    }).targets[0].canvasId).toBe(CANVAS_B);
  });

  it('prefers a Manifest partOf over a Collection and falls back to the collection', () => {
    const t = extractContentStateTargets({
      id: CANVAS_A, type: 'Canvas',
      partOf: [{ id: `${HOST}/col`, type: 'Collection' }, { id: MANIFEST, type: 'Manifest' }],
    }).targets[0];
    expect(t.manifestId).toBe(MANIFEST);
    expect(extractContentStateTargets({ id: CANVAS_A, type: 'Canvas', partOf: [{ id: `${HOST}/col`, type: 'Collection' }] })
      .targets[0].collectionId).toBe(`${HOST}/col`);
  });

  it('keeps an embedded manifest document', () => {
    expect(extractContentStateTargets(manifestDoc).targets[0].manifestJson).toBe(manifestDoc);
  });

  it('marks URIs with an unknown kind to be followed, and fragments as canvases', () => {
    expect(extractContentStateTargets(`${HOST}/thing`).targets).toEqual([{ followId: `${HOST}/thing` }]);
    expect(extractContentStateTargets(`${CANVAS_A}#xywh=1,2,3,4`).targets).toEqual([{
      canvasId: CANVAS_A, followId: CANVAS_A, region: { x: 1, y: 2, width: 3, height: 4, unit: 'pixel' },
    }]);
    expect(extractContentStateTargets({ id: CANVAS_A, type: 'Canvas' }).targets).toEqual([{ canvasId: CANVAS_A, followId: CANVAS_A }]);
  });

  it('applies a selector to a SpecificResource whose source is a bare URI', () => {
    const t = extractContentStateTargets({
      type: 'SpecificResource', source: CANVAS_A, partOf: [{ id: MANIFEST, type: 'Manifest' }],
      selector: { type: 'PointSelector', x: 1, y: 2 },
    }).targets[0];
    expect(t).toMatchObject({ canvasId: CANVAS_A, manifestId: MANIFEST, region: { x: 1, y: 2 } });
  });

  it('accepts percent regions and unions regions of one unit', () => {
    const t = extractContentStateTargets({
      type: 'SpecificResource', source: { id: CANVAS_A, type: 'Canvas', partOf: MANIFEST },
      selector: [
        { type: 'FragmentSelector', value: 'xywh=percent:10,10,10,10' },
        { type: 'FragmentSelector', value: 'xywh=percent:30,30,10,10' },
      ],
    }).targets[0];
    expect(t.region).toEqual({ x: 10, y: 10, width: 30, height: 30, unit: 'percent' });
  });

  it('tolerates Presentation 2 style ids and types', () => {
    const t = extractContentStateTargets({ '@id': CANVAS_A, '@type': 'sc:Canvas', partOf: [{ '@id': MANIFEST, '@type': 'sc:Manifest' }] }).targets;
    expect(t).toEqual([{ canvasId: CANVAS_A, manifestId: MANIFEST }]);
  });

  it('warns about unsupported selectors and falls back to the whole canvas', () => {
    const { targets, warnings } = extractContentStateTargets({
      type: 'SpecificResource', source: { id: CANVAS_A, type: 'Canvas', partOf: MANIFEST },
      selector: { type: 'TextQuoteSelector', exact: 'x' },
    });
    expect(targets[0].region).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });

  it('drops non-http(s) ids and never throws on garbage', () => {
    const bad = [
      null, undefined, 3, true, 'javascript:alert(1)', { id: 'data:text/html,x', type: 'Manifest' },
      { type: 'Annotation' }, { type: 'Annotation', target: [] }, {}, [[[]]], { type: 'SpecificResource' },
      { type: 'Canvas', id: 'javascript:alert(1)', partOf: 'javascript:1' }, { id: 5, type: 'Canvas' },
      { type: ['Annotation'], target: { type: 'Manifest' } },
    ];
    for (const b of bad) {
      const r = extractContentStateTargets(b);
      expect(r.targets).toEqual([]);
    }
  });

  it('limits nesting depth and the number of targets', () => {
    let deep: unknown = { id: MANIFEST, type: 'Manifest' };
    for (let i = 0; i < 20; i++) deep = [deep];
    const r = extractContentStateTargets(deep);
    expect(r.targets).toEqual([]);
    expect(r.warnings.join()).toMatch(/nested too deeply/);

    const many = Array.from({ length: 100 }, (_, i) => ({ id: `${HOST}/m/${i}`, type: 'Manifest' }));
    expect(extractContentStateTargets(many).targets).toHaveLength(CONTENT_STATE_MAX_TARGETS);
  });

  it('removes duplicate targets', () => {
    expect(extractContentStateTargets([fragmentState, fragmentState]).targets).toHaveLength(1);
  });
});

describe('canvas size, bounds and window configs', () => {
  it('finds a canvas size in Presentation 3 and 2 manifests', () => {
    expect(findCanvasSize(manifestDoc, CANVAS_A)).toEqual({ width: 2000, height: 1000 });
    expect(findCanvasSize(manifestDoc, `${HOST}/none`)).toBeUndefined();
    expect(findCanvasSize({ sequences: [{ canvases: [{ '@id': CANVAS_B, width: 5, height: 6 }] }] }, CANVAS_B))
      .toEqual({ width: 5, height: 6 });
    expect(findCanvasSize({ items: [{ id: CANVAS_A }] }, CANVAS_A)).toBeUndefined();
    expect(findCanvasSize(null, CANVAS_A)).toBeUndefined();
  });

  it('pads regions and enlarges points', () => {
    expect(regionToBounds({ x: 100, y: 100, width: 100, height: 50, unit: 'pixel' })).toEqual([90, 75, 120, 100]);
    const point = regionToBounds({ x: 500, y: 500, width: 0, height: 0, unit: 'pixel' })!;
    expect(point[2]).toBe(100);
    expect(point[0] + point[2] / 2).toBe(500);
    const sized = regionToBounds({ x: 500, y: 500, width: 0, height: 0, unit: 'pixel' }, { width: 4000, height: 2000 })!;
    expect(sized[2]).toBe(200);
  });

  it('clamps bounds to the canvas origin', () => {
    expect(regionToBounds({ x: 0, y: 0, width: 10, height: 10, unit: 'pixel' })!.slice(0, 2)).toEqual([0, 0]);
  });

  it('needs a canvas size for percent regions', () => {
    const r = { x: 10, y: 20, width: 50, height: 50, unit: 'percent' as const };
    expect(regionToBounds(r)).toBeUndefined();
    expect(regionToBounds(r, { width: 1000, height: 1000 }, 0)).toEqual([100, 200, 500, 500]);
  });

  it('builds one Mirador window per target', () => {
    const { targets } = extractContentStateTargets(multiTargetState);
    const configs = buildMiradorWindows(targets);
    expect(configs).toHaveLength(2);
    expect(configs[0]).toMatchObject({ manifestId: MANIFEST, canvasId: CANVAS_A, view: 'single' });
    expect(configs[0].initialViewerConfig?.bounds).toEqual(regionToBounds(targets[0].region!));
    expect(configs[1]).toEqual({ manifestId: MANIFEST, canvasId: CANVAS_B });
  });

  it('places percent regions when the canvas size is known and skips bounds otherwise', () => {
    const targets = [{ manifestId: MANIFEST, canvasId: CANVAS_A, region: { x: 0, y: 0, width: 50, height: 50, unit: 'percent' as const } }];
    expect(buildMiradorWindows(targets)[0].initialViewerConfig).toBeUndefined();
    const withSize = buildMiradorWindows(targets, { canvasSize: () => ({ width: 2000, height: 1000 }), margin: 0 });
    expect(withSize[0].initialViewerConfig?.bounds).toEqual([0, 0, 1000, 500]);
  });

  it('uses the default manifest, collections, and skips targets without a manifest', () => {
    expect(buildMiradorWindows([{ canvasId: CANVAS_A }])).toEqual([]);
    expect(buildMiradorWindows([{ canvasId: CANVAS_A }], { defaultManifestId: MANIFEST })).toEqual([{ manifestId: MANIFEST, canvasId: CANVAS_A }]);
    expect(buildMiradorWindows({ targets: [{ collectionId: `${HOST}/c` }], warnings: [] })).toEqual([{ manifestId: `${HOST}/c` }]);
  });
});

describe('hostile input', () => {
  const fast = (fn: () => unknown) => {
    const t = Date.now();
    fn();
    expect(Date.now() - t).toBeLessThan(500);
  };

  it('decodes long padding runs in linear time and rejects excess padding', () => {
    fast(() => expect(decodeContentState('='.repeat(200_000) + 'a')).toBeNull());
    expect(decodeContentState(encodeContentState({ a: 1 }) + '===')).toBeNull();
  });

  it('scans SVG selectors in linear time', () => {
    fast(() => svgSelectorBounds(`<rect ${'a'.repeat(60_000)}>`));
    fast(() => svgSelectorBounds('<rect '.repeat(10_000)));
    fast(() => svgSelectorBounds('<'.repeat(60_000) + '>'));
    expect(svgSelectorBounds('a'.repeat(70_000))).toBeUndefined();
    expect(svgSelectorBounds('<rect x="1" y="2" width="3" height="4"/>')).toMatchObject({ x: 1, y: 2, width: 3, height: 4 });
  });

  it('ignores SVG attributes named after Object.prototype members', () => {
    expect(svgSelectorBounds(
      '<rect __proto__="1" constructor="2" toString="3" x="1" y="2" width="3" height="4"/>'
    )).toMatchObject({ x: 1, y: 2, width: 3, height: 4 });
    expect(svgSelectorBounds('<path constructor="M 0 0 L 9 9"/>')).toBeUndefined();
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('limits nested iiif-content links', () => {
    let link = 'https://iiif.example.org/cs';
    for (let i = 0; i < 50; i++) link = `https://iiif.example.org/?iiif-content=${encodeURIComponent(link)}`;
    expect(parseContentStateInput(link)).toMatchObject({ kind: 'invalid' });
    const one = `https://iiif.example.org/?iiif-content=${encodeURIComponent('https://iiif.example.org/cs')}`;
    expect(parseContentStateInput(one)).toEqual({ kind: 'uri', uri: 'https://iiif.example.org/cs' });
  });

  it('ignores numeric strings that overflow', () => {
    expect(parseXywhFragment(`xywh=1,1,${'9'.repeat(400)},1`)).toBeUndefined();
  });
});
