/**
 * Pattern D integration: plugin wiring.
 * (a) the four exported plugin objects are structurally valid;
 * (b) the demo entry registers all four via Mirador.viewer (mirador mocked).
 * demo/ is outside coverage.include, so this catches "a plugin export or the demo
 * registration broke" without adding coverage.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  scientificAnnotationPlugin,
  imageComparisonPlugin,
  metadataFiltersPlugin,
  selectionHighlightPlugin,
} from '../index';

// vi.hoisted so the vi.mock factory (hoisted above top-level consts) can close
// over `viewer` without a temporal-dead-zone ReferenceError.
// The instance exposes a store (setupDemoAuth subscribes to it for the image-auth reload).
const { viewer } = vi.hoisted(() => ({
  viewer: vi.fn((..._args: unknown[]) => ({
    store: { getState: () => ({}), dispatch: () => {}, subscribe: () => () => {} },
  })),
}));
vi.mock('mirador', () => ({
  default: { viewer },
  addWindow: vi.fn((c) => ({ type: 'ADD_WINDOW', ...c })),
  updateWindow: vi.fn((id, p) => ({ type: 'UPDATE_WINDOW', id, ...p })),
}));
// mirador-image-tools is spread into the demo's plugin array.
vi.mock('mirador-image-tools', () => ({ miradorImageToolsPlugin: [] }));

describe('plugin wiring', () => {
  it('every exported plugin has a valid shape', () => {
    for (const p of [
      scientificAnnotationPlugin,
      imageComparisonPlugin,
      metadataFiltersPlugin,
      selectionHighlightPlugin,
    ]) {
      expect(typeof p.target).toBe('string');
      expect(['wrap', 'add', 'replace']).toContain(p.mode);
      expect(p.component).toBeDefined();
    }
  });

  it('the demo registers all four plugins via Mirador.viewer', async () => {
    await import('../../demo/main');
    expect(viewer).toHaveBeenCalledTimes(1);
    const pluginsArg = viewer.mock.calls[0][1] as unknown[];
    // Spread of miradorImageToolsPlugin ([]) + the four library plugins.
    expect(pluginsArg).toContain(scientificAnnotationPlugin);
    expect(pluginsArg).toContain(imageComparisonPlugin);
    expect(pluginsArg).toContain(metadataFiltersPlugin);
    expect(pluginsArg).toContain(selectionHighlightPlugin);
  });
});
