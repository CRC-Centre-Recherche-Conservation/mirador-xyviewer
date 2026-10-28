/**
 * Tests for the DatasetBody component (Pattern B).
 *
 * The async fetch service, the cache singleton, and the heavy SpectrumPlot are
 * mocked so we exercise DatasetBody's own state machine: invalid-config alert,
 * idle Load button, success (plot rendered + onDataLoaded + points count),
 * error + retry (cache cleared, refetch), and the cache-hit-on-mount path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { DatasetBody, configureDatasetAuth } from './DatasetBody';
import type { DatasetBody as DatasetBodyType } from '../types/iiif';
import type { SpectrumData } from '../types/dataset';
import { fetchDataset, fetchDatasetFile, validateDatasetUrl } from '../services/datasetFetcher';
import { datasetCache } from '../services/datasetCache';

vi.mock('./SpectrumPlot', () => ({ SpectrumPlot: () => <div data-testid="spectrum-plot" /> }));
vi.mock('../services/datasetFetcher', () => ({
  fetchDataset: vi.fn(),
  fetchDatasetFile: vi.fn(),
  abortFetch: vi.fn(),
  datasetCacheKey: vi.fn((url: string) => url),
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
  it('links to the resource (no download) when the format is valid but not plottable', () => {
    // Valid URL, unsupported format (e.g. binary) → not an error: point to the resource.
    vi.mocked(validateDatasetUrl).mockReturnValue({ valid: false, error: 'Unsupported MIME type' });
    render(<DatasetBody body={{ ...body, format: 'application/octet-stream' }} />);

    expect(screen.getByText(/not supported for plotting/i)).toBeInTheDocument();
    // "Open resource" is an authenticated action (button), not a raw link — so a protected
    // file downloads with the token instead of a `<a href>` hitting a bare 401.
    expect(screen.getByRole('button', { name: /open resource/i })).toBeInTheDocument();
  });

  it('opens the resource via an <a download> click (not window.open) so popup blockers allow it', async () => {
    vi.mocked(validateDatasetUrl).mockReturnValue({ valid: false, error: 'Unsupported MIME type' });
    vi.mocked(fetchDatasetFile).mockResolvedValue({ blob: new Blob(['x'], { type: 'text/csv' }), filename: '' });

    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    const openSpy = vi.spyOn(window, 'open');
    let downloadName: string | undefined;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadName = this.download;
      });

    try {
      render(<DatasetBody body={{ ...body, format: 'application/octet-stream' }} />);
      fireEvent.click(screen.getByRole('button', { name: /open resource/i }));

      await waitFor(() => expect(clickSpy).toHaveBeenCalled());
      expect(downloadName).toBe('d.csv'); // the real file name, not a blob UUID
      expect(openSpy).not.toHaveBeenCalled(); // never window.open (blocked after an await)
    } finally {
      clickSpy.mockRestore();
      openSpy.mockRestore();
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });

  it('renders an error Alert when the dataset URL itself is invalid', () => {
    vi.mocked(validateDatasetUrl).mockReturnValue({ valid: false, error: 'Invalid URL' });
    render(<DatasetBody body={{ ...body, id: 'not-a-valid-url' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid URL');
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
    expect(fetchDataset).toHaveBeenCalledWith(body.id, body.format, expect.any(String), undefined, {
      service: undefined,
    }, undefined);
    expect(onDataLoaded).toHaveBeenCalledWith(body.id, data);
    expect(screen.getByText(/2 points/)).toBeInTheDocument();
  });

  it("forwards the body's declared IIIF service to fetchDataset (Phase 1b)", async () => {
    const service = { '@id': 'https://auth.museum/login' };
    const bodyWithService: DatasetBodyType = { ...body, service };
    vi.mocked(fetchDataset).mockResolvedValue({ status: 'success', data });
    render(<DatasetBody body={bodyWithService} />);

    fireEvent.click(screen.getByRole('button', { name: /Load/i }));
    await screen.findByTestId('spectrum-plot');

    expect(fetchDataset).toHaveBeenCalledWith(
      bodyWithService.id,
      bodyWithService.format,
      expect.any(String),
      undefined,
      { service },
      undefined,
    );
  });

  describe('xyReading', () => {
    const reading = (derivedFrom: unknown) => ({
      type: 'XYReading',
      derivedFrom,
    });
    const rawRef = { id: 'https://example.org/raw', type: 'Dataset', format: 'text/csv' };

    it('forwards the xyReading to fetchDataset', async () => {
      const xyReading = reading(undefined);
      vi.mocked(fetchDataset).mockResolvedValue({ status: 'success', data });
      render(<DatasetBody body={{ ...body, xyReading }} />);
      fireEvent.click(screen.getByRole('button', { name: /Load/i }));
      await screen.findByTestId('spectrum-plot');
      expect(vi.mocked(fetchDataset).mock.calls[0][5]).toBe(xyReading);
    });

    it('offers no raw download without derivedFrom, or with an invalid one', () => {
      vi.mocked(datasetCache.get).mockReturnValue(data);
      const { rerender } = render(<DatasetBody body={body} />);
      expect(screen.queryByText(/download raw data/i)).toBeNull();
      rerender(
        <DatasetBody body={{ ...body, xyReading: reading({ ...rawRef, id: 'javascript:alert(1)' }) }} />
      );
      expect(screen.queryByText(/download raw data/i)).toBeNull();
    });

    it('offers the raw download before loading and for a non-plottable dataset', () => {
      const withRaw = { ...body, xyReading: reading(rawRef) };
      render(<DatasetBody body={withRaw} />);
      expect(screen.getByRole('button', { name: /^Load/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /download raw data/i })).toBeTruthy();
      cleanup();
      vi.mocked(validateDatasetUrl).mockReturnValue({ valid: false, error: 'Unsupported MIME type' });
      render(<DatasetBody body={withRaw} />);
      expect(screen.getByRole('button', { name: /download raw data/i })).toBeTruthy();
    });

    it('downloads the raw file through the authenticated fetch, only on click', async () => {
      vi.mocked(datasetCache.get).mockReturnValue(data);
      vi.mocked(fetchDatasetFile).mockResolvedValue({ blob: new Blob(['x'], { type: 'text/csv' }), filename: '' });
      const origCreate = URL.createObjectURL;
      const origRevoke = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn(() => 'blob:fake');
      URL.revokeObjectURL = vi.fn();
      let downloadName: string | undefined;
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(function (this: HTMLAnchorElement) {
          downloadName = this.download;
        });
      try {
        const service = { '@id': 'https://auth.museum/login' };
        render(<DatasetBody body={{ ...body, service, xyReading: reading(rawRef) }} />);
        expect(fetchDatasetFile).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /download raw data/i }));
        await waitFor(() => expect(clickSpy).toHaveBeenCalled());
        expect(fetchDatasetFile).toHaveBeenCalledWith(rawRef.id, undefined, { service });
        expect(downloadName).toBe('d-raw.csv');
      } finally {
        clickSpy.mockRestore();
        URL.createObjectURL = origCreate;
        URL.revokeObjectURL = origRevoke;
      }
    });

    it('names an unknown-format raw file from its label, with no invented extension', async () => {
      vi.mocked(datasetCache.get).mockReturnValue(data);
      vi.mocked(fetchDatasetFile).mockResolvedValue({ blob: new Blob(['x']), filename: '' });
      const origCreate = URL.createObjectURL;
      URL.createObjectURL = vi.fn(() => 'blob:fake');
      let downloadName: string | undefined;
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(function (this: HTMLAnchorElement) {
          downloadName = this.download;
        });
      try {
        const raw = { ...rawRef, format: 'application/octet-stream', label: { none: ['Sample/1'] } };
        render(<DatasetBody body={{ ...body, xyReading: reading(raw) }} />);
        fireEvent.click(screen.getByRole('button', { name: /download raw data/i }));
        await waitFor(() => expect(clickSpy).toHaveBeenCalled());
        expect(downloadName).toBe('Sample_1');
      } finally {
        clickSpy.mockRestore();
        URL.createObjectURL = origCreate;
      }
    });

    it('signs in then retries the raw download on a 401', async () => {
      vi.mocked(datasetCache.get).mockReturnValue(data);
      vi.mocked(fetchDatasetFile)
        .mockRejectedValueOnce(Object.assign(new Error('denied'), { authRequired: true }))
        .mockResolvedValueOnce({ blob: new Blob(['x']), filename: '' });
      const handler = vi.fn().mockResolvedValue(undefined);
      const origCreate = URL.createObjectURL;
      const origRevoke = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn(() => 'blob:fake');
      URL.revokeObjectURL = vi.fn();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        render(<DatasetBody body={{ ...body, xyReading: reading(rawRef) }} onAuthRequired={handler} />);
        fireEvent.click(screen.getByRole('button', { name: /download raw data/i }));
        await waitFor(() => expect(clickSpy).toHaveBeenCalled());
        expect(handler).toHaveBeenCalledTimes(1);
        expect(fetchDatasetFile).toHaveBeenCalledTimes(2);
      } finally {
        clickSpy.mockRestore();
        URL.revokeObjectURL = origRevoke;
        URL.createObjectURL = origCreate;
      }
    });

    it('does not send host request options to a raw file on another origin', async () => {
      vi.mocked(datasetCache.get).mockReturnValue(data);
      vi.mocked(fetchDatasetFile).mockResolvedValue({ blob: new Blob(['x']), filename: '' });
      const requestOptions = { headers: { 'X-Key': 'secret' } };
      const origCreate = URL.createObjectURL;
      const origRevoke = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn(() => 'blob:fake');
      URL.revokeObjectURL = vi.fn();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        const other = { ...rawRef, id: 'https://other.example.net/raw.csv' };
        render(<DatasetBody body={{ ...body, xyReading: reading(other) }} requestOptions={requestOptions} />);
        fireEvent.click(screen.getByRole('button', { name: /download raw data/i }));
        await waitFor(() => expect(clickSpy).toHaveBeenCalled());
        expect(vi.mocked(fetchDatasetFile).mock.calls.at(-1)?.[1]).toBeUndefined();
      } finally {
        clickSpy.mockRestore();
        URL.createObjectURL = origCreate;
        URL.revokeObjectURL = origRevoke;
      }
    });

    it('offers the raw download when the dataset fails to load', async () => {
      vi.mocked(fetchDataset).mockResolvedValue({ status: 'error', error: 'Network down' });
      render(<DatasetBody body={{ ...body, xyReading: reading(rawRef) }} />);
      fireEvent.click(screen.getByRole('button', { name: /^Load/i }));
      await screen.findByText(/Network down/);
      expect(screen.getByRole('button', { name: /download raw data/i })).toBeTruthy();
    });

    it('notes when the reading was set aside', () => {
      vi.mocked(datasetCache.get).mockReturnValue({ ...data, readingIgnored: 'unsupported-correction' });
      render(<DatasetBody body={body} />);
      fireEvent.click(screen.getByRole('button', { name: /points/ }));
      expect(screen.getByText(/correction this viewer cannot apply/i)).toBeInTheDocument();
    });
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

  describe('auth-protected datasets (Sign in affordance)', () => {
    const authError = {
      status: 'error' as const,
      error: 'Access denied — you may need to sign in to view this dataset.',
      authRequired: true,
    };

    // The global handler is module state, not a mock — reset it explicitly.
    afterEach(() => configureDatasetAuth(undefined));

    it('shows a Sign in button on an auth error when a handler is provided, and calls it', async () => {
      vi.mocked(fetchDataset).mockResolvedValue(authError);
      const onAuthRequired = vi.fn();
      render(<DatasetBody body={body} onAuthRequired={onAuthRequired} />);

      fireEvent.click(screen.getByRole('button', { name: /Load/i }));
      const signIn = await screen.findByRole('button', { name: /sign in/i });
      fireEvent.click(signIn);

      expect(onAuthRequired).toHaveBeenCalledWith(body);
    });

    it('uses a globally registered handler (configureDatasetAuth) when no prop is given', async () => {
      vi.mocked(fetchDataset).mockResolvedValue(authError);
      const handler = vi.fn();
      configureDatasetAuth(handler);
      render(<DatasetBody body={body} />);

      fireEvent.click(screen.getByRole('button', { name: /Load/i }));
      const signIn = await screen.findByRole('button', { name: /sign in/i });
      fireEvent.click(signIn);

      expect(handler).toHaveBeenCalledWith(body);
    });

    it('shows no Sign in button when no handler is provided, but offers Open resource', async () => {
      vi.mocked(fetchDataset).mockResolvedValue(authError);
      render(<DatasetBody body={body} />);

      fireEvent.click(screen.getByRole('button', { name: /Load/i }));
      await screen.findByText(/protected/i);
      expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull();
      // The user can still pursue the resource via the authenticated open action.
      expect(screen.getByRole('button', { name: /open resource/i })).toBeInTheDocument();
    });

    it('signs in then downloads automatically when Open resource hits a 401 (one click)', async () => {
      vi.mocked(validateDatasetUrl).mockReturnValue({ valid: false, error: 'Unsupported MIME type' });
      const blobAuthError = Object.assign(new Error('401'), { authRequired: true });
      // First attempt is unauthenticated → 401; after the login the retry succeeds.
      vi.mocked(fetchDatasetFile)
        .mockRejectedValueOnce(blobAuthError)
        .mockResolvedValueOnce({ blob: new Blob(['x'], { type: 'text/csv' }), filename: '' });
      const handler = vi.fn().mockResolvedValue(undefined);
      configureDatasetAuth(handler, { canStartLogin: () => true });

      const origCreate = URL.createObjectURL;
      const origRevoke = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn(() => 'blob:fake');
      URL.revokeObjectURL = vi.fn();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      try {
        render(<DatasetBody body={{ ...body, format: 'application/octet-stream' }} />);
        fireEvent.click(screen.getByRole('button', { name: /open resource/i }));

        await waitFor(() => expect(handler).toHaveBeenCalled()); // the login ran
        await waitFor(() => expect(clickSpy).toHaveBeenCalled()); // download fired after login
        expect(vi.mocked(fetchDatasetFile)).toHaveBeenCalledTimes(2); // initial 401 + retry
      } finally {
        clickSpy.mockRestore();
        URL.createObjectURL = origCreate;
        URL.revokeObjectURL = origRevoke;
      }
    });

    it('downloads directly without a login when already authenticated', async () => {
      vi.mocked(validateDatasetUrl).mockReturnValue({ valid: false, error: 'Unsupported MIME type' });
      vi.mocked(fetchDatasetFile).mockResolvedValue({ blob: new Blob(['x'], { type: 'text/csv' }), filename: '' });
      const handler = vi.fn().mockResolvedValue(undefined);
      configureDatasetAuth(handler, { canStartLogin: () => true });

      const origCreate = URL.createObjectURL;
      const origRevoke = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn(() => 'blob:fake');
      URL.revokeObjectURL = vi.fn();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      try {
        render(<DatasetBody body={{ ...body, format: 'application/octet-stream' }} />);
        fireEvent.click(screen.getByRole('button', { name: /open resource/i }));

        await waitFor(() => expect(clickSpy).toHaveBeenCalled()); // downloaded straight away
        expect(handler).not.toHaveBeenCalled(); // no login popup when already authed
      } finally {
        clickSpy.mockRestore();
        URL.createObjectURL = origCreate;
        URL.revokeObjectURL = origRevoke;
      }
    });

    it('renders a protected record (not a red error) and names the host', async () => {
      vi.mocked(fetchDataset).mockResolvedValue(authError);
      render(<DatasetBody body={body} onAuthRequired={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /Load/i }));
      await screen.findByText(/protected/i);
      // The mono "spec" readout names the format and the host to sign in against.
      expect(screen.getByText('text/csv · example.org')).toBeInTheDocument();
      // It's a status, not the generic error alert.
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('shows no Sign in button for a non-auth error, even with a handler', async () => {
      vi.mocked(fetchDataset).mockResolvedValue({ status: 'error', error: 'Network down' });
      render(<DatasetBody body={body} onAuthRequired={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /Load/i }));
      await screen.findByText('Network down');
      expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull();
    });

    it('hides the Sign in button when the registered predicate says this body cannot start a login', async () => {
      vi.mocked(fetchDataset).mockResolvedValue(authError);
      configureDatasetAuth(vi.fn(), { canStartLogin: () => false });
      render(<DatasetBody body={body} />);

      fireEvent.click(screen.getByRole('button', { name: /Load/i }));
      await screen.findByText(/protected/i);
      expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull();
      // Falls back to the authenticated open action.
      expect(screen.getByRole('button', { name: /open resource/i })).toBeInTheDocument();
    });

    it('shows the Sign in button when the registered predicate allows it', async () => {
      vi.mocked(fetchDataset).mockResolvedValue(authError);
      configureDatasetAuth(vi.fn(), { canStartLogin: () => true });
      render(<DatasetBody body={body} />);

      fireEvent.click(screen.getByRole('button', { name: /Load/i }));
      expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    });

    it('shows a signing-in state while the login is pending, then refetches on success', async () => {
      vi.mocked(fetchDataset).mockResolvedValue(authError);
      let resolveLogin: () => void = () => {};
      // Silent re-acquisition (interactive:false) finds no session → resolves at once; the
      // interactive Sign-in (the click) is the one that stays pending.
      const handler = vi.fn((_b: unknown, opts?: { interactive?: boolean }) =>
        opts?.interactive === false
          ? Promise.resolve()
          : new Promise<void>((r) => { resolveLogin = r; }),
      );
      configureDatasetAuth(handler, { canStartLogin: () => true });
      render(<DatasetBody body={body} />);

      fireEvent.click(screen.getByRole('button', { name: /Load/i }));
      fireEvent.click(await screen.findByRole('button', { name: /^sign in$/i }));

      // While the login promise is pending: progress label + disabled (no double-popup),
      // and the copy points the user at the popup.
      const busy = await screen.findByRole('button', { name: /signing in/i });
      expect(busy).toBeDisabled();
      expect(screen.getByText(/complete sign-in in the new window/i)).toBeInTheDocument();

      vi.mocked(fetchDataset).mockResolvedValue({ status: 'success', data });
      resolveLogin();
      expect(await screen.findByTestId('spectrum-plot')).toBeInTheDocument();
    });

    it('recovers silently on a valid session (zero-click reload): no Sign in shown', async () => {
      vi.mocked(fetchDataset).mockResolvedValueOnce(authError); // first fetch: 401
      // A still-valid session: the silent (interactive:false) re-acquisition succeeds, so the
      // re-fetch lands the data — no popup, no Sign in button.
      const handler = vi.fn((_b: unknown, opts?: { interactive?: boolean }) => {
        if (opts?.interactive === false) {
          vi.mocked(fetchDataset).mockResolvedValue({ status: 'success', data });
        }
        return Promise.resolve();
      });
      configureDatasetAuth(handler, { canStartLogin: () => true });
      render(<DatasetBody body={body} />);

      fireEvent.click(screen.getByRole('button', { name: /Load/i }));

      expect(await screen.findByTestId('spectrum-plot')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^sign in$/i })).toBeNull();
      expect(handler).toHaveBeenCalledWith(expect.anything(), { interactive: false });
    });

    it('shows the Sign in button for a handler registered without a predicate (back-compat)', async () => {
      vi.mocked(fetchDataset).mockResolvedValue(authError);
      configureDatasetAuth(vi.fn()); // no canStartLogin → must default to showing the button
      render(<DatasetBody body={body} />);
      fireEvent.click(screen.getByRole('button', { name: /Load/i }));
      expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    });

    it('resets the signing-in state for a synchronous (void) handler', async () => {
      vi.mocked(fetchDataset).mockResolvedValue(authError);
      configureDatasetAuth(vi.fn(), { canStartLogin: () => true }); // returns void → no auto-retry
      render(<DatasetBody body={body} />);
      fireEvent.click(screen.getByRole('button', { name: /Load/i }));
      fireEvent.click(await screen.findByRole('button', { name: /^sign in$/i }));
      const after = await screen.findByRole('button', { name: /^sign in$/i });
      expect(after).not.toBeDisabled(); // not stuck on "Signing in…"
    });

    it('recovers the button when the handler rejects (no stuck busy, no unhandled rejection)', async () => {
      vi.mocked(fetchDataset).mockResolvedValue(authError);
      const onAuthRequired = vi.fn().mockRejectedValue(new Error('popup closed'));
      render(<DatasetBody body={body} onAuthRequired={onAuthRequired} />);
      fireEvent.click(screen.getByRole('button', { name: /Load/i }));
      fireEvent.click(await screen.findByRole('button', { name: /^sign in$/i }));
      const signIn = await screen.findByRole('button', { name: /^sign in$/i });
      expect(signIn).not.toBeDisabled();
      expect(screen.queryByTestId('spectrum-plot')).toBeNull();
    });

    it('re-fetches automatically after an async handler resolves', async () => {
      vi.mocked(fetchDataset).mockResolvedValueOnce(authError);
      const onAuthRequired = vi.fn().mockResolvedValue(undefined);
      render(<DatasetBody body={body} onAuthRequired={onAuthRequired} />);

      fireEvent.click(screen.getByRole('button', { name: /Load/i }));
      const signIn = await screen.findByRole('button', { name: /sign in/i });

      vi.mocked(fetchDataset).mockResolvedValue({ status: 'success', data });
      fireEvent.click(signIn);

      expect(await screen.findByTestId('spectrum-plot')).toBeInTheDocument();
      expect(datasetCache.delete).toHaveBeenCalledWith(body.id);
    });
  });
});
