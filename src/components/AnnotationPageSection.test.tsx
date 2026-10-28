import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnnotationPageSection } from './AnnotationPageSection';

const renderSection = (props: Partial<React.ComponentProps<typeof AnnotationPageSection>> = {}) =>
  render(
    <ul>
      <AnnotationPageSection title="Analyses" count={3} collapsed={false} onToggle={() => {}} {...props}>
        <li>card</li>
      </AnnotationPageSection>
    </ul>,
  );

describe('AnnotationPageSection', () => {
  it('names its toggle after the title and count, whatever the state', () => {
    const { unmount } = renderSection();
    expect(screen.getByRole('button', { name: /Analyses.*3/ })).toHaveAttribute('aria-expanded', 'true');
    unmount();
    renderSection({ collapsed: true });
    expect(screen.getByRole('button', { name: /Analyses.*3/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows title, count and its cards while expanded', () => {
    renderSection();
    const header = screen.getByRole('button', { name: /Analyses/ });
    expect(header).toHaveTextContent('· 3');
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('card')).toBeInTheDocument();
  });

  it('hides the cards when collapsed', () => {
    renderSection({ collapsed: true });
    expect(screen.getByRole('button', { name: /Analyses/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('card')).toBeNull();
  });

  it('toggles on click and keeps keys from reaching the enclosing menu', () => {
    const onToggle = vi.fn();
    const onKeyDown = vi.fn();
    render(
      <ul onKeyDown={onKeyDown}>
        <AnnotationPageSection title="A" count={1} collapsed={false} onToggle={onToggle} />
      </ul>,
    );
    const header = screen.getByRole('button');
    fireEvent.click(header);
    expect(onToggle).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(header, { key: ' ' });
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});
