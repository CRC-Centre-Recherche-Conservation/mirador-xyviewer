/**
 * Tests for the TextualBody component.
 *
 * text/plain renders as an escaped React text child; text/html goes through
 * Mirador's SanitizedHtml. jsdom never fires onerror, so assertions target the DOM.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextualBody } from './TextualBody';
import type { TextualBody as TextualBodyType } from '../types/iiif';

const PAYLOAD =
  '<img src=x onerror="window.__x=1"><b>ok</b><a href="javascript:alert(1)">l</a>';

const body = (overrides: Partial<TextualBodyType> = {}): TextualBodyType => ({
  type: 'TextualBody',
  value: 'Hello world',
  ...overrides,
});

describe('TextualBody', () => {
  describe('plain text', () => {
    it('renders plain text content', () => {
      render(<TextualBody body={body({ value: 'Hello world', format: 'text/plain' })} />);
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('renders special characters verbatim without double escaping', () => {
      const value = 'x "S" l\'eau a/b <5>';
      const { container } = render(<TextualBody body={body({ value, format: 'text/plain' })} />);
      expect(container.textContent).toBe(value);
    });

    it('shows markup as text and creates no elements', () => {
      const value = 'Hello <script>alert(1)</script> world';
      const { container } = render(<TextualBody body={body({ value })} />);
      expect(container.querySelector('script')).toBeNull();
      expect(container.textContent).toBe(value);
    });

    it('applies the language attribute', () => {
      render(<TextualBody body={body({ value: 'Bonjour', language: 'fr' })} />);
      expect(screen.getByText('Bonjour')).toHaveAttribute('lang', 'fr');
    });
  });

  describe('text/html', () => {
    it('renders a safe tag', () => {
      const { container } = render(
        <TextualBody body={body({ value: '<b>Bold</b>', format: 'text/html' })} />,
      );
      expect(container.querySelector('b')!.textContent).toBe('Bold');
    });

    it('strips handlers and javascript: hrefs but keeps safe markup', () => {
      const { container } = render(
        <TextualBody body={body({ value: PAYLOAD, format: 'text/html' })} />,
      );
      expect(container.querySelector('[onerror]')).toBeNull();
      expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
      expect(container.querySelector('b')!.textContent).toBe('ok');
    });

    it('strips a script tag but keeps surrounding safe content', () => {
      const { container } = render(
        <TextualBody
          body={body({ value: '<b>ok</b><script>alert(1)</script>', format: 'text/html' })}
        />,
      );
      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('b')!.textContent).toBe('ok');
    });

    it('keeps only text with the noHtml rule set', () => {
      const { container } = render(
        <TextualBody body={body({ value: PAYLOAD, format: 'text/html' })} ruleSet="noHtml" />,
      );
      expect(container.querySelector('img, b, a')).toBeNull();
      expect(container.textContent).toContain('ok');
    });
  });
});
