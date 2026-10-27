/**
 * TextualBody Component
 * Case 3: Renders static text content from annotations
 *
 * - text/plain: rendered as a React text child (escaped by React)
 * - text/html: sanitized by Mirador's SanitizedHtml with the configured rule set
 */

import React from 'react';
import { SanitizedHtml } from 'mirador';
import { Box, Typography } from '@mui/material';
import type { TextualBody as TextualBodyType } from '../types/iiif';

export interface TextualBodyProps {
  /** The textual body from the annotation */
  body: TextualBodyType;
  /** Mirador HTML sanitization rule set (iiif, liberal, mirador2, noHtml) */
  ruleSet?: string;
}

export const TextualBody: React.FC<TextualBodyProps> = ({ body, ruleSet = 'iiif' }) => {
  const isHtmlFormat = body.format === 'text/html';

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
        >
          <SanitizedHtml ruleSet={ruleSet} htmlString={body.value} />
        </Typography>
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
        {body.value}
      </Typography>
    </Box>
  );
};

export default TextualBody;
