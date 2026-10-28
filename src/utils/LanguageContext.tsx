/**
 * LanguageContext
 * Carries the reader's language preferences (IIIF Presentation 3 §4.4) down to
 * components. Without a provider, components fall back to the browser language,
 * so they keep working outside a Mirador store.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { resolvePreferredLanguages } from './localization';

const LanguageContext = createContext<string[] | null>(null);

export interface LanguageProviderProps {
  /** Mirador `config.language` (or any language / list of languages). */
  language?: string | string[];
  children?: React.ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ language, children }) => {
  const key = Array.isArray(language) ? language.join('|') : (language ?? '');
  const prefs = useMemo(() => resolvePreferredLanguages(language), [key]);
  return <LanguageContext.Provider value={prefs}>{children}</LanguageContext.Provider>;
};

/** Ordered language preferences for the current reader. Stable between renders. */
export function useLanguagePreferences(): string[] {
  const ctx = useContext(LanguageContext);
  return useMemo(() => ctx ?? resolvePreferredLanguages(), [ctx]);
}

export { LanguageContext };
