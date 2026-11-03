import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ClassificationCard } from './ClassificationCard';
import { ChipRow } from './ChipRow';
import type { IIIFAnnotation } from '../types/iiif';
import page from '../test/fixtures/annotations/v3-characterization-materials-page.json';

vi.mock('mirador', () => ({
  SanitizedHtml: ({ htmlString }: { htmlString: string }) => <span>{htmlString}</span>,
}));

const [lapis, redLead] = page.items as unknown as IIIFAnnotation[];

describe('ClassificationCard', () => {
  it('collapsed: kicker, title and prose only', () => {
    render(<ClassificationCard annotation={lapis} />);
    expect(screen.getByText('Classification')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'lapis lazuli, lead white' })).toBeInTheDocument();
    expect(screen.getByText(/^lapis lazuli \(Highly reliable\)/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Classified as' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Open report/ })).toBeNull();
  });

  it('expanded: plain group captions, overall assessment, no jargon, report link', () => {
    render(<ClassificationCard annotation={lapis} isSelected />);
    for (const caption of ['Classified as', 'Overall assessment (see text)', 'Description']) {
      expect(screen.getByRole('group', { name: caption })).toBeInTheDocument();
    }
    expect(screen.queryByText('classifying')).toBeNull();
    expect(screen.queryByText('assessing')).toBeNull();
    expect(screen.getByRole('group', { name: 'Linked annotations' })).toHaveTextContent('Linked annotations · 5');
    expect(screen.getAllByRole('button', { name: /Select linked annotation/ })).toHaveLength(5);
    const report = screen.getByRole('link', { name: /Open report/ });
    expect(report).toHaveAttribute('href', expect.stringContaining('/report/139239ab'));
    expect(report).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('shows the link count as an icon with an accessible name, overridable', () => {
    const { unmount } = render(<ClassificationCard annotation={lapis} />);
    const badge = screen.getByRole('img', { name: '5 linked annotations' });
    expect(badge).toHaveTextContent('5');
    expect(badge.textContent).not.toContain('⌖');
    unmount();
    render(<ClassificationCard annotation={lapis} labels={{ linkCount: '{n} liées' }} />);
    expect(screen.getByRole('img', { name: '5 liées' })).toBeInTheDocument();
  });

  it('expanded: a single class is shown paired, the text goes under the disclosure', () => {
    render(<ClassificationCard annotation={redLead} isSelected />);
    const row = screen.getByRole('button', { name: 'red lead' }).closest('li')!;
    expect(within(row).getByText('Highly reliable')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /assessment/i })).toBeNull();
    expect(screen.getByText('Full statement')).toBeInTheDocument();
  });

  it('captions are overridable through labels', () => {
    render(
      <ClassificationCard
        annotation={lapis}
        isSelected
        labels={{ classification: 'Pigments', classifiedAs: 'Materials', linkedAnnotations: 'Evidence', purposes: { describing: 'Details' } }}
      />,
    );
    expect(screen.getByText('Pigments')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Materials' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Details' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Evidence' })).toBeInTheDocument();
  });

  it('a chip opens a menu with a vocabulary link and does not leave the page', () => {
    const outer = vi.fn();
    render(
      <div onClick={outer}>
        <ClassificationCard annotation={lapis} isSelected />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'lapis lazuli' }));
    const link = screen.getByRole('menuitem', { name: /Open in vocabulary/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('thesaurus.inha.fr'));
    expect(outer).not.toHaveBeenCalled();
  });

  describe('card menu', () => {
    beforeEach(() => {
      Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    });

    it('copies the id and opens the JSON; the id is not shown inline', () => {
      render(<ClassificationCard annotation={lapis} />);
      expect(screen.queryByText(lapis.id)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Annotation actions' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Copy annotation id' }));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(lapis.id);
      fireEvent.click(screen.getByRole('button', { name: 'Annotation actions' }));
      expect(screen.getByRole('menuitem', { name: /Open JSON/ })).toHaveAttribute('href', lapis.id);
    });

    it("showAnnotationId 'inline' keeps the id visible", () => {
      render(<ClassificationCard annotation={lapis} showAnnotationId="inline" />);
      expect(screen.getByRole('link', { name: lapis.id })).toBeInTheDocument();
    });

    it('lists machine-readable seeAlso links', () => {
      const a = { ...lapis, seeAlso: [{ id: 'https://x.org/data.json', type: 'Dataset', format: 'application/json' }] } as IIIFAnnotation;
      render(<ClassificationCard annotation={a} />);
      fireEvent.click(screen.getByRole('button', { name: 'Annotation actions' }));
      expect(screen.getByRole('menuitem', { name: /Dataset/ })).toHaveAttribute('href', 'https://x.org/data.json');
    });
  });
});

describe('ChipRow', () => {
  const terms = Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, label: `Term ${i}`, uri: '' }));

  it('shows everything when it fits', () => {
    render(<ChipRow terms={terms} />);
    expect(screen.getByText('Term 5')).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d/)).toBeNull();
  });

  it('keeps two lines then "+N", which reveals the rest', () => {
    // Two chips per line.
    const spy = vi
      .spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockImplementation(function (this: HTMLElement) {
        const i = Number(this.textContent?.match(/Term (\d)/)?.[1] ?? 0);
        return Math.floor(i / 2) * 20;
      });
    render(<ChipRow terms={terms} />);
    expect(screen.queryByText('Term 4')).toBeNull();
    expect(screen.getByText('Term 2')).toBeInTheDocument();
    fireEvent.click(screen.getByText('+3'));
    expect(screen.getByText('Term 5')).toBeInTheDocument();
    spy.mockRestore();
  });
});
