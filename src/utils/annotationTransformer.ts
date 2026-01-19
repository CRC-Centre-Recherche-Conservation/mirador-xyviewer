/**
 * Annotation Transformer
 * Transforms point annotations (xywh with w=1, h=1) into SVG circle selectors
 * for better visibility in Mirador.
 */

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
 * Transform all point annotations in an annotation page
 * @param annotationPage - IIIF Annotation Page object
 * @param radius - Radius for point circles
 * @returns Transformed annotation page
 */
export function transformPointAnnotations(
  annotationPage: Record<string, unknown>,
  radius: number = DEFAULT_POINT_RADIUS
): Record<string, unknown> {
  const items = annotationPage.items as Record<string, unknown>[] | undefined;

  if (!items || !Array.isArray(items)) return annotationPage;

  items.forEach((annotation) => {
    transformAnnotationSelector(annotation, radius);
  });

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
  url: string,
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
  return (url: string, action: Record<string, unknown>): void => {
    if (action.annotationJson) {
      const annotationJson = action.annotationJson as Record<string, unknown>;
      transformPointAnnotations(annotationJson, radius);
    }
  };
}

export default annotationPostprocessor;
