/**
 * LinkedAnnotationList
 * The annotations a `linking` body points to, one named row per target. Rows on this canvas
 * highlight their zone on hover and focus and select it on click; rows on another canvas
 * open that canvas first; unresolved ones stay focusable and say why they are disabled.
 */

import React, { useMemo } from 'react';
import { Box, Button, ListItemButton, Tooltip, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import type { SpecificResourceBody } from '../types/iiif';
import type { AnnotationBodyLabels } from '../types/mirador';
import { fillTemplate, resolveLabels } from '../utils/annotationLabels';
import { EMPTY_LINK_INDEX, buildLinkRows, type LinkRow } from '../utils/linkIndex';
import { useLanguagePreferences } from '../utils/LanguageContext';
import { useLinkContext, type LinkContextValue } from './LinkContext';

export interface LinkedAnnotationListProps {
  bodies: SpecificResourceBody[];
  /** The annotation holding these links (for hover restore, the back link and "Show all"). */
  ownerId?: string;
  labels?: AnnotationBodyLabels;
  /** Standalone use, without the plugin's link context: */
  windowId?: string;
  selectAnnotation?: (windowId: string, annotationId: string) => void;
  canvasAnnotationIds?: Iterable<string>;
}

const NOOP = () => {};
const NO_IDS = new Set<string>();

export const LinkedAnnotationList: React.FC<LinkedAnnotationListProps> = ({
  bodies,
  ownerId,
  labels,
  windowId,
  selectAnnotation,
  canvasAnnotationIds,
}) => {
  const prefs = useLanguagePreferences();
  const text = useMemo(() => resolveLabels(labels), [labels]);
  const provided = useLinkContext();
  const standaloneIds = useMemo(() => [...(canvasAnnotationIds ?? [])], [canvasAnnotationIds]);
  const ctx: LinkContextValue = useMemo(
    () =>
      provided ?? {
        windowId,
        index: EMPTY_LINK_INDEX,
        canvasAnnotationIds: standaloneIds,
        hiddenIds: NO_IDS,
        hover: NOOP,
        groupOf: (id) => [id],
        follow: (_owner, to) => {
          if (windowId && selectAnnotation) selectAnnotation(windowId, to.annotationId);
        },
        showAll: NOOP,
        titleOf: (id) => id,
      },
    [provided, windowId, selectAnnotation, standaloneIds],
  );

  const rows = useMemo(
    () =>
      buildLinkRows(bodies, {
        index: ctx.index,
        canvasId: ctx.canvasId,
        canvasAnnotationIds: ctx.canvasAnnotationIds,
        prefs,
        hiddenIds: ctx.hiddenIds,
        subtitleLabel: ctx.subtitleLabel,
      }),
    [bodies, ctx, prefs],
  );
  if (rows.length === 0) return null;

  const restoreHover = () => ctx.hover(ownerId ? ctx.groupOf(ownerId) : []);
  const canFrame = !!ownerId && rows.some((r) => r.kind === 'here');
  const locationOf = (row: LinkRow): string =>
    row.kind === 'here'
      ? text.linkOnThisPage
      : row.kind === 'other'
        ? fillTemplate(text.linkOnCanvas, { canvas: row.canvasLabel ?? '' })
        : row.kind === 'unavailable'
          ? text.linkUnavailable
          : '';

  return (
    <Box role="group" aria-label={text.linkedAnnotations} sx={{ mt: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          {`${text.linkedAnnotations} · ${rows.length}`}
        </Typography>
        {canFrame && (
          <Button
            size="small"
            startIcon={<ZoomOutMapIcon fontSize="inherit" />}
            onClick={(e) => {
              e.stopPropagation();
              ctx.showAll(ownerId!);
            }}
            sx={{ textTransform: 'none', py: 0 }}
          >
            {text.showAll}
          </Button>
        )}
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {rows.map((row, i) => {
          const external = row.kind === 'external';
          const disabled = row.kind === 'unavailable';
          const location = locationOf(row);
          const detail = [row.subtitle, location].filter(Boolean).join(' · ');
          const hidden = row.hiddenByFilter;
          const ariaDetails = [
            row.title,
            row.subtitle,
            location,
            row.kind === 'other' ? text.goToPage : '',
            hidden ? text.hiddenByFilter : '',
          ]
            .filter(Boolean)
            .join(', ');
          const hoverIds = row.kind === 'here' && row.annotationId ? [row.annotationId] : null;
          const interactive = {
            onMouseEnter: () => hoverIds && ctx.hover(hoverIds),
            onFocus: (e: React.FocusEvent) => {
              if (!hoverIds) return;
              // The card's own focus handler would light the whole group instead.
              e.stopPropagation();
              ctx.hover(hoverIds);
            },
            onMouseLeave: () => hoverIds && restoreHover(),
            onBlur: () => hoverIds && restoreHover(),
          };

          const body = (
            <>
              <Typography variant="caption" color="text.secondary" aria-hidden sx={{ minWidth: 18, pt: 0.25 }}>
                {i + 1}
              </Typography>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Tooltip title={row.title} enterDelay={600} describeChild>
                  <Typography
                    variant="body2"
                    noWrap
                    sx={disabled ? { fontFamily: 'monospace' } : undefined}
                  >
                    {row.title}
                    {hidden && (
                      <Typography component="span" variant="caption" color="text.secondary">
                        {` ${text.hiddenByFilter}`}
                      </Typography>
                    )}
                  </Typography>
                </Tooltip>
                {detail && (
                  <Typography variant="caption" color="text.secondary" component="div" noWrap>
                    {detail}
                    {row.kind === 'other' && ` · ${text.goToPage}`}
                  </Typography>
                )}
              </Box>
              {external && <OpenInNewIcon fontSize="small" aria-hidden />}
            </>
          );

          return (
            <Box component="li" key={row.key}>
              {external ? (
                <ListItemButton
                  component="a"
                  href={row.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  sx={{ gap: 1, px: 0.5, py: 0.25, alignItems: 'flex-start' }}
                >
                  {body}
                </ListItemButton>
              ) : (
                <ListItemButton
                  // aria-disabled (not disabled) keeps the row focusable so the reason is reachable.
                  aria-disabled={disabled || undefined}
                  aria-label={fillTemplate(text.selectLinked, { n: i + 1, total: rows.length, details: ariaDetails })}
                  {...interactive}
                  onClick={(e: React.MouseEvent) => {
                    // Inside a selectable card: do not toggle it.
                    e.stopPropagation();
                    if (!disabled && row.annotationId) {
                      ctx.follow(ownerId, { annotationId: row.annotationId, canvasId: row.canvasId });
                    }
                  }}
                  sx={{
                    gap: 1,
                    px: 0.5,
                    py: 0.25,
                    alignItems: 'flex-start',
                    opacity: hidden || disabled ? 0.6 : 1,
                    cursor: disabled ? 'default' : 'pointer',
                  }}
                >
                  {body}
                </ListItemButton>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default LinkedAnnotationList;
