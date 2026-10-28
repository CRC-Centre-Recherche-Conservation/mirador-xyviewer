/**
 * SpecificResourceBody Component
 * Renders non-linking SpecificResource bodies (W3C WADM §4.1) as chips: a controlled
 * term, a classification, an assessment... Chips are grouped by purpose, in source order.
 */

import React, { useMemo } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import type { SpecificResourceBody as SpecificResourceBodyType } from '../types/iiif';
import { srLabel, srSourceId, stringPurposes } from '../types/iiif';
import { getLocalizedString } from '../utils/localization';
import { useLanguagePreferences } from '../utils/LanguageContext';
import { isValidUrl } from '../utils/security';

export interface SpecificResourceBodyProps {
  /** SpecificResource bodies to show as one block. */
  bodies: SpecificResourceBodyType[];
  /** Optional caption per purpose (e.g. `{ classifying: 'Materials' }`); defaults to the purpose. */
  purposeLabels?: Record<string, string>;
}

/** First purpose of a body, or '' when it has none. */
const purposeOf = (body: SpecificResourceBodyType): string => stringPurposes(body)[0] ?? '';

/** Host caption for a purpose (own string values only), else the purpose itself. */
const caption = (labels: Record<string, string> | undefined, purpose: string): string => {
  if (labels && Object.prototype.hasOwnProperty.call(labels, purpose) && typeof labels[purpose] === 'string') {
    return labels[purpose];
  }
  return purpose;
};

export const SpecificResourceBody: React.FC<SpecificResourceBodyProps> = ({
  bodies,
  purposeLabels,
}) => {
  const prefs = useLanguagePreferences();

  // Map keeps the first-seen purpose order (producer strings never become object keys).
  const groups = useMemo(() => {
    const out = new Map<string, Array<{ key: string; text: string; href?: string }>>();
    bodies.forEach((body, index) => {
      const id = srSourceId(body);
      const text = getLocalizedString(srLabel(body), prefs) || id;
      if (!text) return;
      const purpose = purposeOf(body);
      const chips = out.get(purpose) ?? [];
      chips.push({ key: `${id}-${index}`, text, href: id && isValidUrl(id) ? id : undefined });
      out.set(purpose, chips);
    });
    return out;
  }, [bodies, prefs]);

  if (groups.size === 0) return null;

  return (
    <Box sx={{ my: 0.5 }}>
      {[...groups].map(([purpose, chips]) => (
        <Box key={purpose} role="group" aria-label={purpose || undefined} sx={{ mb: 0.5 }}>
          {purpose && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {caption(purposeLabels, purpose)}
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {chips.map(({ key, text, href }) => (
              <Chip
                key={key}
                size="small"
                variant="outlined"
                label={text}
                // Only link chips are interactive; plain chips let the click select the annotation.
                {...(href
                  ? {
                      component: 'a',
                      href,
                      target: '_blank',
                      rel: 'noopener noreferrer',
                      clickable: true,
                      onClick: (e: React.MouseEvent) => e.stopPropagation(),
                    }
                  : {})}
              />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

export default SpecificResourceBody;
