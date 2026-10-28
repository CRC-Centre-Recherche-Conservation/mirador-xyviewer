import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary, ErrorNotice, DEFAULT_ERROR_NOTICE } from './ErrorBoundary';

const Boom = ({ when = true }: { when?: boolean }) => {
  if (when) throw new Error('secret producer value');
  return <div>fine</div>;
};

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><Boom when={false} /></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeInTheDocument();
  });

  it('renders the fallback and keeps siblings', () => {
    render(
      <div>
        <span>sibling</span>
        <ErrorBoundary fallback={<ErrorNotice />}><Boom /></ErrorBoundary>
      </div>,
    );
    expect(screen.getByText('sibling')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(DEFAULT_ERROR_NOTICE);
  });

  it('renders nothing without a fallback', () => {
    const { container } = render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(container).toBeEmptyDOMElement();
  });

  it('library log line has the prefix and no error message (React logs the caught error itself)', () => {
    render(<ErrorBoundary label="x"><Boom /></ErrorBoundary>);
    const calls = errSpy.mock.calls.filter((c: unknown[]) => String(c[0]).startsWith('[mirador-xyviewer]'));
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0])).not.toContain('secret producer value');
  });

  it('resets when resetKey changes', () => {
    const { rerender } = render(<ErrorBoundary resetKey="a" fallback="failed"><Boom /></ErrorBoundary>);
    expect(screen.getByText('failed')).toBeInTheDocument();
    rerender(<ErrorBoundary resetKey="a" fallback="failed"><Boom when={false} /></ErrorBoundary>);
    expect(screen.getByText('failed')).toBeInTheDocument();
    rerender(<ErrorBoundary resetKey="b" fallback="failed"><Boom when={false} /></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});
