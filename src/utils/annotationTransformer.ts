/**
 * Annotation Transformer
 * Normalizes target selectors for display: point annotations (tiny xywh or
 * PointSelector) become SVG circles, polygons become paths (see annotationSelectors).
 *
 * Also handles annotations with multiple targets by expanding them into
 * separate annotations (Mirador only supports single target per annotation).
 *
 * Version-agnostic: whatever IIIF annotation container arrives (any format the
 * normalizer's adapter registry recognizes) is read into the internal model via
 * `normalizeAnnotationList`, then the display pipeline (merge → expand → point→
 * circle) runs on that model. The pipeline itself is version-blind, so a new
 * IIIF version is supported by registering an adapter in `annotationNormalizer`
 * — nothing here changes (see plan §4.7 / §3.1).
 */

import {
  normalizeAnnotationList,
  expandAnnotations,
  isContentSearchResponse,
} from './annotationNormalizer';
import { DEFAULT_POINT_RADIUS, normalizeTargetSelector } from './annotationSelectors';

/**
 * Transform all annotations in an annotation page:
 * 1. Read the container into the internal model (any IIIF version, via the normalizer).
 * 2. Merge duplicate ids + expand multi-target into unique-id, single-target
 *    annotations (shared {@link expandAnnotations} — same id management as the panel).
 * 3. Normalize selectors for display: arrays, points → circles, polygons → paths,
 *    `pixel:` fragments (see {@link normalizeTargetSelector}).
 *
 * @param annotationPage - IIIF Annotation Page / List object (mutated in place)
 * @param radius - Radius for point circles
 * @returns Transformed annotation page
 */
export function transformPointAnnotations(
  annotationPage: Record<string, unknown>,
  radius: number = DEFAULT_POINT_RADIUS
): Record<string, unknown> {
  // A IIIF Content Search response is also an AnnotationList/AnnotationPage, so the
  // adapters would read it — but it carries hits/pagination/highlighting we must
  // NOT strip. Leave it untouched. (Defence in depth: the postprocessor already
  // only runs on annotation responses; this also protects direct callers.)
  if (isContentSearchResponse(annotationPage)) return annotationPage;

  // Read whatever IIIF version this container is into the internal model
  // (version-agnostic: dispatched through the normalizer's adapter registry).
  const items = normalizeAnnotationList(annotationPage);

  // Unknown/empty shape → leave the page untouched.
  if (!items.length) return annotationPage;

  // Shared id management (merge same-id → expand multi-target), then the
  // display-only point→circle pass on the resulting single-target annotations.
  const expanded = expandAnnotations(items) as unknown as Record<string, unknown>[];
  expanded.forEach((annotation) => normalizeTargetSelector(annotation, radius));

  annotationPage.items = expanded;
  annotationPage.type = 'AnnotationPage';
  // Drop non-canonical container keys so Mirador sees a clean v3 page (no-ops if absent).
  delete annotationPage.resources;
  delete annotationPage['@type'];
  delete annotationPage['@context'];
  delete annotationPage['@id'];

  // Log when expansion changed the annotation count.
  if (expanded.length !== items.length) {
    console.debug(
      `[AnnotationTransformer] Processed annotations: ${items.length} → ${expanded.length} (expanded)`
    );
  }

  return annotationPage;
}

/**
 * Annotations processed per manifest, counted after multi-target expansion;
 * pages beyond this budget are left as shipped.
 */
export const MAX_EMBEDDED_ANNOTATIONS = 20_000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Same gate as Mirador's saga: a typed AnnotationPage carrying inline items. */
function embeddedItems(page: unknown): unknown[] | undefined {
  if (!isRecord(page) || page.type !== 'AnnotationPage') return undefined;
  return Array.isArray(page.items) && page.items.length ? page.items : undefined;
}

/** Output size of a page: one annotation per target of each multi-target item. */
function expandedCount(items: unknown[]): number {
  let n = 0;
  for (const a of items) {
    const t = isRecord(a) ? a.target : undefined;
    n += Array.isArray(t) && t.length ? t.length : 1;
  }
  return n;
}

