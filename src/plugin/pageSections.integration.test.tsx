/**
 * Annotation panel sections per AnnotationPage, through the connected plugin
 * (2 characterizations + 14 analyses, each page with its own label).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { ConnectedScientificAnnotationPlugin, groupByPage } from './ConnectedScientificAnnotationPlugin';
import { normalizeAnnotationResources } from '../utils/annotationNormalizer';
import { filtersStore } from '../state/filtersStore';
import characterizations from '../test/fixtures/annotations/manuspectrum-characterizations-page.json';
import analyses from '../test/fixtures/annotations/manuspectrum-analyses-page.json';
import type { IIIFAnnotation } from '../types/iiif';

vi.mock('mirador', () => ({
  SanitizedHtml: ({ htmlString }: { htmlString: string }) => <span>{htmlString}</span>,
  addWindow: vi.fn(),
  setCanvas: vi.fn(),
  updateViewport: vi.fn(),
  getCurrentCanvasWorld: () => ({ canvasToWorldCoordinates: () => [0, 0, 3000, 4000] }),
}));
vi.mock('react-plotly.js', () => ({ default: () => <div /> }));

const CANVAS = 'https://example.org/canvas/1';
const CHARS_TITLE = 'Identified materials of Paris. Bibliothèque Mazarine, Ms 416, f. 009 - vue 2';
const ANALYSES_TITLE = 'Analyses of Paris. Bibliothèque Mazarine, Ms 416, f. 009 - vue 2';

type Pages = Record<string, { id?: string; json: unknown }>;
const twoPages: Pages = {
  chars: { id: 'chars', json: characterizations },
  analyses: { id: 'analyses', json: analyses },
};

function mount(pages: Pages, opts: { selected?: string; language?: string } = {}) {
  const state = {
    config: { language: opts.language ?? 'en' },
    windows: { w1: { id: 'w1', canvasId: CANVAS } },
    manifests: {},
    annotations: { [CANVAS]: pages },
  };
  const store = createStore(() => state);
  const ids = Object.keys(normalizeAnnotationResources(pages));
  const element = (selected?: string) => (
    <Provider store={store as never}>
      <ConnectedScientificAnnotationPlugin
        targetProps={
          {
            annotations: ids.map((id) => ({ id, content: null, tags: [], targetId: 't' })),
            windowId: 'w1',
            canvasId: CANVAS,
            selectedAnnotationId: selected,
            selectAnnotation: vi.fn(),
            deselectAnnotation: vi.fn(),
            hoverAnnotation: vi.fn(),
          } as never
        }
        TargetComponent={(() => <div />) as never}
      />
    </Provider>
  );
  const view = render(element(opts.selected));
  return { ...view, select: (id?: string) => view.rerender(element(id)), ids };
}

const header = (title: string) => screen.getByRole('button', { name: new RegExp(title.slice(0, 20)) });
/** Top-level cards of the panel (linked rows inside a card are groups too). */
const cards = () => Array.from(document.querySelectorAll('ul > li[role="group"]'));
const analysisIds = (analyses.items as unknown as IIIFAnnotation[]).map((a) => a.id);

beforeEach(() => {
  vi.mocked(window.HTMLElement.prototype.scrollIntoView).mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('annotation page sections', () => {
  it('groups cards under one header per page, in page order, with counts', () => {
    mount(twoPages);
    const headers = screen.getAllByRole('button', { expanded: true }).filter((b) => /· \d+/.test(b.textContent ?? ''));
    expect(headers.map((h) => h.textContent)).toEqual([
      expect.stringContaining(`${CHARS_TITLE}· 2`),
      expect.stringContaining(`${ANALYSES_TITLE}· 14`),
    ]);
    expect(cards()).toHaveLength(16);
  });

  it('uses the reader language for the page label', () => {
    mount(twoPages, { language: 'fr' });
    expect(header('Matériaux identifiés')).toBeInTheDocument();
    expect(header('Analyses de Paris')).toBeInTheDocument();
  });

  it('collapses and expands a section from the keyboard-reachable header', () => {
    mount(twoPages);
    fireEvent.click(header(ANALYSES_TITLE));
    expect(cards()).toHaveLength(2);
    expect(header(ANALYSES_TITLE)).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(header(ANALYSES_TITLE));
    expect(cards()).toHaveLength(16);
  });

  it('reopens a collapsed section when one of its annotations gets selected', () => {
    const { select } = mount(twoPages);
    fireEvent.click(header(ANALYSES_TITLE));
    expect(cards()).toHaveLength(2);
    select(analysisIds[0]);
    expect(cards()).toHaveLength(16);
    expect(header(ANALYSES_TITLE)).toHaveAttribute('aria-expanded', 'true');
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('counts only the annotations a filter leaves visible and drops emptied sections', () => {
    vi.spyOn(filtersStore, 'hasFiltersInitialized').mockReturnValue(true);
    vi.spyOn(filtersStore, 'getHiddenAnnotationIds').mockReturnValue(new Set(analysisIds.slice(0, 4)));
    mount(twoPages);
    expect(header(ANALYSES_TITLE)).toHaveTextContent('· 10');
    cleanup();
    vi.spyOn(filtersStore, 'getHiddenAnnotationIds').mockReturnValue(new Set(analysisIds));
    mount(twoPages);
    expect(screen.queryByRole('button', { name: /Analyses of Paris/ })).toBeNull();
    expect(cards()).toHaveLength(2);
  });

  it('stays flat for a single page', () => {
    mount({ analyses: twoPages.analyses });
    expect(screen.queryByRole('button', { name: /Analyses of Paris/ })).toBeNull();
    expect(cards()).toHaveLength(14);
  });

  it('stays flat when a page has no label', () => {
    const unlabeled = { ...analyses, label: undefined };
    mount({ chars: twoPages.chars, analyses: { id: 'analyses', json: unlabeled } });
    expect(screen.queryByRole('button', { expanded: true })).toBeNull();
    expect(cards()).toHaveLength(16);
  });
});

describe('groupByPage', () => {
  const pages = [
    { id: 'p1', label: { en: ['One'] }, annotationIds: ['a', 'b'] },
    { id: 'p2', label: { en: ['Two'] }, annotationIds: ['c'] },
  ];
  it('keeps the page order whatever the annotation order', () => {
    const out = groupByPage([{ id: 'c' }, { id: 'a' }, { id: 'b' }], pages, ['en']);
    expect(out?.map((s) => [s.title, s.annotations.map((a) => a.id)])).toEqual([['One', ['a', 'b']], ['Two', ['c']]]);
  });
  it('is flat for an annotation of no known page', () => {
    expect(groupByPage([{ id: 'zzz' }], pages, ['en'])).toBeUndefined();
  });
});
