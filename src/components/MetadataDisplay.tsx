/**
 * MetadataDisplay Component
 * Renders IIIF metadata entries with proper localization
 */

import React from 'react';
import { Box, Typography, Link } from '@mui/material';
import type { MetadataEntry, LocalizedString, SeeAlsoEntry } from '../types/iiif';
import { getLocalizedString } from '../utils/localization';

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
}

/**
 * Extract URL from a value string that may contain text and URL
 * Format: "Text label (http://...)" or just "http://..."
 */
function extractUrlFromValue(value: string): { text: string; url: string | null } {
  // Check if value contains a URL in parentheses: "Label (http://...)"
  const urlInParensMatch = value.match(/^(.+?)\s*\((https?:\/\/[^)]+)\)$/);
  if (urlInParensMatch) {
    return { text: urlInParensMatch[1].trim(), url: urlInParensMatch[2] };
  }

  // Check if the entire value is a URL
  const urlMatch = value.match(/^(https?:\/\/\S+)$/);
  if (urlMatch) {
    return { text: value, url: urlMatch[1] };
  }

  return { text: value, url: null };
}

/**
 * Check if a string is a valid URL
 */
function isValidUrl(str: string): boolean {
  return /^https?:\/\//.test(str);
}

export const MetadataDisplay: React.FC<MetadataDisplayProps> = ({
  label,
  metadata,
  annotationId,
  seeAlso,
  compact: _compact = false,
}) => {
  // _compact is kept for API compatibility but the layout is now unified
  const labelText = getLocalizedString(label);

  // Normalize seeAlso to array
  const seeAlsoList = seeAlso ? (Array.isArray(seeAlso) ? seeAlso : [seeAlso]) : [];

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
          fontWeight="bold"
          sx={{
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
            const entryLabel = getLocalizedString(entry.label);
            const entryValue = getLocalizedString(entry.value);
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
                  {renderValue(entryValue)}
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
            Linked resources :
          </Typography>
          {seeAlsoList.map((item, index) => {
            // 1. Extraction de l'URL
            let url = '';
            if (typeof item.id === 'string') {
              url = item.id; // Cas 1: id est une URL directe
            } else if (typeof item.id === 'object' && item.id.url) {
              url = item.id.url; // Cas 2: id est un objet avec une propriété url
            }

            // 2. Extraction du libellé à afficher
            let displayLabel = '';
            if (typeof item.id === 'object' && item.id.url_label) {
              displayLabel = item.id.url_label; // Priorité à url_label si disponible
            } else {
              displayLabel = getLocalizedString(item.label) || item.type || 'Ressource liée'; // Fallback
            }

            // 3. Affichage conditionnel
            if (!url) {
              console.warn(`L'élément seeAlso à l'index ${index} n'a pas d'URL valide.`, item);
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
                {item.format && (
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 0.5 }}
                  >
                    ({item.format})
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
