/**
 * IIIF Localization utilities
 *
 * Language selection follows IIIF Presentation 3 §4.4: pick ONE language for a
 * language map (the reader's, else `none`, else `@none`, else any) and show every
 * value of that language.
 */

import type { LocalizedString } from '../types/iiif';

/** Language keys meaning "no language", in IIIF priority order. */
const NO_LANGUAGE_KEYS = ['none', '@none'];

/** Language preference used when the caller supplies none and no environment language exists. */
const FALLBACK_LANGUAGE = 'en';

function toList(value: string | string[] | undefined | null): string[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.filter((l): l is string => typeof l === 'string' && l.trim() !== '').map((l) => l.trim());
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((l) => {
    const k = l.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function environmentLanguages(): string[] {
  if (typeof navigator === 'undefined') return [];
  return toList(navigator.languages?.length ? [...navigator.languages] : navigator.language);
}

/**
 * Build the ordered language preference list: the configured language(s) first
 * (Mirador's `config.language`), then the browser's `navigator.languages`, then
 * `none` / `@none`.
 *
 * Mirador always defines `config.language` (its default is `'en'`), so a host
 * that never set it is indistinguishable from one that chose English: the
 * configured value is therefore authoritative, as it is for Mirador's own
 * metadata panels. `navigator.languages` only matters as a fallback after it,
 * or when no configured language is available (components used without a store).
 */
export function resolvePreferredLanguages(configured?: string | string[] | null): string[] {
  const env = environmentLanguages();
  const list = [...toList(configured), ...env];
  if (list.length === 0) list.push(FALLBACK_LANGUAGE);
  return dedupe([...list, ...NO_LANGUAGE_KEYS]);
}

const hasValues = (value: LocalizedString, key: string): boolean => {
  const entry = (value as Record<string, unknown>)[key];
  return Array.isArray(entry) && entry.some((s) => typeof s === 'string' && s !== '');
};

const primarySubtag = (tag: string): string => tag.toLowerCase().split(/[-_]/)[0];

/**
 * Pick the language key of a language map for the given preferences.
 *
 * Per preference, in order: the exact key (case-insensitive), then its primary
 * subtag (`fr-CA` matches `fr`), then a regional variant of it (`fr` matches
 * `fr-FR`). After the preferences: `none`, `@none`, then the first non-empty key.
 * Keys without any non-empty string are ignored. Returns `undefined` when the map
 * has no usable value.
 */
export function pickLanguageKey(
  value: LocalizedString | undefined,
  preferredLanguages: string[] = resolvePreferredLanguages()
): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const keys = Object.keys(value).filter((k) => hasValues(value, k));
  if (keys.length === 0) return undefined;

  const byLower = (wanted: string) => keys.find((k) => k.toLowerCase() === wanted.toLowerCase());

  for (const pref of preferredLanguages) {
    if (!pref) continue;
    const exact = byLower(pref);
    if (exact) return exact;
    const primary = primarySubtag(pref);
    if (primary !== pref.toLowerCase()) {
      const base = byLower(primary);
      if (base) return base;
    }
    const regional = keys.find((k) => k.toLowerCase().startsWith(`${primary}-`));
    if (regional) return regional;
  }

  for (const none of NO_LANGUAGE_KEYS) {
    const k = byLower(none);
    if (k) return k;
  }
  return keys[0];
}

/**
 * All strings of the language chosen by {@link pickLanguageKey} (IIIF §4.4:
 * every value of the chosen language is displayed).
 */
export function getLocalizedStrings(
  value: LocalizedString | string | undefined,
  preferredLanguages: string[] = resolvePreferredLanguages()
): string[] {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  const key = pickLanguageKey(value, preferredLanguages);
  if (key === undefined) return [];
  return (value[key] as unknown[]).filter((s): s is string => typeof s === 'string' && s !== '');
}

/**
 * Get the best matching (first) string from a LocalizedString.
 * Use {@link getLocalizedStrings} to get every value of the chosen language.
 */
export function getLocalizedString(
  value: LocalizedString | string | undefined,
  preferredLanguages: string[] = resolvePreferredLanguages()
): string {
  return getLocalizedStrings(value, preferredLanguages)[0] ?? '';
}

/**
 * Get all strings of ALL languages as one concatenated string.
 *
 * Not IIIF §4.4-compliant for display (it mixes languages); prefer
 * {@link getLocalizedStrings}. Kept for search-index style uses.
 */
export function getAllLocalizedStrings(
  value: LocalizedString | string | undefined,
  separator = ' '
): string {
  if (!value) return '';
  if (typeof value === 'string') return value;

  const allStrings: string[] = [];
  for (const lang of Object.keys(value)) {
    if (Array.isArray(value[lang])) {
      allStrings.push(...value[lang]);
    }
  }

  return allStrings.join(separator);
}
