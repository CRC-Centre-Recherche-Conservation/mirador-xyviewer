/**
 * Pattern D integration: SpecificResource / Choice bodies through the connected
 * plugin (real redux store + real renderer) down to Mirador's selectAnnotation.
 */
import { describe, it, expect, vi } from 'vitest';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ConnectedScientificAnnotationPlugin,
  shouldUseCustomRendering,
} from './ConnectedScientificAnnotationPlugin';
import type { IIIFAnnotation } from '../types/iiif';

vi.mock('mirador', () => ({
  SanitizedHtml: ({ htmlString }: { htmlString: string }) => <span>{htmlString}</span>,
  addWindow: vi.fn(),
}));
vi.mock('react-plotly.js', () => ({ default: () => <div /> }));

const A = 'https://iiif.example.org/anno/a';
const B = 'https://iiif.example.org/anno/b';

const annotationA = {
  id: A,
  type: 'Annotation',
  motivation: 'classifying',
  body: [
    { type: 'SpecificResource', purpose: 'classifying', source: 'https://t.example.org/c/1', label: { en: ['Lead white'] } },
    { type: 'SpecificResource', purpose: 'linking', source: { id: B, type: 'Annotation' } },
  ],
  target: 'c1',
} as unknown as IIIFAnnotation;

const annotationB = {
  id: B,
  type: 'Annotation',
  body: { type: 'Choice', items: [{ type: 'TextualBody', value: 'Spectrum', language: 'en' }] },
  target: 'c1',
} as unknown as IIIFAnnotation;

const state = {
  config: { language: 'en' },
  windows: { w1: { id: 'w1', canvasId: 'c1' } },
  annotations: {
    c1: {
      list1: {
        json: {
          '@context': 'http://iiif.io/api/presentation/3/context.json',
          id: 'list1',
          type: 'AnnotationPage',
          items: [annotationA, annotationB],
        },
      },
    },
  },
};

function setup(ids: string[], config: Record<string, unknown> = {}) {
  const seen: Array<{ type: string; [k: string]: unknown }> = [];
  const initial = { ...state, config: { ...state.config, ...config } };
  const store = createStore((s: typeof state = initial, a: { type: string }) => {
    seen.push(a);
    return s;
  });
  const selectAnnotation = (windowId: string, annotationId: string) =>
    store.dispatch({ type: 'mirador/SELECT_ANNOTATION', windowId, annotationId } as never);
  const toggle = vi.fn();
  render(
    <Provider store={store as never}>
      <ul onClick={toggle}>
        <ConnectedScientificAnnotationPlugin
          targetProps={
            {
              annotations: ids.map((id) => ({ id, content: null, tags: [], targetId: 't' })),
              windowId: 'w1',
              canvasId: 'c1',
              selectAnnotation,
              deselectAnnotation: vi.fn(),
              hoverAnnotation: vi.fn(),
            } as never
          }
          TargetComponent={(() => <div data-testid="default" />) as never}
        />
      </ul>
    </Provider>,
  );
  return { seen, toggle };
}

describe('shouldUseCustomRendering', () => {
  it('is true for SpecificResource-only and Choice annotations', () => {
    expect(shouldUseCustomRendering(annotationA)).toBe(true);
    expect(shouldUseCustomRendering(annotationB)).toBe(true);
  });
  it('stays false for a malformed Choice without items', () => {
    const bad = { id: 'p', type: 'Annotation', body: { type: 'Choice' }, target: 'c' };
    expect(shouldUseCustomRendering(bad as unknown as IIIFAnnotation)).toBe(false);
  });
  it('stays false for plain textual annotations', () => {
    const plain = { id: 'p', type: 'Annotation', body: { type: 'TextualBody', value: 'x' }, target: 'c' };
    expect(shouldUseCustomRendering(plain as unknown as IIIFAnnotation)).toBe(false);
  });
});

describe('connected plugin with Web Annotation bodies', () => {
  it('applies config.scientificAnnotations.labels to the Evidence button and purpose captions', () => {
    setup([A, B], {
      scientificAnnotations: { labels: { evidence: 'Proof', purposes: { classifying: 'Pigment' } } },
    });
    expect(screen.getByRole('button', { name: /Proof/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Evidence/ })).toBeNull();
    expect(screen.getByText('Pigment')).toBeInTheDocument();
  });

  it('falls back to the default Evidence label when the configured one is not a string', () => {
    setup([A, B], { scientificAnnotations: { labels: { evidence: {} } } });
    expect(screen.getByRole('button', { name: /Evidence/ })).toBeInTheDocument();
  });

  it('renders chips and the Choice item instead of the default list', () => {
    setup([A, B]);
    expect(screen.queryByTestId('default')).toBeNull();
    expect(screen.getByText('Lead white')).toBeInTheDocument();
    expect(screen.getByText('Spectrum')).toBeInTheDocument();
  });

  it('dispatches SELECT_ANNOTATION from the Evidence button without selecting the parent', () => {
    const { seen, toggle } = setup([A, B]);
    fireEvent.click(screen.getByRole('button', { name: /Evidence/ }));
    expect(seen).toContainEqual({ type: 'mirador/SELECT_ANNOTATION', windowId: 'w1', annotationId: B });
    expect(seen.filter((a) => a.type === 'mirador/SELECT_ANNOTATION')).toHaveLength(1);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('disables Evidence when the linked annotation is not on the canvas', () => {
    setup([A]);
    expect(screen.getByRole('button', { name: /Evidence/ })).toHaveAttribute('aria-disabled', 'true');
  });
});
