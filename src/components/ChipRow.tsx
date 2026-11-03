/**
 * ChipRow
 * Term chips on at most two lines, then a "+N" chip that reveals the rest.
 */

import React, { useLayoutEffect, useRef, useState } from 'react';
import { Box, Chip } from '@mui/material';
import type { Term } from '../utils/classificationModel';
import { TermChip, type TermChipProps } from './TermChip';

const MAX_LINES = 2;

export interface ChipRowProps extends Omit<TermChipProps, 'term'> {
  terms: Term[];
}

/** Index of the first chip on a line beyond `MAX_LINES`, or -1 when all fit. */
function firstOverflow(tops: number[]): number {
  const lines = [...new Set(tops)].sort((a, b) => a - b);
  if (lines.length <= MAX_LINES) return -1;
  return tops.findIndex((t) => t >= lines[MAX_LINES]);
}

const Row: React.FC<ChipRowProps> = ({ terms, ...chip }) => {
  const ref = useRef<HTMLDivElement>(null);
  // null: not measured yet (everything is rendered so it can be).
  const [limit, setLimit] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    if (limit !== null || expanded || !ref.current) return;
    const tops = [...ref.current.children].map((c) => (c as HTMLElement).offsetTop);
    const at = firstOverflow(tops);
    // Leave room for the "+N" chip.
    setLimit(at < 0 ? terms.length : Math.max(1, at - 1));
  }, [limit, expanded, terms.length]);

  const shown = expanded || limit === null ? terms : terms.slice(0, limit);
  const hidden = terms.length - shown.length;

  return (
    <Box ref={ref} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {shown.map((t, i) => (
        <TermChip key={`${t.key}-${i}`} term={t} {...chip} />
      ))}
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

export const ChipRow: React.FC<ChipRowProps> = (props) => (
  // Re-measure when the terms change.
  <Row key={props.terms.map((t) => t.key).join('|')} {...props} />
);

export default ChipRow;
