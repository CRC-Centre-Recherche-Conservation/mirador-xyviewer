/**
 * Filtering from the cards, with the real ManuSpectrum page: the term menu of a chip filters the
 * canvas (same facet as the panel), highlights the annotations carrying the term, and the analyses
 * kept through a link say why.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { ConnectedScientificAnnotationPlugin } from './ConnectedScientificAnnotationPlugin';
import { filtersStore } from '../state/filtersStore';
import { extractAnnotationsWithMetadata } from './MetadataFiltersPlugin';
import { linkNavigationStore } from '../state/linkNavigationStore';
import { normalizeAnnotationResources } from '../utils/annotationNormalizer';
import type { IIIFAnnotation } from '../types/iiif';
import characterizations from '../test/fixtures/annotations/manuspectrum-characterizations-page.json';
import analyses from '../test/fixtures/annotations/manuspectrum-analyses-page.json';

vi.mock('mirador', () => ({
  SanitizedHtml: ({ htmlString }: { htmlString: string }) => <span>{htmlString}</span>,
  addWindow: vi.fn(),
  setCanvas: vi.fn(),
  updateViewport: vi.fn(),
  getCurrentCanvasWorld: () => ({ canvasToWorldCoordinates: () => [0, 0, 3000, 4000] }),
}));
vi.mock('react-plotly.js', () => ({ default: () => <div /> }));

const CANVAS = 'https://arca.irht.cnrs.fr/iiif/81855/canvas/canvas-1372508';
const pages = { chars: { json: characterizations }, analyses: { json: analyses } };
const [lapis] = characterizations.items as unknown as IIIFAnnotation[];
const cited = (lapis.body as Array<{ purpose?: string; source?: { id: string } }>)
  .filter((b) => b.purpose === 'linking')
  .map((b) => b.source!.id);

function setup() {
  const state = { config: { language: 'en' }, windows: { w1: { id: 'w1', manifestId: 'm', canvasId: CANVAS } }, manifests: {}, annotations: { [CANVAS]: pages } };
  const store = createStore((s = state) => s);
  const resources = normalizeAnnotationResources(pages);
  filtersStore.clearFilters('w1', CANVAS);
  filtersStore.initializeFromAnnotations('w1', CANVAS, extractAnnotationsWithMetadata(resources), false, ['en']);
  const hoverAnnotation = vi.fn();
  const selectAnnotation = vi.fn();
  render(
    <Provider store={store as never}>
      <ConnectedScientificAnnotationPlugin
        targetProps={
          {
            annotations: Object.keys(resources).map((id) => ({ id, content: null, tags: [], targetId: 't' })),
            windowId: 'w1',
            canvasId: CANVAS,
            selectedAnnotationId: lapis.id,
            selectAnnotation,
            deselectAnnotation: vi.fn(),
            hoverAnnotation,
          } as never
        }
        TargetComponent={(() => <div />) as never}
      />
    </Provider>,
  );
  return { hoverAnnotation };
}

beforeEach(() => {
  vi.useFakeTimers();
  linkNavigationStore.clear('w1');
});
afterEach(() => {
  vi.useRealTimers();
  filtersStore.clearFilters('w1', CANVAS);
});

// The chosen action runs once the menu has closed.
const pick = (name: string) => {
  fireEvent.click(screen.getByRole('menuitem', { name }));
  act(() => void vi.advanceTimersByTime(1000));
};
const openMenu = (term: string) => fireEvent.click(within(screen.getByRole('group', { name: 'lapis lazuli, lead white' })).getByText(term));

describe('term menu', () => {
  it('filters by the term, shows the filter icon and why linked analyses stay', () => {
    setup();
    openMenu('lapis lazuli');
    pick('Filter by lapis lazuli');
    expect(filtersStore.getHiddenAnnotationIds('w1', CANVAS).size).toBe(10);
    // Hidden cards are gone from the list; the kept analyses explain themselves.
    const notes = screen.getAllByRole('note').map((n) => n.textContent);
    expect(notes).toHaveLength(5);
    expect(notes[0]).toBe('shown because linked to lapis lazuli, lead white');
    expect(within(screen.getByRole('group', { name: 'lapis lazuli, lead white' })).getAllByTestId('FilterAltIcon')).toHaveLength(1);
  });

  it('removes the filter from the same entry', () => {
    setup();
    openMenu('lapis lazuli');
    pick('Filter by lapis lazuli');
    act(() => void 0);
    openMenu('lapis lazuli');
    pick('Remove filter: lapis lazuli');
    expect(filtersStore.getHiddenAnnotationIds('w1', CANVAS).size).toBe(0);
  });

  it('highlights the annotations carrying the term', () => {
    const { hoverAnnotation } = setup();
    openMenu('lapis lazuli');
    pick('Highlight annotations with this term');
    act(() => void vi.advanceTimersByTime(60));
    expect(hoverAnnotation).toHaveBeenCalledWith('w1', [lapis.id]);
    expect(cited.length).toBe(5);
  });

  it('keeps the highlight when focus comes back to the chip as the menu closes', () => {
    const { hoverAnnotation } = setup();
    const chip = within(screen.getByRole('group', { name: 'lapis lazuli, lead white' })).getByText('lapis lazuli');
    act(() => chip.focus());
    openMenu('lapis lazuli');
    pick('Highlight annotations with this term');
    act(() => void vi.advanceTimersByTime(60));
    expect(hoverAnnotation).toHaveBeenLastCalledWith('w1', [lapis.id]);
  });
});
