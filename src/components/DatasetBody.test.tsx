/**
 * Tests for the DatasetBody component (Pattern B).
 *
 * The async fetch service, the cache singleton, and the heavy SpectrumPlot are
 * mocked so we exercise DatasetBody's own state machine: invalid-config alert,
 * idle Load button, success (plot rendered + onDataLoaded + points count),
 * error + retry (cache cleared, refetch), and the cache-hit-on-mount path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetBody } from './DatasetBody';
import type { DatasetBody as DatasetBodyType } from '../types/iiif';
import type { SpectrumData } from '../types/dataset';
import { fetchDataset, validateDatasetUrl } from '../services/datasetFetcher';
import { datasetCache } from '../services/datasetCache';

vi.mock('./SpectrumPlot', () => ({ SpectrumPlot: () => <div data-testid="spectrum-plot" /> }));
vi.mock('../services/datasetFetcher', () => ({
  fetchDataset: vi.fn(),
  abortFetch: vi.fn(),
  validateDatasetUrl: vi.fn(() => ({ valid: true })),
}));
vi.mock('../services/datasetCache', () => ({
  datasetCache: { get: vi.fn(() => null), delete: vi.fn() },
}));

const body: DatasetBodyType = { type: 'Dataset', id: 'https://example.org/d.csv', format: 'text/csv' };

const data: SpectrumData = {
  id: body.id,
  label: 'L',
  xValues: [1, 2],
  xLabel: 'x',
  series: [{ label: 's', yValues: [1, 2] }],
  mimeType: 'text/csv',
  points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validateDatasetUrl).mockReturnValue({ valid: true });
  vi.mocked(datasetCache.get).mockReturnValue(null);
});

describe('DatasetBody', () => {
  it('renders a warning Alert for an invalid dataset config', () => {
    vi.mocked(validateDatasetUrl).mockReturnValue({ valid: false, error: 'Bad MIME' });
    render(<DatasetBody body={body} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Bad MIME');
  });

  it('renders a Load button in the idle state', () => {
    render(<DatasetBody body={body} />);
    expect(screen.getByRole('button', { name: /Load/i })).toBeInTheDocument();
  });

  it('fetches on click, renders the plot, shows the point count, and fires onDataLoaded', async () => {
    vi.mocked(fetchDataset).mockResolvedValue({ status: 'success', data });
    const onDataLoaded = vi.fn();
    render(<DatasetBody body={body} onDataLoaded={onDataLoaded} />);

    fireEvent.click(screen.getByRole('button', { name: /Load/i }));

    expect(await screen.findByTestId('spectrum-plot')).toBeInTheDocument();
    expect(fetchDataset).toHaveBeenCalledWith(body.id, body.format, expect.any(String));
    expect(onDataLoaded).toHaveBeenCalledWith(body.id, data);
    expect(screen.getByText(/2 points/)).toBeInTheDocument();
  });

  it('shows an error Alert on fetch failure', async () => {
    vi.mocked(fetchDataset).mockResolvedValue({ status: 'error', error: 'Network down' });
    render(<DatasetBody body={body} />);

    fireEvent.click(screen.getByRole('button', { name: /Load/i }));

    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });

  it('clears the cache and refetches on retry', async () => {
    vi.mocked(fetchDataset).mockResolvedValue({ status: 'error', error: 'Network down' });
    render(<DatasetBody body={body} />);
    fireEvent.click(screen.getByRole('button', { name: /Load/i }));
    await screen.findByText('Network down');

    // In the error state the only button is the retry IconButton.
    vi.mocked(fetchDataset).mockResolvedValue({ status: 'success', data });
    fireEvent.click(screen.getByRole('button'));

    expect(datasetCache.delete).toHaveBeenCalledWith(body.id);
    expect(await screen.findByTestId('spectrum-plot')).toBeInTheDocument();
  });

  it('renders the success state directly when data is already cached on mount', async () => {
    vi.mocked(datasetCache.get).mockReturnValue(data);
    render(<DatasetBody body={body} />);
    expect(await screen.findByText(/2 points/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load/i })).toBeNull();
  });
});
