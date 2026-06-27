import { describe, it, expect } from 'vitest';
import {
  resolveSelectedResource,
  selectionHighlightPlugin,
} from './SelectionHighlightPlugin';

const list = (id: string, resourceId: string) => ({
  id,
  resources: [{ id: resourceId, targetId: 't' }],
});

describe('resolveSelectedResource', () => {
  it('finds the resource in the canvas annotations first', () => {
    const res = resolveSelectedResource([list('l1', 'a')], [list('s1', 'a')], 'a');
    expect(res?.id).toBe('a');
  });
  it('falls back to searchAnnotations when not in the canvas annotations', () => {
    const res = resolveSelectedResource([list('l1', 'x')], [list('s1', 'hit')], 'hit');
    expect(res?.id).toBe('hit');
  });
  it('returns null when the id is in neither list', () => {
    expect(resolveSelectedResource([list('l1', 'x')], [list('s1', 'y')], 'z')).toBeNull();
  });
});

describe('plugin export', () => {
  it('wraps AnnotationsOverlay', () => {
    expect(selectionHighlightPlugin.target).toBe('AnnotationsOverlay');
    expect(selectionHighlightPlugin.mode).toBe('wrap');
  });
});
