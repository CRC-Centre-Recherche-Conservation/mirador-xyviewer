/**
 * Annotation Transformer
 * Transforms point annotations (xywh with w=1, h=1) into SVG circle selectors
 * for better visibility in Mirador.
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

/** Default radius for point markers in pixels */
const DEFAULT_POINT_RADIUS = 12;

/** Threshold to consider an annotation as a point */
const POINT_SIZE_THRESHOLD = 5;

/**
 * Parse xywh fragment selector value
 * @param value - Fragment selector value like "xywh=100,200,1,1"
 * @returns Parsed coordinates or null if invalid
 */
function parseXYWH(value: string): { x: number; y: number; w: number; h: number } | null {
  const match = value.match(/^xywh=(\d+),(\d+),(\d+),(\d+)$/);
  if (!match) return null;

  return {
    x: parseInt(match[1], 10),
    y: parseInt(match[2], 10),
    w: parseInt(match[3], 10),
    h: parseInt(match[4], 10),
  };
}

/**
 * Check if coordinates represent a point (very small area)
 */
function isPointCoordinates(w: number, h: number): boolean {
  return w <= POINT_SIZE_THRESHOLD && h <= POINT_SIZE_THRESHOLD;
}

/**
 * Create an SVG circle selector for a point
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param radius - Circle radius
 * @returns SVG selector object
 */
function createCircleSvgSelector(x: number, y: number, radius: number = DEFAULT_POINT_RADIUS): {
  type: string;
  value: string;
} {
  // Create an SVG circle path centered at (x, y)
  // Using arc commands to draw a circle
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="M ${x} ${y - radius} A ${radius} ${radius} 0 1 1 ${x} ${y + radius} A ${radius} ${radius} 0 1 1 ${x} ${y - radius}" fill="rgba(26, 115, 232, 0.3)" stroke="#1a73e8" stroke-width="2"/></svg>`;

  return {
    type: 'SvgSelector',
    value: svg,
  };
}

/**
 * Transform a single annotation's selector if it's a point
 * @param annotation - The annotation object
 * @param radius - Radius for point circles
 * @returns Transformed annotation (mutated in place)
 */
function transformAnnotationSelector(
  annotation: Record<string, unknown>,
  radius: number = DEFAULT_POINT_RADIUS
): Record<string, unknown> {
  const target = annotation.target as Record<string, unknown> | string | undefined;

  if (!target || typeof target === 'string') return annotation;

  const selector = target.selector as Record<string, unknown> | undefined;

  if (!selector) return annotation;

  // Check if it's a FragmentSelector with xywh
  if (selector.type === 'FragmentSelector' && typeof selector.value === 'string') {
    const coords = parseXYWH(selector.value);

    if (coords && isPointCoordinates(coords.w, coords.h)) {
      // Calculate center of the point
      const centerX = coords.x + coords.w / 2;
      const centerY = coords.y + coords.h / 2;

      // Replace with SVG selector
      target.selector = createCircleSvgSelector(centerX, centerY, radius);

      console.debug(
        `[AnnotationTransformer] Transformed point annotation at (${centerX}, ${centerY}) to SVG circle`
      );
    }
  }

  return annotation;
}

/**
 * Transform all annotations in an annotation page:
 * 1. Read the container into the internal model (any IIIF version, via the normalizer).
 * 2. Merge duplicate ids + expand multi-target into unique-id, single-target
 *    annotations (shared {@link expandAnnotations} — same id management as the panel).
 * 3. Transform point annotations to SVG circles (the display concern owned here).
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
  expanded.forEach((annotation) => transformAnnotationSelector(annotation, radius));

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
