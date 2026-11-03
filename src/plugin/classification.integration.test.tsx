/**
 * Classification cards through the connected plugin, with real ManuSpectrum-shaped data.
 */
import { describe, it, expect, vi } from 'vitest';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectedScientificAnnotationPlugin } from './ConnectedScientificAnnotationPlugin';
import type { IIIFAnnotation } from '../types/iiif';
import page from '../test/fixtures/annotations/v3-characterization-materials-page.json';

vi.mock('mirador', () => ({
  SanitizedHtml: ({ htmlString }: { htmlString: string }) => <span>{htmlString}</span>,
  addWindow: vi.fn(),
}));
vi.mock('react-plotly.js', () => ({ default: () => <div /> }));

const [lapis] = page.items as unknown as IIIFAnnotation[];
const ANALYSIS = 'https://iiif.example.org/anno/analysis';
const analysis = {
  id: ANALYSIS,
  type: 'Annotation',
  motivation: 'supplementing',
  label: { en: ['PAR416-pXRF-0045 - pXRF'] },
  body: [{ type: 'TextualBody', value: 'Spectrum', purpose: 'describing' }],
  metadata: [{ label: { en: ['Technique'] }, value: { en: ['pXRF'] } }],
  target: 'c1',
} as unknown as IIIFAnnotation;

function setup(
  selectedAnnotationId: string | undefined,
  config: Record<string, unknown> = {},
  items: IIIFAnnotation[] = [analysis, lapis],
  hoveredAnnotationIds?: string[],
) {
  const state = {
    config: { language: 'en', ...config },
    windows: { w1: { id: 'w1', canvasId: 'c1', hoveredAnnotationIds } },
    annotations: { c1: { l: { json: { id: 'l', type: 'AnnotationPage', items } } } },
  };
  const store = createStore((s: typeof state = state) => s);
  const selectAnnotation = vi.fn();
  const hoverAnnotation = vi.fn();
  render(
    <Provider store={store as never}>
      <ConnectedScientificAnnotationPlugin
        targetProps={
          {
            annotations: items.map((a) => a.id).map((id) => ({ id, content: null, tags: [], targetId: 't' })),
            windowId: 'w1',
            canvasId: 'c1',
            selectedAnnotationId,
            selectAnnotation,
            deselectAnnotation: vi.fn(),
            hoverAnnotation,
          } as never
        }
        TargetComponent={(() => <div />) as never}
      />
    </Provider>,
  );
  return { selectAnnotation, hoverAnnotation };
}

const card = (name: string) => screen.getByRole('group', { name });

describe('classification cards in the plugin', () => {
  it('collapsed classification card next to an unchanged analysis card', () => {
    setup(undefined);
    expect(card('lapis lazuli, lead white')).toHaveTextContent('Classification');
    expect(screen.queryByText('Classified as')).toBeNull();
    expect(card('PAR416-pXRF-0045 - pXRF')).toHaveTextContent('Spectrum');
    expect(screen.queryByText('Classification', { exact: true })).toBeInTheDocument();
  });

  it('the annotation id lives in the menu of every card, not inline', () => {
    setup(undefined);
    expect(screen.queryByText(ANALYSIS)).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Annotation actions' })).toHaveLength(2);
  });

  it("showAnnotationId 'inline' keeps the URI on analyses", () => {
    setup(undefined, { scientificAnnotations: { showAnnotationId: 'inline' } });
    expect(screen.getByRole('link', { name: ANALYSIS })).toBeInTheDocument();
  });

  it('selecting expands the card with an accent border instead of a grey fill', () => {
    setup(lapis.id);
    expect(screen.getByRole('group', { name: 'Classified as' })).toBeInTheDocument();
    const li = card('lapis lazuli, lead white');
    expect(li).toHaveAttribute('aria-current', 'true');
    expect(getComputedStyle(li).borderLeftStyle).toBe('solid');
  });

  it('a selected card stays ungreyed while hovered or focused; an unselected one is greyed', () => {
    setup(lapis.id, {}, [analysis, lapis], [lapis.id, analysis.id]);
    expect(getComputedStyle(card('lapis lazuli, lead white')).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(card('PAR416-pXRF-0045 - pXRF')).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  it('Enter and Space select the focused card', () => {
    const { selectAnnotation } = setup(undefined);
    const li = card('lapis lazuli, lead white');
    expect(li).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(li, { key: 'Enter' });
    fireEvent.keyDown(li, { key: ' ' });
    expect(selectAnnotation).toHaveBeenCalledTimes(2);
    expect(selectAnnotation).toHaveBeenCalledWith('w1', lapis.id);
  });

  it('a key pressed inside the card does not select it', () => {
    const { selectAnnotation } = setup(undefined);
    fireEvent.keyDown(screen.getAllByRole('button', { name: 'Annotation actions' })[1], { key: 'Enter' });
    expect(selectAnnotation).not.toHaveBeenCalled();
  });

  it('labels from the config reach the card', () => {
    setup(lapis.id, { scientificAnnotations: { labels: { classifiedAs: 'Materials', linkedAnnotations: 'Evidence' } } });
    expect(screen.getByRole('group', { name: 'Materials' })).toBeInTheDocument();
  });

  it('renders a card for a label-only classifying annotation with a TextualBody', () => {
    const a = {
      id: 'https://x.example/a1',
      type: 'Annotation',
      motivation: 'classifying',
      label: { en: ['Gold leaf'] },
      body: [{ type: 'TextualBody', value: 'Applied over bole', purpose: 'describing' }],
      target: 'c1',
    } as unknown as IIIFAnnotation;
    setup(undefined, {}, [a]);
    expect(card('Gold leaf')).toHaveTextContent('Classification');
  });

  it('renders a card for a Composite-only classifying annotation without metadata', () => {
    const a = {
      id: 'https://x.example/a2',
      type: 'Annotation',
      motivation: 'classifying',
      body: [
        {
          type: 'Composite',
          items: [
            { type: 'SpecificResource', purpose: 'classifying', source: 'https://x.example/t/lead', label: { en: ['Lead white'] } },
            { type: 'SpecificResource', purpose: 'assessing', source: 'https://x.example/t/high', label: { en: ['Reliable'] } },
          ],
        },
      ],
      target: 'c1',
    } as unknown as IIIFAnnotation;
    setup(undefined, {}, [a]);
    expect(card('Lead white')).toHaveTextContent('Classification');
  });

  it('names an unlabeled card from its title, exposes expansion and hovers on focus', () => {
    const a = {
      id: 'https://x.example/a3',
      type: 'Annotation',
      motivation: 'identifying',
      body: [{ type: 'TextualBody', value: 'Vermilion', purpose: 'describing' }],
      target: 'c1',
    } as unknown as IIIFAnnotation;
    setup(undefined, {}, [a]);
    const li = card('Vermilion');
    expect(li).toHaveAttribute('aria-expanded', 'false');
    fireEvent.focus(li);
    fireEvent.blur(li);
  });

  it('reads the hovered ids from the window state: no redispatch when unchanged', () => {
    vi.useFakeTimers();
    try {
      const { hoverAnnotation } = setup(undefined, {}, [analysis, lapis], [lapis.id]);
      const li = card('lapis lazuli, lead white');
      fireEvent.focus(li);
      vi.advanceTimersByTime(200);
      expect(hoverAnnotation).not.toHaveBeenCalled();
      fireEvent.focus(card('PAR416-pXRF-0045 - pXRF'));
      vi.advanceTimersByTime(200);
      expect(hoverAnnotation).toHaveBeenCalledWith('w1', [analysis.id]);
    } finally {
      vi.useRealTimers();
    }
  });
});
