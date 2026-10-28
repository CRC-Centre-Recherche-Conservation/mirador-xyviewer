import { describe, it, expect, vi } from 'vitest';
import {
  resolveContentState,
  fetchContentStateJson,
  readContentStateFile,
} from './contentStateResolver';
import { encodeContentState, CONTENT_STATE_MAX_BYTES } from '../utils/contentState';
import {
  HOST, MANIFEST, CANVAS_A, CANVAS_B, pointAndSvgState, fragmentState, multiTargetState, manifestDoc,
} from '../test/fixtures/contentState';

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, ...init });

describe('fetchContentStateJson', () => {
  it('fetches without credentials and parses JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: 1 }));
    await expect(fetchContentStateJson(`${HOST}/cs`, { fetchImpl })).resolves.toEqual({ ok: 1 });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe('omit');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each(['javascript:alert(1)', 'data:application/json,{}', 'file:///etc/passwd', 'ftp://example.org/x', 'not a url'])(
    'refuses %s without fetching', async (uri) => {
      const fetchImpl = vi.fn();
      await expect(fetchContentStateJson(uri, { fetchImpl })).rejects.toThrow(/http/);
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );

  it('rejects HTTP errors and non-JSON bodies', async () => {
    await expect(fetchContentStateJson(`${HOST}/a`, { fetchImpl: vi.fn().mockResolvedValue(new Response('no', { status: 404 })) }))
      .rejects.toThrow(/404/);
    await expect(fetchContentStateJson(`${HOST}/a`, { fetchImpl: vi.fn().mockResolvedValue(jsonResponse('<html>')) }))
      .rejects.toThrow(/JSON/);
  });

  it('enforces the size cap from the header and while streaming', async () => {
    const declared = jsonResponse({ a: 1 }, { headers: { 'content-length': String(CONTENT_STATE_MAX_BYTES + 1) } });
    await expect(fetchContentStateJson(`${HOST}/a`, { fetchImpl: vi.fn().mockResolvedValue(declared) })).rejects.toThrow(/too large/);
    const big = jsonResponse(JSON.stringify({ pad: 'x'.repeat(200) }));
    await expect(fetchContentStateJson(`${HOST}/a`, { maxBytes: 100, fetchImpl: vi.fn().mockResolvedValue(big) })).rejects.toThrow(/too large/);
  });

  it('enforces the size cap when the response has no stream', async () => {
    const res = { ok: true, status: 200, headers: new Headers(), body: null, text: async () => 'x'.repeat(50) } as unknown as Response;
    await expect(fetchContentStateJson(`${HOST}/a`, { maxBytes: 10, fetchImpl: vi.fn().mockResolvedValue(res) })).rejects.toThrow(/too large/);
  });

  it('times out', async () => {
    const fetchImpl = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => {
      init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    }));
    await expect(fetchContentStateJson(`${HOST}/slow`, { timeoutMs: 10, fetchImpl: fetchImpl as unknown as typeof fetch }))
      .rejects.toThrow(/timed out/);
  });

  it('wraps non-Error failures', async () => {
    await expect(fetchContentStateJson(`${HOST}/a`, { fetchImpl: vi.fn().mockRejectedValue('boom') })).rejects.toThrow(/failed/);
  });
});

