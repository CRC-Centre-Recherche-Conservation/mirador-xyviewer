/**
 * TextualBody Component
 * Case 3: Renders static text content from annotations
 *
 * Supports both text/plain and text/html formats:
 * - text/plain: Escapes all HTML entities
 * - text/html: Sanitizes HTML to allow only safe tags
 */

import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import type { TextualBody as TextualBodyType } from '../types/iiif';
import { sanitizeText, sanitizeHtml } from '../utils/security';

export interface TextualBodyProps {
  /** The textual body from the annotation */
  body: TextualBodyType;
}

export const TextualBody: React.FC<TextualBodyProps> = ({ body }) => {
  const isHtmlFormat = body.format === 'text/html';

  // Sanitize content based on format
  const safeContent = useMemo(() => {
    if (isHtmlFormat) {
      return sanitizeHtml(body.value);
    }
    return sanitizeText(body.value);
  }, [body.value, isHtmlFormat]);

  // For HTML format, render with dangerouslySetInnerHTML (content is sanitized)
  if (isHtmlFormat) {
    return (
      <Box sx={{ my: 1 }}>
        <Typography
          variant="body2"
          component="div"
          sx={{
            wordBreak: 'break-word',
            '& a': {
              color: 'primary.main',
              textDecoration: 'underline',
            },
            '& p': { my: 0.5 },
            '& ul, & ol': { pl: 2 },
          }}
          lang={body.language}
          dangerouslySetInnerHTML={{ __html: safeContent }}
        />
      </Box>
    );
  }

  // For plain text, render as text with preserved whitespace
  return (
    <Box sx={{ my: 1 }}>
      <Typography
        variant="body2"
        component="div"
        sx={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
        lang={body.language}
      >
        {safeContent}
      </Typography>
    </Box>
  );
};

export default TextualBody;
