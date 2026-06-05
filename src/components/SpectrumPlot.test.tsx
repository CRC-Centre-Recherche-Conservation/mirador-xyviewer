/// <reference types="@testing-library/jest-dom" />
/**
 * Tests for SpectrumPlot — focused on the expand-to-modal behavior wired
 * through Plotly's mode bar.
 *
 * react-plotly.js is mocked because Plotly relies on canvas/WebGL which
 * jsdom doesn't implement. ResizeObserver is stubbed for the same reason.
 *
 * The mock records every set of props passed to <Plot> so tests can
 * inspect the custom modebar button and invoke its click handler.
 */

import React, { act } from 'react';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SpectrumData } from '../types/dataset';

type ModeBarButtonShape = {
  name?: string;
  title?: string;
  icon?: unknown;
  click?: (...args: unknown[]) => void;
};

type PlotMockProps = {
  config?: {
    modeBarButtonsToAdd?: ModeBarButtonShape[];
    [k: string]: unknown;
  };
  data?: unknown[];
  style?: React.CSSProperties;
  [k: string]: unknown;
};

// vi.hoisted lets us share state with the hoisted vi.mock factory.
const { plotCalls } = vi.hoisted(() => ({ plotCalls: [] as PlotMockProps[] }));

vi.mock('react-plotly.js', () => ({
  default: vi.fn((props: PlotMockProps) => {
    plotCalls.push(props);
    return (
      <div
        data-testid="mock-plot"
        data-trace-count={Array.isArray(props.data) ? props.data.length : 0}
        style={props.style || {}}
      />
    );
  }),
}));

import { SpectrumPlot } from './SpectrumPlot';

// ResizeObserver polyfill — records instances so tests can assert lifecycle.
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(public cb: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
}

const makeData = (overrides: Partial<SpectrumData> = {}): SpectrumData => ({
  id: 'http://example.com/spectrum.csv',
  label: 'Test Spectrum',
  xValues: [1, 2, 3, 4],
  xLabel: 'Wavelength',
  series: [{ label: 'Intensity', yValues: [10, 20, 15, 25] }],
  mimeType: 'text/csv',
  points: [
    { x: 1, y: 10 },
    { x: 2, y: 20 },
    { x: 3, y: 15 },
    { x: 4, y: 25 },
  ],
  ...overrides,
});

/**
 * Return the most recent props passed to the inline Plot.
 *
 * Walks plotCalls backwards: when enableExpand=true, the inline Plot is the
 * one carrying `modeBarButtonsToAdd` (the modal uses baseConfig without it).
 * When enableExpand=false only the inline Plot is ever rendered, so the last
 * entry is the inline one.
 *
 * Returning the latest entry (not plotCalls[0]) makes the test sensitive to
 * stale-closure regressions on re-renders.
 */
const getInlinePlotProps = (): PlotMockProps => {
  for (let i = plotCalls.length - 1; i >= 0; i--) {
    const call = plotCalls[i];
    if (call.config?.modeBarButtonsToAdd) return call;
  }
  const last = plotCalls[plotCalls.length - 1];
  if (!last) throw new Error('No Plot was rendered');
  return last;
};

const getExpandButton = (props: PlotMockProps): ModeBarButtonShape | undefined => {
  return props.config?.modeBarButtonsToAdd?.find((b) => b.name === 'expandPlot');
};

