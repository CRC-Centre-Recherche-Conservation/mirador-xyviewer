import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MetadataFiltersPanel } from './MetadataFiltersPanel';
import { filtersStore } from '../state/filtersStore';

const W = 'w-panel';
const C = 'c1';
const term = (purpose: string, uri: string, label: string) => ({
  type: 'SpecificResource',
  purpose,
  source: uri,
  label: { en: [label] },
});
const link = (id: string) => ({ type: 'SpecificResource', purpose: 'linking', source: { id, type: 'Annotation' } });
const meta = (value: string) => [{ label: { en: ['Technique'] }, value: { en: [value] } }];

const annotations = [
  { id: 'char', body: [term('classifying', 'u:lapis', 'lapis lazuli'), term('assessing', 'u:high', 'High'), link('xrf')] },
  { id: 'xrf', metadata: meta('XRF') },
  { id: 'raman', metadata: meta('Raman') },
];

function renderPanel(props: Partial<React.ComponentProps<typeof MetadataFiltersPanel>> = {}) {
  filtersStore.clearFilters(W, C);
  filtersStore.initializeFromAnnotations(W, C, annotations, false, ['en'], { labels: props.labels });
  return render(<MetadataFiltersPanel windowId={W} canvasId={C} annotations={annotations} embedded {...props} />);
}

beforeEach(() => filtersStore.clearFilters(W, C));

describe('panel with body facets', () => {
  it('lists the content block before the metadata block', () => {
    renderPanel();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['From annotation content', 'From metadata']);
    const text = document.body.textContent!;
    expect(text.indexOf('Classified as')).toBeLessThan(text.indexOf('Technique'));
    expect(screen.getByText('lapis lazuli')).toBeInTheDocument();
  });

  it('shows the counts as "1 · +1 linked" and where a group applies', () => {
    renderPanel();
    expect(screen.getByText('1 · +1 linked')).toBeInTheDocument();
    expect(screen.getByText(/1 annotation \(\+1 linked\)/)).toBeInTheDocument();
  });

  it('names the group buttons, with host overrides', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Collapse Technique' })).not.toHaveAttribute('aria-expanded');
    expect(screen.getByRole('button', { name: 'Select all: Technique' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deselect all: Technique' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Technique' }));
    expect(screen.getByRole('button', { name: 'Expand Technique' })).toBeInTheDocument();
  });

  it('takes the button names from the labels', () => {
    renderPanel({ labels: { deselectAllIn: 'Tout masquer : {name}' } });
    expect(screen.getByRole('button', { name: 'Tout masquer : Technique' })).toBeInTheDocument();
  });

  it('has the switch on by default and turning it off drops the linked counts', () => {
    renderPanel();
    const toggle = screen.getByRole('switch', { name: 'Apply to linked annotations' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(filtersStore.getInheritLinked(W, C)).toBe(false);
    expect(screen.queryByText(/linked\)/)).not.toBeInTheDocument();
  });

  it('filters through the checkboxes and reports the hidden set', () => {
    let hidden = new Set<string>();
    renderPanel({ onFiltersChange: (ids) => (hidden = ids) });
    const group = screen.getByRole('checkbox', { name: /lapis lazuli/ });
    fireEvent.click(group); // uncheck lapis: the characterization and what it cites go
    expect([...hidden].sort()).toEqual(['char', 'xrf']);
    expect(screen.getByText(/^1 of 3 shown$/)).toBeInTheDocument();
  });

  it('takes the captions from the labels config', () => {
    renderPanel({
      labels: { applyToLinked: 'Include linked', filtersFromContent: 'Content', classifiedAs: 'Materials', plusLinked: '{n} more via links' },
    });
    expect(screen.getByRole('switch', { name: 'Include linked' })).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Materials')).toBeInTheDocument();
    expect(screen.getByText('1 · 1 more via links')).toBeInTheDocument();
  });

  it('folds groups of more than 8 values behind "Show N more"', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, body: [term('tagging', `u:t${i}`, `tag ${i}`)] }));
    filtersStore.clearFilters(W, C);
    filtersStore.initializeFromAnnotations(W, C, many, false, ['en']);
    render(<MetadataFiltersPanel windowId={W} canvasId={C} annotations={many} embedded />);
    expect(screen.getAllByText(/^tag \d$/)).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(screen.getAllByText(/^tag \d$/)).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.getAllByText(/^tag \d$/)).toHaveLength(8);
  });

  it('hides the switch and the headings for a metadata-only canvas', () => {
    const only = [{ id: 'm', metadata: meta('XRF') }];
    filtersStore.clearFilters(W, C);
    filtersStore.initializeFromAnnotations(W, C, only, false, ['en']);
    render(<MetadataFiltersPanel windowId={W} canvasId={C} annotations={only} embedded />);
    expect(screen.queryByRole('switch', { name: 'Apply to linked annotations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    within(document.body).getByText('Technique');
  });
});

describe('panel notifications', () => {
  it('refreshes what is hidden once per ticked value', () => {
    const events: string[] = [];
    const onFiltersChange = vi.fn();
    renderPanel({ onFiltersChange });
    const off = filtersStore.subscribe((e) => events.push(e.type));
    fireEvent.click(screen.getByRole('checkbox', { name: /Raman/ }));
    off();
    expect(events).toEqual(['update-hidden']);
    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange.mock.calls[0][0]).toEqual(filtersStore.getHiddenAnnotationIds(W, C));
  });

  it('words the empty panel from the labels', () => {
    filtersStore.clearFilters(W, C);
    render(<MetadataFiltersPanel windowId={W} canvasId={C} annotations={[]} embedded labels={{ filtersEmpty: 'Nothing to filter' }} />);
    expect(screen.getByText('Nothing to filter')).toBeInTheDocument();
  });
});
