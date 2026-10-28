/**
 * Links between annotations (W3C `linking` SpecificResource bodies): a forward and an inverse
 * index over every annotation the window has loaded, and the display rows built from them.
 * Ids of expanded multi-target annotations (`#target-N`) are folded to their base id.
 * No network access: a target that is not loaded stays unresolved.
 */

import type { AnnotationBody, IIIFAnnotation, LocalizedString, SpecificResourceBody } from '../types/iiif';
import {
  isChoiceBody,
  isCompositeBody,
  isIndependentsBody,
  isListBody,
  isSpecificResourceBody,
  srLabel,
  srSourceId,
  stringPurposes,
} from '../types/iiif';
import type { MiradorState } from '../types/mirador';
import { normalizeAnnotationResources } from './annotationNormalizer';
import { getLocalizedString, getLocalizedStrings } from './localization';
import { isValidUrl } from './security';

export interface CanvasInfo {
  id: string;
  label?: LocalizedString | string;
  width?: number;
  height?: number;
}

export interface LinkedEntry {
  /** Base id (without `#target-N`). */
  id: string;
  /** Ids as listed on the canvas (one per target of a multi-target annotation). */
  ids: string[];
  canvasId: string;
  /** First expanded resource. */
  resource: IIIFAnnotation;
  /** Resource of each listed id (multi-target zones differ per id). */
  resources: Record<string, IIIFAnnotation>;
}

export interface LinkIndex {
  entries: Map<string, LinkedEntry>;
  /** Base id -> base ids it links to. */
  forward: Map<string, string[]>;
  /** Base id -> base ids of the annotations linking to it. */
  inverse: Map<string, string[]>;
  canvases: CanvasInfo[];
}

const TARGET_SUFFIX = /#target-\d+$/;

export const baseAnnotationId = (id: string): string => id.replace(TARGET_SUFFIX, '');

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const MAX_DEPTH = 4;
/** Links read per annotation and rows shown per list: remote JSON is untrusted. */
export const MAX_LINKS = 500;

/** Every `linking` SpecificResource of a body tree (Choice, Composite, List and Independents included). */
export function collectLinkingBodies(body: unknown, depth = 0): SpecificResourceBody[] {
  const out: SpecificResourceBody[] = [];
  for (const b of [body ?? []].flat() as AnnotationBody[]) {
    if (out.length >= MAX_LINKS) break;
    if (!isObject(b)) continue;
    if (isSpecificResourceBody(b)) {
      if (stringPurposes(b).includes('linking')) out.push(b);
    } else if ((isChoiceBody(b) || isCompositeBody(b) || isListBody(b) || isIndependentsBody(b)) && depth < MAX_DEPTH) {
      for (const inner of collectLinkingBodies(b.items, depth + 1)) {
        if (out.length >= MAX_LINKS) break;
        out.push(inner);
      }
    }
  }
  return out;
}

/** The id of `sourceId` among `ids`: exact, else the first `#target-N` expansion. */
export function resolveLinkedAnnotationId(sourceId: string, ids: Iterable<string>): string | undefined {
  if (!sourceId) return undefined;
  let expanded: string | undefined;
  for (const id of ids) {
    if (id === sourceId) return id;
    if (expanded === undefined && id.startsWith(`${sourceId}#target-`)) expanded = id;
  }
  return expanded;
}

const listedCache = new WeakMap<readonly string[], Map<string, string[]>>();

/** Listed ids grouped by base id (`#target-N` folded), built once per array. */
export function listedIdsByBase(ids: readonly string[]): Map<string, string[]> {
  let map = listedCache.get(ids);
  if (!map) {
    map = new Map();
    for (const id of ids) {
      const base = baseAnnotationId(id);
      const list = map.get(base);
      if (list) list.push(id);
      else map.set(base, [id]);
    }
    listedCache.set(ids, map);
  }
  return map;
}

export const EMPTY_LINK_INDEX: LinkIndex = { entries: new Map(), forward: new Map(), inverse: new Map(), canvases: [] };

/** Canvases of a manifest (Presentation 3 `items`, Presentation 2 `sequences[].canvases`). */
const canvasCache = new WeakMap<object, CanvasInfo[]>();
export function manifestCanvases(manifestJson: unknown): CanvasInfo[] {
  if (!isObject(manifestJson)) return [];
  const cached = canvasCache.get(manifestJson);
  if (cached) return cached;
  const raw: unknown[] = Array.isArray(manifestJson.items)
    ? manifestJson.items
    : Array.isArray(manifestJson.sequences)
      ? (manifestJson.sequences as unknown[]).flatMap((s) => (isObject(s) && Array.isArray(s.canvases) ? s.canvases : []))
      : [];
  const out: CanvasInfo[] = [];
  for (const c of raw) {
    if (!isObject(c)) continue;
    const id = typeof c.id === 'string' ? c.id : typeof c['@id'] === 'string' ? c['@id'] : '';
    if (!id) continue;
    out.push({
      id,
      label: c.label as CanvasInfo['label'],
      width: typeof c.width === 'number' ? c.width : undefined,
      height: typeof c.height === 'number' ? c.height : undefined,
    });
  }
  canvasCache.set(manifestJson, out);
  return out;
}

