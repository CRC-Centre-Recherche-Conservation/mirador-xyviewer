/**
 * Pattern D integration: the real annotation-body routing.
 * AnnotationBodyRenderer -> isManifest/isDataset/isTextual guards -> the real
 * body components. A mixed array renders all three branches. Only the outer
 * boundary (react-plotly) is mocked; the real components must agree on props.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnotationBodyRenderer } from './AnnotationBodyRenderer';
import type { AnnotationBody } from '../types/iiif';

vi.mock('react-plotly.js', () => ({ default: () => <div data-testid="plotly" /> }));

const props = { dispatch: vi.fn(), addWindow: vi.fn(() => ({ type: 'ADD_WINDOW' })) };

describe('annotation-routing integration', () => {
  it('renders a textual body as text', () => {
    render(<AnnotationBodyRenderer body={{ type: 'TextualBody', value: 'Hello spectro' }} {...props} />);
    expect(screen.getByText('Hello spectro')).toBeInTheDocument();
  });

  it('renders a manifest body as a "View IIIF Manifest" button', () => {
    render(<AnnotationBodyRenderer body={{ type: 'Manifest', id: 'https://ex.org/m.json' }} {...props} />);
    expect(screen.getByText('View IIIF Manifest')).toBeInTheDocument();
  });

  it('renders a dataset body as a Load button', () => {
    render(
      <AnnotationBodyRenderer
        body={{ type: 'Dataset', id: 'https://ex.org/d.csv', format: 'text/csv' }}
        {...props}
      />,
    );
    expect(screen.getByRole('button', { name: /Load/i })).toBeInTheDocument();
  });

  it('renders all branches of a mixed body array', () => {
    const bodies: AnnotationBody[] = [
      { type: 'TextualBody', value: 'note' },
      { type: 'Manifest', id: 'https://ex.org/m.json' },
      { type: 'Dataset', id: 'https://ex.org/d.csv', format: 'text/csv' },
    ];
    const { container } = render(<AnnotationBodyRenderer body={bodies} {...props} />);
    expect(screen.getByText('note')).toBeInTheDocument();
    expect(screen.getByText('View IIIF Manifest')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Load/i })).toBeInTheDocument();
    // 2 dividers between 3 bodies.
    expect(container.querySelectorAll('hr')).toHaveLength(2);
  });
});
