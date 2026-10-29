/**
 * Linked annotations through the connected plugin, with the real ManuSpectrum page:
 * 2 characterizations citing 8 of the 14 analyses.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Provider, useSelector } from 'react-redux';
import { createStore } from 'redux';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { ConnectedScientificAnnotationPlugin } from './ConnectedScientificAnnotationPlugin';
import { linkNavigationStore } from '../state/linkNavigationStore';
import { cancelPendingNavigation } from './useLinkController';
import { normalizeAnnotationResources } from '../utils/annotationNormalizer';
import type { IIIFAnnotation } from '../types/iiif';
import characterizations from '../test/fixtures/annotations/manuspectrum-characterizations-page.json';
import analyses from '../test/fixtures/annotations/manuspectrum-analyses-page.json';

const osd = vi.hoisted(() => ({ maxZoom: undefined as number | undefined }));

vi.mock('mirador', () => ({
  OSDReferences: {
    get: () => (osd.maxZoom === undefined ? undefined : { current: { viewport: { getMaxZoom: () => osd.maxZoom } } }),
  },
  SanitizedHtml: ({ htmlString }: { htmlString: string }) => <span>{htmlString}</span>,
  addWindow: vi.fn(),
  setCanvas: (windowId: string, canvasId: string) => ({ type: 'test/SET_CANVAS', windowId, canvasId }),
  updateViewport: (windowId: string, payload: unknown) => ({ type: 'test/UPDATE_VIEWPORT', windowId, payload }),
  getCurrentCanvasWorld: () => ({ canvasToWorldCoordinates: () => [0, 0, 3000, 4000] }),
}));
vi.mock('react-plotly.js', () => ({ default: () => <div /> }));

const CANVAS = 'https://arca.irht.cnrs.fr/iiif/81855/canvas/canvas-1372508';
const OTHER = 'https://arca.irht.cnrs.fr/iiif/81855/canvas/canvas-2';
const MANIFEST = 'https://example.org/manifest';
const manifest = {
  id: MANIFEST,
  type: 'Manifest',
  items: [
    { id: CANVAS, type: 'Canvas', label: { en: ['f. 009'] }, width: 3000, height: 4000 },
    { id: OTHER, type: 'Canvas', label: { en: ['f. 010'] }, width: 3000, height: 4000 },
  ],
};

/** The analyses page as the producer would emit it for another canvas (their targets name it). */
const analysesTargeting = (canvasId: string) => ({
  ...analyses,
  items: (analyses.items as unknown as Array<{ target: { source: { id: string } } }>).map((a) => ({
    ...a,
    target: { ...a.target, source: { ...a.target.source, id: canvasId } },
  })),
});

const [lapis, redLead] = characterizations.items as unknown as IIIFAnnotation[];
const cited = (lapis.body as Array<{ purpose?: string; source?: { id: string } }>)
  .filter((b) => b.purpose === 'linking')
  .map((b) => b.source!.id);
const firstAnalysis = (analyses.items as unknown as IIIFAnnotation[]).find((a) => a.id === cited[0])!;
const analysisTitle = (firstAnalysis.label as { en: string[] }).en[0];
const uncited = (analyses.items as unknown as IIIFAnnotation[]).find(
  (a) => ![...cited, ...(redLead.body as Array<{ source?: { id: string } }>).map((b) => b.source?.id)].includes(a.id),
)!;

interface TestState {
  config: Record<string, unknown>;
  windows: { w1: { id: string; manifestId: string; canvasId: string; selectedAnnotationId?: string } };
  manifests: Record<string, unknown>;
  annotations: Record<string, Record<string, { json: unknown }>>;
}