/** Linked base ids of one annotation, in order and without duplicates. */
const linksOfCache = new WeakMap<object, string[]>();
function linksOf(resource: IIIFAnnotation): string[] {
  const cached = linksOfCache.get(resource);
  if (cached) return cached;
  const ids = [...new Set(collectLinkingBodies(resource.body).map((b) => baseAnnotationId(srSourceId(b))).filter(Boolean))];
  linksOfCache.set(resource, ids);
  return ids;
}

/** The canvas an annotation targets (no fragment), undefined when its target does not name one. */
export function targetCanvasId(resource: IIIFAnnotation): string | undefined {
  const first = [resource.target].flat()[0] as unknown;
  const idOf = (v: unknown): string | undefined =>
    typeof v === 'string' ? v : isObject(v) && typeof v.id === 'string' ? v.id : undefined;
  const raw = typeof first === 'string' ? first : isObject(first) ? (idOf(first.source) ?? idOf(first)) : undefined;
  const id = raw?.split('#')[0];
  return id || undefined;
}

function buildIndex(annotations: MiradorState['annotations'], canvases: CanvasInfo[], currentCanvasId?: string): LinkIndex {
  const canvasIds = canvases.length > 0 ? canvases.map((c) => c.id) : Object.keys(annotations);
  if (currentCanvasId && !canvasIds.includes(currentCanvasId)) canvasIds.push(currentCanvasId);

  const entries = new Map<string, LinkedEntry>();
  const forward = new Map<string, string[]>();
  const inverse = new Map<string, string[]>();
  const manifestCanvasIds = new Set(canvasIds);
  for (const pageKey of canvasIds) {
    const resources = normalizeAnnotationResources(annotations[pageKey]);
    for (const id of Object.keys(resources)) {
      const resource = resources[id];
      const base = baseAnnotationId(id);
      // A page can list annotations of several canvases: the target wins over the page key.
      const targeted = targetCanvasId(resource);
      const canvasId = targeted && manifestCanvasIds.has(targeted) ? targeted : pageKey;
      const known = entries.get(base);
      if (known) {
        if (known.canvasId === canvasId && !known.ids.includes(id)) {
          known.ids.push(id);
          known.resources[id] = resource;
        }
        continue;
      }
      entries.set(base, { id: base, ids: [id], canvasId, resource, resources: { [id]: resource } });
      const links = linksOf(resource);
      if (links.length === 0) continue;
      forward.set(base, links);
      for (const target of links) {
        const citing = inverse.get(target);
        if (citing) citing.push(base);
        else inverse.set(target, [base]);
      }
    }
  }
  return { entries, forward, inverse, canvases };
}

// One index per (annotation state object, window): rebuilt only when Mirador's annotations change.
const indexCache = new WeakMap<object, Map<string, { manifest: unknown; canvasId?: string; index: LinkIndex }>>();

/** The link index of a window, over the annotations loaded for its manifest's canvases. */
export function getLinkIndex(state: MiradorState, windowId: string): LinkIndex {
  const annotations = state.annotations;
  if (!isObject(annotations)) return EMPTY_LINK_INDEX;
  const win = state.windows?.[windowId];
  const manifest = win?.manifestId ? state.manifests?.[win.manifestId]?.json : undefined;
  const canvasId = win?.canvasId;
  let perWindow = indexCache.get(annotations);
  if (!perWindow) indexCache.set(annotations, (perWindow = new Map()));
  const hit = perWindow.get(windowId);
  if (hit && hit.manifest === manifest && hit.canvasId === canvasId) return hit.index;
  const index = buildIndex(annotations, manifestCanvases(manifest), canvasId);
  perWindow.set(windowId, { manifest, canvasId, index });
  return index;
}

/** Linked ids of an annotation that are on the current canvas (as listed there). */
export function linkedIdsOnCanvas(index: LinkIndex, annotationId: string, canvasAnnotationIds: string[]): string[] {
  const listed = listedIdsByBase(canvasAnnotationIds);
  const out: string[] = [];
  for (const target of index.forward.get(baseAnnotationId(annotationId)) ?? []) {
    const own = listed.get(target);
    if (own) out.push(...own);
  }
  return out;
}

/** Annotations citing this one (other than itself), as index entries. */
export function citingEntries(index: LinkIndex, annotationId: string): LinkedEntry[] {
  const base = baseAnnotationId(annotationId);
  return (index.inverse.get(base) ?? [])
    .filter((id) => id !== base)
    .map((id) => index.entries.get(id))
    .filter((e): e is LinkedEntry => !!e);
}

