/**
 * Tests for IIIF localization helpers.
 *
 * Covers IIIF Presentation v3 language selection: preferred-language order,
 * the plain-string passthrough, the first-available-language fallback, and
 * the empty/undefined edge cases — plus getAllLocalizedStrings concatenation.
 */
import { describe, it, expect } from 'vitest';
import { getLocalizedString, getAllLocalizedStrings } from './localization';

describe('getLocalizedString', () => {
  it('returns an empty string for undefined', () => {
    expect(getLocalizedString(undefined)).toBe('');
  });

  it('returns a plain string as-is', () => {
    expect(getLocalizedString('Plain label')).toBe('Plain label');
  });

  it('picks the preferred language (en) first', () => {
    expect(getLocalizedString({ en: ['English'], fr: ['Français'] })).toBe('English');
  });

  it('honours a custom preferred-language order', () => {
    expect(getLocalizedString({ en: ['English'], fr: ['Français'] }, ['fr', 'en'])).toBe('Français');
  });

  it('falls back to the first available language when no preferred match', () => {
    expect(getLocalizedString({ de: ['Deutsch'] })).toBe('Deutsch');
  });

  it('handles the "none" and "@none" IIIF language keys', () => {
    expect(getLocalizedString({ none: ['No-lang'] })).toBe('No-lang');
    expect(getLocalizedString({ '@none': ['At-none'] })).toBe('At-none');
  });

  it('returns an empty string for an empty object', () => {
    expect(getLocalizedString({})).toBe('');
  });

  it('skips a preferred language whose array is empty and moves to the next preferred', () => {
    // 'fr' must be in the preferred order to be reached — with the default order
    // ['en','none','@none'], 'fr' is never tried and the first-key fallback returns ''.
    expect(getLocalizedString({ en: [], fr: ['Français'] }, ['en', 'fr'])).toBe('Français');
  });
});

describe('getAllLocalizedStrings', () => {
  it('returns an empty string for undefined', () => {
    expect(getAllLocalizedStrings(undefined)).toBe('');
  });

  it('returns a plain string as-is', () => {
    expect(getAllLocalizedStrings('Plain')).toBe('Plain');
  });

  it('concatenates every language value with the default separator', () => {
    expect(getAllLocalizedStrings({ en: ['A', 'B'], fr: ['C'] })).toBe('A B C');
  });

  it('uses a custom separator', () => {
    expect(getAllLocalizedStrings({ en: ['A'], fr: ['C'] }, ', ')).toBe('A, C');
  });
});
