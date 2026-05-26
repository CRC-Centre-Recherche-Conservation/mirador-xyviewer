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

/** Find the most recent props passed to the inline Plot (i.e. the first one mounted). */
const getInlinePlotProps = (): PlotMockProps => {
  // The inline plot is always the first call after a render; the modal Plot, if any, comes after.
  const inline = plotCalls[0];
  if (!inline) throw new Error('No Plot was rendered');
  return inline;
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

  it('adds a custom "expandPlot" modebar button by default', () => {
    render(<SpectrumPlot data={makeData()} />);
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
    render(<SpectrumPlot data={makeData()} />);
    expect(screen.getAllByTestId('mock-plot')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the dialog when the modebar click handler fires', () => {
    render(<SpectrumPlot data={makeData()} />);
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
      />,
    );
    act(() => {
      getExpandButton(getInlinePlotProps())!.click!();
    });
    expect(within(screen.getByRole('dialog')).getByText('Intensity (A.U.)')).toBeInTheDocument();
  });

  it('closes the dialog via the close button', () => {
    render(<SpectrumPlot data={makeData()} />);
    act(() => {
      getExpandButton(getInlinePlotProps())!.click!();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('mock-plot')).toHaveLength(1);
  });

  it('attaches a ResizeObserver while the dialog is open and disconnects on close', async () => {
    render(<SpectrumPlot data={makeData()} />);
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
    expect(observer.disconnected).toBe(true);
  });

  it('does not include the expand button on the modal plot itself', () => {
    render(<SpectrumPlot data={makeData()} />);
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
    render(<SpectrumPlot data={data} />);
    act(() => {
      getExpandButton(getInlinePlotProps())!.click!();
    });

    const plots = screen.getAllByTestId('mock-plot');
    expect(plots).toHaveLength(2);
    expect(plots[0]).toHaveAttribute('data-trace-count', '2');
    expect(plots[1]).toHaveAttribute('data-trace-count', '2');
  });
});