function setup(opts: { analysesOn?: string; config?: Record<string, unknown>; ignoreSetCanvas?: boolean; lateLoad?: boolean } = {}) {
  const { analysesOn = CANVAS, config = {}, ignoreSetCanvas = false, lateLoad = false } = opts;
  let withheld: TestState['annotations'][string] | undefined;
  const actions: Array<{ type: string; [k: string]: unknown }> = [];
  const initial: TestState = {
    config: { language: 'en', ...config },
    windows: { w1: { id: 'w1', manifestId: MANIFEST, canvasId: CANVAS } },
    manifests: { [MANIFEST]: { id: MANIFEST, json: manifest } },
    annotations:
      analysesOn === CANVAS
        ? { [CANVAS]: { chars: { json: characterizations }, analyses: { json: analyses } } }
        : { [CANVAS]: { chars: { json: characterizations } }, [analysesOn]: { analyses: { json: analysesTargeting(analysesOn) } } },
  };
  const store = createStore((s: TestState = initial, a: { type: string; [k: string]: unknown }) => {
    actions.push(a);
    const w = s.windows.w1;
    if (a.type === 'test/SELECT') return { ...s, windows: { w1: { ...w, selectedAnnotationId: a.annotationId as string } } };
    if (a.type === 'test/DESELECT') return { ...s, windows: { w1: { ...w, selectedAnnotationId: undefined } } };
    if (a.type === 'test/LOAD' && withheld) {
      const annotations = { ...s.annotations, [analysesOn]: withheld };
      withheld = undefined;
      return { ...s, annotations };
    }
    if (a.type === 'test/SET_CANVAS' && !ignoreSetCanvas) {
      if (lateLoad) {
        // The new canvas shows up before its annotations are fetched.
        withheld = s.annotations[a.canvasId as string];
        const rest = { ...s.annotations };
        delete rest[a.canvasId as string];
        return { ...s, annotations: rest, windows: { w1: { ...w, canvasId: a.canvasId as string, selectedAnnotationId: undefined } } };
      }
      return { ...s, windows: { w1: { ...w, canvasId: a.canvasId as string, selectedAnnotationId: undefined } } };
    }
    return s;
  });
  const hoverAnnotation = vi.fn();

  const Harness = () => {
    const win = useSelector((s: TestState) => s.windows.w1);
    const pages = useSelector((s: TestState) => s.annotations[s.windows.w1.canvasId]);
    const ids = Object.keys(normalizeAnnotationResources(pages));
    return (
      <ConnectedScientificAnnotationPlugin
        key={win.canvasId}
        targetProps={
          {
            annotations: ids.map((id) => ({ id, content: null, tags: [], targetId: 't' })),
            windowId: 'w1',
            canvasId: win.canvasId,
            selectedAnnotationId: win.selectedAnnotationId,
            selectAnnotation: (windowId: string, annotationId: string) =>
              store.dispatch({ type: 'test/SELECT', windowId, annotationId }),
            deselectAnnotation: () => store.dispatch({ type: 'test/DESELECT' }),
            hoverAnnotation,
          } as never
        }
        TargetComponent={(() => <div />) as never}
      />
    );
  };
  render(
    <Provider store={store as never}>
      <Harness />
    </Provider>,
  );
  return { store, actions, hoverAnnotation };
}

const card = (name: string | RegExp) => screen.getByRole('group', { name });
const selected = (actions: Array<{ type: string; annotationId?: unknown }>) =>
  actions.filter((a) => a.type === 'test/SELECT').map((a) => a.annotationId);
const settle = (ms = 60) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  linkNavigationStore.clear('w1');
});
afterEach(() => {
  vi.useRealTimers();
});

describe('hover', () => {
  it('lights the characterization zone with all its linked zones, debounced', () => {
    const { hoverAnnotation } = setup();
    const c = card('lapis lazuli, lead white');
    fireEvent.mouseEnter(c);
    expect(hoverAnnotation).not.toHaveBeenCalled();
    settle();
    expect(hoverAnnotation).toHaveBeenCalledTimes(1);
    const ids = hoverAnnotation.mock.calls[0][1] as string[];
    expect(hoverAnnotation.mock.calls[0][0]).toBe('w1');
    expect(ids[0]).toBe(lapis.id);
    expect(ids.slice(1).sort()).toEqual([...cited].sort());
  });

  it('coalesces a quick leave and enter into one dispatch', () => {
    const { hoverAnnotation } = setup();
    fireEvent.mouseEnter(card('lapis lazuli, lead white'));
    fireEvent.mouseLeave(card('lapis lazuli, lead white'));
    fireEvent.mouseEnter(card('red lead'));
    settle();
    expect(hoverAnnotation).toHaveBeenCalledTimes(1);
    expect((hoverAnnotation.mock.calls[0][1] as string[])[0]).toBe(redLead.id);
  });

  it('a plain annotation lights only its own zone', () => {
    const { hoverAnnotation } = setup();
    fireEvent.mouseEnter(card(analysisTitle));
    settle();
    expect(hoverAnnotation).toHaveBeenCalledWith('w1', [firstAnalysis.id]);
  });

  it('hover and focus on a linked row light only that target, leaving restores the card', () => {
    const { hoverAnnotation } = setup({});
    fireEvent.click(card('lapis lazuli, lead white'));
    const row = screen.getAllByRole('button', { name: /Select linked annotation/ })[0];
    fireEvent.focus(row);
    settle();
    expect(hoverAnnotation).toHaveBeenLastCalledWith('w1', [firstAnalysis.id]);
    fireEvent.blur(row, { relatedTarget: card('lapis lazuli, lead white') });
    settle();
    expect((hoverAnnotation.mock.calls.at(-1)![1] as string[])).toHaveLength(6);
  });
});

