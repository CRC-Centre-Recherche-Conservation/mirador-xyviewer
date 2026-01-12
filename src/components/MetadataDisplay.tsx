/**
 * MetadataDisplay Component
 * Renders IIIF metadata entries with proper localization
 */

import React from 'react';
import { Box, Typography, Chip, Stack } from '@mui/material';
import type { MetadataEntry, LocalizedString } from '../types/iiif';
import { getLocalizedString } from '../utils/localization';
import { escapeHtml } from '../utils/security';

export interface MetadataDisplayProps {
  /** Label of the annotation */
  label?: LocalizedString;
  /** Metadata entries */
  metadata?: MetadataEntry[];
  /** Compact mode - shows metadata as chips */
  compact?: boolean;
}

export const MetadataDisplay: React.FC<MetadataDisplayProps> = ({
  label,
  metadata,
  compact = false,
}) => {
  const labelText = getLocalizedString(label);

  if (!labelText && (!metadata || metadata.length === 0)) {
    return null;
  }

  if (compact) {
    return (
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
        {labelText && (
          <Chip
            label={escapeHtml(labelText)}
            size="small"
            color="primary"
            variant="outlined"
          />
        )}
        {metadata?.map((entry, index) => {
          const entryLabel = getLocalizedString(entry.label);
          const entryValue = getLocalizedString(entry.value);
          return (
            <Chip
              key={`${entryLabel}-${index}`}
              label={`${escapeHtml(entryLabel)}: ${escapeHtml(entryValue)}`}
              size="small"
              variant="outlined"
            />
          );
        })}
      </Stack>
    );
  }

  return (
    <Box sx={{ mb: 1 }}>
      {labelText && (
        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
          {escapeHtml(labelText)}
        </Typography>
      )}
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
                  {escapeHtml(entryLabel)}:{' '}
                </Typography>
                <Typography
                  component="dd"
                  variant="body2"
                  sx={{ display: 'inline', m: 0 }}
                >
                  {escapeHtml(entryValue)}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default MetadataDisplay;
