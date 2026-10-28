/**
 * MetadataDisplay Component
 * Renders IIIF metadata entries with proper localization
 */

import React from 'react';
import { Box, Typography, Link } from '@mui/material';
import type { MetadataEntry, LocalizedString, SeeAlsoEntry } from '../types/iiif';
import { getLocalizedString, getLocalizedStrings } from '../utils/localization';
import { useLanguagePreferences } from '../utils/LanguageContext';
import { isValidUrl } from '../utils/security';
import { parseValueWithUrl } from '../state/filtersStore';

export interface MetadataDisplayProps {
  /** Label of the annotation */
  label?: LocalizedString;
  /** Metadata entries */
  metadata?: MetadataEntry[];
  /** Annotation ID (@id) */
  annotationId?: string;
  /** SeeAlso references */
  seeAlso?: SeeAlsoEntry | SeeAlsoEntry[];
  /** Compact mode - shows metadata inline */
  compact?: boolean;
  /** Link text when a seeAlso entry has no label or type (default 'Linked resource'). */
  fallbackLinkLabel?: string;
  /** Heading above the seeAlso list (default 'Linked resources'). */
  seeAlsoHeading?: string;
  /** seeAlso entries with these ids are not listed (already offered elsewhere, e.g. an authenticated download). */
  hiddenSeeAlsoIds?: ReadonlySet<string>;
}

/** Upper bound on rendered values per entry (hostile or huge arrays). */
const MAX_METADATA_VALUES = 50;

/**
 * Extract URL from a value string that may contain text and URL
 * Format: "Text label (http://...)" or just "http://..."
 */
function extractUrlFromValue(value: string): { text: string; url: string | null } {
  // Check if value contains a URL in parentheses: "Label (http://...)"
  const parsed = parseValueWithUrl(value);
  if (parsed.url) return { text: parsed.displayText, url: parsed.url };

  // Check if the entire value is a URL
  const urlMatch = value.match(/^(https?:\/\/\S+)$/);
  if (urlMatch) {
    return { text: value, url: urlMatch[1] };
  }

  return { text: value, url: null };
}

export const MetadataDisplay: React.FC<MetadataDisplayProps> = ({
  label,
  metadata,
  annotationId,
  seeAlso,
  compact: _compact = false,
  fallbackLinkLabel = 'Linked resource',
  seeAlsoHeading = 'Linked resources',
  hiddenSeeAlsoIds,
}) => {
  // _compact is kept for API compatibility but the layout is now unified
  const prefs = useLanguagePreferences();
  const labelText = getLocalizedString(label, prefs);

  // Normalize seeAlso to array
  const seeAlsoList = (seeAlso ? (Array.isArray(seeAlso) ? seeAlso : [seeAlso]) : []).filter(
    (item) => !(hiddenSeeAlsoIds?.size && typeof item?.id === 'string' && hiddenSeeAlsoIds.has(item.id))
  );

  if (!labelText && (!metadata || metadata.length === 0) && !annotationId && seeAlsoList.length === 0) {
    return null;
  }

  /**
   * Render a metadata value, converting URLs to clickable links
   */
  const renderValue = (value: string) => {
    const { text, url } = extractUrlFromValue(value);

    if (url) {
      return (
        <Link
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            color: 'primary.main',
            textDecoration: 'none',
            '&:hover': { textDecoration: 'underline' }
          }}
        >
          {text}
        </Link>
      );
    }

    return value;
  };

  // Both compact and non-compact modes now use the same improved layout
  return (
    <Box sx={{ mb: 1 }}>
      {/* Label as prominent title */}
      {labelText && (
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 'bold',
            mb: 0.5,
            color: 'primary.main',
            fontSize: '1rem'
          }}
        >
          {labelText}
        </Typography>
      )}

      {/* Annotation URI IIIF as clickable link */}
      {annotationId && isValidUrl(annotationId) && (
        <Box sx={{ mb: 0.5 }}>
          <Typography
            component="span"
            variant="caption"
            color="text.secondary"
            sx={{ fontStyle: 'italic' }}
          >
            Annotation URI IIIF:{' '}
          </Typography>
          <Link
            href={annotationId}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              fontSize: '0.75rem',
              fontStyle: 'italic',
              color: 'text.secondary',
              textDecoration: 'none',
              '&:hover': { textDecoration: 'underline', color: 'primary.main' }
            }}
          >
            {annotationId}
          </Link>
        </Box>
      )}

      {/* Metadata entries */}
      {metadata && metadata.length > 0 && (
        <Box component="dl" sx={{ m: 0 }}>
          {metadata.map((entry, index) => {
            const entryLabel = getLocalizedString(entry.label, prefs);
            // IIIF §4.4: show every value of the chosen language.
            const entryValues = getLocalizedStrings(entry.value, prefs).slice(0, MAX_METADATA_VALUES);
            return (
              <Box key={`${entryLabel}-${index}`} sx={{ mb: 0.5 }}>
                <Typography
                  component="dt"
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'inline' }}
                >
                  {entryLabel}:{' '}
                </Typography>
                <Typography
                  component="dd"
                  variant="body2"
                  sx={{ display: 'inline', m: 0 }}
                >
                  {entryValues.map((v, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && ', '}
                      {renderValue(v)}
                    </React.Fragment>
                  ))}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}

      {/* SeeAlso references */}
      {seeAlsoList.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontStyle: 'italic', display: 'block', mb: 0.5 }}
          >
            {seeAlsoHeading} :
          </Typography>
          {seeAlsoList.map((item, index) => {
            // 1. Extract the URL
            let url = '';
            if (typeof item.id === 'string') {
              url = item.id; // id is a plain URL
            } else if (typeof item.id === 'object' && item.id.url) {
              url = item.id.url; // id is an object with a url property
            }

            // 2. Pick the link text
            let displayLabel: string;
            if (typeof item.id === 'object' && item.id.url_label) {
              displayLabel = item.id.url_label; // url_label wins when present
            } else {
              displayLabel = getLocalizedString(item.label, prefs) || item.type || fallbackLinkLabel;
            }

            // 3. Skip entries without a valid URL
            if (!url || !isValidUrl(url)) {
              console.warn(`seeAlso entry at index ${index} has no valid URL.`, item);
              return null;
            }

            return (
              <Box key={url || index} sx={{ ml: 1, mb: 0.25 }}>
                <Link
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    fontSize: '0.85rem',
                    color: 'primary.main',
                    textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' }
                  }}
                >
                  {displayLabel}
                </Link>
                {item.type && (
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 0.5 }}
                  >
                    ({item.type})
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default MetadataDisplay;
