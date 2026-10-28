/**
 * Tests for the AnnotationBodyRenderer router (Pattern B).
 *
 * The three body components are mocked to stubs so we assert ROUTING only:
 * each body type reaches the right child, multiple bodies get a divider
 * between them, and an unknown body type falls back to the JSON debug block.
 * Real cross-module rendering is covered by Pattern D integration tests (PR6).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnotationBodyRenderer } from './AnnotationBodyRenderer';
import type { AnnotationBody } from '../types/iiif';

vi.mock('./ManifestBody', () => ({ ManifestBody: () => <div data-testid="manifest-body" /> }));
vi.mock('./DatasetBody', () => ({ DatasetBody: () => <div data-testid="dataset-body" /> }));
vi.mock('./TextualBody', () => ({ TextualBody: ({ ruleSet }: { ruleSet?: string }) => (
    <div data-testid="textual-body" data-ruleset={ruleSet} />
  ) }));

const baseProps = {
  dispatch: vi.fn(),
  addWindow: vi.fn(),
};

describe('AnnotationBodyRenderer', () => {
  it('routes a Manifest body to ManifestBody', () => {
    render(<AnnotationBodyRenderer body={{ type: 'Manifest', id: 'https://x/m.json' }} {...baseProps} />);
    expect(screen.getByTestId('manifest-body')).toBeInTheDocument();
    expect(screen.queryByTestId('dataset-body')).toBeNull();
    expect(screen.queryByTestId('textual-body')).toBeNull();
  });

  it('routes a Dataset body to DatasetBody', () => {
    render(
      <AnnotationBodyRenderer
        body={{ type: 'Dataset', id: 'https://x/d.csv', format: 'text/csv' }}
        {...baseProps}
      />,
    );
    expect(screen.getByTestId('dataset-body')).toBeInTheDocument();
  });

  it('routes a TextualBody to TextualBody', () => {
    render(<AnnotationBodyRenderer body={{ type: 'TextualBody', value: 'hi' }} {...baseProps} />);
    expect(screen.getByTestId('textual-body')).toBeInTheDocument();
  });

  it('renders nothing for an unknown body type', () => {
    const unknown = { type: 'Unknown', id: 'x' } as unknown as AnnotationBody;
    const { container } = render(<AnnotationBodyRenderer body={unknown} {...baseProps} />);
    expect(container.querySelector('code')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('tolerates empty and absent bodies', () => {
    const { container, rerender } = render(<AnnotationBodyRenderer body={[]} {...baseProps} />);
    expect(container.textContent).toBe('');
    rerender(<AnnotationBodyRenderer body={undefined as never} {...baseProps} />);
    rerender(<AnnotationBodyRenderer body={[null, undefined] as never} {...baseProps} />);
    expect(container.textContent).toBe('');
  });

  it('renders the chips of one annotation as a single block without dividers', () => {
    const sr = (source: string): AnnotationBody => ({ type: 'SpecificResource', purpose: 'classifying', source });
    const { container } = render(
      <AnnotationBodyRenderer body={[sr('https://x/a'), sr('https://x/b'), sr('https://x/c')]} {...baseProps} />,
    );
    expect(container.querySelectorAll('.MuiChip-root')).toHaveLength(3);
    expect(container.querySelectorAll('hr')).toHaveLength(0);
  });

  it('renders multiple bodies with a single divider between them', () => {
    const bodies: AnnotationBody[] = [
      { type: 'Manifest', id: 'https://a/m.json' },
      { type: 'TextualBody', value: 'hi' },
    ];
    const { container } = render(<AnnotationBodyRenderer body={bodies} {...baseProps} />);
    expect(screen.getByTestId('manifest-body')).toBeInTheDocument();
    expect(screen.getByTestId('textual-body')).toBeInTheDocument();
    // One <hr> divider sits between the two bodies (index > 0).
    expect(container.querySelectorAll('hr')).toHaveLength(1);
  });

  it('forwards ruleSet to TextualBody', () => {
    render(
      <AnnotationBodyRenderer body={{ type: 'TextualBody', value: 'hi' }} ruleSet="noHtml" {...baseProps} />,
    );
    expect(screen.getByTestId('textual-body')).toHaveAttribute('data-ruleset', 'noHtml');
  });
});
