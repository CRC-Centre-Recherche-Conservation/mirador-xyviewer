/**
 * AnnotationBodyRenderer Component
 * Main component that routes annotation bodies to appropriate renderers
 *
 * Handles:
 * - Case 1 (Manifest): Opens in new Mirador window
 * - Case 2 (Dataset): Fetches and plots spectrum
 * - Case 3 (TextualBody): Renders static text
 * - Case 4 (SpecificResource): Chips, or an "Evidence" button for purpose `linking`
 * - Case 5 (Choice): Renders one alternative
 * Unknown body types render nothing.
 */

import React from 'react';
import { Box, Divider } from '@mui/material';
import type {
  AnnotationBody,
  ChoiceBody,
  LocalizedString,
  DatasetBody as DatasetBodyType,
  SpecificResourceBody as SpecificResourceBodyType,
} from '../types/iiif';
import {
  isManifestBody,
  isDatasetBody,
  isTextualBody,
  isSpecificResourceBody,
  isChoiceBody,
  isLinkingBody,
  stringPurposes,
  stringLanguages,
  normalizeBody,
} from '../types/iiif';
import { ErrorBoundary, ErrorNotice } from './ErrorBoundary';
import { ManifestBody } from './ManifestBody';
import { DatasetBody } from './DatasetBody';
import { TextualBody } from './TextualBody';
import { SpecificResourceBody } from './SpecificResourceBody';
import { EvidenceLinkBody } from './EvidenceLinkBody';
import { pickLanguageKey } from '../utils/localization';
import { useLanguagePreferences } from '../utils/LanguageContext';
import type { SpectrumData, DatasetRequestOptions } from '../types/dataset';

/** User-facing strings, overridable by the host. */
export interface AnnotationBodyLabels {
  /** Linking button (default "Evidence"). */
  evidence?: string;
  /** Tooltip of a linking button whose target is not on the canvas. */
  evidenceUnavailable?: string;
  /** Caption per SpecificResource purpose (default: the purpose itself). */
  purposes?: Record<string, string>;
}

/** Selection wiring for linking bodies. */
interface LinkingProps {
  windowId?: string;
  selectAnnotation?: (windowId: string, annotationId: string) => void;
  canvasAnnotationIds?: Iterable<string>;
  labels?: AnnotationBodyLabels;
}

/** Deepest Choice-in-Choice nesting rendered. */
const MAX_CHOICE_DEPTH = 3;

export interface AnnotationBodyRendererProps extends LinkingProps {
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
  const groupKey = (b: AnnotationBody) =>
    JSON.stringify([b.type, stringPurposes(b).sort(), b.format ?? '']);
  // Only a single string `language` tags a TextualBody variant; other shapes are left alone.
  const langOf = (b: AnnotationBody): string | undefined =>
    isTextualBody(b) && typeof b.language === 'string' && b.language ? b.language : undefined;

  for (const b of bodies) {
    const lang = langOf(b);
    if (!lang) continue;
    const k = groupKey(b);
    const langs = groups.get(k) ?? [];
    if (!langs.some((l) => l.toLowerCase() === lang.toLowerCase())) langs.push(lang);
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
    const lang = langOf(b);
    if (!lang) return true;
    const picked = chosen.get(groupKey(b));
    return picked === undefined || lang.toLowerCase() === picked;
  });
}

/** A run of bodies rendered as one block: chips, linking buttons or a single other body. */
type Segment =
  | { kind: 'chips'; bodies: SpecificResourceBodyType[] }
  | { kind: 'links'; bodies: SpecificResourceBodyType[] }
  | { kind: 'body'; body: AnnotationBody };

