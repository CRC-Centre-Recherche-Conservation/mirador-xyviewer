/**
 * Web Annotation bodies through the real renderer: SpecificResource chips (§4.1),
 * linking buttons and Choice (§4.3 / IIIF cookbook 0346).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnnotationBodyRenderer, pickChoiceItem } from './AnnotationBodyRenderer';
import { LanguageProvider } from '../utils/LanguageContext';
import { normalizeAnnotationList } from '../utils/annotationNormalizer';
import v2Characterization from '../test/fixtures/annotations/v2-characterization-page.json';
import v3Characterization from '../test/fixtures/annotations/v3-characterization-page.json';
import type { AnnotationBody, SpecificResourceBody } from '../types/iiif';

vi.mock('react-plotly.js', () => ({ default: () => <div /> }));

const props = { dispatch: vi.fn(), addWindow: vi.fn(() => ({ type: 'ADD_WINDOW' })) };
const ID = 'https://thesaurus.example.org/concept/1';

const renderIn = (language: string, ui: React.ReactElement) =>
  render(<LanguageProvider language={language}>{ui}</LanguageProvider>);

describe('SpecificResource chips', () => {
  it('shows a string source with the body label, as a link', () => {
    const body: AnnotationBody = {
      type: 'SpecificResource',
      purpose: 'classifying',
      source: ID,
      label: { en: ['vermilion'] },
    };
    renderIn('en', <AnnotationBodyRenderer body={body} {...props} />);
    const link = screen.getByRole('link', { name: 'vermilion' });
    expect(link).toHaveAttribute('href', ID);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('takes the label of an object source', () => {
    const body: AnnotationBody = {
      type: 'SpecificResource',
      purpose: 'describing',
      source: { id: ID, type: 'Concept', label: { en: ['Red'] } },
    };
    renderIn('en', <AnnotationBodyRenderer body={body} {...props} />);
    expect(screen.getByText('Red')).toBeInTheDocument();
  });

  it('prefers the reader language and falls back to the id without a label', () => {
    const labelled: AnnotationBody = {
      type: 'SpecificResource',
      purpose: 'classifying',
      source: ID,
      label: { en: ['lead white'], fr: ['blanc de plomb'] },
    };
    const bare: AnnotationBody = { type: 'SpecificResource', source: 'https://x/bare' };
    renderIn('fr', <AnnotationBodyRenderer body={[labelled, bare]} {...props} />);
    expect(screen.getByText('blanc de plomb')).toBeInTheDocument();
    expect(screen.queryByText('lead white')).toBeNull();
    expect(screen.getByText('https://x/bare')).toBeInTheDocument();
  });

  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>'])('gives %s no href', (src) => {
    const body: AnnotationBody = { type: 'SpecificResource', purpose: 'tagging', source: src, label: { en: ['t'] } };
    renderIn('en', <AnnotationBodyRenderer body={body} {...props} />);
    expect(screen.getByText('t').closest('a')).toBeNull();
    expect(document.querySelector('[href]')).toBeNull();
  });

  it('still renders a chip for an unknown or absent purpose', () => {
    const bodies: AnnotationBody[] = [
      { type: 'SpecificResource', purpose: 'bookmarking', source: 'https://x/a', label: { en: ['A'] } },
      { type: 'SpecificResource', source: 'https://x/b', label: { en: ['B'] } },
    ];
    renderIn('en', <AnnotationBodyRenderer body={bodies} {...props} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('groups chips by purpose in source order', () => {
    const mk = (purpose: string, n: string): AnnotationBody => ({
      type: 'SpecificResource',
      purpose,
      source: `https://x/${n}`,
      label: { en: [n] },
    });
    renderIn('en', <AnnotationBodyRenderer body={[mk('classifying', 'a'), mk('assessing', 'b'), mk('classifying', 'c')]} {...props} />);
    const groups = screen.getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['classifying', 'assessing']);
    expect(groups[0].querySelectorAll('.MuiChip-root')).toHaveLength(2);
  });

  it('survives a non-string purpose and a "__proto__" purpose with host captions', () => {
    const bodies = [
      { type: 'SpecificResource', purpose: { x: 1 }, source: 'https://iiif.example.org/a', label: { en: ['one'] } },
      { type: 'SpecificResource', purpose: [3, 'classifying'], source: 'https://iiif.example.org/b', label: { en: ['two'] } },
      { type: 'SpecificResource', purpose: '__proto__', source: 'https://iiif.example.org/c', label: { en: ['three'] } },
    ] as unknown as AnnotationBody[];
    renderIn('en', <AnnotationBodyRenderer body={bodies} labels={{ purposes: {} }} {...props} />);
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('two')).toBeInTheDocument();
    expect(screen.getByText('three')).toBeInTheDocument();
  });

  it('keeps a chip without href non-interactive and lets its click reach the parent', () => {
    const onClick = vi.fn();
    const body: AnnotationBody = { type: 'SpecificResource', purpose: 'classifying', source: 'urn:term:1', label: { en: ['plain'] } };
    render(
      <ul>
        <li onClick={onClick}>
          <AnnotationBodyRenderer body={body} {...props} />
        </li>
      </ul>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    fireEvent.click(screen.getByText('plain'));
    expect(onClick).toHaveBeenCalled();
  });

  it('does not let a chip click reach a parent handler', () => {
    const onClick = vi.fn();
    const body: AnnotationBody = { type: 'SpecificResource', purpose: 'classifying', source: ID, label: { en: ['x'] } };
    render(
      <ul>
        <li onClick={onClick}>
          <AnnotationBodyRenderer body={body} {...props} />
        </li>
      </ul>,
    );
    fireEvent.click(screen.getByText('x'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders the real v3 characterization fixture as chips in the reader language', () => {
    const [anno] = normalizeAnnotationList(v3Characterization);
    renderIn('fr', <AnnotationBodyRenderer body={anno.body} {...props} />);
    expect(screen.getByText('vermillon')).toBeInTheDocument();
    expect(screen.getByText('Fiable')).toBeInTheDocument();
    expect(document.querySelectorAll('.MuiChip-root').length).toBeGreaterThan(4);
  });

  it('renders the real v2 characterization fixture as chips', () => {
    const [anno] = normalizeAnnotationList(v2Characterization);
    renderIn('en', <AnnotationBodyRenderer body={anno.body} {...props} />);
    expect(screen.getByText('vermilion')).toBeInTheDocument();
    expect(document.querySelectorAll('.MuiChip-root').length).toBeGreaterThan(4);
  });
});

describe('linking bodies', () => {
  const link: SpecificResourceBody = {
    type: 'SpecificResource',
    purpose: 'linking',
    source: { id: 'https://iiif.example.org/anno/1', type: 'Annotation' },
  };

  it('selects the annotation with an exact id match', () => {
    const select = vi.fn();
    render(
      <AnnotationBodyRenderer
        body={link}
        windowId="w1"
        selectAnnotation={select}
        canvasAnnotationIds={['other', 'https://iiif.example.org/anno/1']}
        {...props}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Select linked annotation/ }));
    expect(select).toHaveBeenCalledWith('w1', 'https://iiif.example.org/anno/1');
  });

  it('matches an expanded #target-N id', () => {
    const select = vi.fn();
    render(
      <AnnotationBodyRenderer
        body={link}
        windowId="w1"
        selectAnnotation={select}
        canvasAnnotationIds={['https://iiif.example.org/anno/1#target-0', 'https://iiif.example.org/anno/1#target-1']}
        {...props}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(select).toHaveBeenCalledWith('w1', 'https://iiif.example.org/anno/1#target-0');
  });

  it('is disabled when the annotation is not on the canvas', () => {
    const select = vi.fn();
    render(
      <AnnotationBodyRenderer
        body={link}
        windowId="w1"
        selectAnnotation={select}
        canvasAnnotationIds={['unrelated']}
        {...props}
      />,
    );
    const button = screen.getByRole('button', { name: /Select linked annotation/ });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(select).not.toHaveBeenCalled();
  });

  it('does not toggle the parent list item and supports a custom caption', () => {
    const parent = vi.fn();
    render(
      <ul>
        <li onClick={parent}>
          <AnnotationBodyRenderer
            body={link}
            windowId="w1"
            selectAnnotation={vi.fn()}
            canvasAnnotationIds={['https://iiif.example.org/anno/1']}
            labels={{ linkedAnnotations: 'Preuve' }}
            {...props}
          />
        </li>
      </ul>,
    );
    expect(screen.getByRole('group', { name: 'Preuve' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Select linked annotation/ }));
    expect(parent).not.toHaveBeenCalled();
  });
});

describe('Choice', () => {
  const text = (value: string, language?: string): AnnotationBody => ({ type: 'TextualBody', value, language });
  const choice = (items: AnnotationBody[]): AnnotationBody => ({ type: 'Choice', items });

  it('renders the reader-language item only', () => {
    renderIn('fr', <AnnotationBodyRenderer body={choice([text('Hello', 'en'), text('Bonjour', 'fr')])} {...props} />);
    expect(screen.getByText('Bonjour')).toBeInTheDocument();
    expect(screen.queryByText('Hello')).toBeNull();
  });

  it('falls back to the first item when no language matches', () => {
    renderIn('fr', <AnnotationBodyRenderer body={choice([text('Hello', 'en'), text('Hallo', 'de')])} {...props} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.queryByText('Hallo')).toBeNull();
  });

  it('routes the item through the normal renderer (SpecificResource chip)', () => {
    const sr: AnnotationBody = { type: 'SpecificResource', purpose: 'classifying', source: ID, label: { en: ['Concept'] } };
    renderIn('en', <AnnotationBodyRenderer body={choice([sr])} {...props} />);
    expect(screen.getByRole('link', { name: 'Concept' })).toBeInTheDocument();
  });

  it('bounds the nesting depth', () => {
    let body: AnnotationBody = text('deep');
    for (let i = 0; i < 6; i++) body = choice([body]);
    renderIn('en', <AnnotationBodyRenderer body={body} {...props} />);
    expect(screen.queryByText('deep')).toBeNull();
  });

  it('matches array-valued languages and ignores non-string ones', () => {
    const items = [
      { type: 'TextualBody', value: 'num', language: 7 },
      { type: 'TextualBody', value: 'Hallo', language: ['de'] },
      { type: 'TextualBody', value: 'Bonjour', language: ['en', 'fr'] },
    ] as unknown as AnnotationBody[];
    expect(pickChoiceItem({ type: 'Choice', items }, ['fr'])).toBe(items[2]);
    renderIn('fr', <AnnotationBodyRenderer body={{ type: 'Choice', items }} {...props} />);
    expect(screen.getByText('Bonjour')).toBeInTheDocument();
  });

  it('does not throw on TextualBodies with array languages next to a chip', () => {
    const bodies = [
      { type: 'TextualBody', value: 'fr-arr', language: ['fr'] },
      { type: 'TextualBody', value: 'en-str', language: 'en' },
      { type: 'SpecificResource', purpose: 'classifying', source: ID, label: { en: ['chip'] } },
    ] as unknown as AnnotationBody[];
    renderIn('en', <AnnotationBodyRenderer body={bodies} {...props} />);
    expect(screen.getByText('chip')).toBeInTheDocument();
  });

  it('renders a normalized v2 oa:Choice', () => {
    const [ann] = normalizeAnnotationList({
      resources: [{
        '@id': 'a', '@type': 'oa:Annotation', on: 'c#xywh=0,0,1,1',
        resource: {
          '@type': 'oa:Choice',
          default: { '@type': 'cnt:ContentAsText', chars: 'Hello', language: 'en' },
          item: [{ '@type': 'cnt:ContentAsText', chars: 'Bonjour', language: 'fr' }],
        },
      }],
    });
    renderIn('fr', <AnnotationBodyRenderer body={ann.body} {...props} />);
    expect(screen.getByText('Bonjour')).toBeInTheDocument();
    expect(screen.queryByText('Hello')).toBeNull();
  });

  it('pickChoiceItem copes with empty items and a "__proto__" language', () => {
    expect(pickChoiceItem({ type: 'Choice', items: [] }, ['en'])).toBeUndefined();
    const items = [text('a', 'en'), text('b', '__proto__')];
    expect(pickChoiceItem({ type: 'Choice', items }, ['en'])).toBe(items[0]);
  });
});
