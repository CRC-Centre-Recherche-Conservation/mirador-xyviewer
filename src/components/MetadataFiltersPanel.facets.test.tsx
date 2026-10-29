import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
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
  it('lists the content block before the metadata block, without headings', () => {
    renderPanel();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    const text = document.body.textContent!;
    expect(text.indexOf('Classified as')).toBeLessThan(text.indexOf('Technique'));
    expect(screen.getByText('lapis lazuli')).toBeInTheDocument();
  });

  it('merges the counts of a value (carrying + cited) into one number', () => {
    renderPanel();
    const row = screen.getByRole('checkbox', { name: /lapis lazuli/ }).closest('div')!.parentElement!;
    expect(row).toHaveTextContent('2 annotations');
    expect(screen.queryByText(/linked/)).not.toBeInTheDocument();
  });

  it('names the group toggle and its master checkbox, with host overrides', () => {
    renderPanel();
    const toggle = screen.getByRole('button', { name: 'Collapse Technique' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('checkbox', { name: 'All values of Technique' })).toBeChecked();
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Expand Technique' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('takes the button names from the labels', () => {
    renderPanel({ labels: { allValuesIn: 'Tout : {name}', onlyTerm: 'Seulement {term}' } });
    expect(screen.getByRole('checkbox', { name: 'Tout : Technique' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seulement Raman' })).toBeInTheDocument();
  });

  it('has no reader control for linked annotations; the host option drives it', () => {
    renderPanel();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(filtersStore.getInheritLinked(W, C)).toBe(true);
    filtersStore.clearFilters(W, C);
    filtersStore.initializeFromAnnotations(W, C, annotations, false, ['en'], { extendToLinked: false });
    expect(filtersStore.getInheritLinked(W, C)).toBe(false);
  });

  it('filters through the checkboxes and reports the hidden set', () => {
    let hidden = new Set<string>();
    renderPanel({ onFiltersChange: (ids) => (hidden = ids) });
    fireEvent.click(screen.getByRole('checkbox', { name: /lapis lazuli/ })); // the characterization and what it cites go
    expect([...hidden].sort()).toEqual(['char', 'xrf']);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 3 annotations');
  });

  it('shows visible/total and a partial caption under a filter', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('checkbox', { name: /lapis lazuli/ }));
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getAllByText(/^\d\/\d$/).length).toBeGreaterThan(0);
  });

  it('cycles the master checkbox through its three states', () => {
    renderPanel();
    const master = screen.getByRole('checkbox', { name: 'All values of Technique' }) as HTMLInputElement;
    expect(master.checked).toBe(true);
    fireEvent.click(master); // all -> none
    expect(master.checked).toBe(false);
    expect(master.indeterminate).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: /Raman/ })); // one back
    expect(master.indeterminate).toBe(true);
    fireEvent.click(master); // some -> all
    expect(master.checked).toBe(true);
  });

  it('keeps only one value with "Only" and restores the group on a second click', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Only Raman' }));
    expect(screen.getByRole('checkbox', { name: /Raman/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /XRF/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Only Raman' }));
    expect(screen.getByRole('checkbox', { name: /XRF/ })).toBeChecked();
  });

  it('names the absence checkbox "Not specified" and describes it with the hint', () => {
    renderPanel();
    const none = screen.getAllByRole('checkbox', { name: 'Not specified' })[0];
    expect(none).toBeInTheDocument();
    // MUI wires the tooltip title as the description of the label, not of the name.
    const labelEl = screen.getAllByText('Not specified')[0];
    expect(labelEl.getAttribute('aria-describedby') ?? labelEl.parentElement?.getAttribute('aria-describedby') ?? labelEl.getAttribute('title') ?? '').not.toBe('');
    expect(labelEl).not.toHaveAttribute('aria-label');
  });

  it('shows the host wording on the "Only" button, matching its accessible name', () => {
    renderPanel({ labels: { only: 'Seulement', onlyTerm: 'Seulement {term}' } });
    const btn = screen.getByRole('button', { name: 'Seulement Raman' });
    expect(btn).toHaveTextContent('Seulement');
  });

  it('puts "Only" right after the value checkbox in the tab order and omits it for a single value', () => {
    renderPanel();
    const raman = screen.getByRole('checkbox', { name: /Raman/ });
    const only = screen.getByRole('button', { name: 'Only Raman' });
    const tabbables = Array.from(document.querySelectorAll<HTMLElement>('input, button')).filter((e) => e.tabIndex >= 0);
    expect(tabbables[tabbables.indexOf(raman) + 1]).toBe(only);
    cleanup();
    const single = [{ id: 's', metadata: meta('XRF') }];
    filtersStore.clearFilters(W, C);
    filtersStore.initializeFromAnnotations(W, C, single, false, ['en']);
    render(<MetadataFiltersPanel windowId={W} canvasId={C} annotations={single} embedded />);
    expect(screen.queryByRole('button', { name: /^Only/ })).not.toBeInTheDocument();
  });

  it('follows the store when the canvas changes, without leaking the previous state', () => {
    const big = (n: number, p: string) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, body: [term('tagging', `u:${p}${i}`, `${p} ${i}`)] }));
    const c1 = [...big(14, 'a'), ...['A', 'B', 'C', 'D', 'E'].map((v) => ({ id: `m${v}`, metadata: meta(v) }))];
    const c2 = [...big(3, 'b'), { id: 'm2', metadata: meta('Raman') }];
    for (const [c, an] of [['c1', c1], ['c2', c2]] as const) {
      filtersStore.clearFilters(W, c);
      filtersStore.initializeFromAnnotations(W, c, an, false, ['en']);
    }
    const { rerender } = render(<MetadataFiltersPanel key="c1" windowId={W} canvasId="c1" annotations={c1} embedded />);
    expect(screen.getByRole('button', { name: 'Collapse Tags' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand Technique' })).toBeInTheDocument();
    rerender(<MetadataFiltersPanel key="c2" windowId={W} canvasId="c2" annotations={c2} embedded />);
    expect(screen.getByRole('button', { name: 'Collapse Tags' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse Technique' })).toBeInTheDocument();
    filtersStore.clearFilters(W, 'c1');
    filtersStore.clearFilters(W, 'c2');
  });

  it('takes the captions from the labels config', () => {
    renderPanel({ labels: { classifiedAs: 'Materials', filterNone: 'Unknown' } });
    expect(screen.getByText('Materials')).toBeInTheDocument();
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
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

  it('unfolds groups while their values fit the budget of 12', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ id: `a${i}`, body: [term('tagging', `u:t${i}`, `tag ${i}`)] }));
    const mixed = [...many, ...['A', 'B', 'C', 'D', 'E'].map((v) => ({ id: `m${v}`, metadata: meta(v) }))];
    filtersStore.clearFilters(W, C);
    filtersStore.initializeFromAnnotations(W, C, mixed, false, ['en']);
    const groups = filtersStore.getGroups(W, C);
    // The first group always unfolds, even above the budget; the next one does not fit.
    expect(groups.find((g) => g.kind === 'body')!.expanded).toBe(true);
    expect(groups.find((g) => g.kind === 'metadata')!.expanded).toBe(false);
  });

  it('counts the rows shown, "Not specified" included, against the budget', () => {
    const set = (prefix: string, purpose: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, body: [term(purpose, `u:${prefix}${i}`, `${prefix} ${i}`)] }));
    // 5 + 5 + 3 values; every body group inherits, so each gets "Not specified" (+1 row).
    const three = [...set('c', 'classifying', 5), ...set('i', 'identifying', 5), ...set('t', 'tagging', 3)];
    filtersStore.clearFilters(W, C);
    filtersStore.initializeFromAnnotations(W, C, three, false, ['en']);
    const flags = filtersStore.getGroups(W, C).map((g) => `${g.purpose}:${g.expanded}`);
    expect(flags).toEqual(['classifying:true', 'identifying:true', 'tagging:false']);
  });

  it('shows no heading for a metadata-only canvas', () => {
    const only = [{ id: 'm', metadata: meta('XRF') }];
    filtersStore.clearFilters(W, C);
    filtersStore.initializeFromAnnotations(W, C, only, false, ['en']);
    render(<MetadataFiltersPanel windowId={W} canvasId={C} annotations={only} embedded />);
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
