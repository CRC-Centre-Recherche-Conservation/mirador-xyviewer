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
