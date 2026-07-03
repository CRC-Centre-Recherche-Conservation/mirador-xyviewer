import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  resolveSelectedResource,
  ConnectedSelectionHighlightPlugin,
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

describe('SelectionHighlightPluginComponent', () => {
  it('pulses a search hit into the viewer canvas when it becomes selected', () => {
    // Minimal OSD viewer: a detached canvas hosts the pulse portal.
    const canvas = document.createElement('div');
    const viewer = {
      canvas,
      viewport: {
        getZoom: () => 1,
        getMaxZoom: () => 4,
        imageToViewportCoordinates: () => ({ x: 0.5, y: 0.5 }),
        viewportToViewerElementCoordinates: () => ({ x: 100, y: 100 }),
        fitBounds: vi.fn(),
        fitBoundsWithConstraints: vi.fn(),
        getContainerSize: () => ({ x: 800, y: 600 }),
      },
      addHandler: vi.fn(),
      removeHandler: vi.fn(),
    };

    render(
      <ConnectedSelectionHighlightPlugin
        targetProps={
          {
            windowId: 'w1',
            annotations: [],
            // Resolves only via the search-hit fallback (empty canvas annotations).
            searchAnnotations: [
              { id: 's1', resources: [{ id: 'hit', targetId: 't', fragmentSelector: [10, 20, 40, 40] }] },
            ],
            selectedAnnotationId: 'hit',
            viewer,
          } as never
        }
        TargetComponent={(() => <div data-testid="target" />) as never}
      />,
    );

    expect(screen.getByTestId('target')).toBeInTheDocument();
    // The pulse overlay is portaled into the viewer canvas, not the main tree.
    expect(canvas.querySelector('style')).toBeTruthy();
  });

  it('renders only the target when the selection matches no annotation', () => {
    render(
      <ConnectedSelectionHighlightPlugin
        targetProps={
          {
            windowId: 'w1',
            annotations: [],
            searchAnnotations: [],
            selectedAnnotationId: 'missing',
            viewer: null,
          } as never
        }
        TargetComponent={(() => <div data-testid="target" />) as never}
      />,
    );
    expect(screen.getByTestId('target')).toBeInTheDocument();
  });
});

describe('plugin export', () => {
  it('wraps AnnotationsOverlay', () => {
    expect(selectionHighlightPlugin.target).toBe('AnnotationsOverlay');
    expect(selectionHighlightPlugin.mode).toBe('wrap');
  });
});
