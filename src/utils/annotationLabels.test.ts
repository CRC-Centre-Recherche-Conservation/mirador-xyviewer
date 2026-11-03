import { describe, it, expect } from 'vitest';
import { fillTemplate, resolveLabels } from './annotationLabels';

describe('fillTemplate', () => {
  it('fills known placeholders and leaves unknown ones, including prototype members', () => {
    expect(fillTemplate('Back to {title} ({n})', { title: 'X', n: 2 })).toBe('Back to X (2)');
    expect(fillTemplate('on {constructor} {toString} {missing}', {})).toBe('on {constructor} {toString} {missing}');
  });
});

describe('resolveLabels', () => {
  it('falls back to the deprecated evidence keys when the new ones are not set', () => {
    const l = resolveLabels({ evidence: 'Proofs', evidenceUnavailable: 'Elsewhere' });
    expect(l.linkedAnnotations).toBe('Proofs');
    expect(l.linkUnavailable).toBe('Elsewhere');
  });

  it('prefers the new keys', () => {
    const l = resolveLabels({ evidence: 'Proofs', linkedAnnotations: 'Links', evidenceUnavailable: 'x', linkUnavailable: 'None' });
    expect(l.linkedAnnotations).toBe('Links');
    expect(l.linkUnavailable).toBe('None');
  });

  it('keeps the English defaults without a config', () => {
    expect(resolveLabels().linkedAnnotations).toBe('Linked annotations');
  });
});

describe('termGroupCaption', () => {
  it('uses the card captions, overridable per purpose', async () => {
    const { termGroupCaption } = await import('./annotationLabels');
    expect(termGroupCaption(undefined, 'classifying')).toBe('Classified as');
    expect(termGroupCaption(undefined, 'tagging')).toBe('Tags');
    expect(termGroupCaption({ classifiedAs: 'Materials' }, 'classifying')).toBe('Materials');
    expect(termGroupCaption({ classifiedAs: 'Materials', purposes: { classifying: 'Pigments' } }, 'classifying')).toBe('Pigments');
  });
});

describe('sanitizeLabels', () => {
  it('keeps strings only and is stable per config object', async () => {
    const { sanitizeLabels } = await import('./annotationLabels');
    const raw = { onlyTerm: 'Seulement {term}', showMore: 3, purposes: { a: 'b' } };
    const clean = sanitizeLabels(raw)!;
    expect(clean.onlyTerm).toBe('Seulement {term}');
    expect(clean.showMore).toBeUndefined();
    expect(sanitizeLabels(raw)).toBe(clean);
    expect(sanitizeLabels(null)).toBeUndefined();
    expect(sanitizeLabels([])).toBeDefined();
  });
});
