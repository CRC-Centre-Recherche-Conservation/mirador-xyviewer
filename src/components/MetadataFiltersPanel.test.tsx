/**
 * Tests for MetadataFiltersPanel (Pattern B).
 *
 * Uses the REAL filtersStore (pure logic). Each test seeds the store via
 * initializeFromAnnotations, then renders the panel and asserts the rendered
 * groups/values, the standalone-vs-embedded layout, the footer counts, and
 * that toggling a value checkbox fires onFiltersChange. clearFilters() in
 * beforeEach resets the singleton between tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MetadataFiltersPanel } from './MetadataFiltersPanel';
import { filtersStore } from '../state/filtersStore';

const WIN = 'win1';
const CANVAS = 'canvas1';

type Anno = { id: string; metadata?: Array<{ label: { [l: string]: string[] }; value: { [l: string]: string[] } }> };

const annotations: Anno[] = [
  { id: 'a1', metadata: [{ label: { none: ['Technique'] }, value: { none: ['XRF'] } }] },
  { id: 'a2', metadata: [{ label: { none: ['Technique'] }, value: { none: ['Raman'] } }] },
];

const seed = () => filtersStore.initializeFromAnnotations(WIN, CANVAS, annotations);

beforeEach(() => {
  filtersStore.clearFilters(WIN, CANVAS);
});

describe('MetadataFiltersPanel', () => {
  it('shows a "no metadata" message when the store has no groups', () => {
    render(<MetadataFiltersPanel windowId={WIN} canvasId={CANVAS} annotations={[]} />);
    expect(screen.getByText(/No metadata available/i)).toBeInTheDocument();
  });

  it('renders the group label, its values, and a checkbox per value', () => {
    seed();
    render(<MetadataFiltersPanel windowId={WIN} canvasId={CANVAS} annotations={annotations} />);

    expect(screen.getByText('Technique')).toBeInTheDocument();
    expect(screen.getByText('XRF')).toBeInTheDocument();
    expect(screen.getByText('Raman')).toBeInTheDocument();
    // One checkbox per value (groups start expanded).
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThanOrEqual(2);
  });

  it('fires onFiltersChange with a Set when a value checkbox is toggled', () => {
    seed();
    const onFiltersChange = vi.fn();
    render(
      <MetadataFiltersPanel
        windowId={WIN}
        canvasId={CANVAS}
        annotations={annotations}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.click(screen.getAllByRole('checkbox')[0]);

    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange.mock.calls[0][0]).toBeInstanceOf(Set);
  });

  it('renders the "Filters" header in standalone mode but not embedded', () => {
    seed();
    const { rerender } = render(
      <MetadataFiltersPanel windowId={WIN} canvasId={CANVAS} annotations={annotations} />,
    );
    expect(screen.getByText('Filters')).toBeInTheDocument();

    rerender(<MetadataFiltersPanel windowId={WIN} canvasId={CANVAS} annotations={annotations} embedded />);
    expect(screen.queryByText('Filters')).toBeNull();
  });

  it('shows annotation and group counts in the footer', () => {
    seed();
    render(<MetadataFiltersPanel windowId={WIN} canvasId={CANVAS} annotations={annotations} />);
    // Footer text: "2 annotations | 1 filter groups"
    expect(screen.getByText(/2 annotations/)).toBeInTheDocument();
    expect(screen.getByText(/1 filter groups/)).toBeInTheDocument();
  });
});
