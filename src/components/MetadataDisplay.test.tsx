/**
 * Tests for the MetadataDisplay component (Pattern B).
 *
 * Covers: empty -> renders nothing, localized label, annotation-URI link
 * (valid vs non-URL), metadata dt/dd pairs, a metadata value containing a URL
 * rendered as a link, and the seeAlso variants (string id, object id with
 * url_label, and the missing-url skip path).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetadataDisplay } from './MetadataDisplay';
import type { MetadataEntry, SeeAlsoEntry } from '../types/iiif';

// IIIF LocalizedString; 'none' is in the default preferred-language list, so
// getLocalizedString returns the value as-is.
const loc = (s: string) => ({ none: [s] });

describe('MetadataDisplay', () => {
  it('renders nothing when there is no content', () => {
    const { container } = render(<MetadataDisplay />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the localized label', () => {
    render(<MetadataDisplay label={loc('My Annotation')} />);
    expect(screen.getByText('My Annotation')).toBeInTheDocument();
  });

  it('renders the annotation URI as a link when it is a valid URL', () => {
    render(<MetadataDisplay annotationId="https://example.org/anno/1" />);
    expect(screen.getByRole('link', { name: 'https://example.org/anno/1' })).toHaveAttribute(
      'href',
      'https://example.org/anno/1',
    );
  });

  it('does not render the annotation URI when it is not a URL', () => {
    render(<MetadataDisplay annotationId="not-a-url" />);
    expect(screen.queryByText('not-a-url')).toBeNull();
  });

  it('renders metadata entries as label/value pairs', () => {
    const metadata: MetadataEntry[] = [{ label: loc('Technique'), value: loc('XRF') }];
    render(<MetadataDisplay metadata={metadata} />);
    expect(screen.getByText(/Technique/)).toBeInTheDocument();
    expect(screen.getByText('XRF')).toBeInTheDocument();
  });

  it('renders a metadata value containing a URL as a link', () => {
    const metadata: MetadataEntry[] = [
      { label: loc('Source'), value: loc('Dataset (https://example.org/d.csv)') },
    ];
    render(<MetadataDisplay metadata={metadata} />);
    expect(screen.getByRole('link', { name: 'Dataset' })).toHaveAttribute(
      'href',
      'https://example.org/d.csv',
    );
  });

  describe('seeAlso', () => {
    it('renders a string-id reference as a link', () => {
      const seeAlso: SeeAlsoEntry = { id: 'https://example.org/see', type: 'Dataset' };
      render(<MetadataDisplay seeAlso={seeAlso} />);
      expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.org/see');
    });

    it('prefers url_label for an object id', () => {
      const seeAlso: SeeAlsoEntry = { id: { url: 'https://example.org/x', url_label: 'Open dataset' } };
      render(<MetadataDisplay seeAlso={seeAlso} />);
      expect(screen.getByRole('link', { name: 'Open dataset' })).toHaveAttribute(
        'href',
        'https://example.org/x',
      );
    });

    it('skips a reference that has no URL', () => {
      const seeAlso = { type: 'Dataset' } as unknown as SeeAlsoEntry;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<MetadataDisplay seeAlso={seeAlso} />);
      expect(screen.queryByRole('link')).toBeNull();
      warn.mockRestore();
    });
  });
});