describe('resolveContentState', () => {
  it('resolves unencoded JSON without any request', async () => {
    const fetchJson = vi.fn();
    const r = await resolveContentState({ kind: 'json', json: fragmentState }, { fetchJson });
    expect(fetchJson).not.toHaveBeenCalled();
    expect(r.targets).toHaveLength(1);
    expect(r.targets[0]).toMatchObject({ canvasId: CANVAS_B, manifestId: MANIFEST });
  });

  it('resolves encoded text, JSON text and manifest URIs given as strings', async () => {
    const enc = await resolveContentState(encodeContentState(pointAndSvgState));
    expect(enc.targets[0].canvasId).toBe(CANVAS_A);
    const txt = await resolveContentState(JSON.stringify(multiTargetState));
    expect(txt.targets).toHaveLength(2);
    expect((await resolveContentState(encodeContentState(pointAndSvgState), { allowEncoded: false })).targets).toEqual([]);
  });

  it('fetches a content state URI and acts on its type', async () => {
    const fetchJson = vi.fn().mockResolvedValue(pointAndSvgState);
    const r = await resolveContentState(`${HOST}/iiif/v3/content-state/a/1`, { fetchJson });
    expect(fetchJson).toHaveBeenCalledWith(`${HOST}/iiif/v3/content-state/a/1`);
    expect(r.targets[0]).toMatchObject({ canvasId: CANVAS_A, manifestId: MANIFEST });
  });

  it('opens a fetched Manifest and keeps its embedded document', async () => {
    const r = await resolveContentState(MANIFEST, { fetchJson: async () => manifestDoc });
    expect(r.targets).toEqual([{ manifestId: MANIFEST, manifestJson: manifestDoc }]);
  });

  it('opens a fetched Collection', async () => {
    const r = await resolveContentState(`${HOST}/col`, { fetchJson: async () => ({ id: `${HOST}/col`, type: 'Collection' }) });
    expect(r.targets).toEqual([{ collectionId: `${HOST}/col` }]);
  });

  it('opens a fetched Annotation with another motivation as content (§2.2.4)', async () => {
    const r = await resolveContentState(`${HOST}/anno`, { fetchJson: async () => ({ ...fragmentState, motivation: 'commenting' }) });
    expect(r.targets[0].canvasId).toBe(CANVAS_B);
  });

  it('uses the partOf of a fetched Canvas or Range', async () => {
    const canvasDoc = { id: CANVAS_A, type: 'Canvas', partOf: [{ id: MANIFEST, type: 'Manifest' }] };
    const r = await resolveContentState(CANVAS_A, { fetchJson: async () => canvasDoc });
    expect(r.targets).toEqual([{ canvasId: CANVAS_A, manifestId: MANIFEST }]);

    const rangeDoc = { id: `${HOST}/r`, type: 'Range', partOf: [{ id: MANIFEST, type: 'Manifest' }] };
    const rr = await resolveContentState(`${HOST}/r`, { fetchJson: async () => rangeDoc });
    expect(rr.targets).toEqual([{ rangeId: `${HOST}/r`, manifestId: MANIFEST }]);
  });

  it('dereferences a Canvas that lacks partOf and keeps its fragment region', async () => {
    const fetchJson = vi.fn().mockResolvedValue({ id: CANVAS_A, type: 'Canvas', partOf: [{ id: MANIFEST, type: 'Manifest' }] });
    const r = await resolveContentState({ kind: 'json', json: { id: `${CANVAS_A}#xywh=1,2,3,4`, type: 'Canvas' } }, { fetchJson });
    expect(fetchJson).toHaveBeenCalledWith(CANVAS_A);
    expect(r.targets[0]).toMatchObject({ canvasId: CANVAS_A, manifestId: MANIFEST, region: { x: 1, y: 2, width: 3, height: 4 } });
  });

  it('stops on a reference loop', async () => {
    const fetchJson = vi.fn().mockResolvedValue({ id: CANVAS_A, type: 'Canvas' });
    const r = await resolveContentState({ kind: 'json', json: { id: CANVAS_A, type: 'Canvas' } }, { fetchJson });
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(r.warnings.join()).toMatch(/loops/);
    expect(r.targets).toEqual([{ canvasId: CANVAS_A }]);
  });

  it('stops following a cycle of Annotations', async () => {
    const a = `${HOST}/a`, b = `${HOST}/b`;
    const docs: Record<string, unknown> = {
      [a]: { id: a, type: 'Annotation', target: { id: b, type: 'Annotation' } },
      [b]: { id: b, type: 'Annotation', target: { id: a, type: 'Annotation' } },
    };
    const fetchJson = vi.fn(async (u: string) => docs[u]);
    const r = await resolveContentState(a, { fetchJson });
    expect(fetchJson.mock.calls.length).toBeLessThanOrEqual(3);
    expect(r.targets).toEqual([]);
    expect(r.warnings.join()).toMatch(/loops/);
  });

  it('honours the depth limit on a long chain', async () => {
    const fetchJson = vi.fn(async (u: string) => {
      const n = Number(u.split('/').pop());
      return { id: u, type: 'Annotation', target: { id: `${HOST}/${n + 1}`, type: 'Annotation' } };
    });
    const r = await resolveContentState(`${HOST}/0`, { fetchJson, maxDepth: 2 });
    expect(fetchJson.mock.calls.length).toBe(3);
    expect(r.warnings.join()).toMatch(/Too many nested/);
  });

  it('reports fetch failures as warnings without throwing', async () => {
    const failing = async () => { throw new Error('boom'); };
    const root = await resolveContentState(`${HOST}/cs`, { fetchJson: failing });
    expect(root.targets).toEqual([]);
    expect(root.warnings[0]).toMatch(/boom/);

    const nested = await resolveContentState({ kind: 'json', json: { id: CANVAS_A, type: 'Canvas' } }, { fetchJson: failing });
    expect(nested.targets).toEqual([{ canvasId: CANVAS_A }]);
    expect(nested.warnings[0]).toMatch(/boom/);

    const nonError = await resolveContentState(`${HOST}/cs`, { fetchJson: () => Promise.reject('x') });
    expect(nonError.warnings[0]).toMatch(/request failed/);
  });

  it('rejects dangerous or malformed input with a warning', async () => {
    const fetchJson = vi.fn();
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', '', '{', 'garbage!!']) {
      const r = await resolveContentState(bad, { fetchJson });
      expect(r.targets).toEqual([]);
      expect(r.warnings.length).toBeGreaterThan(0);
    }
    expect(fetchJson).not.toHaveBeenCalled();
    expect((await resolveContentState({ kind: 'json', json: {} })).warnings.join()).toMatch(/anything/);
  });

  it('resolves through the default fetcher', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(fragmentState));
    const r = await resolveContentState(`${HOST}/cs`);
    expect(r.targets).toHaveLength(1);
    expect((spy.mock.calls[0][1] as RequestInit).credentials).toBe('omit');
    spy.mockRestore();
  });
});

