import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPortal } from 'react-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  computeVisibleAnnotations,
  shownOnlyBecauseSelected,
  ScientificAnnotationPluginComponent,
} from './ConnectedScientificAnnotationPlugin';
import { filtersStore } from '../state/filtersStore';
import { datasetAnnotation, textualAnnotation } from '../test/fixtures/miradorState';

vi.mock('../components/AnnotationBodyRenderer', () => ({
  AnnotationBodyRenderer: ({ ruleSet }: { ruleSet?: string }) => (
    <div data-testid="body-renderer" data-ruleset={ruleSet}>
      <button>Retry</button>
      {createPortal(<div data-testid="portal-area">dialog</div>, document.body)}
    </div>
  ),
}));
vi.mock('../components/MetadataDisplay', () => ({
  MetadataDisplay: () => <div data-testid="metadata" />,
}));

afterEach(() => filtersStore.clearWindow('w1'));

describe('computeVisibleAnnotations', () => {
  const hidden = new Set(['b']);
  it('drops hidden annotations', () => {
    const out = computeVisibleAnnotations([{ id: 'a' }, { id: 'b' }], hidden, undefined);
    expect(out.map((a) => a.id)).toEqual(['a']);
  });
  it('keeps a hidden annotation when it is the selected one', () => {
    const out = computeVisibleAnnotations([{ id: 'a' }, { id: 'b' }], hidden, 'b');
    expect(out.map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('shownOnlyBecauseSelected', () => {
  it('true only when hidden AND selected', () => {
    expect(shownOnlyBecauseSelected('b', new Set(['b']), 'b')).toBe(true);
    expect(shownOnlyBecauseSelected('b', new Set(['b']), 'a')).toBe(false);
    expect(shownOnlyBecauseSelected('a', new Set(['b']), 'a')).toBe(false);
  });
});

describe('hidden-but-selected annotation', () => {
  it('renders the selected hidden annotation with a "hidden by filter" badge', () => {
    const windowId = 'w1';
    const canvasId = 'c1';
    const annId = datasetAnnotation.id;
    // Build a filter group from one metadata value, then deselect it to hide the annotation.
    const forFilter = [{ id: annId, metadata: [{ label: { en: ['k'] }, value: { en: ['v'] } }] }];
    filtersStore.initializeFromAnnotations(windowId, canvasId, forFilter);
    for (const group of filtersStore.getGroups(windowId, canvasId)) {
      for (const valueKey of group.values.keys()) {
        filtersStore.toggleValue(windowId, canvasId, group.key, valueKey);
      }
    }
    filtersStore.updateHiddenAnnotations(windowId, canvasId, forFilter);
    expect(filtersStore.getHiddenAnnotationIds(windowId, canvasId).has(annId)).toBe(true);

    render(
      <ScientificAnnotationPluginComponent
        targetProps={
          {
            annotations: [{ id: annId, content: 'x', tags: [], targetId: 't' }],
            windowId,
            canvasId,
            selectedAnnotationId: annId,
            selectAnnotation: vi.fn(),
            deselectAnnotation: vi.fn(),
            hoverAnnotation: vi.fn(),
          } as never
        }
        TargetComponent={(() => <div data-testid="target" />) as never}
        dispatch={vi.fn()}
        addWindow={vi.fn()}
        annotationResources={{ [annId]: datasetAnnotation }}
      />,
    );

    expect(screen.getByRole('note')).toHaveTextContent(/hidden by the metadata filter/i);
    expect(screen.getByTestId('body-renderer')).toBeInTheDocument();
  });

  it('renders the badge on the default (non-scientific) branch when a plain annotation is hidden-but-selected', () => {
    const windowId = 'w1';
    const canvasId = 'c-plain';
    const annId = textualAnnotation.id; // plain text body, no metadata -> default rendering
    // Build a one-value filter group and toggle it off so the annotation is hidden.
    const forFilter = [{ id: annId, metadata: [{ label: { en: ['k'] }, value: { en: ['v'] } }] }];
    filtersStore.initializeFromAnnotations(windowId, canvasId, forFilter);
    for (const group of filtersStore.getGroups(windowId, canvasId)) {
      for (const valueKey of group.values.keys()) {
        filtersStore.toggleValue(windowId, canvasId, group.key, valueKey);
      }
    }
    filtersStore.updateHiddenAnnotations(windowId, canvasId, forFilter);
    expect(filtersStore.getHiddenAnnotationIds(windowId, canvasId).has(annId)).toBe(true);

    render(
      <ScientificAnnotationPluginComponent
        targetProps={
          {
            annotations: [{ id: annId, content: 'plain annotation', tags: [], targetId: 't' }],
            windowId,
            canvasId,
            selectedAnnotationId: annId,
            selectAnnotation: vi.fn(),
            deselectAnnotation: vi.fn(),
            hoverAnnotation: vi.fn(),
          } as never
        }
        TargetComponent={(() => <div data-testid="target" />) as never}
        dispatch={vi.fn()}
        addWindow={vi.fn()}
        annotationResources={{ [annId]: textualAnnotation }}
      />,
    );

    // Default branch: the raw content plus the badge, and NO scientific body renderer.
    expect(screen.getByRole('note')).toHaveTextContent(/hidden by the metadata filter/i);
    expect(screen.getByText('plain annotation')).toBeInTheDocument();
    expect(screen.queryByTestId('body-renderer')).not.toBeInTheDocument();
  });
});

describe('plain annotation HTML sanitization', () => {
  const PAYLOAD =
    '<img src=x onerror="window.__x=1"><b>ok</b><a href="javascript:alert(1)">l</a>';

  const renderPlugin = (
    annotations: Array<{ id: string; content: string | null; tags: string[]; targetId: string }>,
    resources: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ) =>
    render(
      <ScientificAnnotationPluginComponent
        targetProps={
          {
            annotations,
            windowId: 'w1',
            canvasId: 'c-san',
            selectAnnotation: vi.fn(),
            deselectAnnotation: vi.fn(),
            hoverAnnotation: vi.fn(),
            ...extra,
          } as never
        }
        TargetComponent={(() => <div data-testid="target" />) as never}
        dispatch={vi.fn()}
        addWindow={vi.fn()}
        annotationResources={resources as never}
      />,
    );

  const plain = (id: string, content: string | null = PAYLOAD) => ({
    id,
    content,
    tags: [],
    targetId: 't',
  });

  const expectSafe = (container: HTMLElement) => {
    expect(container.querySelector('img[onerror]')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  };

  it('sanitizes plain annotations next to a scientific one', () => {
    const { container } = renderPlugin(
      [plain(datasetAnnotation.id, 'x'), plain('plain-1')],
      { [datasetAnnotation.id]: datasetAnnotation },
    );
    expectSafe(container);
    expect(container.querySelector('b')!.textContent).toBe('ok');
  });

  it('sanitizes plain content when the only custom annotation is metadata-only', () => {
    const metaOnly = { id: 'meta-1', type: 'Annotation', metadata: [{ label: { en: ['k'] }, value: { en: ['v'] } }] };
    const { container } = renderPlugin([plain('meta-1', 'x'), plain('plain-1')], {
      'meta-1': metaOnly,
    });
    expectSafe(container);
    expect(container.querySelector('b')!.textContent).toBe('ok');
  });

  it('sanitizes plain content when annotations are hidden only by filters', () => {
    const forFilter = [{ id: 'hid', metadata: [{ label: { en: ['k'] }, value: { en: ['v'] } }] }];
    filtersStore.initializeFromAnnotations('w1', 'c-san', forFilter);
    for (const group of filtersStore.getGroups('w1', 'c-san')) {
      for (const valueKey of group.values.keys()) {
        filtersStore.toggleValue('w1', 'c-san', group.key, valueKey);
      }
    }
    filtersStore.updateHiddenAnnotations('w1', 'c-san', forFilter);
    const { container } = renderPlugin([plain('hid', 'x'), plain('plain-1')], {});
    expectSafe(container);
    expect(container.querySelector('b')!.textContent).toBe('ok');
  });

  it('renders tags as chips', () => {
    renderPlugin(
      [plain(datasetAnnotation.id, 'x'), { ...plain('plain-1', 'x'), tags: ['alpha'] }],
      { [datasetAnnotation.id]: datasetAnnotation },
    );
    expect(screen.getByText('alpha')).toBeInTheDocument();
  });

  it('keeps only text with the noHtml rule set', () => {
    const { container } = renderPlugin(
      [plain(datasetAnnotation.id, 'x'), plain('plain-1')],
      { [datasetAnnotation.id]: datasetAnnotation },
      { htmlSanitizationRuleSet: 'noHtml' },
    );
    expect(container.querySelector('img, b, a')).toBeNull();
  });

  it('does not crash on null content', () => {
    const { container } = renderPlugin(
      [plain(datasetAnnotation.id, 'x'), plain('plain-1', null)],
      { [datasetAnnotation.id]: datasetAnnotation },
    );
    expect(container.querySelector('li')).not.toBeNull();
  });
});

describe('scientific annotation interactions', () => {
  const renderOne = () => {
    const selectAnnotation = vi.fn();
    const annId = datasetAnnotation.id;
    render(
      <ScientificAnnotationPluginComponent
        targetProps={
          {
            annotations: [{ id: annId, content: 'x', tags: [], targetId: 't' }],
            windowId: 'w1',
            canvasId: 'c-int',
            selectAnnotation,
            deselectAnnotation: vi.fn(),
            hoverAnnotation: vi.fn(),
          } as never
        }
        TargetComponent={(() => <div data-testid="target" />) as never}
        dispatch={vi.fn()}
        addWindow={vi.fn()}
        annotationResources={{ [annId]: datasetAnnotation }}
      />,
    );
    return selectAnnotation;
  };

  it('selects on a click in the body but not on a nested button or portaled content', () => {
    const select = renderOne();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.click(screen.getByTestId('portal-area'));
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('body-renderer'));
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('does not let MenuList handle keys coming from the annotation body or its dialog', () => {
    renderOne();
    for (const el of [screen.getByRole('button', { name: 'Retry' }), screen.getByTestId('portal-area')]) {
      for (const key of ['ArrowDown', 'End']) {
        expect(fireEvent.keyDown(el, { key })).toBe(true); // not defaultPrevented
      }
    }
  });
});
