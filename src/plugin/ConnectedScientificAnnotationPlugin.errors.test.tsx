import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScientificAnnotationPluginComponent } from './ConnectedScientificAnnotationPlugin';
import { datasetAnnotation } from '../test/fixtures/miradorState';

vi.mock('../components/AnnotationBodyRenderer', () => ({
  AnnotationBodyRenderer: ({ annotationLabel }: { annotationLabel?: unknown }) => {
    if (annotationLabel === 'boom') throw new Error('bad body');
    return <div data-testid="body-ok" />;
  },
}));
vi.mock('../components/MetadataDisplay', () => ({ MetadataDisplay: () => null }));

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe('annotation list containment', () => {
  it('shows a notice for the failing annotation and still renders the others', () => {
    const bad = { ...datasetAnnotation, id: 'bad', label: 'boom' };
    const good = { ...datasetAnnotation, id: 'good' };
    const ann = (id: string) => ({ id, content: 'x', tags: [], targetId: 't' });
    const select = vi.fn();
    const { container } = render(
      <ScientificAnnotationPluginComponent
        targetProps={{
          annotations: [ann('bad'), ann('good'), ann('plain')],
          windowId: 'w1',
          canvasId: 'c1',
          selectAnnotation: select,
          deselectAnnotation: select,
          hoverAnnotation: vi.fn(),
        } as never}
        TargetComponent={(() => null) as never}
        dispatch={vi.fn()}
        addWindow={vi.fn()}
        annotationResources={{ bad, good } as never}
      />,
    );
    expect(screen.getAllByRole('note')).toHaveLength(1);
    expect(screen.getByRole('note')).toHaveTextContent('could not be displayed');
    expect(screen.getAllByTestId('body-ok')).toHaveLength(1);
    expect(screen.getByText('x', { selector: 'li *' })).toBeInTheDocument();
    expect(container.querySelectorAll('li')).toHaveLength(3);

    // The failed item stays selectable and the list keeps keyboard handling.
    fireEvent.click(screen.getByRole('note'));
    expect(select).toHaveBeenCalledWith('w1', 'bad');
    fireEvent.keyDown(container.querySelector('ul')!, { key: 'ArrowDown' });
    expect(screen.getAllByRole('note')).toHaveLength(1);
  });
});
