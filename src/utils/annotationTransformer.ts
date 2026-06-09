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

import { normalizeAnnotationList } from './annotationNormalizer';

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
 * Merge annotations that share the same ID into a single annotation with multiple targets.
 * This handles the case where the backend sends duplicate annotations (same ID, different targets)
 * for analyses that cover multiple locations (e.g., Micro Imaging).
 *
 * @param items - Array of annotation objects
 * @returns Array of annotations with duplicates merged
 */
function mergeAnnotationsByIds(
  items: Record<string, unknown>[]
): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>[]>();

  // Group annotations by ID
  items.forEach((item) => {
    const id = item.id as string;
    if (!byId.has(id)) {
      byId.set(id, []);
    }
    byId.get(id)!.push(item);
  });

  // Merge duplicates
  const merged: Record<string, unknown>[] = [];
  byId.forEach((annotations, id) => {
    if (annotations.length === 1) {
      // No duplicates, keep as-is
      merged.push(annotations[0]);
    } else {
      // Multiple annotations with same ID - merge their targets into an array
      const base = { ...annotations[0] };
      base.target = annotations.map((ann) => ann.target);
      merged.push(base);

      console.debug(
        `[AnnotationTransformer] Merged ${annotations.length} annotations with ID: ${id}`
      );
    }
  });

  return merged;
}

/**
 * Expand annotations with multiple targets into separate annotations.
 * Mirador only supports single target per annotation, so we need to split them.
 *
 * @param annotation - The annotation object that may have multiple targets
 * @returns Array of annotations (1 if single target, N if multiple targets)
 */
function expandMultiTargetAnnotation(
  annotation: Record<string, unknown>
): Record<string, unknown>[] {
  const target = annotation.target;

  // If target is not an array, return as-is
  if (!Array.isArray(target)) {
    return [annotation];
  }

  // If array has only one element, simplify to single target
  if (target.length === 1) {
    return [{ ...annotation, target: target[0] }];
  }

  // Expand into multiple annotations, each with a unique ID
  const baseId = annotation.id as string;

  return target.map((singleTarget, index) => ({
    ...annotation,
    // Create unique ID by appending target index
    id: `${baseId}#target-${index}`,
    // Keep reference to original annotation ID for grouping
    _originalAnnotationId: baseId,
    _targetIndex: index,
    _totalTargets: target.length,
    // Single target for this expanded annotation
    target: singleTarget,
  }));
}

/**
 * Transform all annotations in an annotation page:
 * 1. Merge duplicate annotations (same ID) into single annotation with multiple targets
 * 2. Expand multi-target annotations into separate annotations with unique IDs
 * 3. Transform point annotations to SVG circles
 *
 * @param annotationPage - IIIF Annotation Page object
 * @param radius - Radius for point circles
 * @returns Transformed annotation page
 */
export function transformPointAnnotations(
  annotationPage: Record<string, unknown>,
  radius: number = DEFAULT_POINT_RADIUS
): Record<string, unknown> {
  // Read whatever IIIF version this container is into the internal model
  // (version-agnostic: dispatched through the normalizer's adapter registry).
  const items = normalizeAnnotationList(annotationPage);

  // Unknown/empty shape → leave the page untouched.
  if (!items.length) return annotationPage;

  // Existing display pipeline, version-blind: merge same-id → expand
  // multi-target → point→circle. These operate purely on the internal model.
  const merged = mergeAnnotationsByIds(items as unknown as Record<string, unknown>[]);
  const expanded = merged.flatMap(expandMultiTargetAnnotation);
  expanded.forEach((annotation) => transformAnnotationSelector(annotation, radius));

  annotationPage.items = expanded;
  annotationPage.type = 'AnnotationPage';
  // Drop non-canonical container keys so Mirador sees a clean v3 page (no-ops if absent).
  delete annotationPage.resources;
  delete annotationPage['@type'];
  delete annotationPage['@context'];
  delete annotationPage['@id'];

  // Log transformation summary when merge/expand changed the count.
  if (merged.length < items.length || expanded.length !== merged.length) {
    console.debug(
      `[AnnotationTransformer] Processed annotations: ${items.length} → ${merged.length} (merged) → ${expanded.length} (expanded)`
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
  // Check if this is an annotation response
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
