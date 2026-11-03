/**
 * CitedBy
 * The annotations that link to this one (inverse index), as chips; a click selects the
 * citing annotation and remembers this one for the back link.
 */

import React, { useState } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import type { AnnotationBodyLabels } from '../types/mirador';
import { resolveLabels } from '../utils/annotationLabels';
import { citingEntries } from '../utils/linkIndex';
import { useLinkContext } from './LinkContext';

const VISIBLE = 3;

export interface CitedByProps {
  annotationId: string;
  labels?: AnnotationBodyLabels;
}

export const CitedBy: React.FC<CitedByProps> = ({ annotationId, labels }) => {
  const ctx = useLinkContext();
  const [expanded, setExpanded] = useState(false);
  if (!ctx) return null;
  const citing = citingEntries(ctx.index, annotationId);
  if (citing.length === 0) return null;

  const caption = resolveLabels(labels).citedBy;
  const shown = expanded ? citing : citing.slice(0, VISIBLE);
  const hidden = citing.length - shown.length;
  const restore = () => ctx.hover(ctx.groupOf(annotationId));
  // Computed when the pointer arrives, not on every render.
  const hoverEntry = (id: string) => ctx.hover(ctx.groupOf(id));

  return (
    <Box role="group" aria-label={caption} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
      <Typography variant="caption" color="text.secondary">
        {caption}
      </Typography>
      {shown.map((entry) => {
        const id = entry.ids[0];
        return (
          <Chip
            key={entry.id}
            size="small"
            variant="outlined"
            clickable
            label={ctx.titleOf(id)}
            title={ctx.titleOf(id)}
            sx={{ maxWidth: '100%' }}
            onClick={(e) => {
              e.stopPropagation();
              ctx.follow(annotationId, { annotationId: id, canvasId: entry.canvasId });
            }}
            onMouseEnter={() => hoverEntry(id)}
            onFocus={(e) => {
              e.stopPropagation();
              hoverEntry(id);
            }}
            onMouseLeave={restore}
            onBlur={restore}
          />
        );
      })}
      {hidden > 0 && (
        <Chip
          size="small"
          label={`+${hidden}`}
          clickable
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
        />
      )}
    </Box>
  );
};

export default CitedBy;