describe('linked rows', () => {
  it('names each row, with the host-named metadata and the location', () => {
    setup({ config: { scientificAnnotations: { linkSubtitleMetadataLabel: 'Technique' } } });
    fireEvent.click(card('lapis lazuli, lead white'));
    const group = screen.getByRole('group', { name: 'Linked annotations' });
    expect(group).toHaveTextContent('Linked annotations · 5');
    const rows = within(group).getAllByRole('button', { name: /Select linked annotation/ });
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveAttribute('aria-label', expect.stringContaining(analysisTitle));
    expect(rows[0]).toHaveTextContent('Raman microspectrometry · on this page');
  });

  it('click: selects the target, shows the way back and "Cited by", and back returns with focus', () => {
    const { actions } = setup();
    fireEvent.click(card('lapis lazuli, lead white'));
    fireEvent.click(screen.getAllByRole('button', { name: /Select linked annotation/ })[0]);
    expect(selected(actions).at(-1)).toBe(firstAnalysis.id);
    expect(linkNavigationStore.get('w1').stack.map((o) => o.annotationId)).toEqual([lapis.id]);

    const target = card(analysisTitle);
    const back = within(target).getByRole('button', { name: 'Back to lapis lazuli, lead white' });
    expect(within(target).getByRole('group', { name: 'Cited by' })).toHaveTextContent('lapis lazuli, lead white');

    fireEvent.click(back);
    expect(selected(actions).at(-1)).toBe(lapis.id);
    expect(linkNavigationStore.get('w1').stack).toEqual([]);
    expect(document.activeElement).toBe(card('lapis lazuli, lead white'));
  });

  it('"Cited by" selects the citing annotation and pushes the way back', () => {
    const { actions } = setup();
    fireEvent.click(card(analysisTitle));
    fireEvent.click(within(card(analysisTitle)).getByRole('button', { name: 'lapis lazuli, lead white' }));
    expect(selected(actions).at(-1)).toBe(lapis.id);
    expect(linkNavigationStore.get('w1').stack.map((o) => o.annotationId)).toEqual([firstAnalysis.id]);
  });

  it('selecting something else drops the way back', () => {
    setup();
    fireEvent.click(card('lapis lazuli, lead white'));
    fireEvent.click(screen.getAllByRole('button', { name: /Select linked annotation/ })[0]);
    expect(within(card(analysisTitle)).queryByRole('button', { name: /^Back to/ })).not.toBeNull();
    fireEvent.click(card(/^PAR416/.test(uncited.id) ? uncited.id : (uncited.label as { en: string[] }).en[0]));
    expect(linkNavigationStore.get('w1').stack).toEqual([]);
    expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull();
  });

  it('"Show all" frames the zone and its linked zones without changing the selection', () => {
    const { actions } = setup();
    fireEvent.click(card('lapis lazuli, lead white'));
    const before = selected(actions).length;
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    const view = actions.find((a) => a.type === 'test/UPDATE_VIEWPORT') as unknown as { payload: { x: number; y: number; zoom: number } };
    // Mirador units: world pixels and 1 / visible width, never canvas fractions.
    expect(view.payload.zoom).toBeGreaterThan(0);
    expect(view.payload.zoom).toBeLessThan(0.01);
    expect(view.payload.x).toBeGreaterThan(1);
    expect(view.payload.y).toBeGreaterThan(1);
    expect(selected(actions)).toHaveLength(before);
  });
});

describe('framing limits and zoom to zone', () => {
  afterEach(() => {
    osd.maxZoom = undefined;
  });
  const lastView = (actions: Array<{ type: string }>) =>
    actions.filter((a) => a.type === 'test/UPDATE_VIEWPORT').at(-1) as unknown as { payload: { x: number; y: number; zoom: number } };

  it('"Show all" never zooms past the viewer maximum', () => {
    osd.maxZoom = 0.0001;
    const { actions } = setup();
    fireEvent.click(card('lapis lazuli, lead white'));
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(lastView(actions).payload.zoom).toBeLessThanOrEqual(0.0001);
  });

  it('the card menu zooms to the zone of any card, within the viewer maximum', () => {
    osd.maxZoom = 0.0002;
    const { actions } = setup();
    const menu = within(card(analysisTitle)).getByRole('button', { name: 'Annotation actions' });
    fireEvent.click(menu);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Zoom to zone' }));
    const view = lastView(actions);
    expect(view.payload.zoom).toBeLessThanOrEqual(0.0002);
    expect(view.payload.x).toBeGreaterThan(1);
  });
});

