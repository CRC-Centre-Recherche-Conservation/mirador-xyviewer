/**
 * Tests for the TextualBody component (Pattern B).
 *
 * Covers the two render paths: plain text (tags stripped + HTML-escaped via
 * sanitizeText) and text/html (sanitized via sanitizeHtml + dangerouslySetInnerHTML).
 * Includes XSS-strip regressions and the language-attribute passthrough.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextualBody } from './TextualBody';
import type { TextualBody as TextualBodyType } from '../types/iiif';

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

    it('strips HTML tags from plain text (default format)', () => {
      render(<TextualBody body={body({ value: 'Hello <b>bold</b>' })} />);
      // Tags removed by sanitizeText, so the text is the tag-stripped string.
      expect(screen.getByText('Hello bold')).toBeInTheDocument();
    });

    it('neutralizes a script tag in plain-text mode', () => {
      // Regression: a <script> body must never produce a <script> element.
      const { container } = render(
        <TextualBody body={body({ value: 'Hello <script>alert(1)</script> world' })} />,
      );
      expect(container.querySelector('script')).toBeNull();
      expect(screen.getByText('Hello alert(1) world')).toBeInTheDocument();
    });

    it('applies the language attribute', () => {
      render(<TextualBody body={body({ value: 'Bonjour', language: 'fr' })} />);
      expect(screen.getByText('Bonjour')).toHaveAttribute('lang', 'fr');
    });
  });

  describe('text/html', () => {
    it('renders a sanitized safe tag', () => {
      const { container } = render(
        <TextualBody body={body({ value: '<strong>Bold</strong>', format: 'text/html' })} />,
      );
      const strong = container.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong!.textContent).toBe('Bold');
    });

    it('strips a script tag but keeps surrounding safe content', () => {
      // Regression: sanitizeHtml drops <script> while preserving allowed markup.
      const { container } = render(
        <TextualBody
          body={body({ value: '<strong>ok</strong><script>alert(1)</script>', format: 'text/html' })}
        />,
      );
      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('strong')!.textContent).toBe('ok');
    });
  });
});