/** Display ids to highlight together: the annotation and its linked zones on the canvas. */
export function hoverGroup(index: LinkIndex, annotationId: string, canvasAnnotationIds: string[]): string[] {
  return [...new Set([annotationId, ...linkedIdsOnCanvas(index, annotationId, canvasAnnotationIds)])];
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

export interface LinkRow {
  key: string;
  /** Position in the list, from 1: the number the list shows and the canvas badge repeats. */
  n: number;
  kind: 'here' | 'other' | 'unavailable' | 'external';
  /** Base id of the linked annotation, or the URL of an external link. */
  targetId: string;
  /** Id to select (as listed on its canvas); here and other rows only. */
  annotationId?: string;
  canvasId?: string;
  title: string;
  /** Value of the host-named metadata of the target, '' when none. */
  subtitle: string;
  canvasLabel?: string;
  href?: string;
  hiddenByFilter: boolean;
}

export interface LinkRowEnv {
  index: LinkIndex;
  canvasId?: string;
  /** Ids of the annotations on the current canvas. */
  canvasAnnotationIds: string[];
  prefs: string[];
  hiddenIds?: Set<string>;
  subtitleLabel?: string;
}

const ID_TAIL = 12;
const idTail = (id: string): string => `…${id.slice(-ID_TAIL)}`;

/** Localized value(s) of the metadata entry named `label` (case-insensitive), '' when absent. */
export function metadataValue(resource: IIIFAnnotation | undefined, label: string, prefs: string[]): string {
  if (!label || !Array.isArray(resource?.metadata)) return '';
  const wanted = label.trim().toLowerCase();
  for (const m of resource.metadata) {
    if (getLocalizedString(m?.label, prefs).trim().toLowerCase() === wanted) {
      return getLocalizedStrings(m.value, prefs).join(', ');
    }
  }
  return '';
}

export function canvasLabelOf(canvases: CanvasInfo[], canvasId: string | undefined, prefs: string[]): string {
  if (!canvasId) return '';
  const c = canvases.find((x) => x.id === canvasId);
  return getLocalizedString(c?.label, prefs) || canvasId.replace(/[/#]+$/, '').split(/[/#]/).pop() || canvasId;
}

/** One row per linked target: duplicates collapse, non-annotation links become external rows. */
export function buildLinkRows(bodies: SpecificResourceBody[], env: LinkRowEnv): LinkRow[] {
  const { index, canvasId, canvasAnnotationIds, prefs, hiddenIds, subtitleLabel } = env;
  const rows: LinkRow[] = [];
  const seen = new Set<string>();
  for (const body of bodies) {
    if (rows.length >= MAX_LINKS) break;
    const sourceId = srSourceId(body);
    if (!sourceId) continue;
    const base = baseAnnotationId(sourceId);
    if (seen.has(base)) continue;
    seen.add(base);

    const source = isObject(body.source) ? (body.source as Record<string, unknown>) : {};
    const ownLabel = getLocalizedString(srLabel(body), prefs);
    const listedHere = listedIdsByBase(canvasAnnotationIds).get(base);
    const entry = index.entries.get(base);
    // Listed under this page, but only "here" when its own target is this canvas.
    const here = listedHere && (!entry || !canvasId || entry.canvasId === canvasId) ? (listedHere.find((id) => id === base) ?? listedHere[0]) : undefined;
    const common = (annotationId: string | undefined, target: IIIFAnnotation | undefined) => ({
      key: base,
      n: rows.length + 1,
      targetId: base,
      annotationId,
      title: ownLabel || getLocalizedString(target?.label, prefs) || idTail(base),
      subtitle: metadataValue(target, subtitleLabel ?? '', prefs),
    });

    if (here || (entry && entry.canvasId === canvasId)) {
      const annotationId = here ?? entry!.ids[0];
      rows.push({
        ...common(annotationId, entry?.resource),
        kind: 'here',
        canvasId,
        hiddenByFilter: !!hiddenIds?.has(annotationId),
      });
    } else if (entry) {
      rows.push({
        ...common(entry.ids[0], entry.resource),
        kind: 'other',
        canvasId: entry.canvasId,
        canvasLabel: canvasLabelOf(index.canvases, entry.canvasId, prefs),
        hiddenByFilter: false,
      });
    } else if (source.type !== 'Annotation' && isValidUrl(sourceId)) {
      rows.push({ ...common(undefined, undefined), key: sourceId, kind: 'external', targetId: sourceId, href: sourceId, hiddenByFilter: false });
    } else {
      // Embedded hint (`source.target`) names the canvas without loading anything.
      const hinted = typeof source.target === 'string' ? source.target : undefined;
      rows.push({
        ...common(undefined, undefined),
        kind: 'unavailable',
        canvasLabel: hinted ? canvasLabelOf(index.canvases, hinted, prefs) : undefined,
        hiddenByFilter: false,
      });
    }
  }
  return rows;
}
