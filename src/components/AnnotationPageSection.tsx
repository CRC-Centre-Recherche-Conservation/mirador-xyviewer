/**
 * Collapsible, sticky section of the annotation panel: the annotations of one AnnotationPage.
 * Rendered as a flat sibling of the cards so the list keeps its keyboard order.
 */

import React from 'react';
import { ListSubheader, Typography } from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

export interface AnnotationPageSectionProps {
  /** Localized page label. */
  title: string;
  /** Annotations of the page currently listed. */
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  /** The page's cards, rendered only while expanded. */
  children?: React.ReactNode;
}

export const AnnotationPageSection: React.FC<AnnotationPageSectionProps> = ({
  title,
  count,
  collapsed,
  onToggle,
  children,
}) => (
  <>
    <ListSubheader
      component="li"
      role="none"
      disableGutters
      sx={{ lineHeight: 'normal', borderBottom: '1px solid', borderColor: 'divider', zIndex: 2 }}
    >
      <Typography
        component="button"
        type="button"
        variant="overline"
        aria-expanded={!collapsed}
        onClick={onToggle}
        // The enclosing menu would take Space/Enter as typeahead or selection.
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        sx={{
          all: 'unset',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          width: '100%',
          px: 1.5,
          py: 0.75,
          cursor: 'pointer',
          color: 'text.secondary',
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          '&:hover': { bgcolor: 'action.hover' },
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={title}>
          {title}
        </span>
        <span>{`· ${count}`}</span>
        {collapsed ? <ExpandMoreIcon fontSize="small" aria-hidden /> : <ExpandLessIcon fontSize="small" aria-hidden />}
      </Typography>
    </ListSubheader>
    {!collapsed && children}
  </>
);
