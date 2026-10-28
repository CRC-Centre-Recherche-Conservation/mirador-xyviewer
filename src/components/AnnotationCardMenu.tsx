/**
 * AnnotationCardMenu
 * The "⋮" menu of an annotation card: copy the annotation id, open its JSON, other links.
 */

import React, { useState } from 'react';
import { IconButton, Menu, MenuItem } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { isValidUrl } from '../utils/security';
import { DEFAULT_ANNOTATION_LABELS } from '../utils/annotationLabels';

export interface AnnotationCardMenuProps {
  /** IIIF id of the annotation. */
  annotationId?: string;
  /** Hide "Open JSON" when the id is already shown as a link. */
  hideJson?: boolean;
  /** Extra links (e.g. machine-readable seeAlso). */
  links?: Array<{ href: string; label: string }>;
  labels?: { cardMenu: string; copyAnnotationId: string; openJson: string };
}

export const AnnotationCardMenu: React.FC<AnnotationCardMenuProps> = ({
  annotationId,
  hideJson,
  links = [],
  labels = DEFAULT_ANNOTATION_LABELS,
}) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const jsonUrl = annotationId && isValidUrl(annotationId) ? annotationId : undefined;
  const showJson = !!jsonUrl && !hideJson;
  if (!annotationId && links.length === 0) return null;
  const close = () => setAnchor(null);

  const copy = () => {
    // Clipboard is unavailable on insecure origins; failing quietly is enough.
    void Promise.resolve(globalThis.navigator?.clipboard?.writeText(annotationId!)).catch(() => undefined);
    close();
  };

  const external = (href: string, label: string) => (
    <MenuItem key={href} component="a" href={href} target="_blank" rel="noopener noreferrer" onClick={close}>
      {label}&nbsp;
      <OpenInNewIcon fontSize="inherit" aria-hidden />
    </MenuItem>
  );

  return (
    <>
      <IconButton
        size="small"
        aria-label={labels.cardMenu}
        aria-haspopup="menu"
        aria-expanded={anchor ? true : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(e.currentTarget);
        }}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={close}
        onClick={(e) => e.stopPropagation()}
        slotProps={{ list: { dense: true, 'aria-label': labels.cardMenu } }}
      >
        {annotationId && <MenuItem onClick={copy}>{labels.copyAnnotationId}</MenuItem>}
        {showJson && external(jsonUrl, labels.openJson)}
        {links.map((l) => external(l.href, l.label))}
      </Menu>
    </>
  );
};

export default AnnotationCardMenu;
