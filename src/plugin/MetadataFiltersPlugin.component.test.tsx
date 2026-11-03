import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MetadataFiltersPluginComponent } from './MetadataFiltersPlugin';
import { filtersStore } from '../state/filtersStore';

const meta = (value: string) => [{ label: { en: ['Type'] }, value: { en: [value] } }];
const annos = (...ids: string[]) =>
  Object.fromEntries(ids.map((id, i) => [id, { id, type: 'Annotation', metadata: meta(i % 2 ? 'b' : 'a') }]));

describe('MetadataFiltersPluginComponent hidden count', () => {
  beforeEach(() => filtersStore.clearWindow('w1'));

  it('keeps the hidden count when returning to an already-filtered canvas (A -> B -> A)', () => {
    const resA = annos('a1', 'a2', 'a3');
    const resB = annos('b1');
    const ui = (canvasId: string, resources: object) => (
      <MetadataFiltersPluginComponent
        windowId="w1"
        canvasId={canvasId}
        annotationResources={resources as never}
      />
    );

    const { rerender } = render(ui('A', resA));
    act(() => {
      const [group] = filtersStore.getGroups('w1', 'A');
      filtersStore.deselectAll('w1', 'A', group.key);
      filtersStore.updateHiddenAnnotations('w1', 'A', Object.values(resA) as never);
    });
    const badge = () => document.querySelector('.MuiBadge-badge:not(.MuiBadge-invisible)')?.textContent;
    const hiddenA = filtersStore.getHiddenAnnotationIds('w1', 'A').size;
    expect(hiddenA).toBeGreaterThan(0);
    expect(badge()).toBe(String(hiddenA));

    rerender(ui('B', resB));
    expect(badge()).toBeUndefined();

    rerender(ui('A', resA));
    expect(badge()).toBe(String(hiddenA));
    expect(screen.getByRole('button', { name: /^Filter annotations/ })).toBeTruthy();
  });
});

describe('MetadataFiltersPluginComponent filter button', () => {
  beforeEach(() => filtersStore.clearWindow('w2'));

  it('stays disabled when the host hid every group the canvas has', () => {
    render(
      <MetadataFiltersPluginComponent
        windowId="w2"
        canvasId="A"
        annotationResources={annos('a1') as never}
        hiddenFilterGroups={['Type']}
      />,
    );
    expect(screen.getByRole('button', { name: /^Filter annotations/ })).toBeDisabled();
  });

  it('is enabled when a group remains', () => {
    render(<MetadataFiltersPluginComponent windowId="w2" canvasId="A" annotationResources={annos('a1') as never} />);
    expect(screen.getByRole('button', { name: /^Filter annotations/ })).toBeEnabled();
  });
});
