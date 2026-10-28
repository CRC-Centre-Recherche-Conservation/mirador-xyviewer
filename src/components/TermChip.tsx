/**
 * TermChip
 * A term as a chip. When it has actions it opens a small menu instead of leaving the page;
 * "Open in vocabulary" is built in, other entries are passed in `actions`.
 */

import React, { useState } from 'react';
import { Chip, Menu, MenuItem } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { Term } from '../utils/classificationModel';
import { isValidUrl } from '../utils/security';

export interface TermChipAction {
  key: string;
  label: string;
  onClick: (term: Term) => void;
}

export interface TermChipProps {
  term: Term;
  variant?: 'filled' | 'outlined';
  /** Label of the built-in link entry (default "Open in vocabulary"). */
  openVocabularyLabel?: string;
  /** Extra menu entries, shown before the vocabulary link. */
  actions?: TermChipAction[];
}

export const TermChip: React.FC<TermChipProps> = ({
  term,
  variant = 'outlined',
  openVocabularyLabel = 'Open in vocabulary',
  actions = [],
}) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const href = term.uri && isValidUrl(term.uri) ? term.uri : undefined;
  const interactive = !!href || actions.length > 0;
  const close = () => setAnchor(null);

  return (
    <>
      <Chip
        size="small"
        variant={variant}
        label={term.label}
        title={term.uri || undefined}
        {...(interactive
          ? {
              clickable: true,
              'aria-haspopup': 'menu' as const,
              'aria-expanded': anchor ? true : undefined,
              onClick: (e: React.MouseEvent<HTMLElement>) => {
                // The card must not toggle its selection.
                e.stopPropagation();
                setAnchor(e.currentTarget);
              },
            }
          : {})}
      />
      {interactive && (
        <Menu
          anchorEl={anchor}
          open={!!anchor}
          onClose={close}
          onClick={(e) => e.stopPropagation()}
          slotProps={{ list: { dense: true, 'aria-label': term.label } }}
        >
          {actions.map((a) => (
            <MenuItem
              key={a.key}
              onClick={() => {
                a.onClick(term);
                close();
              }}
            >
              {a.label}
            </MenuItem>
          ))}
          {href && (
            <MenuItem component="a" href={href} target="_blank" rel="noopener noreferrer" onClick={close}>
              {openVocabularyLabel}&nbsp;
              <OpenInNewIcon fontSize="inherit" aria-hidden />
            </MenuItem>
          )}
        </Menu>
      )}
    </>
  );
};

export default TermChip;