describe('links to another canvas', () => {
  it('shows the canvas, switches to it and then selects', () => {
    const { actions } = setup({ analysesOn: OTHER });
    fireEvent.click(card('lapis lazuli, lead white'));
    const row = screen.getAllByRole('button', { name: /Select linked annotation/ })[0];
    expect(row).toHaveTextContent('on f. 010 · Go to page');
    fireEvent.click(row);
    const types = actions.map((a) => a.type);
    expect(types.lastIndexOf('test/SET_CANVAS')).toBeLessThan(types.lastIndexOf('test/SELECT'));
    expect(actions.find((a) => a.type === 'test/SET_CANVAS')).toMatchObject({ canvasId: OTHER });
    expect(selected(actions).at(-1)).toBe(firstAnalysis.id);
    // The reader lands on the analysis with the way back to the characterization on the first canvas.
    const target = card(analysisTitle);
    expect(within(target).getByRole('button', { name: 'Back to lapis lazuli, lead white' })).toBeInTheDocument();
  });

  it('back returns to the origin canvas and reselects the origin', () => {
    const { actions, store } = setup({ analysesOn: OTHER });
    fireEvent.click(card('lapis lazuli, lead white'));
    fireEvent.click(screen.getAllByRole('button', { name: /Select linked annotation/ })[0]);
    fireEvent.click(within(card(analysisTitle)).getByRole('button', { name: /^Back to/ }));
    expect((store.getState() as TestState).windows.w1.canvasId).toBe(CANVAS);
    expect(selected(actions).at(-1)).toBe(lapis.id);
  });

  it('gives up after 5 s with a message, and forgets the way back', () => {
    const { actions } = setup({ analysesOn: OTHER, ignoreSetCanvas: true });
    fireEvent.click(card('lapis lazuli, lead white'));
    fireEvent.click(screen.getAllByRole('button', { name: /Select linked annotation/ })[0]);
    expect(actions.some((a) => a.type === 'test/SET_CANVAS')).toBe(true);
    expect(selected(actions)).not.toContain(firstAnalysis.id);
    settle(5100);
    expect(screen.getByText('The linked annotation could not be opened')).toBeInTheDocument();
    expect(linkNavigationStore.get('w1').stack).toEqual([]);
  });

  describe('when the panel remounts on the canvas change (Mirador keys it by canvas)', () => {
    const followToOther = () => {
      const t = setup({ analysesOn: OTHER, lateLoad: true });
      fireEvent.click(card('lapis lazuli, lead white'));
      fireEvent.click(screen.getAllByRole('button', { name: /Select linked annotation/ })[0]);
      return t;
    };

    it('still tells the reader when the target never loads', () => {
      const { store } = followToOther();
      expect((store.getState() as TestState).windows.w1.canvasId).toBe(OTHER);
      settle(5100);
      expect(screen.getByText('The linked annotation could not be opened')).toBeInTheDocument();
      expect(linkNavigationStore.get('w1').stack).toEqual([]);
    });

    it('selects the target when it loads late', () => {
      const { actions, store } = followToOther();
      act(() => void store.dispatch({ type: 'test/LOAD' }));
      expect(selected(actions).at(-1)).toBe(firstAnalysis.id);
      settle(5100);
      expect(screen.queryByText('The linked annotation could not be opened')).toBeNull();
    });

    it('a cancelled wait neither selects nor reports a failure', () => {
      const { actions, store } = followToOther();
      cancelPendingNavigation('w1');
      settle(5100);
      act(() => void store.dispatch({ type: 'test/LOAD' }));
      expect(selected(actions)).not.toContain(firstAnalysis.id);
      expect(screen.queryByText('The linked annotation could not be opened')).toBeNull();
    });

    it('back across canvases focuses the origin card in the new panel', () => {
      const { store } = setup({ analysesOn: OTHER });
      fireEvent.click(card('lapis lazuli, lead white'));
      fireEvent.click(screen.getAllByRole('button', { name: /Select linked annotation/ })[0]);
      fireEvent.click(within(card(analysisTitle)).getByRole('button', { name: /^Back to/ }));
      expect((store.getState() as TestState).windows.w1.canvasId).toBe(CANVAS);
      expect(card('lapis lazuli, lead white').contains(document.activeElement)).toBe(true);
    });
  });
});
