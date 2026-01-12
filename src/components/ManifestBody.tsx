/**
 * ManifestBody Component
 * Case 1: Renders a clickable link that opens a manifest in a new Mirador window
 *
 * IMPORTANT: Does NOT fetch the manifest - delegates to Mirador's internal system
 */

import React, { useCallback, useMemo } from 'react';
import {
  Button,
  Box,
  Typography,
  Tooltip,
  Alert,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningIcon from '@mui/icons-material/Warning';
import type { ManifestBody as ManifestBodyType, LocalizedString } from '../types/iiif';
import { getLocalizedString } from '../utils/localization';
import { escapeHtml, isValidUrl } from '../utils/security';

export interface ManifestBodyProps {
  /** The manifest body from the annotation */
  body: ManifestBodyType;
  /** Dispatch function to trigger Mirador actions */
  dispatch: (action: unknown) => void;
  /** Mirador addWindow action creator */
  addWindow: (config: { manifestId: string }) => unknown;
  /** Optional: Additional label from annotation */
  annotationLabel?: LocalizedString;
}

export const ManifestBody: React.FC<ManifestBodyProps> = ({
  body,
  dispatch,
  addWindow,
  annotationLabel,
}) => {
  // Validate URL on render
  const isUrlValid = useMemo(() => isValidUrl(body.id), [body.id]);

  const handleClick = useCallback(() => {
    // Only dispatch if URL is valid (defense in depth)
    if (!isUrlValid) {
      console.error('[ManifestBody] Blocked invalid URL:', body.id);
      return;
    }
    // Dispatch Mirador action to open manifest in new window
    dispatch(addWindow({ manifestId: body.id }));
  }, [dispatch, addWindow, body.id, isUrlValid]);

  // Get display label (prefer body label, fall back to annotation label)
  const displayLabel = getLocalizedString(body.label) ||
    getLocalizedString(annotationLabel) ||
    'Open related manifest';

  // Show warning for invalid URLs
  if (!isUrlValid) {
    return (
      <Box sx={{ my: 1 }}>
        <Alert
          severity="warning"
          icon={<WarningIcon fontSize="small" />}
          sx={{ py: 0.5 }}
        >
          <Typography variant="body2">
            Invalid manifest URL (only http/https allowed)
          </Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ my: 1 }}>
      <Tooltip title={escapeHtml(body.id)} placement="top">
        <Button
          variant="outlined"
          size="small"
          onClick={handleClick}
          startIcon={<OpenInNewIcon />}
          sx={{
            textTransform: 'none',
            maxWidth: '100%',
            justifyContent: 'flex-start',
          }}
        >
          <Typography
            variant="body2"
            noWrap
            sx={{ maxWidth: 200 }}
          >
            {escapeHtml(displayLabel)}
          </Typography>
        </Button>
      </Tooltip>
    </Box>
  );
};

export default ManifestBody;
