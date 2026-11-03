import { describe, it, expect, vi, beforeEach } from 'vitest';
import { linkNavigationStore as store, MAX_STACK } from './linkNavigationStore';

const A = { annotationId: 'a', canvasId: 'c1' };
const B = { annotationId: 'b', canvasId: 'c1' };
const C = { annotationId: 'c', canvasId: 'c2' };

beforeEach(() => {
  store.clear('w1');
  store.clear('w2');
});

describe('linkNavigationStore', () => {
  it('stacks origins per window and pops them in reverse', () => {
    store.push('w1', A, B);
    store.push('w1', B, C);
    store.push('w2', C, A);
    expect(store.get('w1').stack).toEqual([A, B]);
    expect(store.pop('w1')).toEqual(B);
    expect(store.get('w1').current).toEqual(B);
    expect(store.pop('w1')).toEqual(A);
    expect(store.get('w1').stack).toEqual([]);
    expect(store.pop('w1')).toBeUndefined();
    expect(store.get('w2').stack).toEqual([C]);
  });

  it('keeps the stack while the move is in flight and once the target is selected', () => {
    store.push('w1', A, C);
    store.reconcile('w1', 'a', ['c2']);
    expect(store.get('w1').stack).toHaveLength(1);
    store.reconcile('w1', 'c#target-0', ['c2']);
    expect(store.get('w1').reached).toBe(true);
    store.reconcile('w1', 'c', ['c2']);
    expect(store.get('w1').stack).toHaveLength(1);
  });

  it('clears on an unrelated selection, a deselection or a manual canvas change', () => {
    for (const [sel, canvas] of [['z', 'c2'], [undefined, 'c2'], ['c', 'c3']] as const) {
      store.push('w1', A, C);
      store.reconcile('w1', 'c', ['c2']);
      store.reconcile('w1', sel, [canvas]);
      expect(store.get('w1').stack).toEqual([]);
    }
  });

  it('keeps the way back while the target stays on any visible canvas (book view)', () => {
    store.push('w1', A, C);
    store.reconcile('w1', 'c', ['c1', 'c2']);
    store.reconcile('w1', 'c', ['c1', 'c2']);
    expect(store.get('w1').stack).toHaveLength(1);
    store.reconcile('w1', 'c', ['c3', 'c4']);
    expect(store.get('w1').stack).toEqual([]);
  });

  it('caps the stack, dropping the oldest origins', () => {
    for (let i = 0; i < MAX_STACK + 20; i++) store.push('w1', { annotationId: `o${i}` }, B);
    const { stack } = store.get('w1');
    expect(stack).toHaveLength(MAX_STACK);
    expect(stack[0].annotationId).toBe('o20');
    expect(stack[MAX_STACK - 1].annotationId).toBe(`o${MAX_STACK + 19}`);
  });

  it('flags a failed move, drops the stack and lets the panel dismiss it', () => {
    store.push('w1', A, C);
    store.fail('w1');
    expect(store.get('w1')).toMatchObject({ stack: [], failed: true });
    store.dismissFailure('w1');
    expect(store.get('w1').failed).toBeUndefined();
  });

  it('carries the card to focus after back, across panel instances', () => {
    store.push('w1', A, B);
    store.push('w1', B, C);
    store.pop('w1');
    store.setFocus('w1', 'b');
    expect(store.get('w1').focus).toBe('b');
    expect(store.get('w1').stack).toHaveLength(1);
    store.setFocus('w1', undefined);
    expect(store.get('w1').focus).toBeUndefined();
    // last pop empties the stack: focus still stored
    store.pop('w1');
    store.setFocus('w1', 'a');
    expect(store.get('w1').focus).toBe('a');
  });

  it('notifies subscribers with the window id and returns stable snapshots', () => {
    const l = vi.fn();
    const off = store.subscribe(l);
    store.push('w1', A, B);
    const snap = store.get('w1');
    expect(store.get('w1')).toBe(snap);
    store.clear('w1');
    off();
    store.push('w1', A, B);
    expect(l).toHaveBeenCalledTimes(2);
    expect(l).toHaveBeenCalledWith('w1');
  });
});
