/**
 * TermChip
 * A term as a chip. When it has actions it opens a small menu instead of leaving the page;
 * "Open in vocabulary" is built in, other entries are passed in `actions`.
 */

import React, { useRef, useState } from 'react';
import { Chip, Menu, MenuItem } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import type { Term } from '../utils/classificationModel';
import { isValidUrl } from '../utils/security';
import { useTermActions, type TermFacetRef } from './TermActionsContext';

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
  /** Filter group of the term: adds "Filter by" and "Highlight" entries when the canvas is filterable. */
  facet?: TermFacetRef;
  /** State appended to the accessible name while the term filters (default "filter active"). */
  filterActiveLabel?: string;
}

export const TermChip: React.FC<TermChipProps> = ({
  term,
  variant = 'outlined',
  openVocabularyLabel = 'Open in vocabulary',
  actions: ownActions = [],
  facet,
  filterActiveLabel,
}) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // Run after the menu closed: its focus restore would otherwise override the action (hover).
  const pending = useRef<(() => void) | undefined>(undefined);
  const termActions = useTermActions();
  const actions = facet && termActions ? [...termActions.actionsFor(term, facet), ...ownActions] : ownActions;
  const filtering = !!facet && !!termActions?.isFiltering(term, facet);
  const href = term.uri && isValidUrl(term.uri) ? term.uri : undefined;
  const interactive = !!href || actions.length > 0;
  const close = () => setAnchor(null);

  return (
    <>
      <Chip
        size="small"
        variant={variant}
        label={term.label}
        {...(filtering ? { icon: <FilterAltIcon fontSize="small" /> } : {})}
        title={term.uri || undefined}
        {...(filtering ? { 'aria-label': `${term.label} (${filterActiveLabel ?? termActions?.filterActiveLabel ?? 'filter active'})` } : {})}
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
          slotProps={{
            list: { dense: true, 'aria-label': term.label },
            transition: {
              onExited: () => {
                const run = pending.current;
                pending.current = undefined;
                run?.();
              },
            },
          }}
        >
          {actions.map((a) => (
            <MenuItem
              key={a.key}
              onClick={() => {
                pending.current = () => a.onClick(term);
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
