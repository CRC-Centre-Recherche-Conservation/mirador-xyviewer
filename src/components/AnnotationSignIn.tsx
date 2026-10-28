/**
 * AnnotationSignIn
 * Quiet "Sign in" notice for annotation pages that declare a trusted IIIF Auth service.
 * Rendered by the annotation panel only when a handler says a login can start.
 */
import React, { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { getAnnotationAuth } from '../services/annotationAuth';
import type { AnnotationPageRef } from '../services/annotationAuth';

export interface AnnotationSignInProps {
  page: AnnotationPageRef;
}

export const AnnotationSignIn: React.FC<AnnotationSignInProps> = ({ page }) => {
  const [busy, setBusy] = useState(false);

  const onClick = async (): Promise<void> => {
    setBusy(true);
    try {
      // Call synchronously from the click so the login popup is not blocked.
      await getAnnotationAuth()?.signIn(page);
    } catch (err) {
      console.debug('[mirador-xyviewer] annotation sign-in did not complete:', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, flexWrap: 'wrap' }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>
        Some annotations may be visible only after signing in.
      </Typography>
      <Button size="small" variant="outlined" onClick={onClick} disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </Box>
  );
};

export default AnnotationSignIn;
