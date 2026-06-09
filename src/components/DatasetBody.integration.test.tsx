/**
 * Pattern D integration: the real dataset-load chain.
 * DatasetBody -> fetchDataset -> parseDataset -> datasetCache -> SpectrumPlot,
 * with only the outer boundary mocked (global.fetch streams a CSV; react-plotly
 * is stubbed). Verifies the modules agree on data shapes end-to-end and that the
 * cache prevents a second fetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetBody } from './DatasetBody';
import { datasetCache } from '../services/datasetCache';
import type { DatasetBody as DatasetBodyType } from '../types/iiif';

vi.mock('react-plotly.js', () => ({ default: () => <div data-testid="plotly" /> }));

const CSV = 'wavelength,intensity\n400,10\n500,20\n600,30';
const body: DatasetBodyType = { type: 'Dataset', id: 'https://ex.org/spectrum.csv', format: 'text/csv' };

/** Minimal streamed Response over a string (matches performFetch's reader usage). */
function csvResponse(text: string): Response {
  const bytes = new TextEncoder().encode(text);
  let sent = false;
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: (k: string) => (k === 'Content-Type' ? 'text/csv' : null) },
    body: {
      getReader: () => ({
        read: async () =>
          sent ? { done: true, value: undefined } : ((sent = true), { done: false, value: bytes }),
        cancel: vi.fn(),
      }),
    },
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  datasetCache.clear();
});

describe('dataset-load integration', () => {
  it('loads a CSV, parses it, and renders the plot', async () => {
    vi.mocked(global.fetch).mockResolvedValue(csvResponse(CSV));
    render(<DatasetBody body={body} />);

    fireEvent.click(screen.getByRole('button', { name: /Load/i }));

    expect(await screen.findByTestId('plotly')).toBeInTheDocument();
    // 3 data points parsed from the CSV.
    expect(screen.getByText(/3 points/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('serves the second mount from cache without a second fetch', async () => {
    vi.mocked(global.fetch).mockResolvedValue(csvResponse(CSV));
    const first = render(<DatasetBody body={body} />);
    fireEvent.click(screen.getByRole('button', { name: /Load/i }));
    await screen.findByTestId('plotly');
    first.unmount();

    render(<DatasetBody body={body} />);
    // Cache hit on mount -> success state, no Load button, fetch still called only once.
    expect(await screen.findByText(/3 points/)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces a fetch error in an Alert', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false, status: 500, statusText: 'Server Error',
      headers: { get: () => null }, body: null,
    } as unknown as Response);
    render(<DatasetBody body={body} />);

    fireEvent.click(screen.getByRole('button', { name: /Load/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/HTTP 500/);
  });
});
