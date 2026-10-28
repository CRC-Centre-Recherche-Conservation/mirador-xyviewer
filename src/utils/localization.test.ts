/**
 * Tests for IIIF localization helpers.
 *
 * Covers IIIF Presentation v3 language selection: preferred-language order,
 * the plain-string passthrough, the first-available-language fallback, and
 * the empty/undefined edge cases — plus getAllLocalizedStrings concatenation.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getLocalizedString,
  getLocalizedStrings,
  getAllLocalizedStrings,
  pickLanguageKey,
  resolvePreferredLanguages,
} from './localization';

afterEach(() => vi.unstubAllGlobals());

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

describe('resolvePreferredLanguages', () => {
  it('puts the configured language first, then navigator.languages, then none/@none', () => {
    vi.stubGlobal('navigator', { languages: ['de-DE', 'en'], language: 'de-DE' });
    expect(resolvePreferredLanguages('fr')).toEqual(['fr', 'de-DE', 'en', 'none', '@none']);
  });

  it('accepts a list and dedupes case-insensitively', () => {
    vi.stubGlobal('navigator', { languages: ['FR'], language: 'FR' });
    expect(resolvePreferredLanguages(['fr', 'en'])).toEqual(['fr', 'en', 'none', '@none']);
  });

  it('uses navigator.languages when nothing is configured', () => {
    vi.stubGlobal('navigator', { languages: ['es-ES'], language: 'es-ES' });
    expect(resolvePreferredLanguages()).toEqual(['es-ES', 'none', '@none']);
    expect(resolvePreferredLanguages('')).toEqual(['es-ES', 'none', '@none']);
  });

  it('falls back to navigator.language, then to en', () => {
    vi.stubGlobal('navigator', { language: 'it' });
    expect(resolvePreferredLanguages()).toEqual(['it', 'none', '@none']);
    vi.stubGlobal('navigator', {});
    expect(resolvePreferredLanguages()).toEqual(['en', 'none', '@none']);
  });
});

describe('pickLanguageKey', () => {
  const map = (o: Record<string, string[]>) => o;

  it('matches keys case-insensitively and returns the original key', () => {
    expect(pickLanguageKey(map({ EN: ['a'], FR: ['b'] }), ['fr'])).toBe('FR');
    expect(pickLanguageKey(map({ fr: ['b'] }), ['FR'])).toBe('fr');
  });

  it('falls back from a regional preference to its primary subtag', () => {
    expect(pickLanguageKey(map({ en: ['a'], fr: ['b'] }), ['fr-CA'])).toBe('fr');
  });

  it('falls back from a bare preference to a regional key', () => {
    expect(pickLanguageKey(map({ en: ['a'], 'fr-FR': ['b'] }), ['fr'])).toBe('fr-FR');
  });

  it('falls back to a sibling region of the same language before none', () => {
    expect(pickLanguageKey(map({ 'pt-BR': ['b'], none: ['n'] }), ['pt-PT'])).toBe('pt-BR');
  });

  it('honours preference order', () => {
    expect(pickLanguageKey(map({ en: ['a'], fr: ['b'] }), ['fr', 'en'])).toBe('fr');
  });

  it('prefers none, then @none, over an arbitrary first key', () => {
    expect(pickLanguageKey(map({ de: ['a'], '@none': ['c'], none: ['b'] }), ['fr'])).toBe('none');
    expect(pickLanguageKey(map({ de: ['a'], '@none': ['c'] }), ['fr'])).toBe('@none');
  });

  it('falls back to the first non-empty key', () => {
    expect(pickLanguageKey(map({ de: [], ja: ['x'], es: ['y'] }), ['fr'])).toBe('ja');
  });

  it('skips keys with empty arrays or empty strings', () => {
    expect(pickLanguageKey(map({ fr: [], en: ['a'] }), ['fr', 'en'])).toBe('en');
    expect(pickLanguageKey(map({ fr: [''], en: ['a'] }), ['fr', 'en'])).toBe('en');
  });

  it('returns undefined for empty or missing maps', () => {
    expect(pickLanguageKey(undefined, ['en'])).toBeUndefined();
    expect(pickLanguageKey({}, ['en'])).toBeUndefined();
    expect(pickLanguageKey(map({ en: [] }), ['en'])).toBeUndefined();
  });

  it('defaults to the (stubbed) browser language', () => {
    vi.stubGlobal('navigator', { languages: ['fr-FR'], language: 'fr-FR' });
    expect(pickLanguageKey(map({ en: ['a'], fr: ['b'] }))).toBe('fr');
  });
});

describe('getLocalizedStrings', () => {
  it('returns every value of the chosen language only', () => {
    const v = { en: ['one', 'two'], fr: ['un'] };
    expect(getLocalizedStrings(v, ['en'])).toEqual(['one', 'two']);
    expect(getLocalizedStrings(v, ['fr'])).toEqual(['un']);
  });

  it('handles plain strings, undefined and empty maps', () => {
    expect(getLocalizedStrings('plain')).toEqual(['plain']);
    expect(getLocalizedStrings(undefined)).toEqual([]);
    expect(getLocalizedStrings({})).toEqual([]);
  });

  it('getLocalizedString is its first value', () => {
    expect(getLocalizedString({ en: ['one', 'two'] }, ['en'])).toBe('one');
  });

  it('getLocalizedString follows reader language and subtags', () => {
    const v = { en: ['Hello'], fr: ['Bonjour'] };
    expect(getLocalizedString(v, ['fr-CA', 'en'])).toBe('Bonjour');
  });
});
