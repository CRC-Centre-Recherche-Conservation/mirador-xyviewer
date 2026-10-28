import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AnnotationSignIn } from './AnnotationSignIn';
import { configureAnnotationAuth } from '../services/annotationAuth';

afterEach(() => configureAnnotationAuth(undefined));

describe('AnnotationSignIn', () => {
  it('runs the registered sign-in for its page on click, then re-enables', async () => {
    let finish!: () => void;
    const signIn = vi.fn(() => new Promise<void>((r) => (finish = r)));
    configureAnnotationAuth({ canSignIn: () => true, signIn });
    const page = { id: 'https://iiif.example.org/p.json', service: {} };
    render(<AnnotationSignIn page={page} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(signIn).toHaveBeenCalledWith(page);
    expect(screen.getByRole('button')).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
  });

  it('does not throw when sign-in rejects', async () => {
    configureAnnotationAuth({ canSignIn: () => true, signIn: () => Promise.reject(new Error('x')) });
    render(<AnnotationSignIn page={{ id: 'p' }} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
  });
});