/** Gather all chips (and all linking buttons) into one block at their first position. */
function toSegments(bodies: AnnotationBody[]): Segment[] {
  const out: Segment[] = [];
  let chips: Extract<Segment, { kind: 'chips' }> | undefined;
  let links: Extract<Segment, { kind: 'links' }> | undefined;
  for (const b of bodies) {
    if (isSpecificResourceBody(b)) {
      if (isLinkingBody(b)) {
        if (!links) out.push((links = { kind: 'links', bodies: [] }));
        links.bodies.push(b);
      } else {
        if (!chips) out.push((chips = { kind: 'chips', bodies: [] }));
        chips.bodies.push(b);
      }
    } else {
      out.push({ kind: 'body', body: b });
    }
  }
  return out;
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
  windowId,
  selectAnnotation,
  canvasAnnotationIds,
  labels,
}) => {
  const prefs = useLanguagePreferences();
  const segments = React.useMemo(
    () =>
      toSegments(
        selectLanguageVariants(
          normalizeBody(body).filter((b) => b && typeof b === 'object'),
          prefs
        )
      ),
    [body, prefs]
  );

  return (
    <Box>
      {segments.map((segment, index) => (
        <React.Fragment key={index}>
          {index > 0 && <Divider sx={{ my: 1 }} />}
          <ErrorBoundary resetKey={segment} label="annotation body" fallback={<ErrorNotice />}>
            <SegmentView
              segment={segment}
              annotationLabel={annotationLabel}
              dispatch={dispatch}
              addWindow={addWindow}
              isActive={isActive}
              onDataLoaded={onDataLoaded}
              onVisibilityChange={onVisibilityChange}
              requestOptions={requestOptions}
              onAuthRequired={onAuthRequired}
              ruleSet={ruleSet}
              windowId={windowId}
              selectAnnotation={selectAnnotation}
              canvasAnnotationIds={canvasAnnotationIds}
              labels={labels}
            />
          </ErrorBoundary>
        </React.Fragment>
      ))}
    </Box>
  );
};

interface SegmentViewProps extends LinkingProps {
  segment: Segment;
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
  /** Choice nesting level (bounds the recursion). */
  depth?: number;
}

const SegmentView: React.FC<SegmentViewProps> = ({ segment, depth = 0, ...props }) => {
  const prefs = useLanguagePreferences();

  if (segment.kind === 'chips') {
    return <SpecificResourceBody bodies={segment.bodies} purposeLabels={props.labels?.purposes} />;
  }

  if (segment.kind === 'links') {
    return (
      <EvidenceLinkBody
        bodies={segment.bodies}
        windowId={props.windowId}
        selectAnnotation={props.selectAnnotation}
        canvasAnnotationIds={props.canvasAnnotationIds}
        label={props.labels?.evidence}
        unavailableLabel={props.labels?.evidenceUnavailable}
      />
    );
  }

  const { body } = segment;
  const { annotationLabel, dispatch, addWindow, isActive, ruleSet } = props;

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
        onDataLoaded={props.onDataLoaded}
        onVisibilityChange={props.onVisibilityChange}
        requestOptions={props.requestOptions}
        onAuthRequired={props.onAuthRequired}
      />
    );
  }

  // Case 3: TextualBody - render static text
  if (isTextualBody(body)) {
    return <TextualBody body={body} ruleSet={ruleSet} />;
  }

  // Case 5: Choice - show one alternative through the normal routing
  if (isChoiceBody(body)) {
    const item = depth < MAX_CHOICE_DEPTH ? pickChoiceItem(body, prefs) : undefined;
    if (!item) return null;
    const [inner] = toSegments([item]);
    return <SegmentView {...props} segment={inner} depth={depth + 1} />;
  }

  // Unknown body type: render nothing.
  console.debug('[XYViewer] Unsupported annotation body type:', (body as { type?: unknown }).type);
  return null;
};

/**
 * The Choice item to show (WADM §4.3, IIIF cookbook 0346): the one in the reader's
 * language, else the first.
 * @internal Exposed for tests; not part of the public API.
 */
export function pickChoiceItem(
  choice: ChoiceBody,
  preferredLanguages: string[]
): AnnotationBody | undefined {
  const items = choice.items.filter((i) => i && typeof i === 'object');
  // Null prototype: `language` is untrusted and may be "__proto__".
  const map = Object.create(null) as LocalizedString;
  for (const i of items) for (const lang of stringLanguages(i)) map[lang] = [lang];
  const picked = pickLanguageKey(map, preferredLanguages);
  // pickLanguageKey falls back to any key: only keep a real match for the reader.
  const primary = (t: string) => t.toLowerCase().split(/[-_]/)[0];
  if (picked && preferredLanguages.some((p) => p && primary(p) === primary(picked))) {
    const match = items.find((i) =>
      stringLanguages(i).some((l) => l.toLowerCase() === picked.toLowerCase())
    );
    if (match) return match;
  }
  return items[0];
}

export default AnnotationBodyRenderer;
