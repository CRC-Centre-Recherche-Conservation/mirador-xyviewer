/**
 * Tests for ScientificAnnotationPlugin (Pattern A + unconnected render).
 *
 * Pure helpers, plus a render of the unconnected ScientificAnnotationPanel with a
 * spy TargetComponent: when no annotation is scientific it delegates to the target;
 * otherwise it renders the enhanced panel. The child renderers are mocked to keep
 * the test focused on the wrapper's routing.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  extractBody,
  extractLabel,
  extractMetadata,
  hasScientificBody,
  ScientificAnnotationPanel,
  scientificAnnotationPlugin,
} from './ScientificAnnotationPlugin';
import { datasetAnnotation, textualAnnotation } from '../test/fixtures/miradorState';
import type { IIIFAnnotation } from '../types/iiif';

vi.mock('../components/AnnotationBodyRenderer', () => ({
  AnnotationBodyRenderer: () => <div data-testid="body-renderer" />,
}));
vi.mock('../components/MetadataDisplay', () => ({ MetadataDisplay: () => <div data-testid="metadata" /> }));

describe('helpers', () => {
  it('extractBody / extractLabel / extractMetadata read from the resource', () => {
    expect(extractBody(datasetAnnotation)).toEqual(datasetAnnotation.body);
    expect(extractBody(undefined)).toBeNull();
    expect(extractMetadata(datasetAnnotation)).toEqual(datasetAnnotation.metadata);
    expect(extractLabel(undefined)).toBeUndefined();
  });

  it('hasScientificBody: true for a Dataset/Manifest resource', () => {
    expect(hasScientificBody(datasetAnnotation)).toBe(true);
    expect(hasScientificBody(textualAnnotation)).toBe(false);
    expect(hasScientificBody(undefined)).toBe(false);
  });
});

describe('ScientificAnnotationPanel', () => {
  const renderPanel = (
    anns: Array<{ id: string; content: string; tags: string[]; targetId: string; resource?: IIIFAnnotation }>,
  ) => {
    const TargetComponent = vi.fn(() => <div data-testid="target" />);
    render(
      <ScientificAnnotationPanel
        targetProps={{ annotations: anns, windowId: 'w1' }}
        TargetComponent={TargetComponent as never}
      />,
    );
    return TargetComponent;
  };

  it('delegates to TargetComponent when no annotation is scientific', () => {
    const TargetComponent = renderPanel([
      { id: 'a', content: 'x', tags: [], targetId: 't', resource: textualAnnotation },
    ]);
    expect(TargetComponent).toHaveBeenCalled();
    expect(screen.getByTestId('target')).toBeInTheDocument();
  });

  it('renders the enhanced panel for a scientific annotation', () => {
    renderPanel([{ id: 'a', content: 'x', tags: [], targetId: 't', resource: datasetAnnotation }]);
    expect(screen.getByTestId('body-renderer')).toBeInTheDocument();
    expect(screen.queryByTestId('target')).toBeNull();
  });
});

describe('plugin export', () => {
  it('targets CanvasAnnotations in wrap mode', () => {
    expect(scientificAnnotationPlugin.target).toBe('CanvasAnnotations');
    expect(scientificAnnotationPlugin.mode).toBe('wrap');
  });
});
