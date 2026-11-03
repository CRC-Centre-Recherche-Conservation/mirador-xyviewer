import { describe, it, expect } from 'vitest';
import { isCompositeBody, isListBody, isIndependentsBody, type AnnotationBody } from './iiif';

describe('multiplicity body guards', () => {
  const make = (type: string, items?: unknown) => ({ type, items }) as unknown as AnnotationBody;

  it('match their own type with array items only', () => {
    expect(isCompositeBody(make('Composite', []))).toBe(true);
    expect(isListBody(make('List', []))).toBe(true);
    expect(isIndependentsBody(make('Independents', []))).toBe(true);
  });

  it('reject other types and non-array items', () => {
    expect(isCompositeBody(make('List', []))).toBe(false);
    expect(isListBody(make('Composite', []))).toBe(false);
    expect(isIndependentsBody(make('Choice', []))).toBe(false);
    expect(isCompositeBody(make('Composite', 'x'))).toBe(false);
    expect(isListBody(make('List'))).toBe(false);
  });
});
