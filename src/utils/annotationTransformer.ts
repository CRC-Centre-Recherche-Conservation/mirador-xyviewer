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
  // Only act on annotation responses. Mirador runs every postprocessor over ALL
  // fetched resources, distinguished by key: annotations carry `annotationJson`,
  // search carries `searchJson`, manifests `manifestJson`, info `infoJson`. Gating
  // on `annotationJson` is what keeps this transform off Search/Manifest/Info
  // responses — do NOT broaden it (Search would lose its hits/pagination).
  if (action.annotationJson) {
    const annotationJson = action.annotationJson as Record<string, unknown>;
    transformPointAnnotations(annotationJson);
  }
}

/**
 * Create a customized postprocessor with specific radius
 * @param radius - Radius for point circles
 * @returns Postprocessor function
 */
export function createAnnotationPostprocessor(radius: number = DEFAULT_POINT_RADIUS) {
  return (_url: string, action: Record<string, unknown>): void => {
    if (action.annotationJson) {
      const annotationJson = action.annotationJson as Record<string, unknown>;
      transformPointAnnotations(annotationJson, radius);
    }
  };
}

export default annotationPostprocessor;
