/**
 * Reader-language integration: Mirador `config.language` -> mapStateToProps ->
 * plugin component -> LanguageProvider -> MetadataDisplay / AnnotationBodyRenderer,
 * and -> filtersStore keys. mirador is mocked (SanitizedHtml only).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  mapStateToProps,
  ScientificAnnotationPluginComponent,
} from './ConnectedScientificAnnotationPlugin';
import {
  mapStateToProps as filtersMapState,
  MetadataFiltersPluginComponent,
} from './MetadataFiltersPlugin';
import { filtersStore } from '../state/filtersStore';
import { resolvePreferredLanguages } from '../utils/localization';
import { miradorState } from '../test/fixtures/miradorState';
import type { IIIFAnnotation } from '../types/iiif';

vi.mock('mirador', () => ({
  SanitizedHtml: () => null,
  addWindow: vi.fn(),
  updateWindow: vi.fn(),
}));
vi.mock('react-plotly.js', () => ({ default: () => <div /> }));

const annotation = {
  id: 'https://iiif.example.org/anno/1',
  type: 'Annotation',
  label: { en: ['Lead white'], fr: ['Blanc de plomb'] },
  metadata: [
    { label: { en: ['Technique'], fr: ['Technique'] }, value: { en: ['Painting'], fr: ['Peinture'] } },
  ],
  body: [
    { type: 'TextualBody', value: 'English note', language: 'en', purpose: 'describing' },
    { type: 'TextualBody', value: 'Note en français', language: 'fr', purpose: 'describing' },
  ],
  target: 'canvas-1',
} as unknown as IIIFAnnotation;

afterEach(() => filtersStore.clearWindow('lw'));

function renderWith(language: string) {
  const state = { ...miradorState, config: { ...miradorState.config, language } };
  const { language: fromState } = mapStateToProps(state, { targetProps: { windowId: 'window-1' } });
  return render(
    <ScientificAnnotationPluginComponent
      targetProps={
        {
          annotations: [{ id: annotation.id, content: null, tags: [], targetId: 't' }],
          windowId: 'lw',
          canvasId: 'c1',
          selectAnnotation: vi.fn(),
          deselectAnnotation: vi.fn(),
          hoverAnnotation: vi.fn(),
        } as never
      }
      TargetComponent={(() => null) as never}
      dispatch={vi.fn()}
      addWindow={vi.fn()}
      annotationResources={{ [annotation.id]: annotation }}
      language={fromState}
    />,
  );
}

describe('config.language="fr"', () => {
  it('shows the French label, metadata and body only', () => {
    renderWith('fr');
    expect(screen.getByText('Blanc de plomb')).toBeInTheDocument();
    expect(screen.getByText('Peinture')).toBeInTheDocument();
    expect(screen.getByText('Note en français')).toBeInTheDocument();
    expect(screen.queryByText('Lead white')).toBeNull();
    expect(screen.queryByText('Painting')).toBeNull();
    expect(screen.queryByText('English note')).toBeNull();
  });

  it('shows English with config.language="en"', () => {
    renderWith('en');
    expect(screen.getByText('Lead white')).toBeInTheDocument();
    expect(screen.getByText('English note')).toBeInTheDocument();
    expect(screen.queryByText('Note en français')).toBeNull();
  });

  it('keys the metadata filters in French', () => {
    const state = { ...miradorState, config: { ...miradorState.config, language: 'fr' } };
    const { language } = filtersMapState(state, { windowId: 'window-1' });
    filtersStore.initializeFromAnnotations(
      'lw',
      'c1',
      [{ id: annotation.id, metadata: annotation.metadata }],
      false,
      resolvePreferredLanguages(language),
    );
    const [group] = filtersStore.getGroups('lw', 'c1');
    expect([...group.values.keys()]).toEqual(['peinture']);
  });
});

describe('MetadataFiltersPluginComponent language change', () => {
  const mk = (id: string, en: string, fr: string) =>
    ({
      id,
      type: 'Annotation',
      metadata: [{ label: { en: ['Technique'], fr: ['Technique'] }, value: { en: [en], fr: [fr] } }],
      target: 'c1',
    }) as unknown as IIIFAnnotation;
  const resources = { a1: mk('a1', 'Painting', 'Peinture'), a2: mk('a2', 'Drawing', 'Dessin') };
  const props = { windowId: 'lw', canvasId: 'c1', annotationResources: resources };

  it('rebuilds the groups in the new language and clears the selection', () => {
    const { rerender } = render(<MetadataFiltersPluginComponent {...props} language="en" />);
    expect([...filtersStore.getGroups('lw', 'c1')[0].values.keys()].sort()).toEqual(['drawing', 'painting']);

    filtersStore.toggleValue('lw', 'c1', 'meta:technique', 'painting');
    filtersStore.updateHiddenAnnotations('lw', 'c1', [
      { id: 'a1', metadata: resources.a1.metadata },
      { id: 'a2', metadata: resources.a2.metadata },
    ]);
    expect(filtersStore.hasActiveFilters('lw', 'c1')).toBe(true);
    expect(filtersStore.getHiddenAnnotationIds('lw', 'c1').size).toBe(1);

    rerender(<MetadataFiltersPluginComponent {...props} language="fr" />);
    expect([...filtersStore.getGroups('lw', 'c1')[0].values.keys()].sort()).toEqual(['dessin', 'peinture']);
    expect(filtersStore.hasActiveFilters('lw', 'c1')).toBe(false);
    expect(filtersStore.getHiddenAnnotationIds('lw', 'c1').size).toBe(0);
  });
});
