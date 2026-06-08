/**
 * Tests for ImageComparisonSlider (Pattern B).
 *
 * OpenSeadragon can't run in jsdom, so it's mocked to a stub viewer. We assert
 * the <2-canvas guard, the comparison UI (two selects + Close), the onClose
 * callback, and that both viewers are initialised with the IIIF tile source
 * derived from each canvas's imageUrl (covers getIIIFTileSource's branches).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OpenSeadragon from 'openseadragon';
import { ImageComparisonSlider, type CanvasInfo } from './ImageComparisonSlider';

// addOnceHandler invokes its callback synchronously so the component's
// 'open' handlers fire — that drives setupSync() (handler registration +
// isReady), exercising the post-init path. The viewport stub is enough for
// syncViewers' early-return guard.
vi.mock('openseadragon', () => ({
  default: vi.fn(() => ({
    destroy: vi.fn(),
    addHandler: vi.fn(),
    addOnceHandler: vi.fn((_event: string, cb: () => void) => cb()),
    viewport: {},
  })),
}));

const canvas = (id: string, imageUrl: string, label = id): CanvasInfo => ({ id, label, imageUrl });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ImageComparisonSlider', () => {
  it('shows a guard message when fewer than 2 canvases are provided', () => {
    render(<ImageComparisonSlider windowId="w1" canvases={[canvas('c1', 'https://x/info.json')]} />);
    expect(screen.getByText(/At least 2 images are required/i)).toBeInTheDocument();
  });

  it('renders the comparison UI with two selects and a Close button', () => {
    render(
      <ImageComparisonSlider
        windowId="w1"
        canvases={[canvas('c1', 'https://x/info.json'), canvas('c2', 'https://y/info.json')]}
      />,
    );
    expect(screen.getByText('Comparison')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    // Both viewers "open" (mock), so setupSync ran and the loading indicator is gone.
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('calls onClose when the Close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <ImageComparisonSlider
        windowId="w1"
        onClose={onClose}
        canvases={[canvas('c1', 'https://x/info.json'), canvas('c2', 'https://y/info.json')]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('initialises a viewer per side with the derived IIIF tile source', () => {
    render(
      <ImageComparisonSlider
        windowId="w1"
        canvases={[
          canvas('c1', 'https://srv/iiif/img/full/max/0/default.jpg'),
          canvas('c2', 'https://srv/iiif/img2/info.json'),
        ]}
      />,
    );
    expect(OpenSeadragon).toHaveBeenCalledTimes(2);
    // '/full/' URL -> base + /info.json
    expect(OpenSeadragon).toHaveBeenCalledWith(
      expect.objectContaining({ tileSources: 'https://srv/iiif/img/info.json' }),
    );
    // already an info.json URL -> unchanged
    expect(OpenSeadragon).toHaveBeenCalledWith(
      expect.objectContaining({ tileSources: 'https://srv/iiif/img2/info.json' }),
    );
  });

  it('appends /info.json for a bare image URL', () => {
    render(
      <ImageComparisonSlider
        windowId="w1"
        canvases={[canvas('c1', 'https://srv/bare'), canvas('c2', 'https://y/info.json')]}
      />,
    );
    expect(OpenSeadragon).toHaveBeenCalledWith(
      expect.objectContaining({ tileSources: 'https://srv/bare/info.json' }),
    );
  });
});
