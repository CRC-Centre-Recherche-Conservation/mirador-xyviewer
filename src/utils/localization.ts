/**
 * IIIF Localization utilities
 */

import type { LocalizedString } from '../types/iiif';

/** Default language preference order */
const DEFAULT_LANGUAGES = ['en', 'none', '@none'];

/**
 * Get the best matching string from a LocalizedString
 * Follows IIIF Presentation API v3 language selection
 */
export function getLocalizedString(
  value: LocalizedString | string | undefined,
  preferredLanguages: string[] = DEFAULT_LANGUAGES
): string {
  if (!value) return '';

  // If it's already a plain string, return it
  if (typeof value === 'string') return value;

  // Try preferred languages in order
  for (const lang of preferredLanguages) {
    if (value[lang]?.length) {
      return value[lang][0];
    }
  }

  // Fall back to first available language
  const keys = Object.keys(value);
  if (keys.length > 0 && value[keys[0]]?.length) {
    return value[keys[0]][0];
  }

  return '';
}

/**
 * Get all strings from a LocalizedString as a single concatenated string
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