describe('SpectrumPlot — expand to modal', () => {
  beforeEach(() => {
    plotCalls.length = 0;
    MockResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders the inline plot', () => {
    render(<SpectrumPlot data={makeData()} />);
    expect(screen.getByTestId('mock-plot')).toBeInTheDocument();
  });

  it('does NOT add the expand button by default (opt-in)', () => {
    render(<SpectrumPlot data={makeData()} />);
    expect(getInlinePlotProps().config?.modeBarButtonsToAdd).toBeUndefined();
  });

  it('adds a custom "expandPlot" modebar button when enableExpand is true', () => {
    render(<SpectrumPlot data={makeData()} enableExpand />);
    const btn = getExpandButton(getInlinePlotProps());
    expect(btn).toBeDefined();
    expect(btn?.title).toBe('Open in larger view');
    expect(btn?.icon).toBeDefined();
    expect(typeof btn?.click).toBe('function');
  });

  it('omits the modebar button when enableExpand is false', () => {
    render(<SpectrumPlot data={makeData()} enableExpand={false} />);
    const props = getInlinePlotProps();
    expect(props.config?.modeBarButtonsToAdd).toBeUndefined();
  });

  it('does not mount the dialog before the modebar button is clicked', () => {
    render(<SpectrumPlot data={makeData()} enableExpand />);
    expect(screen.getAllByTestId('mock-plot')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the dialog when the modebar click handler fires', () => {
    render(<SpectrumPlot data={makeData()} enableExpand />);
    const btn = getExpandButton(getInlinePlotProps());
    expect(btn).toBeDefined();

    act(() => {
      btn!.click!();
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Test Spectrum')).toBeInTheDocument();
    expect(screen.getAllByTestId('mock-plot')).toHaveLength(2);
  });

  it('falls back to the single series label when data.label is empty', () => {
    render(
      <SpectrumPlot
        data={makeData({ label: '', series: [{ label: 'Intensity (A.U.)', yValues: [1, 2] }] })}
        enableExpand
      />,
    );
    act(() => {
      getExpandButton(getInlinePlotProps())!.click!();
    });
    expect(within(screen.getByRole('dialog')).getByText('Intensity (A.U.)')).toBeInTheDocument();
  });

  it('closes the dialog via the close button', async () => {
    render(<SpectrumPlot data={makeData()} enableExpand />);
    act(() => {
      getExpandButton(getInlinePlotProps())!.click!();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    // Dialog uses MUI Fade transition; node is unmounted after the transition.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getAllByTestId('mock-plot')).toHaveLength(1);
  });

  it('attaches a ResizeObserver while the dialog is open and disconnects on close', async () => {
    render(<SpectrumPlot data={makeData()} enableExpand />);
    act(() => {
      getExpandButton(getInlinePlotProps())!.click!();
    });

    // MUI Dialog uses a Portal — the effect re-runs once the content element
    // mounts (we use a callback ref via setState to handle that timing).
    await waitFor(() => {
      expect(MockResizeObserver.instances).toHaveLength(1);
    });
    const observer = MockResizeObserver.instances[0];
    expect(observer.observed).toHaveLength(1);
    expect(observer.disconnected).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    // Disconnect happens during the MUI Fade exit + effect cleanup.
    await waitFor(() => {
      expect(observer.disconnected).toBe(true);
    });
  });

  it('does not include the expand button on the modal plot itself', () => {
    render(<SpectrumPlot data={makeData()} enableExpand />);
    act(() => {
      getExpandButton(getInlinePlotProps())!.click!();
    });

    // After opening, the most recent Plot rendered is the modal one.
    const modalProps = plotCalls[plotCalls.length - 1];
    expect(modalProps.config?.modeBarButtonsToAdd).toBeUndefined();
  });

  it('passes the same trace count to inline and modal plots', () => {
    const data = makeData({
      series: [
        { label: 'A', yValues: [1, 2, 3, 4] },
        { label: 'B', yValues: [4, 3, 2, 1] },
      ],
    });
    render(<SpectrumPlot data={data} enableExpand />);
    act(() => {
      getExpandButton(getInlinePlotProps())!.click!();
    });

    const plots = screen.getAllByTestId('mock-plot');
    expect(plots).toHaveLength(2);
    expect(plots[0]).toHaveAttribute('data-trace-count', '2');
    expect(plots[1]).toHaveAttribute('data-trace-count', '2');
  });

  // Regression: empty xValues array was truthy and bypassed the legacy fallback,
  // producing a silent empty chart instead of using data.points.
  it('falls back to legacy points when xValues is an empty array', () => {
    const data = makeData({
      xValues: [],
      series: [{ label: 'S', yValues: [99, 99, 99] }],
      points: [
        { x: 10, y: 1 },
        { x: 20, y: 2 },
        { x: 30, y: 3 },
      ],
    });
    render(<SpectrumPlot data={data} />);
    const traces = getInlinePlotProps().data as Array<{ x: number[]; y: number[] }>;
    expect(traces).toHaveLength(1);
    expect(traces[0].x).toEqual([10, 20, 30]);
    expect(traces[0].y).toEqual([1, 2, 3]);
  });

  // Regression: untyped JS callers can pass SpectrumData without `points`;
  // the legacy fallback used to crash with "Cannot read properties of undefined".
  it('does not crash when both xValues and points are absent', () => {
    const data = {
      id: 'x',
      label: 'L',
      xValues: [],
      series: [],
      mimeType: 'text/csv',
      // points intentionally omitted
    } as unknown as SpectrumData;

    expect(() => render(<SpectrumPlot data={data} />)).not.toThrow();
    const traces = getInlinePlotProps().data as unknown[];
    expect(traces).toHaveLength(1);
  });

  // Regression: react-plotly.js mutates the layout/data references on user
  // interaction (zoom, pan, legend toggle). Sharing them between the inline
  // and modal Plots leaked interaction state between the two.
  it('passes distinct layout and data references to inline and modal plots', () => {
    render(<SpectrumPlot data={makeData()} enableExpand />);
    act(() => {
      getExpandButton(getInlinePlotProps())!.click!();
    });

    const inline = plotCalls[0];
    const modal = plotCalls[plotCalls.length - 1];
    expect(modal.layout).not.toBe(inline.layout);
    expect(modal.data).not.toBe(inline.data);

    // Simulate Plotly mutating the modal's layout — inline must remain pristine.
    (modal.layout as { xaxis: { range?: [number, number] } }).xaxis.range = [0, 100];
    expect((inline.layout as { xaxis: { range?: [number, number] } }).xaxis.range).toBeUndefined();
  });

  // Regression: render under React 19 StrictMode and exercise the full
  // open → close cycle. Whether or not effects double-invoke here (the
  // modal mounts through a MUI Portal), the invariant is the same: after
  // a clean close, no ResizeObserver remains active.
  it('does not leak a ResizeObserver under StrictMode', async () => {
    render(
      <React.StrictMode>
        <SpectrumPlot data={makeData()} enableExpand />
      </React.StrictMode>,
    );
    act(() => {
      getExpandButton(getInlinePlotProps())!.click!();
    });
    await waitFor(() => {
      expect(MockResizeObserver.instances.length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    await waitFor(() => {
      const active = MockResizeObserver.instances.filter((o) => !o.disconnected);
      expect(active).toHaveLength(0);
    });
  });

  // Regression: hard-coded English strings are now overridable via the `labels`
  // prop, so callers can translate them without forking the component.
  it('uses provided labels instead of English defaults', () => {
    render(
      <SpectrumPlot
        data={makeData({ label: '', series: [] })}
        enableExpand
        labels={{
          expandButton: 'Ouvrir en grand',
          closeButton: 'fermer',
          defaultTitle: 'Spectre',
        }}
      />,
    );
    const btn = getExpandButton(getInlinePlotProps());
    expect(btn?.title).toBe('Ouvrir en grand');

    act(() => { btn!.click!(); });
    expect(screen.getByRole('button', { name: /^fermer$/i })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText('Spectre')).toBeInTheDocument();
  });

  // Regression: close button used to be nested inside DialogTitle's <h2>,
  // and the Dialog had no aria-labelledby linking to the title.
  it('exposes a labelled dialog with the close button outside the heading', () => {
    render(<SpectrumPlot data={makeData()} enableExpand />);
    act(() => {
      getExpandButton(getInlinePlotProps())!.click!();
    });

    const dialog = screen.getByRole('dialog');
    const heading = within(dialog).getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Test Spectrum');
    // aria-labelledby must point to the heading's id (set via useId).
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
    // Close button must NOT be a descendant of the heading.
    const closeBtn = within(dialog).getByRole('button', { name: /^close$/i });
    expect(heading.contains(closeBtn)).toBe(false);
  });

  // Regression: closing the modal used to fully unmount the Dialog, breaking
  // MUI's exit transition. With controlled `open`, re-opening after close must work.
  it('can reopen the modal after closing it', async () => {
    render(<SpectrumPlot data={makeData()} enableExpand />);
    act(() => {
      getExpandButton(getInlinePlotProps())!.click!();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    act(() => {
      getExpandButton(getInlinePlotProps())!.click!();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
