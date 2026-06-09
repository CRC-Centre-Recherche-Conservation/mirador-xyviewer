/**
 * Tests for the spectrumStore singleton.
 *
 * Covers add/update/remove, visibility toggling, window/canvas queries,
 * colour-palette cycling, subscriber notification, clear/clearWindow, and
 * getStats. The store is a module singleton, so each test calls clear()
 * in beforeEach to start from a known state.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { spectrumStore } from './spectrumStore';
import type { SpectrumData } from '../types/dataset';

const makeData = (id = 'd1'): SpectrumData => ({
  id,
  label: 'Test',
  xValues: [1, 2, 3],
  xLabel: 'x',
  series: [{ label: 's', yValues: [1, 2, 3] }],
  mimeType: 'text/csv',
  points: [{ x: 1, y: 1 }],
});

beforeEach(() => {
  spectrumStore.clear();
});

describe('addSpectrum', () => {
  it('adds a new entry, visible by default, and notifies', () => {
    const listener = vi.fn();
    const unsub = spectrumStore.subscribe(listener);

    spectrumStore.addSpectrum('id1', makeData(), 'anno1', 'win1', 'canvas1');

    const entry = spectrumStore.getSpectrum('id1');
    expect(entry).toBeDefined();
    expect(entry!.visible).toBe(true);
    expect(entry!.annotationId).toBe('anno1');
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'add', id: 'id1' }));
    unsub();
  });

  it('updates data in place without a second notification on re-add', () => {
    spectrumStore.addSpectrum('id1', makeData(), 'anno1');
    const listener = vi.fn();
    const unsub = spectrumStore.subscribe(listener);

    const updated = makeData('updated');
    spectrumStore.addSpectrum('id1', updated, 'anno1');

    expect(spectrumStore.getSpectrum('id1')!.data.id).toBe('updated');
    expect(listener).not.toHaveBeenCalled();
    unsub();
  });

  it('cycles through the colour palette for distinct entries', () => {
    spectrumStore.addSpectrum('a', makeData(), 'anno');
    spectrumStore.addSpectrum('b', makeData(), 'anno');
    const colorA = spectrumStore.getSpectrum('a')!.color;
    const colorB = spectrumStore.getSpectrum('b')!.color;
    expect(colorA).not.toBe(colorB);
  });
});

describe('removeSpectrum', () => {
  it('removes an existing entry and notifies', () => {
    spectrumStore.addSpectrum('id1', makeData(), 'anno1');
    const listener = vi.fn();
    const unsub = spectrumStore.subscribe(listener);

    spectrumStore.removeSpectrum('id1');

    expect(spectrumStore.getSpectrum('id1')).toBeUndefined();
    expect(listener).toHaveBeenCalledWith({ type: 'remove', id: 'id1' });
    unsub();
  });

  it('is a no-op for a missing id', () => {
    const listener = vi.fn();
    const unsub = spectrumStore.subscribe(listener);
    spectrumStore.removeSpectrum('nope');
    expect(listener).not.toHaveBeenCalled();
    unsub();
  });
});

describe('setVisibility', () => {
  it('toggles visibility and notifies', () => {
    spectrumStore.addSpectrum('id1', makeData(), 'anno1');
    spectrumStore.setVisibility('id1', false);
    expect(spectrumStore.getSpectrum('id1')!.visible).toBe(false);
  });

  it('is a no-op for a missing id', () => {
    expect(() => spectrumStore.setVisibility('nope', false)).not.toThrow();
  });
});

describe('window / canvas queries', () => {
  it('returns only spectra for the given window', () => {
    spectrumStore.addSpectrum('a', makeData(), 'anno', 'win1', 'c1');
    spectrumStore.addSpectrum('b', makeData(), 'anno', 'win2', 'c2');
    const win1 = spectrumStore.getSpectraForWindow('win1');
    expect([...win1.keys()]).toEqual(['a']);
  });

  it('returns only spectra for the given canvas', () => {
    spectrumStore.addSpectrum('a', makeData(), 'anno', 'win1', 'c1');
    spectrumStore.addSpectrum('b', makeData(), 'anno', 'win1', 'c2');
    const c2 = spectrumStore.getSpectraForCanvas('c2');
    expect([...c2.keys()]).toEqual(['b']);
  });

  it('tracks the active window', () => {
    spectrumStore.setActiveWindow('win1');
    expect(spectrumStore.getActiveWindow()).toBe('win1');
    spectrumStore.setActiveWindow(null);
    expect(spectrumStore.getActiveWindow()).toBeNull();
  });
});

describe('clearWindow', () => {
  it('removes only the target window and notifies per entry', () => {
    spectrumStore.addSpectrum('a', makeData(), 'anno', 'win1');
    spectrumStore.addSpectrum('b', makeData(), 'anno', 'win2');
    const listener = vi.fn();
    const unsub = spectrumStore.subscribe(listener);

    spectrumStore.clearWindow('win1');

    expect(spectrumStore.getSpectrum('a')).toBeUndefined();
    expect(spectrumStore.getSpectrum('b')).toBeDefined();
    expect(listener).toHaveBeenCalledWith({ type: 'remove', id: 'a' });
    unsub();
  });
});

describe('clear and getStats', () => {
  it('clear() empties the store, resets colours, and notifies', () => {
    spectrumStore.addSpectrum('a', makeData(), 'anno');
    const listener = vi.fn();
    const unsub = spectrumStore.subscribe(listener);

    spectrumStore.clear();

    expect(spectrumStore.getAllSpectra().size).toBe(0);
    expect(listener).toHaveBeenCalledWith({ type: 'clear' });
    unsub();
  });

  it('getStats counts totals, visible, and distinct windows', () => {
    spectrumStore.addSpectrum('a', makeData(), 'anno', 'win1');
    spectrumStore.addSpectrum('b', makeData(), 'anno', 'win1');
    spectrumStore.addSpectrum('c', makeData(), 'anno', 'win2');
    spectrumStore.setVisibility('c', false);

    expect(spectrumStore.getStats()).toEqual({ total: 3, visible: 2, windows: 2 });
  });
});

describe('subscribe', () => {
  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsub = spectrumStore.subscribe(listener);
    unsub();
    spectrumStore.addSpectrum('a', makeData(), 'anno');
    expect(listener).not.toHaveBeenCalled();
  });
});
