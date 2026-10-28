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
  DatasetBody as DatasetBodyType,
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
import { pickLanguageKey } from '../utils/localization';
import { useLanguagePreferences } from '../utils/LanguageContext';
import type { SpectrumData, DatasetRequestOptions } from '../types/dataset';

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
  /** Optional IIIF Auth overrides forwarded to dataset fetches. */
  requestOptions?: DatasetRequestOptions;
  /** Called when a dataset needs auth (401/403); surfaces a "Sign in" button. */
  onAuthRequired?: (body: DatasetBodyType) => void | Promise<void>;
  /** Mirador HTML sanitization rule set for text/html bodies (default 'iiif'). */
  ruleSet?: string;
}

/**
 * Among TextualBodies that differ only by language (same type, purpose and format),
 * keep the reader's language (IIIF §4.4 / W3C `language`). Bodies without a
 * language, bodies that are alone in their group and non-textual bodies are kept;
 * order is preserved.
 * @internal Exposed for tests; not part of the public API.
 */
export function selectLanguageVariants(
  bodies: AnnotationBody[],
  preferredLanguages: string[]
): AnnotationBody[] {
  const groups = new Map<string, string[]>();
  const groupKey = (b: AnnotationBody & { language: string }) =>
    JSON.stringify([b.type, [b.purpose ?? []].flat().sort(), b.format ?? '']);

  for (const b of bodies) {
    if (!isTextualBody(b) || !b.language) continue;
    const k = groupKey(b as AnnotationBody & { language: string });
    const langs = groups.get(k) ?? [];
    if (!langs.some((l) => l.toLowerCase() === b.language!.toLowerCase())) langs.push(b.language);
    groups.set(k, langs);
  }

  const chosen = new Map<string, string>();
  for (const [k, langs] of groups) {
    if (langs.length < 2) continue;
    // Null prototype: `language` is untrusted and may be "__proto__".
    const map = Object.create(null) as LocalizedString;
    for (const l of langs) map[l] = [l];
    const picked = pickLanguageKey(map, preferredLanguages);
    if (picked) chosen.set(k, picked.toLowerCase());
  }
  if (chosen.size === 0) return bodies;

  return bodies.filter((b) => {
    if (!isTextualBody(b) || !b.language) return true;
    const picked = chosen.get(groupKey(b as AnnotationBody & { language: string }));
    return picked === undefined || b.language.toLowerCase() === picked;
  });
}

export const AnnotationBodyRenderer: React.FC<AnnotationBodyRendererProps> = ({
  body,
  annotationLabel,
  dispatch,
  addWindow,
  isActive,
  onDataLoaded,
  onVisibilityChange,
  requestOptions,
  onAuthRequired,
  ruleSet,
}) => {
  const prefs = useLanguagePreferences();
  const bodies = React.useMemo(
    () => selectLanguageVariants(normalizeBody(body), prefs),
    [body, prefs]
  );

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
            requestOptions={requestOptions}
            onAuthRequired={onAuthRequired}
            ruleSet={ruleSet}
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
  requestOptions?: DatasetRequestOptions;
  onAuthRequired?: (body: DatasetBodyType) => void | Promise<void>;
  /** Mirador HTML sanitization rule set for text/html bodies (default 'iiif'). */
  ruleSet?: string;
}

const BodySwitch: React.FC<BodySwitchProps> = ({
  body,
  annotationLabel,
  dispatch,
  addWindow,
  isActive,
  onDataLoaded,
  onVisibilityChange,
  requestOptions,
  onAuthRequired,
  ruleSet,
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
        requestOptions={requestOptions}
        onAuthRequired={onAuthRequired}
      />
    );
  }

  // Case 3: TextualBody - render static text
  if (isTextualBody(body)) {
    return <TextualBody body={body} ruleSet={ruleSet} />;
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
