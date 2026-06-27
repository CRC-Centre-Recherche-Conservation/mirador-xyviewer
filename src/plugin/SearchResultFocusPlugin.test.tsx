import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import {
  shouldFocusAnnotations,
  SearchResultFocusPluginComponent,
  searchResultFocusPlugin,
} from './SearchResultFocusPlugin';

describe('shouldFocusAnnotations', () => {
  const ids = new Set(['a']);
  it('true when a search-result annotation is selected and panel is not annotations', () => {
    expect(shouldFocusAnnotations('a', ids, 'search')).toBe(true);
  });
  it('false when the selected id is not a search result', () => {
    expect(shouldFocusAnnotations('b', ids, 'search')).toBe(false);
  });
  it('false when the annotations panel is already showing', () => {
    expect(shouldFocusAnnotations('a', ids, 'annotations')).toBe(false);
  });
  it('false when nothing is selected', () => {
    expect(shouldFocusAnnotations(null, ids, 'search')).toBe(false);
  });
});

describe('SearchResultFocusPluginComponent', () => {
  const renderWith = (props: Record<string, unknown>) => {
    const updateCompanionWindow = vi.fn();
    render(
      <SearchResultFocusPluginComponent
        targetProps={{ windowId: 'w1' } as never}
        TargetComponent={(() => <div data-testid="t" />) as never}
        selectedAnnotationId={props.selectedAnnotationId as never}
        searchAnnotationIds={props.searchAnnotationIds as never}
        leftCompanionWindowId={props.leftCompanionWindowId as never}
        leftCompanionContent={props.leftCompanionContent as never}
        updateCompanionWindow={updateCompanionWindow as never}
      />,
    );
    return updateCompanionWindow;
  };

  it('switches the left sidebar to annotations on a search-hit selection', () => {
    const spy = renderWith({
      selectedAnnotationId: 'a',
      searchAnnotationIds: new Set(['a']),
      leftCompanionWindowId: 'cw1',
      leftCompanionContent: 'search',
    });
    expect(spy).toHaveBeenCalledWith('w1', 'cw1', { content: 'annotations' });
  });

  it('does nothing when the selection is not a search result', () => {
    const spy = renderWith({
      selectedAnnotationId: 'b',
      searchAnnotationIds: new Set(['a']),
      leftCompanionWindowId: 'cw1',
      leftCompanionContent: 'search',
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('plugin export', () => {
  it('wraps AnnotationsOverlay', () => {
    expect(searchResultFocusPlugin.target).toBe('AnnotationsOverlay');
    expect(searchResultFocusPlugin.mode).toBe('wrap');
  });
});
