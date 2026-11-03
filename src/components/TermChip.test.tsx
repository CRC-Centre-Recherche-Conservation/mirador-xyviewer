import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TermChip } from './TermChip';
import { TermActionsContext } from './TermActionsContext';

const term = { key: 'u:lapis', label: 'lapis lazuli', uri: 'https://example.org/lapis' };

describe('TermChip facet entries', () => {
  it('adds the context entries before the vocabulary link and marks an active filter', async () => {
    const onClick = vi.fn();
    render(
      <TermActionsContext.Provider
        value={{
          actionsFor: () => [{ key: 'filter', label: 'Filter by lapis lazuli', onClick }],
          isFiltering: () => true,
        }}
      >
        <TermChip term={term} facet={{ purpose: 'classifying' }} />
      </TermActionsContext.Provider>,
    );
    expect(screen.getByTestId('FilterAltIcon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'lapis lazuli (filter active)' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('lapis lazuli'));
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent?.trim());
    expect(items).toEqual(['Filter by lapis lazuli', 'Open in vocabulary']);
    fireEvent.click(screen.getByText('Filter by lapis lazuli'));
    // Run once the menu has closed.
    await waitFor(() => expect(onClick).toHaveBeenCalledWith(term));
  });

  it('ignores the facet without a provider', () => {
    render(<TermChip term={{ key: 'x', label: 'free text', uri: '' }} facet={{ purpose: 'classifying' }} />);
    expect(screen.queryByTestId('FilterAltIcon')).not.toBeInTheDocument();
    expect(screen.getByText('free text').closest('[role="button"]')).toBeNull();
  });
});
