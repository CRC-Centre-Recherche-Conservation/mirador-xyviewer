/**
 * EvidenceLinkBody Component
 * Renders linking SpecificResource bodies (purpose `linking`) as an "Evidence" button
 * that selects the linked annotation when it is on the current canvas.
 */

import React, { useMemo } from 'react';
import { Box, Button, Tooltip } from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';
import type { SpecificResourceBody as SpecificResourceBodyType } from '../types/iiif';
import { srSourceId } from '../types/iiif';

export interface EvidenceLinkBodyProps {
  /** Linking SpecificResource bodies to show as one block. */
  bodies: SpecificResourceBodyType[];
  /** Mirador window the annotation belongs to. */
  windowId?: string;
  /** Mirador `selectAnnotation(windowId, annotationId)`. */
  selectAnnotation?: (windowId: string, annotationId: string) => void;
  /** Ids of the annotations on the current canvas. */
  canvasAnnotationIds?: Iterable<string>;
  /** Button label (default "Evidence"). */
  label?: string;
  /** Tooltip when the linked annotation is not on this canvas. */
  unavailableLabel?: string;
}

/**
 * The canvas annotation id a link points to: the exact id, else the `#target-N`
 * form produced when a multi-target annotation is expanded.
 * @internal Exposed for tests; not part of the public API.
 */
export function resolveLinkedAnnotationId(
  sourceId: string,
  canvasAnnotationIds: Iterable<string>,
): string | undefined {
  if (!sourceId) return undefined;
  let expanded: string | undefined;
  for (const id of canvasAnnotationIds) {
    if (id === sourceId) return id;
    if (expanded === undefined && id.startsWith(`${sourceId}#target-`)) expanded = id;
  }
  return expanded;
}

export const EvidenceLinkBody: React.FC<EvidenceLinkBodyProps> = ({
  bodies,
  windowId,
  selectAnnotation,
  canvasAnnotationIds,
  label = 'Evidence',
  unavailableLabel = 'This annotation is not on the current canvas',
}) => {
  const targets = useMemo(() => {
    const ids = canvasAnnotationIds ? [...canvasAnnotationIds] : [];
    return bodies.map((body) => resolveLinkedAnnotationId(srSourceId(body), ids));
  }, [bodies, canvasAnnotationIds]);

  return (
    <Box sx={{ my: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {targets.map((target, index) => {
        const enabled = !!target && !!windowId && !!selectAnnotation;
        return (
          <Tooltip key={index} describeChild title={enabled ? '' : unavailableLabel}>
            {/* aria-disabled (not disabled) keeps the button focusable so the reason is reachable. */}
            <Button
              size="small"
              variant="outlined"
              startIcon={<LinkIcon />}
              aria-disabled={!enabled}
              aria-label={targets.length > 1 ? `${label} ${index + 1}` : undefined}
              onClick={(e) => {
                // Inside a selectable list item: do not toggle it.
                e.stopPropagation();
                if (enabled) selectAnnotation(windowId, target);
              }}
              sx={{
                textTransform: 'none',
                ...(enabled ? {} : { opacity: 0.5, cursor: 'default' }),
              }}
            >
              {label}
            </Button>
          </Tooltip>
        );
      })}
    </Box>
  );
};

export default EvidenceLinkBody;