/** Display-transform one canvas's embedded pages; the original canvas when nothing changed. */
function transformCanvasPages(
  canvas: Record<string, unknown>,
  budget: { left: number },
  radius: number
): Record<string, unknown> {
  const pages = canvas.annotations;
  if (!Array.isArray(pages)) return canvas;
  let out: unknown[] | undefined;
  pages.forEach((page, i) => {
    const items = embeddedItems(page);
    if (!items) return;
    const count = expandedCount(items);
    if (count > budget.left) return;
    budget.left -= count;
    const next = transformPointAnnotations({ ...(page as Record<string, unknown>) }, radius);
    // Unrecognised items come back as the same (unchanged) list: keep the original page.
    if (next.items === items) return;
    out ??= pages.slice();
    out[i] = next;
  });
  return out ? { ...canvas, annotations: out } : canvas;
}

/**
 * Apply the display pass to annotation pages EMBEDDED in a Presentation 3
 * manifest (`items[Canvas].annotations[AnnotationPage].items`). Mirador hands
 * inline pages straight to the store without running request postprocessors,
 * so the canvas overlay would otherwise draw their raw selectors.
 *
 * Presentation 2 `otherContent` lists are left alone: Mirador ignores any
 * inline `resources` and always fetches each list by `@id`, which already goes
 * through the `annotationJson` branch of the postprocessor.
 *
 * Referenced pages (no inline items), content-search responses and everything
 * else stay byte-identical. The input is never mutated: changed canvases and
 * pages are copied, and the SAME object is returned when nothing changed (the
 * common case, a cheap walk with no cloning). At most
 * {@link MAX_EMBEDDED_ANNOTATIONS} annotations (after multi-target expansion)
 * are processed per manifest, and any error returns the original manifest.
 *
 * @param manifest - Presentation 3 manifest JSON
 * @param radius - Radius for point circles
 */
export function transformEmbeddedAnnotationPages<T = unknown>(
  manifest: T,
  radius: number = DEFAULT_POINT_RADIUS
): T {
  try {
    if (!isRecord(manifest) || !Array.isArray(manifest.items)) return manifest;
    const budget = { left: MAX_EMBEDDED_ANNOTATIONS };
    let canvases: unknown[] | undefined;
    manifest.items.forEach((canvas, i) => {
      if (!isRecord(canvas) || canvas.type !== 'Canvas') return;
      const next = transformCanvasPages(canvas, budget, radius);
      if (next === canvas) return;
      canvases ??= (manifest.items as unknown[]).slice();
      canvases[i] = next;
    });
    return canvases ? ({ ...manifest, items: canvases } as T) : manifest;
  } catch {
    return manifest;
  }
}

/**
 * Mirador postprocessor function to transform annotations
 * Use this in the Mirador config: requests.postprocessors
 *
 * @example
 * ```ts
 * Mirador.viewer({
 *   requests: {
 *     postprocessors: [annotationPostprocessor],
 *   },
 * });
 * ```
 */
export function annotationPostprocessor(
  _url: string,
  action: Record<string, unknown>
): void {
  applyPostprocessor(action, DEFAULT_POINT_RADIUS);
}

// Mirador runs every postprocessor over ALL fetched resources, distinguished by
// key: annotations carry `annotationJson`, search `searchJson`, info `infoJson`,
// manifests `manifestJson`. Search and info are never touched (Search would lose
// its hits/pagination); manifests only get their embedded pages transformed.
function applyPostprocessor(action: Record<string, unknown>, radius: number): void {
  if (action.annotationJson) {
    transformPointAnnotations(action.annotationJson as Record<string, unknown>, radius);
  } else if (action.manifestJson) {
    action.manifestJson = transformEmbeddedAnnotationPages(action.manifestJson, radius);
  }
}

/**
 * Create a customized postprocessor with specific radius
 * @param radius - Radius for point circles
 * @returns Postprocessor function
 */
export function createAnnotationPostprocessor(radius: number = DEFAULT_POINT_RADIUS) {
  return (_url: string, action: Record<string, unknown>): void => {
    applyPostprocessor(action, radius);
  };
}

export default annotationPostprocessor;
