/**
 * AnnotationBodyRenderer Component
 * Main component that routes annotation bodies to appropriate renderers
 *
 * Handles:
 * - Case 1 (Manifest): Opens in new Mirador window
 * - Case 2 (Dataset): Fetches and plots spectrum
 * - Case 3 (TextualBody): Renders static text
 */

import React from 'react';
import { Box, Divider } from '@mui/material';
import type {
  AnnotationBody,
  LocalizedString,
} from '../types/iiif';
import {
  isManifestBody,
  isDatasetBody,
  isTextualBody,
  normalizeBody,
} from '../types/iiif';
import { ManifestBody } from './ManifestBody';
import { DatasetBody } from './DatasetBody';
import { TextualBody } from './TextualBody';
import type { SpectrumData } from '../types/dataset';

export interface AnnotationBodyRendererProps {
  /** The annotation body (single or array) */
  body: AnnotationBody | AnnotationBody[];
  /** Label from the parent annotation */
  annotationLabel?: LocalizedString;
  /** Dispatch function for Mirador actions */
  dispatch: (action: unknown) => void;
  /** Mirador addWindow action creator */
  addWindow: (config: { manifestId: string }) => unknown;
  /** Whether this annotation is currently selected */
  isActive?: boolean;
  /** Callback when spectrum data is loaded */
  onDataLoaded?: (id: string, data: SpectrumData) => void;
  /** Callback when spectrum visibility changes */
  onVisibilityChange?: (id: string, visible: boolean) => void;
}

export const AnnotationBodyRenderer: React.FC<AnnotationBodyRendererProps> = ({
  body,
  annotationLabel,
  dispatch,
  addWindow,
  isActive,
  onDataLoaded,
  onVisibilityChange,
}) => {
  const bodies = normalizeBody(body);

  return (
    <Box>
      {bodies.map((b, index) => (
        <React.Fragment key={b.id || `body-${index}`}>
          {index > 0 && <Divider sx={{ my: 1 }} />}
          <BodySwitch
            body={b}
            annotationLabel={annotationLabel}
            dispatch={dispatch}
            addWindow={addWindow}
            isActive={isActive}
            onDataLoaded={onDataLoaded}
            onVisibilityChange={onVisibilityChange}
          />
        </React.Fragment>
      ))}
    </Box>
  );
};

/** Internal component to switch on body type */
interface BodySwitchProps {
  body: AnnotationBody;
  annotationLabel?: LocalizedString;
  dispatch: (action: unknown) => void;
  addWindow: (config: { manifestId: string }) => unknown;
  isActive?: boolean;
  onDataLoaded?: (id: string, data: SpectrumData) => void;
  onVisibilityChange?: (id: string, visible: boolean) => void;
}

const BodySwitch: React.FC<BodySwitchProps> = ({
  body,
  annotationLabel,
  dispatch,
  addWindow,
  isActive,
  onDataLoaded,
  onVisibilityChange,
}) => {
  // Case 1: Manifest - render clickable link
  if (isManifestBody(body)) {
    return (
      <ManifestBody
        body={body}
        dispatch={dispatch}
        addWindow={addWindow}
        annotationLabel={annotationLabel}
      />
    );
  }

  // Case 2: Dataset - fetch and plot
  if (isDatasetBody(body)) {
    return (
      <DatasetBody
        body={body}
        annotationLabel={annotationLabel}
        isActive={isActive}
        onDataLoaded={onDataLoaded}
        onVisibilityChange={onVisibilityChange}
      />
    );
  }

  // Case 3: TextualBody - render static text
  if (isTextualBody(body)) {
    return <TextualBody body={body} />;
  }

  // Fallback: Unknown body type - render as JSON for debugging
  return (
    <Box sx={{ my: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
      <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
        {JSON.stringify(body, null, 2)}
      </code>
    </Box>
  );
};

export default AnnotationBodyRenderer;
