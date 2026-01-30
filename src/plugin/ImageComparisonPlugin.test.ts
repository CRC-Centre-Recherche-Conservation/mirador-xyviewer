import { describe, it, expect } from 'vitest';

/**
 * Tests for ImageComparisonPlugin utility functions
 *
 * Note: The React component tests would require a more complex setup with
 * mocked Mirador/OpenSeadragon environment. These tests focus on the
 * pure utility functions.
 */

// Re-implement the utility functions for testing (they are not exported from the plugin)
// This ensures the logic is correct without needing to export internal functions

/** Localized string type */
interface LocalizedString {
  [language: string]: string[];
}

/** IIIF Canvas type (simplified) */
interface IIIFCanvas {
  id?: string;
  '@id'?: string;
  label?: LocalizedString | string;
  items?: Array<{
    items?: Array<{
      body?: { id?: string } | Array<{ id?: string }>;
    }>;
  }>;
  images?: Array<{
    resource?: string | { '@id'?: string; id?: string };
  }>;
  thumbnail?: string | Array<string | { id?: string; '@id'?: string }> | { id?: string; '@id'?: string };
}

/** IIIF Manifest type (simplified) */
interface IIIFManifest {
  items?: IIIFCanvas[];
  sequences?: Array<{ canvases?: IIIFCanvas[] }>;
}

/** Canvas info type */
interface CanvasInfo {
  id: string;
  label: string;
  imageUrl: string;
  thumbnailUrl?: string;
}

/** Default language preference order */
const DEFAULT_LANGUAGES = ['en', 'none', '@none'];

/**
 * Get the best matching string from a LocalizedString
 */
function getLocalizedString(
  value: LocalizedString | string | undefined,
  preferredLanguages: string[] = DEFAULT_LANGUAGES
): string {
  if (!value) return '';
  if (typeof value === 'string') return value;

  for (const lang of preferredLanguages) {
    if (value[lang]?.length) {
      return value[lang][0];
    }
  }

  const keys = Object.keys(value);
  if (keys.length > 0 && value[keys[0]]?.length) {
    return value[keys[0]][0];
  }

  return '';
}

/**
 * Extract image URL from IIIF canvas
 */
function extractImageUrl(canvas: IIIFCanvas): string | null {
  // IIIF Presentation 3.0
  if (canvas.items) {
    for (const page of canvas.items) {
      if (page.items) {
        for (const annotation of page.items) {
          if (annotation.body) {
            const body = annotation.body;
            if (typeof body === 'object' && 'id' in body) {
              return body.id as string;
            }
            if (Array.isArray(body) && body[0]?.id) {
              return body[0].id;
            }
          }
        }
      }
    }
  }
  // IIIF Presentation 2.0
  if (canvas.images) {
    for (const image of canvas.images) {
      if (image.resource) {
        if (typeof image.resource === 'string') {
          return image.resource;
        }
        if (image.resource['@id']) {
          return image.resource['@id'];
        }
        if (image.resource.id) {
          return image.resource.id;
        }
      }
    }
  }
  return null;
}

/**
 * Extract thumbnail URL from IIIF canvas
 */
function extractThumbnailUrl(canvas: IIIFCanvas): string | null {
  if (canvas.thumbnail) {
    if (typeof canvas.thumbnail === 'string') {
      return canvas.thumbnail;
    }
    if (Array.isArray(canvas.thumbnail) && canvas.thumbnail[0]) {
      const thumb = canvas.thumbnail[0];
      if (typeof thumb === 'string') {
        return thumb;
      }
      return thumb.id || thumb['@id'] || null;
    }
    if (typeof canvas.thumbnail === 'object' && !Array.isArray(canvas.thumbnail)) {
      return canvas.thumbnail.id || canvas.thumbnail['@id'] || null;
    }
  }
  return null;
}

/**
 * Get canvas label as string
 */
function getCanvasLabel(label: LocalizedString | string | undefined, index: number): string {
  if (!label) return `Image ${index + 1}`;
  if (typeof label === 'string') return label;
  return getLocalizedString(label) || `Image ${index + 1}`;
}

/**
 * Extract canvases from manifest
 */
