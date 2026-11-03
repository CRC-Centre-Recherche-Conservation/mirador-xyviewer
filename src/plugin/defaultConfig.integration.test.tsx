/**
 * Plugin default config through Mirador's real store creation: annotations are drawn from the
 * start, and a host value wins.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error not in Mirador's published typings
import { createPluggableStore } from 'mirador';
import { scientificAnnotationPlugin } from './ConnectedScientificAnnotationPlugin';
import { pointMarkersPlugin } from './PointMarkersPlugin';

const windowDefaults = (config: object, plugins: object[]) =>
  (createPluggableStore(config, plugins) as { getState(): { config: { window: Record<string, unknown> } } }).getState().config.window;

describe('plugin default config', () => {
  it('both plugins export the draw-everything defaults', () => {
    for (const p of [scientificAnnotationPlugin, pointMarkersPlugin]) {
      expect(p.config).toEqual({ window: { highlightAllAnnotations: true, forceDrawAnnotations: true } });
    }
  });

  it('applies when the host sets nothing, from either plugin alone', () => {
    for (const p of [scientificAnnotationPlugin, pointMarkersPlugin]) {
      const w = windowDefaults({ id: 'x' }, [p]);
      expect(w.highlightAllAnnotations).toBe(true);
      expect(w.forceDrawAnnotations).toBe(true);
    }
  });

  it('lets the host config override them', () => {
    const w = windowDefaults({ id: 'x', window: { highlightAllAnnotations: false } }, [scientificAnnotationPlugin, pointMarkersPlugin]);
    expect(w.highlightAllAnnotations).toBe(false);
    expect(w.forceDrawAnnotations).toBe(true);
  });
});
