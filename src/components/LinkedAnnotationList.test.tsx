import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LinkedAnnotationList } from './LinkedAnnotationList';
import { CitedBy } from './CitedBy';
import { EvidenceLinkBody } from './EvidenceLinkBody';
import { LinkContext, type LinkContextValue } from './LinkContext';
import { EMPTY_LINK_INDEX, getLinkIndex } from '../utils/linkIndex';
import type { IIIFAnnotation, SpecificResourceBody } from '../types/iiif';
import type { MiradorState } from '../types/mirador';

const link = (id: string, extra: Record<string, unknown> = {}) =>
  ({ type: 'SpecificResource', purpose: 'linking', source: { id, type: 'Annotation', ...extra } }) as SpecificResourceBody;

const ann = (id: string, label: string, links: string[] = []): IIIFAnnotation =>
  ({
    id,
    type: 'Annotation',
    label: { en: [label] },
    metadata: [{ label: { en: ['Technique'] }, value: { en: ['pXRF'] } }],
    body: links.map((l) => link(l)),
    target: 'c1',
  }) as unknown as IIIFAnnotation;

function contextFor(items: IIIFAnnotation[], over: Partial<LinkContextValue> = {}): LinkContextValue {
  const state = {
    windows: { w1: { id: 'w1', canvasId: 'c1' } },
    manifests: {},
    annotations: { c1: { l: { json: { type: 'AnnotationPage', items } } } },
  } as unknown as MiradorState;
  return {
    windowId: 'w1',
    canvasId: 'c1',
    index: getLinkIndex(state, 'w1'),
    canvasAnnotationIds: items.map((i) => i.id),
    hiddenIds: new Set(),
    subtitleLabel: 'Technique',
    hover: vi.fn(),
    groupOf: (id) => [id],
    follow: vi.fn(),
    showAll: vi.fn(),
    titleOf: (id) => id,
    ...over,
  };
}

const items = [ann('a', 'Alpha', ['b', 'c']), ann('b', 'Beta'), ann('c', 'Gamma')];

describe('LinkedAnnotationList', () => {
  it('follows a row from its owner and frames all zones on demand', () => {
    const ctx = contextFor(items);
    render(
      <LinkContext.Provider value={ctx}>
        <LinkedAnnotationList bodies={[link('b'), link('c')]} ownerId="a" />
      </LinkContext.Provider>,
    );
    expect(screen.getByRole('group', { name: 'Linked annotations' })).toHaveTextContent('Linked annotations · 2');
    fireEvent.click(screen.getByRole('button', { name: /linked annotation 1 of 2: Beta, pXRF, on this page/ }));
    expect(ctx.follow).toHaveBeenCalledWith('a', { annotationId: 'b', canvasId: 'c1' });
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(ctx.showAll).toHaveBeenCalledWith('a');
  });

  it('highlights only the target on hover and focus, and restores the owner group on leave', () => {
    const ctx = contextFor(items, { groupOf: (id) => [id, 'b', 'c'] });
    render(
      <LinkContext.Provider value={ctx}>
        <LinkedAnnotationList bodies={[link('b')]} ownerId="a" />
      </LinkContext.Provider>,
    );
    const row = screen.getByRole('button', { name: /Beta/ });
    fireEvent.mouseEnter(row);
    expect(ctx.hover).toHaveBeenLastCalledWith(['b']);
    fireEvent.mouseLeave(row);
    expect(ctx.hover).toHaveBeenLastCalledWith(['a', 'b', 'c']);
    fireEvent.focus(row);
    expect(ctx.hover).toHaveBeenLastCalledWith(['b']);
  });

  it('dims a row hidden by a filter, labels it, and keeps it clickable', () => {
    const ctx = contextFor(items, { hiddenIds: new Set(['b']) });
    render(
      <LinkContext.Provider value={ctx}>
        <LinkedAnnotationList bodies={[link('b')]} ownerId="a" />
      </LinkContext.Provider>,
    );
    const row = screen.getByRole('button', { name: /Beta.*\(hidden by filter\)/ });
    expect(row).not.toHaveAttribute('aria-disabled');
    fireEvent.click(row);
    expect(ctx.follow).toHaveBeenCalled();
  });

  it('keeps an unavailable row focusable, announces the reason and does nothing on click', () => {
    const ctx = contextFor(items);
    render(
      <LinkContext.Provider value={ctx}>
        <LinkedAnnotationList bodies={[link('https://x.org/annotation/gone-0000')]} ownerId="a" />
      </LinkContext.Provider>,
    );
    const row = screen.getByRole('button', { name: /Not available in this viewer/ });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByText('Not available in this viewer').length).toBeGreaterThan(0);
    fireEvent.click(row);
    expect(ctx.follow).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
  });

  it('opens a non-annotation link as an external link', () => {
    render(
      <LinkContext.Provider value={contextFor(items)}>
        <LinkedAnnotationList
          bodies={[{ type: 'SpecificResource', purpose: 'linking', source: { id: 'https://example.org/r', type: 'Text', label: { en: ['Report'] } } } as SpecificResourceBody]}
          ownerId="a"
        />
      </LinkContext.Provider>,
    );
    const a = screen.getByRole('link', { name: /Report/ });
    expect(a).toHaveAttribute('href', 'https://example.org/r');
    expect(a).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('shows the label of the body when the target is unknown, in the labels of the host', () => {
    render(
      <LinkedAnnotationList
        bodies={[link('zz', { label: { en: ['Hinted'] } })]}
        labels={{ linkedAnnotations: 'Evidence', linkUnavailable: 'Elsewhere' }}
      />,
    );
    expect(screen.getByRole('group', { name: 'Evidence' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hinted, Elsewhere/ })).toBeInTheDocument();
  });
});

describe('EvidenceLinkBody (deprecated wrapper)', () => {
  it('still selects the linked annotation of the canvas', () => {
    const select = vi.fn();
    render(<EvidenceLinkBody bodies={[link('b')]} windowId="w1" selectAnnotation={select} canvasAnnotationIds={['b#target-0']} />);
    fireEvent.click(screen.getByRole('button', { name: /Select linked annotation 1 of 1/ }));
    expect(select).toHaveBeenCalledWith('w1', 'b#target-0');
  });
});

describe('CitedBy', () => {
  const many = [
    ann('t', 'Target'),
    ...['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => ann(id, id.toUpperCase(), ['t'])),
  ];

  it('renders nothing for an annotation nobody cites or without a context', () => {
    const { container } = render(
      <LinkContext.Provider value={contextFor(many)}>
        <CitedBy annotationId="p1" />
      </LinkContext.Provider>,
    );
    expect(container).toBeEmptyDOMElement();
    const bare = render(<CitedBy annotationId="t" />);
    expect(bare.container).toBeEmptyDOMElement();
    expect(EMPTY_LINK_INDEX.inverse.size).toBe(0);
  });

  it('lists three citing annotations, then +N, and follows one from the cited annotation', () => {
    const ctx = contextFor(many, { titleOf: (id) => id.toUpperCase() });
    render(
      <LinkContext.Provider value={ctx}>
        <CitedBy annotationId="t" labels={{ citedBy: 'Cité par' }} />
      </LinkContext.Provider>,
    );
    expect(screen.getByRole('group', { name: 'Cité par' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'P3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'P4' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '+2' }));
    expect(screen.getByRole('button', { name: 'P5' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'P2' }));
    expect(ctx.follow).toHaveBeenCalledWith('t', { annotationId: 'p2', canvasId: 'c1' });
  });
});
