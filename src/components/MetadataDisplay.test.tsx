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

  describe('HTML values (IIIF Presentation 3 section 4.5)', () => {
    const one = (v: string) => [{ label: loc('Technique'), value: loc(v) }] as MetadataEntry[];

    it('renders <a href> as a link that opens safely in a new tab', () => {
      render(<MetadataDisplay metadata={one('<a href="https://x/c">Raman</a>')} />);
      const link = screen.getByRole('link', { name: 'Raman' });
      expect(link).toHaveAttribute('href', 'https://x/c');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('strips scripts, event handlers and javascript: hrefs', () => {
      const { container } = render(
        <MetadataDisplay
          metadata={one('<script>alert(1)</script><a href="javascript:alert(2)" onclick="x()">Bad</a> <b onclick="y()">ok</b>')}
        />,
      );
      expect(container.querySelector('script')).toBeNull();
      expect(container.innerHTML).not.toMatch(/onclick|javascript:/i);
      expect(screen.getByText('ok')).toBeInTheDocument();
    });

    it('keeps the legacy "Label (url)" convention and plain text', () => {
      render(
        <MetadataDisplay
          metadata={[
            { label: loc('Technique'), value: loc('Raman (https://x/c)') },
            { label: loc('Operator'), value: loc('Jane') },
          ]}
        />,
      );
      expect(screen.getByRole('link', { name: 'Raman' })).toHaveAttribute('href', 'https://x/c');
      expect(screen.getByText('Jane')).toBeInTheDocument();
    });
  });

  describe('seeAlso', () => {
    it('renders no anchor for a javascript: URL', () => {
      const { container } = render(
        <MetadataDisplay seeAlso={{ id: 'javascript:alert(1)', type: 'Dataset' }} />,
      );
      expect(container.querySelector('a')).toBeNull();
    });

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

describe('MetadataDisplay hiddenSeeAlsoIds', () => {
  it('hides only the listed seeAlso entries', () => {
    render(
      <MetadataDisplay
        seeAlso={[
          { id: 'https://h.example/raw', label: { en: ['Raw'] } },
          { id: 'https://h.example/other', label: { en: ['Other'] } },
        ]}
        hiddenSeeAlsoIds={new Set(['https://h.example/raw'])}
      />,
    );
    expect(screen.queryByText('Raw')).toBeNull();
    expect(screen.getByText('Other')).toBeTruthy();
  });
});

describe('MetadataDisplay homepage and rendering', () => {
  const home = { id: 'https://h.example/report', type: 'Text', label: { en: ['Report'] } };
  const rend = { id: 'https://h.example/raw', type: 'Dataset', label: { en: ['Raw file'] } };
  const see = { id: 'https://h.example/see', label: { en: ['See'] } };

  it('lists homepage and rendering links with safe attributes', () => {
    render(<MetadataDisplay homepage={[home]} rendering={rend} />);
    const report = screen.getByRole('link', { name: 'Report' });
    expect(report).toHaveAttribute('href', 'https://h.example/report');
    expect(report).toHaveAttribute('target', '_blank');
    expect(report).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Raw file' })).toHaveAttribute('href', 'https://h.example/raw');
  });

  it('orders homepage, rendering, then seeAlso', () => {
    render(<MetadataDisplay seeAlso={see} rendering={rend} homepage={home} />);
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Report', 'Raw file', 'See']);
  });

  it('dedupes by URL across lists, first wins', () => {
    render(
      <MetadataDisplay
        homepage={{ id: 'https://h.example/raw', label: { en: ['From homepage'] } }}
        rendering={rend}
        seeAlso={[rend, see]}
      />,
    );
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['From homepage', 'See']);
  });

  it('drops invalid URLs and renders nothing when only those remain', () => {
    const { container } = render(<MetadataDisplay homepage={{ id: 'javascript:alert(1)' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('applies hiddenSeeAlsoIds to homepage and rendering', () => {
    render(
      <MetadataDisplay
        homepage={home}
        rendering={rend}
        hiddenSeeAlsoIds={new Set(['https://h.example/raw'])}
      />,
    );
    expect(screen.queryByText('Raw file')).toBeNull();
    expect(screen.getByText('Report')).toBeTruthy();
  });
});
