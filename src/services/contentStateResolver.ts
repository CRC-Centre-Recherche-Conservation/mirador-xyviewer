/**
 * IIIF Content State 1.0: guarded fetching and resolution.
 *
 * Turns a classified input (URI, JSON) into targets, dereferencing URIs only
 * when the content state does not say enough. Every request omits credentials,
 * is time-limited and size-capped, and only http(s) is ever fetched.
 */

import {
  CONTENT_STATE_MAX_BYTES,
  dedupeTargets,
  extractContentStateTargets,
  parseContentStateInput,
  partOfFromDocument,
} from '../utils/contentState';
import type {
  ContentStateDraft,
  ContentStateInput,
  ContentStateResult,
  ContentStateTarget,
} from '../utils/contentState';
import { isValidUrl } from '../utils/security';

/** Fetches and parses one JSON document. */
export type ContentStateFetcher = (uri: string) => Promise<unknown>;

/** Options for {@link fetchContentStateJson}. */
export interface FetchContentStateOptions {
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
  /** Veto for a URI, checked before the request and on the final URL after redirects. */
  isAllowedUrl?: (url: string) => boolean;
}

/** Options for {@link resolveContentState}. */
export interface ResolveContentStateOptions {
  /** Custom fetcher (defaults to {@link fetchContentStateJson}). */
  fetchJson?: ContentStateFetcher;
  /** Maximum chain of URIs followed. Default 3. */
  maxDepth?: number;
  /** Maximum number of requests for the whole resolution. Default 10. */
  maxFetches?: number;
  /** Veto for every URI fetched (e.g. a private-network blocklist). Ignored with a custom `fetchJson`. */
  isAllowedUrl?: (url: string) => boolean;
  /** Accept content-state-encoded text when `input` is a string. Default true. */
  allowEncoded?: boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_FETCHES = 10;

/** Read a response body, refusing to buffer more than `maxBytes`. */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('Response too large.');

  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (text.length > maxBytes) throw new Error('Response too large.');
    return text;
  }
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error('Response too large.');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * Fetch a JSON document for a content state: http(s) only, no credentials,
 * time-limited, size-capped. Rejects with a readable Error; the body is only
 * ever parsed as JSON.
 */
export async function fetchContentStateJson(uri: string, options: FetchContentStateOptions = {}): Promise<unknown> {
  if (!isValidUrl(uri)) throw new Error('Only http(s) URIs can be fetched.');
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = CONTENT_STATE_MAX_BYTES, fetchImpl = fetch, isAllowedUrl } = options;
  if (isAllowedUrl && !isAllowedUrl(uri)) throw new Error('This address is not allowed.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(uri, {
      credentials: 'omit',
      redirect: 'follow',
      headers: { Accept: 'application/ld+json, application/json;q=0.9, */*;q=0.1' },
      signal: controller.signal,
    });
    if (isAllowedUrl && response.url && response.url !== uri && !isAllowedUrl(response.url)) {
      throw new Error('This address is not allowed.');
    }
    if (!response.ok) throw new Error(`The server answered ${response.status}.`);
    const text = await readCapped(response, maxBytes);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('The response is not valid JSON.');
    }
  } catch (e) {
    // Error `cause` is not in the configured lib target.
    // eslint-disable-next-line preserve-caught-error
    if (controller.signal.aborted) throw new Error('The request timed out.');
    throw e instanceof Error ? e : new Error('The request failed.');
  } finally {
    clearTimeout(timer);
  }
}

/** Read a local file (spec §3.5) and classify it. Never throws. */
export function readContentStateFile(file: Blob, maxBytes = CONTENT_STATE_MAX_BYTES): Promise<ContentStateInput> {
  return new Promise((resolve) => {
    if (file.size > maxBytes) {
      resolve({ kind: 'invalid', reason: 'The file is too large.' });
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => resolve({ kind: 'invalid', reason: 'The file could not be read.' });
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      // A file is never encoded (spec §3.5).
      const input = parseContentStateInput(text, { allowEncoded: false });
      resolve(input.kind === 'uri' ? { kind: 'invalid', reason: 'The file does not contain JSON.' } : input);
    };
    reader.readAsText(file);
  });
}

interface Walk {
  fetchJson: ContentStateFetcher;
  maxDepth: number;
  /** Requests still allowed for the whole walk. */
  budget: number;
  /** Documents already requested, so siblings reuse them. */
  cache: Map<string, Promise<unknown>>;
  warnings: string[];
}