describe('readContentStateFile', () => {
  it('reads a content state file', async () => {
    const file = new File([JSON.stringify(fragmentState)], 'state.json', { type: 'application/json' });
    expect(await readContentStateFile(file)).toEqual({ kind: 'json', json: fragmentState });
  });

  it('reads a manifest file', async () => {
    const input = await readContentStateFile(new File([JSON.stringify(manifestDoc)], 'm.jsonld'));
    expect(input.kind).toBe('json');
  });

  it('never decodes encoded text, nor accepts URIs, oversize or unreadable files', async () => {
    expect((await readContentStateFile(new File([encodeContentState(fragmentState)], 'a.txt'))).kind).toBe('invalid');
    expect((await readContentStateFile(new File([`${HOST}/m.json`], 'a.txt'))).kind).toBe('invalid');
    expect((await readContentStateFile(new File(['{"a":1}'], 'a.json'), 3)).kind).toBe('invalid');
    expect((await readContentStateFile(new File(['not json'], 'a.json'))).kind).toBe('invalid');

    const original = globalThis.FileReader;
    class Failing {
      onerror: (() => void) | null = null;
      readAsText() { queueMicrotask(() => this.onerror?.()); }
    }
    globalThis.FileReader = Failing as unknown as typeof FileReader;
    try {
      expect((await readContentStateFile(new File(['{}'], 'a.json'))).kind).toBe('invalid');
    } finally {
      globalThis.FileReader = original;
    }
  });

  it('caps the total number of requests on a fan-out', async () => {
    let n = 0;
    const fetchJson = vi.fn(async () => ({
      id: `${HOST}/doc`, type: 'Annotation',
      target: Array.from({ length: 20 }, () => `${HOST}/u${n++}`),
    }));
    const r = await resolveContentState(`${HOST}/0`, { fetchJson });
    expect(fetchJson.mock.calls.length).toBeLessThanOrEqual(10);
    expect(r.warnings.join()).toMatch(/Too many references/);
  });

  it('opens two regions of one dereferenced canvas', async () => {
    const fetchJson = vi.fn(async () => ({ id: CANVAS_A, type: 'Canvas', partOf: [{ id: MANIFEST, type: 'Manifest' }] }));
    const r = await resolveContentState({
      kind: 'json', json: { type: 'Annotation', target: [`${CANVAS_A}#xywh=0,0,10,10`, `${CANVAS_A}#xywh=50,50,10,10`] },
    }, { fetchJson });
    expect(r.targets).toHaveLength(2);
    expect(r.targets.every((t) => t.manifestId === MANIFEST && t.canvasId === CANVAS_A)).toBe(true);
    expect(r.targets[0].region).not.toEqual(r.targets[1].region);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it('keeps the region of a canvas URI input', async () => {
    const fetchJson = vi.fn(async () => ({ id: CANVAS_A, type: 'Canvas', partOf: [{ id: MANIFEST, type: 'Manifest' }] }));
    const r = await resolveContentState(`${CANVAS_A}#xywh=10,10,50,50`, { fetchJson });
    expect(fetchJson).toHaveBeenCalledWith(CANVAS_A);
    expect(r.targets).toEqual([{ manifestId: MANIFEST, canvasId: CANVAS_A, region: { x: 10, y: 10, width: 50, height: 50, unit: 'pixel' } }]);
  });

  it('applies the isAllowedUrl veto, including after redirects', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchContentStateJson(`${HOST}/a`, { fetchImpl, isAllowedUrl: () => false })).rejects.toThrow(/not allowed/);
    expect(fetchImpl).not.toHaveBeenCalled();

    const redirected = jsonResponse({});
    Object.defineProperty(redirected, 'url', { value: 'https://intranet.example.org/x' });
    await expect(fetchContentStateJson(`${HOST}/a`, {
      fetchImpl: vi.fn().mockResolvedValue(redirected), isAllowedUrl: (u) => u.startsWith(HOST),
    })).rejects.toThrow(/not allowed/);
  });
});