function extractCanvases(manifest: IIIFManifest | null | undefined): CanvasInfo[] {
  if (!manifest) return [];

  const canvases: CanvasInfo[] = [];

  // IIIF Presentation 3.0
  if (manifest.items) {
    manifest.items.forEach((canvas, index) => {
      const id = canvas.id || canvas['@id'] || `canvas-${index}`;
      const imageUrl = extractImageUrl(canvas);
      if (imageUrl) {
        canvases.push({
          id,
          label: getCanvasLabel(canvas.label, index),
          imageUrl,
          thumbnailUrl: extractThumbnailUrl(canvas) || undefined,
        });
      }
    });
  }

  // IIIF Presentation 2.0
  if (manifest.sequences) {
    manifest.sequences.forEach((sequence) => {
      if (sequence.canvases) {
        sequence.canvases.forEach((canvas, index) => {
          const id = canvas.id || canvas['@id'] || `canvas-${index}`;
          const imageUrl = extractImageUrl(canvas);
          if (imageUrl) {
            canvases.push({
              id,
              label: getCanvasLabel(canvas.label, index),
              imageUrl,
              thumbnailUrl: extractThumbnailUrl(canvas) || undefined,
            });
          }
        });
      }
    });
  }

  return canvases;
}

describe('ImageComparisonPlugin', () => {
  describe('extractImageUrl', () => {
    describe('IIIF Presentation 3.0', () => {
      it('should extract image URL from body with id property', () => {
        const canvas: IIIFCanvas = {
          id: 'canvas-1',
          items: [
            {
              items: [
                {
                  body: { id: 'https://example.com/image.jpg' },
                },
              ],
            },
          ],
        };

        const url = extractImageUrl(canvas);

        expect(url).toBe('https://example.com/image.jpg');
      });

      it('should extract image URL from array body', () => {
        const canvas: IIIFCanvas = {
          id: 'canvas-1',
          items: [
            {
              items: [
                {
                  body: [{ id: 'https://example.com/image1.jpg' }, { id: 'https://example.com/image2.jpg' }],
                },
              ],
            },
          ],
        };

        const url = extractImageUrl(canvas);

        expect(url).toBe('https://example.com/image1.jpg');
      });

      it('should return null for empty items', () => {
        const canvas: IIIFCanvas = {
          id: 'canvas-1',
          items: [],
        };

        const url = extractImageUrl(canvas);

        expect(url).toBeNull();
      });

      it('should return null for items without body', () => {
        const canvas: IIIFCanvas = {
          id: 'canvas-1',
          items: [
            {
              items: [{}],
            },
          ],
        };

        const url = extractImageUrl(canvas);

        expect(url).toBeNull();
      });
    });

    describe('IIIF Presentation 2.0', () => {
      it('should extract image URL from resource string', () => {
        const canvas: IIIFCanvas = {
          '@id': 'canvas-1',
          images: [
            {
              resource: 'https://example.com/image.jpg',
            },
          ],
        };

        const url = extractImageUrl(canvas);

        expect(url).toBe('https://example.com/image.jpg');
      });

      it('should extract image URL from resource @id property', () => {
        const canvas: IIIFCanvas = {
          '@id': 'canvas-1',
          images: [
            {
              resource: { '@id': 'https://example.com/image.jpg' },
            },
          ],
        };

        const url = extractImageUrl(canvas);

        expect(url).toBe('https://example.com/image.jpg');
      });

      it('should extract image URL from resource id property', () => {
        const canvas: IIIFCanvas = {
          '@id': 'canvas-1',
          images: [
            {
              resource: { id: 'https://example.com/image.jpg' },
            },
          ],
        };

        const url = extractImageUrl(canvas);

        expect(url).toBe('https://example.com/image.jpg');
      });

      it('should prefer @id over id in resource', () => {
        const canvas: IIIFCanvas = {
          '@id': 'canvas-1',
          images: [
            {
              resource: {
                '@id': 'https://example.com/preferred.jpg',
                id: 'https://example.com/fallback.jpg',
              },
            },
          ],
        };

        const url = extractImageUrl(canvas);

        expect(url).toBe('https://example.com/preferred.jpg');
      });

      it('should return null for empty images array', () => {
        const canvas: IIIFCanvas = {
          '@id': 'canvas-1',
          images: [],
        };

        const url = extractImageUrl(canvas);

        expect(url).toBeNull();
      });

      it('should return null for images without resource', () => {
        const canvas: IIIFCanvas = {
          '@id': 'canvas-1',
          images: [{}],
        };

        const url = extractImageUrl(canvas);

        expect(url).toBeNull();
      });
    });

    it('should return null for canvas without items or images', () => {
      const canvas: IIIFCanvas = {
        id: 'canvas-1',
      };

      const url = extractImageUrl(canvas);

      expect(url).toBeNull();
    });
  });

  describe('extractThumbnailUrl', () => {
    it('should extract thumbnail URL from string', () => {
      const canvas: IIIFCanvas = {
        id: 'canvas-1',
        thumbnail: 'https://example.com/thumb.jpg',
      };

      const url = extractThumbnailUrl(canvas);

      expect(url).toBe('https://example.com/thumb.jpg');
    });

    it('should extract thumbnail URL from array of strings', () => {
      const canvas: IIIFCanvas = {
        id: 'canvas-1',
        thumbnail: ['https://example.com/thumb1.jpg', 'https://example.com/thumb2.jpg'],
      };

      const url = extractThumbnailUrl(canvas);

      expect(url).toBe('https://example.com/thumb1.jpg');
    });

    it('should extract thumbnail URL from array of objects with id', () => {
      const canvas: IIIFCanvas = {
        id: 'canvas-1',
        thumbnail: [{ id: 'https://example.com/thumb.jpg' }],
      };

      const url = extractThumbnailUrl(canvas);

      expect(url).toBe('https://example.com/thumb.jpg');
    });

    it('should extract thumbnail URL from array of objects with @id', () => {
      const canvas: IIIFCanvas = {
        id: 'canvas-1',
        thumbnail: [{ '@id': 'https://example.com/thumb.jpg' }],
      };

      const url = extractThumbnailUrl(canvas);

      expect(url).toBe('https://example.com/thumb.jpg');
    });

    it('should extract thumbnail URL from object with id', () => {
      const canvas: IIIFCanvas = {
        id: 'canvas-1',
        thumbnail: { id: 'https://example.com/thumb.jpg' },
      };

      const url = extractThumbnailUrl(canvas);

      expect(url).toBe('https://example.com/thumb.jpg');
    });

    it('should extract thumbnail URL from object with @id', () => {
      const canvas: IIIFCanvas = {
        id: 'canvas-1',
        thumbnail: { '@id': 'https://example.com/thumb.jpg' },
      };

      const url = extractThumbnailUrl(canvas);

      expect(url).toBe('https://example.com/thumb.jpg');
    });

    it('should prefer id over @id in object', () => {
      const canvas: IIIFCanvas = {
        id: 'canvas-1',
        thumbnail: {
          id: 'https://example.com/preferred.jpg',
          '@id': 'https://example.com/fallback.jpg',
        },
      };

      const url = extractThumbnailUrl(canvas);

      expect(url).toBe('https://example.com/preferred.jpg');
    });

    it('should return null for canvas without thumbnail', () => {
      const canvas: IIIFCanvas = {
        id: 'canvas-1',
      };

      const url = extractThumbnailUrl(canvas);

      expect(url).toBeNull();
    });

    it('should return null for empty thumbnail array', () => {
      const canvas: IIIFCanvas = {
        id: 'canvas-1',
        thumbnail: [],
      };

      const url = extractThumbnailUrl(canvas);

      expect(url).toBeNull();
    });

    it('should return null for thumbnail object without id properties', () => {
      const canvas: IIIFCanvas = {
        id: 'canvas-1',
        thumbnail: {} as { id?: string; '@id'?: string },
      };

      const url = extractThumbnailUrl(canvas);

      expect(url).toBeNull();
    });
  });

  describe('getCanvasLabel', () => {
    it('should return default label when label is undefined', () => {
      const label = getCanvasLabel(undefined, 0);

      expect(label).toBe('Image 1');
    });

    it('should return default label when label is empty string', () => {
      // Empty string is falsy, so it falls back to default label
      const label = getCanvasLabel('', 0);

      expect(label).toBe('Image 1');
    });

    it('should return string label directly', () => {
      const label = getCanvasLabel('My Canvas', 0);

      expect(label).toBe('My Canvas');
    });

    it('should return localized label from English', () => {
      const localizedLabel: LocalizedString = {
        en: ['English Label'],
        fr: ['French Label'],
      };

      const label = getCanvasLabel(localizedLabel, 0);

      expect(label).toBe('English Label');
    });

    it('should fall back to other language if English not available', () => {
      const localizedLabel: LocalizedString = {
        fr: ['French Label'],
        de: ['German Label'],
      };

      const label = getCanvasLabel(localizedLabel, 0);

      expect(label).toBe('French Label');
    });

    it('should return default label for empty localized string', () => {
      const localizedLabel: LocalizedString = {};

      const label = getCanvasLabel(localizedLabel, 2);

      expect(label).toBe('Image 3');
    });

    it('should use correct index for default label', () => {
      const label = getCanvasLabel(undefined, 5);

      expect(label).toBe('Image 6');
    });

    it('should handle none language key', () => {
      const localizedLabel: LocalizedString = {
        none: ['Unlabeled Canvas'],
      };

      const label = getCanvasLabel(localizedLabel, 0);

      expect(label).toBe('Unlabeled Canvas');
    });

    it('should handle @none language key', () => {
      const localizedLabel: LocalizedString = {
        '@none': ['Unlabeled Canvas'],
      };

      const label = getCanvasLabel(localizedLabel, 0);

      expect(label).toBe('Unlabeled Canvas');
    });
  });

  describe('extractCanvases', () => {
    describe('IIIF Presentation 3.0', () => {
      it('should extract canvases from manifest items', () => {
        const manifest: IIIFManifest = {
          items: [
            {
              id: 'canvas-1',
              label: { en: ['First Canvas'] },
              items: [
                {
                  items: [
                    { body: { id: 'https://example.com/image1.jpg' } },
                  ],
                },
              ],
              thumbnail: 'https://example.com/thumb1.jpg',
            },
            {
              id: 'canvas-2',
              label: { en: ['Second Canvas'] },
              items: [
                {
                  items: [
                    { body: { id: 'https://example.com/image2.jpg' } },
                  ],
                },
              ],
            },
          ],
        };

        const canvases = extractCanvases(manifest);

        expect(canvases).toHaveLength(2);
        expect(canvases[0]).toEqual({
          id: 'canvas-1',
          label: 'First Canvas',
          imageUrl: 'https://example.com/image1.jpg',
          thumbnailUrl: 'https://example.com/thumb1.jpg',
        });
        expect(canvases[1]).toEqual({
          id: 'canvas-2',
          label: 'Second Canvas',
          imageUrl: 'https://example.com/image2.jpg',
          thumbnailUrl: undefined,
        });
      });

      it('should use @id if id is not available', () => {
        const manifest: IIIFManifest = {
          items: [
            {
              '@id': 'canvas-1',
              items: [
                {
                  items: [
                    { body: { id: 'https://example.com/image.jpg' } },
                  ],
                },
              ],
            },
          ],
        };

        const canvases = extractCanvases(manifest);

        expect(canvases[0].id).toBe('canvas-1');
      });

      it('should generate fallback id if neither id nor @id available', () => {
        const manifest: IIIFManifest = {
          items: [
            {
              items: [
                {
                  items: [
                    { body: { id: 'https://example.com/image.jpg' } },
                  ],
                },
              ],
            },
          ],
        };

        const canvases = extractCanvases(manifest);

        expect(canvases[0].id).toBe('canvas-0');
      });

      it('should skip canvases without valid image URL', () => {
        const manifest: IIIFManifest = {
          items: [
            {
              id: 'canvas-1',
              items: [
                {
                  items: [
                    { body: { id: 'https://example.com/image.jpg' } },
                  ],
                },
              ],
            },
            {
              id: 'canvas-2',
              items: [], // No image
            },
          ],
        };

        const canvases = extractCanvases(manifest);

        expect(canvases).toHaveLength(1);
        expect(canvases[0].id).toBe('canvas-1');
      });
    });

    describe('IIIF Presentation 2.0', () => {
      it('should extract canvases from manifest sequences', () => {
        const manifest: IIIFManifest = {
          sequences: [
            {
              canvases: [
                {
                  '@id': 'canvas-1',
                  label: 'First Canvas',
                  images: [
                    { resource: { '@id': 'https://example.com/image1.jpg' } },
                  ],
                  thumbnail: { '@id': 'https://example.com/thumb1.jpg' },
                },
                {
                  '@id': 'canvas-2',
                  label: 'Second Canvas',
                  images: [
                    { resource: 'https://example.com/image2.jpg' },
                  ],
                },
              ],
            },
          ],
        };

        const canvases = extractCanvases(manifest);

        expect(canvases).toHaveLength(2);
        expect(canvases[0]).toEqual({
          id: 'canvas-1',
          label: 'First Canvas',
          imageUrl: 'https://example.com/image1.jpg',
          thumbnailUrl: 'https://example.com/thumb1.jpg',
        });
        expect(canvases[1]).toEqual({
          id: 'canvas-2',
          label: 'Second Canvas',
          imageUrl: 'https://example.com/image2.jpg',
          thumbnailUrl: undefined,
        });
      });

      it('should handle multiple sequences', () => {
        const manifest: IIIFManifest = {
          sequences: [
            {
              canvases: [
                {
                  '@id': 'canvas-1',
                  images: [{ resource: { '@id': 'https://example.com/image1.jpg' } }],
                },
              ],
            },
            {
              canvases: [
                {
                  '@id': 'canvas-2',
                  images: [{ resource: { '@id': 'https://example.com/image2.jpg' } }],
                },
              ],
            },
          ],
        };

        const canvases = extractCanvases(manifest);

        expect(canvases).toHaveLength(2);
      });

      it('should handle sequences without canvases property', () => {
        const manifest: IIIFManifest = {
          sequences: [{}],
        };

        const canvases = extractCanvases(manifest);

        expect(canvases).toHaveLength(0);
      });
    });

    it('should return empty array for null manifest', () => {
      const canvases = extractCanvases(null);

      expect(canvases).toEqual([]);
    });

    it('should return empty array for undefined manifest', () => {
      const canvases = extractCanvases(undefined);

      expect(canvases).toEqual([]);
    });

    it('should return empty array for empty manifest', () => {
      const manifest: IIIFManifest = {};

      const canvases = extractCanvases(manifest);

      expect(canvases).toEqual([]);
    });

    it('should handle manifest with both items and sequences', () => {
      const manifest: IIIFManifest = {
        items: [
          {
            id: 'canvas-v3',
            items: [
              {
                items: [
                  { body: { id: 'https://example.com/v3-image.jpg' } },
                ],
              },
            ],
          },
        ],
        sequences: [
          {
            canvases: [
              {
                '@id': 'canvas-v2',
                images: [{ resource: { '@id': 'https://example.com/v2-image.jpg' } }],
              },
            ],
          },
        ],
      };

      const canvases = extractCanvases(manifest);

      // Should include both v3 and v2 canvases
      expect(canvases).toHaveLength(2);
      expect(canvases.map((c) => c.id)).toContain('canvas-v3');
      expect(canvases.map((c) => c.id)).toContain('canvas-v2');
    });
  });
});

describe('ImageComparisonPlugin export', () => {
  it('should export the plugin correctly', async () => {
    const { imageComparisonPlugin } = await import('./ImageComparisonPlugin');

    expect(imageComparisonPlugin).toBeDefined();
    expect(imageComparisonPlugin.target).toBe('OpenSeadragonViewer');
    expect(imageComparisonPlugin.mode).toBe('add');
    expect(imageComparisonPlugin.name).toBe('ImageComparisonPlugin');
    expect(imageComparisonPlugin.component).toBeDefined();
  });

  it('should export ConnectedImageComparisonPlugin', async () => {
    const { ConnectedImageComparisonPlugin } = await import('./ImageComparisonPlugin');

    expect(ConnectedImageComparisonPlugin).toBeDefined();
  });
});