/** Fetch once per URI, within the request budget. */
function fetchOnce(uri: string, walk: Walk): Promise<unknown> | undefined {
  const cached = walk.cache.get(uri);
  if (cached) return cached;
  if (walk.budget <= 0) return undefined;
  walk.budget--;
  const pending = walk.fetchJson(uri);
  walk.cache.set(uri, pending);
  return pending;
}

/**
 * Complete drafts by dereferencing their `followId`, within the depth, loop
 * (`ancestors` is the chain of URIs being followed) and request limits.
 */
async function complete(
  drafts: ContentStateDraft[], walk: Walk, depth: number, ancestors: ReadonlySet<string>
): Promise<ContentStateTarget[]> {
  const out: ContentStateTarget[] = [];
  for (const draft of drafts) {
    const { followId, ...target } = draft;
    if (!followId) {
      out.push(target);
      continue;
    }
    if (depth >= walk.maxDepth) {
      walk.warnings.push('Too many nested references: stopped following URIs.');
      out.push(target);
      continue;
    }
    if (ancestors.has(followId)) {
      walk.warnings.push('A reference loops back on itself.');
      out.push(target);
      continue;
    }

    let doc: unknown;
    try {
      const pending = fetchOnce(followId, walk);
      if (!pending) {
        if (!walk.warnings.includes(TOO_MANY_REQUESTS)) walk.warnings.push(TOO_MANY_REQUESTS);
        out.push(target);
        continue;
      }
      doc = await pending;
    } catch (e) {
      walk.warnings.push(`Could not load ${followId}: ${e instanceof Error ? e.message : 'request failed'}`);
      out.push(target);
      continue;
    }

    const extracted = extractContentStateTargets(doc);
    walk.warnings.push(...extracted.warnings);
    const resolved = await complete(extracted.targets, walk, depth + 1, new Set(ancestors).add(followId));
    // A Canvas/Range document only tells us where it lives.
    const container = partOfFromDocument(doc);
    for (const r of resolved) {
      const merged: ContentStateTarget = { ...r };
      if (!merged.manifestId && !merged.collectionId) Object.assign(merged, container);
      // The selector or fragment of the original reference applies to its own canvas.
      if (target.region && !merged.region && merged.canvasId === followId) merged.region = target.region;
      out.push(merged);
    }
  }
  return out;
}

const TOO_MANY_REQUESTS = 'Too many references: stopped following URIs.';

/**
 * Resolve a content state (spec §3 and §4) into targets a host can open.
 *
 * - a URI is fetched, then processed by the `type` of what it returns;
 * - an Annotation (any motivation), a bare target or an array of targets gives
 *   one entry per target;
 * - a Canvas or Range gives its `partOf` manifest, dereferenced when missing.
 *
 * Never throws: problems are reported in `warnings` and unusable input gives
 * no targets.
 */
export async function resolveContentState(
  input: ContentStateInput | string,
  options: ResolveContentStateOptions = {}
): Promise<ContentStateResult> {
  const warnings: string[] = [];
  const classified: ContentStateInput =
    typeof input === 'string' ? parseContentStateInput(input, { allowEncoded: options.allowEncoded }) : input;

  if (classified.kind === 'invalid') return { targets: [], warnings: [classified.reason] };

  const walk: Walk = {
    fetchJson:
      options.fetchJson ??
      ((uri) => fetchContentStateJson(uri, { isAllowedUrl: options.isAllowedUrl })),
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    budget: options.maxFetches ?? DEFAULT_MAX_FETCHES,
    cache: new Map(),
    warnings,
  };

  try {
    // A URI goes through the bare-target path: its fragment is split off
    // before fetching, and its region is kept.
    const json: unknown = classified.kind === 'uri' ? classified.uri : classified.json;
    const extracted = extractContentStateTargets(json);
    warnings.push(...extracted.warnings);
    // The input URI itself is not counted against the depth limit.
    const completed = await complete(extracted.targets, walk, classified.kind === 'uri' ? -1 : 0, new Set());
    const targets = dedupeTargets(
      completed.filter((t) => t.manifestId || t.collectionId || t.canvasId || t.rangeId)
    );
    if (!targets.length) warnings.push('The content state does not point to anything that can be opened.');
    return { targets, warnings };
  } catch {
    return { targets: [], warnings: [...warnings, 'The content state could not be processed.'] };
  }
}
