import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHOW_ALL_BADGES_MS, canvasEmphasisStore as store } from './canvasEmphasisStore';

describe('canvasEmphasisStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    store.clear('w1');
    store.clear('w2');
    vi.useRealTimers();
  });

  it('sets and clears hover emphasis and keeps the snapshot stable', () => {
    store.hover('w1', 'a', 'all');
    const s = store.get('w1');
    expect(s).toMatchObject({ ownerId: 'a', rows: 'all', source: 'hover' });
    store.hover('w1', 'a', 'all');
    expect(store.get('w1')).toBe(s);
    store.release('w1');
    expect(store.get('w1')).toBeUndefined();
  });

  it('release falls back to the card badges after leaving a row', () => {
    store.hover('w1', 'a', [2]);
    store.release('w1', { ownerId: 'a', rows: 'all' });
    expect(store.get('w1')).toMatchObject({ rows: 'all', source: 'hover' });
  });

  it('release leaves timed and follow emphasis alone', () => {
    store.showTimed('w1', 'a');
    store.release('w1');
    expect(store.get('w1')?.source).toBe('timed');
    store.follow('w1', 'a', 3);
    store.release('w1');
    expect(store.get('w1')).toMatchObject({ source: 'follow', rows: [3] });
    store.endFollow('w1');
    expect(store.get('w1')).toBeUndefined();
  });

  it('expires a timed emphasis', () => {
    store.showTimed('w1', 'a');
    expect(store.get('w1')?.expiresAt).toBe(Date.now() + SHOW_ALL_BADGES_MS);
    vi.advanceTimersByTime(SHOW_ALL_BADGES_MS - 1);
    expect(store.get('w1')).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(store.get('w1')).toBeUndefined();
  });

  it('a later change cancels the pending expiry', () => {
    const l = vi.fn();
    store.showTimed('w1', 'a');
    store.hover('w1', 'b', [1]);
    const off = store.subscribe(l);
    vi.advanceTimersByTime(SHOW_ALL_BADGES_MS * 2);
    expect(store.get('w1')).toMatchObject({ ownerId: 'b' });
    expect(l).not.toHaveBeenCalled();
    off();
  });

  it('notifies subscribers until they unsubscribe', () => {
    const l = vi.fn();
    const off = store.subscribe(l);
    store.hover('w1', 'a', 'all');
    expect(l).toHaveBeenCalledWith('w1');
    off();
    store.clear('w1');
    expect(l).toHaveBeenCalledTimes(1);
  });

  it('isolates windows and cancels the timer when a window is cleared', () => {
    store.showTimed('w1', 'a');
    store.hover('w2', 'b', 'all');
    store.clear('w1');
    expect(store.get('w1')).toBeUndefined();
    expect(store.get('w2')).toBeDefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
