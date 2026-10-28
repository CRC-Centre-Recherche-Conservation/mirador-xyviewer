/**
 * Reader-language selection among TextualBodies that differ only by language
 * (IIIF Presentation 3 §4.4), for v3 and v2 sources, plus the language-aware
 * metadata rendering through LanguageProvider.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnotationBodyRenderer, selectLanguageVariants } from './AnnotationBodyRenderer';
import { MetadataDisplay } from './MetadataDisplay';
import { LanguageProvider } from '../utils/LanguageContext';
import { normalizeAnnotationList } from '../utils/annotationNormalizer';
import type { AnnotationBody } from '../types/iiif';

vi.mock('react-plotly.js', () => ({ default: () => <div data-testid="plotly" /> }));

const props = { dispatch: vi.fn(), addWindow: vi.fn(() => ({ type: 'ADD_WINDOW' })) };

const v3Bodies: AnnotationBody[] = [
  { type: 'TextualBody', value: 'Lead white', language: 'en', purpose: 'describing', format: 'text/plain' },
  { type: 'TextualBody', value: 'Blanc de plomb', language: 'fr', purpose: 'describing', format: 'text/plain' },
];

function v2Bodies(): AnnotationBody[] {
  const list = {
    '@context': 'http://iiif.io/api/presentation/2/context.json',
    '@id': 'https://iiif.example.org/list/1',
    '@type': 'sc:AnnotationList',
    resources: [
      {
        '@id': 'https://iiif.example.org/anno/1',
        '@type': 'oa:Annotation',
        motivation: 'oa:describing',
        on: 'https://iiif.example.org/canvas/1#xywh=0,0,10,10',
        resource: [
          { '@type': 'cnt:ContentAsText', chars: 'Lead white', language: 'en', format: 'text/plain' },
          { '@type': 'cnt:ContentAsText', chars: 'Blanc de plomb', language: 'fr', format: 'text/plain' },
        ],
      },
    ],
  };
  const [anno] = normalizeAnnotationList(list);
  return ([] as AnnotationBody[]).concat(anno.body as AnnotationBody | AnnotationBody[]);
}

describe('selectLanguageVariants', () => {
  it('treats a "__proto__" language as an ordinary variant', () => {
    const mk = (value: string, language: string) =>
      ({ type: 'TextualBody', value, language, purpose: 'describing' }) as AnnotationBody;
    const bodies = [mk('a', '__proto__'), mk('b', 'fr'), mk('c', 'en')];
    expect(selectLanguageVariants(bodies, ['__proto__'])).toEqual([bodies[0]]);
  });

  it.each([
    ['v3', () => v3Bodies],
    ['v2', v2Bodies],
  ])('keeps only the reader language (%s)', (_name, make) => {
    const bodies = make();
    expect(bodies).toHaveLength(2);
    const fr = selectLanguageVariants(bodies, ['fr', 'none']);
    expect(fr.map((b) => (b as { value: string }).value)).toEqual(['Blanc de plomb']);
    const en = selectLanguageVariants(bodies, ['en', 'none']);
    expect(en.map((b) => (b as { value: string }).value)).toEqual(['Lead white']);
  });

  it('matches regional preferences (fr-CA -> fr)', () => {
    expect(selectLanguageVariants(v3Bodies, ['fr-CA'])).toHaveLength(1);
  });

  it('keeps bodies without a language and preserves order', () => {
    const bodies: AnnotationBody[] = [
      { type: 'TextualBody', value: 'first' },
      v3Bodies[0],
      { type: 'Manifest', id: 'https://iiif.example.org/m.json' },
      v3Bodies[1],
      { type: 'TextualBody', value: 'last' },
    ];
    const out = selectLanguageVariants(bodies, ['fr']);
    expect(out.map((b) => (b as { value?: string }).value ?? b.type)).toEqual([
      'first',
      'Manifest',
      'Blanc de plomb',
      'last',
    ]);
  });

  it('does not merge bodies with different purpose or format', () => {
    const bodies: AnnotationBody[] = [
      { type: 'TextualBody', value: 'tag', language: 'en', purpose: 'tagging' },
      { type: 'TextualBody', value: 'note fr', language: 'fr', purpose: 'describing' },
      { type: 'TextualBody', value: '<b>x</b>', language: 'en', purpose: 'describing', format: 'text/html' },
    ];
    expect(selectLanguageVariants(bodies, ['fr'])).toHaveLength(3);
  });

  it('keeps a lone language and keeps all bodies of the chosen language', () => {
    const lone: AnnotationBody[] = [{ type: 'TextualBody', value: 'solo', language: 'de' }];
    expect(selectLanguageVariants(lone, ['fr'])).toEqual(lone);
    const twoFr: AnnotationBody[] = [...v3Bodies, { ...v3Bodies[1], value: 'Autre' } as AnnotationBody];
    expect(selectLanguageVariants(twoFr, ['fr'])).toHaveLength(2);
  });
});

describe('language through the React tree', () => {
  it('renders only the French body under LanguageProvider language="fr"', () => {
    render(
      <LanguageProvider language="fr">
        <AnnotationBodyRenderer body={v3Bodies} {...props} />
      </LanguageProvider>,
    );
    expect(screen.getByText('Blanc de plomb')).toBeInTheDocument();
    expect(screen.queryByText('Lead white')).toBeNull();
  });

  it('renders the English body for language="en"', () => {
    render(
      <LanguageProvider language="en">
        <AnnotationBodyRenderer body={v3Bodies} {...props} />
      </LanguageProvider>,
    );
    expect(screen.getByText('Lead white')).toBeInTheDocument();
    expect(screen.queryByText('Blanc de plomb')).toBeNull();
  });

  it('MetadataDisplay shows all values of the reader language only', () => {
    render(
      <LanguageProvider language="fr">
        <MetadataDisplay
          label={{ en: ['Pigment'], fr: ['Pigment FR'] }}
          metadata={[
            {
              label: { en: ['Colour'], fr: ['Couleur'] },
              value: { en: ['White'], fr: ['Blanc', 'Clair'] },
            },
          ]}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText('Pigment FR')).toBeInTheDocument();
    expect(screen.getByText(/Couleur/)).toBeInTheDocument();
    expect(screen.getByText(/Blanc/)).toHaveTextContent('Blanc, Clair');
    expect(screen.queryByText(/White/)).toBeNull();
  });

  it('MetadataDisplay fallback link label is English and overridable', () => {
    const entry = { id: 'https://iiif.example.org/see' };
    const { unmount } = render(<MetadataDisplay seeAlso={entry} />);
    expect(screen.getByRole('link', { name: 'Linked resource' })).toBeInTheDocument();
    unmount();
    render(<MetadataDisplay seeAlso={entry} fallbackLinkLabel="Ressource liée" />);
    expect(screen.getByRole('link', { name: 'Ressource liée' })).toBeInTheDocument();
  });
});
