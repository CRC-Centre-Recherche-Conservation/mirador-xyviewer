import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('mirador', () => ({
  getSelectedAnnotationId: vi.fn(),
  getSearchAnnotationsForWindow: vi.fn(),
  getCompanionWindowsForPosition: vi.fn(),
  updateCompanionWindow: vi.fn((windowId, companionWindowId, payload) => ({
    type: 'UPDATE_COMPANION_WINDOW',
    windowId,
    companionWindowId,
    payload,
  })),
}));

import {
  getSelectedAnnotationId,
  getSearchAnnotationsForWindow,
  getCompanionWindowsForPosition,
  updateCompanionWindow,
} from 'mirador';
import {
  shouldFocusAnnotations,
  SearchResultFocusPluginComponent,
  mapStateToProps,
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

describe('mapStateToProps', () => {
  beforeEach(() => vi.clearAllMocks());

  it('collects every search-hit annotation id and the left companion window', () => {
    vi.mocked(getSelectedAnnotationId).mockReturnValue('a');
    vi.mocked(getSearchAnnotationsForWindow).mockReturnValue([
      { resources: [{ id: 'a' }, { id: 'b' }] },
      { resources: [{ id: 'c' }] },
    ]);
    vi.mocked(getCompanionWindowsForPosition).mockReturnValue([
      { id: 'cw-left', content: 'search' },
    ]);

    const props = mapStateToProps({} as never, { targetProps: { windowId: 'w1' } });

    expect(props.selectedAnnotationId).toBe('a');
    expect([...props.searchAnnotationIds].sort()).toEqual(['a', 'b', 'c']);
    expect(props.leftCompanionWindowId).toBe('cw-left');
    expect(props.leftCompanionContent).toBe('search');
    expect(getCompanionWindowsForPosition).toHaveBeenCalledWith({}, { windowId: 'w1', position: 'left' });
  });

  it('tolerates missing search lists and no left companion window', () => {
    vi.mocked(getSelectedAnnotationId).mockReturnValue(undefined);
    vi.mocked(getSearchAnnotationsForWindow).mockReturnValue(undefined as never);
    vi.mocked(getCompanionWindowsForPosition).mockReturnValue(undefined as never);

    const props = mapStateToProps({} as never, { targetProps: { windowId: 'w1' } });

    expect(props.selectedAnnotationId).toBeUndefined();
    expect(props.searchAnnotationIds.size).toBe(0);
    expect(props.leftCompanionWindowId).toBeUndefined();
    expect(props.leftCompanionContent).toBeUndefined();
  });

  it('skips resources without a string id and search lists with no resources', () => {
    vi.mocked(getSelectedAnnotationId).mockReturnValue(null);
    vi.mocked(getSearchAnnotationsForWindow).mockReturnValue([
      { resources: [{ id: 'a' }, {}, { id: 123 as never }] },
      {},
    ]);
    vi.mocked(getCompanionWindowsForPosition).mockReturnValue([]);

    const props = mapStateToProps({} as never, { targetProps: { windowId: 'w1' } });

    expect([...props.searchAnnotationIds]).toEqual(['a']);
    expect(props.leftCompanionWindowId).toBeUndefined();
  });
});

describe('mapDispatchToProps', () => {
  it('dispatches Mirador updateCompanionWindow', () => {
    const dispatch = vi.fn();
    const props = (
      searchResultFocusPlugin.mapDispatchToProps as unknown as (
        d: typeof dispatch,
      ) => { updateCompanionWindow: (w: string, c: string, p: { content: string }) => void }
    )(dispatch);

    props.updateCompanionWindow('w1', 'cw1', { content: 'annotations' });

    expect(updateCompanionWindow).toHaveBeenCalledWith('w1', 'cw1', { content: 'annotations' });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'UPDATE_COMPANION_WINDOW' }),
    );
  });
});

describe('plugin export', () => {
  it('wraps AnnotationsOverlay', () => {
    expect(searchResultFocusPlugin.target).toBe('AnnotationsOverlay');
    expect(searchResultFocusPlugin.mode).toBe('wrap');
  });
});
