/**
 * ConnectedScientificAnnotationPlugin
 * Redux-connected version of the scientific annotation plugin
 *
 * This plugin properly integrates with Mirador's Redux store to:
 * - Dispatch addWindow actions for Manifest bodies
 * - Access annotation state
 * - Handle selection/hover states
 * - Apply metadata filters
 */

import React, { useCallback, useContext, useMemo, useRef, useEffect, useState, useSyncExternalStore } from 'react';
import { connect, ReactReduxContext } from 'react-redux';
import { addWindow as miradorAddWindow, SanitizedHtml } from 'mirador';
import { Box, Button, Typography, MenuList, MenuItem, ListItemText, Chip, Snackbar } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { AnnotationBodyRenderer, pickChoiceItem } from '../components/AnnotationBodyRenderer';
import { rawSourceIds } from '../utils/xyReading';
import { useLanguagePreferences } from '../utils/LanguageContext';
import { getLocalizedString, resolvePreferredLanguages } from '../utils/localization';
import { MetadataDisplay } from '../components/MetadataDisplay';
import { LanguageProvider } from '../utils/LanguageContext';
import { ErrorBoundary, ErrorNotice } from '../components/ErrorBoundary';
import { ClassificationCard } from '../components/ClassificationCard';
import { AnnotationCardMenu } from '../components/AnnotationCardMenu';
import { classificationKind, buildClassificationView } from '../utils/classificationModel';
import { resolveLabels, sanitizeLabels } from '../utils/annotationLabels';
import { AnnotationSignIn } from '../components/AnnotationSignIn';
import { getAnnotationAuth } from '../services/annotationAuth';
import type { AnnotationPageRef } from '../services/annotationAuth';
import { filtersStore, facetGroupKey } from '../state/filtersStore';
import { TermActionsContext, type TermActionsValue, type TermFacetRef } from '../components/TermActionsContext';
import type { Term } from '../utils/classificationModel';
import { linkNavigationStore } from '../state/linkNavigationStore';
import { CitedBy } from '../components/CitedBy';
import { LinkContext } from '../components/LinkContext';
import { EMPTY_LINK_INDEX, baseAnnotationId, getLinkIndex, type LinkIndex } from '../utils/linkIndex';
import { fillTemplate } from '../utils/annotationLabels';
import { cancelPendingNavigation, useLinkController } from './useLinkController';
import { normalizeAnnotationResources } from '../utils/annotationNormalizer';
import type {
  AnnotationBody,
  IIIFAnnotation,
} from '../types/iiif';
import {
  isSpecificResourceBody,
  isChoiceBody,
  isCompositeBody,
  isListBody,
  isIndependentsBody,
} from '../types/iiif';
import type { SpectrumData } from '../types/dataset';
import type { MiradorState, MiradorPlugin, AnnotationBodyLabels } from '../types/mirador';
import type { Dispatch, AnyAction } from 'redux';
import { containPlugin } from './containPlugin';

/** Evaluates its render function in its own render so an enclosing boundary catches parent-built expressions. */
const InsideBoundary: React.FC<{ children: () => React.ReactNode }> = ({ children }) => <>{children()}</>;

/** Metadata block; the raw file offered by the shown body's reading replaces its plain seeAlso link. */
const AnnotationMetadata: React.FC<
  Omit<React.ComponentProps<typeof MetadataDisplay>, 'hiddenSeeAlsoIds' | 'compact'> & { body?: unknown }
> = ({ body, ...rest }) => {
  const prefs = useLanguagePreferences();
  const hidden = React.useMemo(() => rawSourceIds(body, (c) => pickChoiceItem(c, prefs)), [body, prefs]);
  return <MetadataDisplay {...rest} hiddenSeeAlsoIds={hidden} compact />;
};

/** Banner shown on an annotation surfaced only because it is selected while filtered out. */
const FILTER_HIDDEN_BADGE = 'Shown because selected — hidden by the metadata filter';

/**
 * Check if body is a scientific type (Manifest or Dataset)
 * @internal Exposed for tests; not part of the public API.
 */
export function isScientificBodyType(type: string | undefined): boolean {
  return type === 'Manifest' || type === 'Dataset';
}

/**
 * Check if annotation has scientific body
 * @internal Exposed for tests; not part of the public API.
 */
export function hasScientificBody(body: unknown): boolean {
  if (!body) return false;
  const bodies = Array.isArray(body) ? body : [body];
  return bodies.some(b => isScientificBodyType((b as AnnotationBody | null)?.type));
}

/** Web Annotation body types rendered by the plugin (chips, evidence links, Choice). */
export function isWebAnnotationBody(body: AnnotationBody | null | undefined): boolean {
  return !!body && typeof body === 'object' && (
    isSpecificResourceBody(body) ||
    isChoiceBody(body) ||
    isCompositeBody(body) ||
    isListBody(body) ||
    isIndependentsBody(body)
  );
}

/**
 * Check if annotation has a SpecificResource or Choice body
 * @internal Exposed for tests; not part of the public API.
 */
export function hasWebAnnotationBody(body: unknown): boolean {
  if (!body) return false;
  const bodies = Array.isArray(body) ? body : [body];
  return bodies.some(b => isWebAnnotationBody(b as AnnotationBody | null));
}

/**
 * Check if annotation has metadata that should be displayed
 * @internal Exposed for tests; not part of the public API.
 */
export function hasMetadata(annotation: IIIFAnnotation | undefined): boolean {
  if (!annotation) return false;
  return Array.isArray(annotation.metadata) && annotation.metadata.length > 0;
}

/**
 * Check if annotation should use custom rendering (scientific or Web Annotation body, OR has metadata)
 * @internal Exposed for tests; not part of the public API.
 */
export function shouldUseCustomRendering(annotation: IIIFAnnotation | undefined): boolean {
  if (!annotation) return false;
  return (
    !!classificationKind(annotation.motivation) ||
    hasScientificBody(annotation.body) ||
    hasWebAnnotationBody(annotation.body) ||
    hasMetadata(annotation)
  );
}

/**
 * Annotations to render: the filter-visible ones, plus the currently-selected
 * annotation even when the metadata filter has hidden it — so selecting it (via
 * search hit, canvas click, or deep link) still surfaces its body.
 * @internal Exposed for tests; not part of the public API.
 */
export function computeVisibleAnnotations<T extends { id: string }>(
  annotations: T[],
  hiddenAnnotationIds: Set<string>,
  selectedAnnotationId: string | undefined,
): T[] {
  return annotations.filter(
    (ann) => !hiddenAnnotationIds.has(ann.id) || ann.id === selectedAnnotationId,
  );
}

/**
 * True when an annotation is shown ONLY because it is selected while the metadata
 * filter would otherwise hide it (drives the "hidden by filter" badge).
 * @internal Exposed for tests; not part of the public API.
 */
export function shownOnlyBecauseSelected(
  id: string,
  hiddenAnnotationIds: Set<string>,
  selectedAnnotationId: string | undefined,
): boolean {
  return hiddenAnnotationIds.has(id) && id === selectedAnnotationId;
}

/**
 * Plugin wrapper component props
 */
interface TargetProps {
  annotations?: Array<{
    id: string;
    content: string | null;
    tags: string[];
    targetId: string;
  }>;
  windowId: string;
  canvasId?: string;
  selectedAnnotationId?: string;
  hoveredAnnotationIds?: string[];
  selectAnnotation: (windowId: string, annotationId: string) => void;
  deselectAnnotation: (windowId: string, annotationId: string) => void;
  hoverAnnotation: (windowId: string, annotationIds: string[]) => void;
  containerRef?: React.RefObject<HTMLElement>;
  /** Mirador's HTML sanitization rule set (iiif, liberal, mirador2, noHtml). */
  htmlSanitizationRuleSet?: string;
}

interface PluginWrapperProps {
  targetProps: TargetProps;
  TargetComponent: React.ComponentType<TargetProps>;
  // Connected props
  dispatch: (action: unknown) => void;
  addWindow: (config: { manifestId: string }) => unknown;
  annotationResources: Record<string, IIIFAnnotation>;
  /** Mirador config language (reader's language for IIIF language maps). */
  language?: string;
  /** UI string overrides from `config.scientificAnnotations.labels`. */
  labels?: AnnotationBodyLabels;
  /** `config.scientificAnnotations.showAnnotationId` (default 'menu'). */
  showAnnotationId?: 'menu' | 'inline';
  /** First annotation page of this canvas for which a sign-in can be offered. */
  signInPage?: AnnotationPageRef;
  /** Links between the annotations loaded for the window's manifest. */
  linkIndex?: LinkIndex;
  /** `config.scientificAnnotations.linkSubtitleMetadataLabel`. */
  linkSubtitleMetadataLabel?: string;
  /** Canvas the window shows (a panel in book view may show another). */
  windowCanvasId?: string;
  /** Canvases the window shows (two in book view). */
  visibleCanvasIds?: string[];
  /** Rest of Mirador's wrap chain, when other plugins wrap the same target. */
  children?: React.ReactNode;
}

/**
 * Main plugin component that wraps CanvasAnnotations
 */
const ScientificAnnotationPluginComponent: React.FC<PluginWrapperProps> = ({
  targetProps,
  TargetComponent,
  dispatch,
  addWindow,
  annotationResources,
  language,
  labels,
  showAnnotationId = 'menu',
  signInPage,
  linkIndex = EMPTY_LINK_INDEX,
  linkSubtitleMetadataLabel,
  windowCanvasId,
  visibleCanvasIds,
  children,
}) => {
  const {
    annotations = [],
    windowId,
    canvasId,
    selectedAnnotationId,
    hoveredAnnotationIds = [],
    selectAnnotation,
    deselectAnnotation,
    hoverAnnotation,
    htmlSanitizationRuleSet,
  } = targetProps;
  const ruleSet = htmlSanitizationRuleSet ?? 'iiif';

  // Refs for scrolling to annotations
  const annotationRefs = useRef<Map<string, HTMLElement>>(new Map());

  // State for hidden annotations (from filters - only when metadataFiltersPlugin is used)
  const [hiddenAnnotationIds, setHiddenAnnotationIds] = useState<Set<string>>(new Set());

  // Subscribe to filter changes (only applies when metadataFiltersPlugin initializes filters)
  useEffect(() => {
    if (!windowId || !canvasId) return;
    const unsubscribe = filtersStore.subscribe((event) => {
      if (event.windowId === windowId && event.canvasId === canvasId && (event.type === 'update-hidden' || event.type === 'init')) {
        // Only apply filters if they were explicitly initialized by metadataFiltersPlugin
        if (filtersStore.hasFiltersInitialized(windowId, canvasId)) {
          setHiddenAnnotationIds(new Set(filtersStore.getHiddenAnnotationIds(windowId, canvasId)));
        }
      }
    });
    // Get initial hidden annotations only if filters are initialized
    if (filtersStore.hasFiltersInitialized(windowId, canvasId)) {
      setHiddenAnnotationIds(new Set(filtersStore.getHiddenAnnotationIds(windowId, canvasId)));
    }
    return unsubscribe;
  }, [windowId, canvasId]);

  // Scroll to selected annotation when selection changes (e.g., from clicking SVG on canvas)
  useEffect(() => {
    if (selectedAnnotationId) {
      const element = annotationRefs.current.get(selectedAnnotationId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedAnnotationId]);

  // Determine if we have any annotations that need custom rendering
  // (scientific body OR has metadata)
  const customRenderingIds = useMemo(() => {
    const ids = new Set<string>();
    annotations.forEach(ann => {
      const resource = annotationResources[ann.id];
      if (resource && shouldUseCustomRendering(resource)) {
        ids.add(ann.id);
      }
    });
    return ids;
  }, [annotations, annotationResources]);

  // Ids on this canvas, for linking bodies to find their target annotation.
  const canvasAnnotationIds = useMemo(() => annotations.map((a) => a.id), [annotations]);

  const prefs = useMemo(() => resolvePreferredLanguages(language), [language]);

  const { context: linkContext, back } = useLinkController({
    windowId,
    canvasId,
    visibleCanvasIds,
    dispatch,
    selectAnnotation,
    hoverAnnotation,
    hoveredAnnotationIds,
    index: linkIndex,
    canvasAnnotationIds,
    annotationResources,
    hiddenIds: hiddenAnnotationIds,
    subtitleLabel: linkSubtitleMetadataLabel,
    prefs,
  });

  // Hover lights the zone and its linked zones; leaving clears it (debounced).
  const handleAnnotationHover = useCallback((annotationId: string | null) => {
    linkContext.hover(annotationId ? linkContext.groupOf(annotationId) : []);
  }, [linkContext]);

  // Term chips: filter by a term, highlight its annotations (same facet as the filter panel).
  const textLabels = useMemo(() => resolveLabels(labels), [labels]);
  const termActions = useMemo<TermActionsValue>(() => {
    const locate = (term: Term, facet: TermFacetRef): string | undefined => {
      if (!windowId || !canvasId) return undefined;
      return [facet.purpose]
        .flat()
        .map((purpose) => facetGroupKey(purpose, purpose === 'describing' ? facet.group : undefined))
        .find((group) => filtersStore.hasFacet(windowId, canvasId, group, term.key));
    };
    return {
      actionsFor: (term, facet) => {
        const group = locate(term, facet);
        if (!group || !windowId || !canvasId) return [];
        const filtering = filtersStore.isFacetActive(windowId, canvasId, group, term.key);
        return [
          {
            key: 'filter',
            label: fillTemplate(filtering ? textLabels.removeFilter : textLabels.filterBy, { term: term.label }),
            onClick: () => {
              filtersStore.toggleFacet(windowId, canvasId, group, term.key, 'only');
            },
          },
          {
            key: 'highlight',
            label: textLabels.highlightTerm,
            onClick: () => linkContext.hover(filtersStore.getAnnotationIdsWithValue(windowId, canvasId, group, term.key)),
          },
        ];
      },
      isFiltering: (term, facet) => {
        const group = locate(term, facet);
        return !!group && !!windowId && !!canvasId && filtersStore.isFacetActive(windowId, canvasId, group, term.key);
      },
      filterActiveLabel: textLabels.filterActive,
    };
    // The hidden set changes with every filter change: chips re-read the store.
  }, [windowId, canvasId, textLabels, linkContext, hiddenAnnotationIds]);
  const shownBecause =
    windowId && canvasId && hiddenAnnotationIds.size > 0 ? filtersStore.getShownBecauseLinked(windowId, canvasId) : undefined;

  // Back stack of followed links: dropped when the reader moves on.
  const nav = useSyncExternalStore(
    useCallback((cb: () => void) => linkNavigationStore.subscribe((w) => w === windowId && cb()), [windowId]),
    () => linkNavigationStore.get(windowId),
  );
  const shownCanvasIds = useMemo(
    () => (visibleCanvasIds?.length ? visibleCanvasIds : [windowCanvasId ?? canvasId]),
    [visibleCanvasIds, windowCanvasId, canvasId],
  );
  useEffect(() => {
    linkNavigationStore.reconcile(windowId, selectedAnnotationId, shownCanvasIds);
  }, [windowId, selectedAnnotationId, shownCanvasIds]);
  const reduxStore = useContext(ReactReduxContext)?.store;
  useEffect(
    () => () => {
      const st = reduxStore?.getState() as MiradorState | undefined;
      if (st && !st.windows?.[windowId]) {
        cancelPendingNavigation(windowId);
        linkNavigationStore.clear(windowId);
      }
    },
    [windowId, reduxStore],
  );

  // "Back" returns focus to the card it came from (the store survives a remount on canvas change).
  const wantedFocus = nav.focus;
  useEffect(() => {
    if (!wantedFocus || !selectedAnnotationId || baseAnnotationId(selectedAnnotationId) !== baseAnnotationId(wantedFocus)) return;
    const el = annotationRefs.current.get(selectedAnnotationId);
    if (!el) return;
    el.focus({ preventScroll: true });
    linkNavigationStore.setFocus(windowId, undefined);
  }, [windowId, wantedFocus, selectedAnnotationId, annotations]);

  // Spectrum data callbacks
  const handleDataLoaded = useCallback((id: string, data: SpectrumData) => {
    console.debug('[XYViewer] Spectrum loaded:', id, data.points.length, 'points');
  }, []);

  const handleVisibilityChange = useCallback((id: string, visible: boolean) => {
    console.debug('[XYViewer] Visibility changed:', id, visible);
  }, []);

  // Handle annotation click - triggers selection which updates Redux state
  // Note: Mirador's selectAnnotation takes (windowId, annotationId) - no canvasId needed
  const handleAnnotationClick = useCallback((annotationId: string) => {
    if (selectedAnnotationId === annotationId) {
      deselectAnnotation(windowId, annotationId);
    } else {
      selectAnnotation(windowId, annotationId);
    }
  }, [windowId, selectedAnnotationId, selectAnnotation, deselectAnnotation]);

  // Filter annotations, but keep the selected one even if the filter hid it.
  const visibleAnnotations = useMemo(
    () => computeVisibleAnnotations(annotations, hiddenAnnotationIds, selectedAnnotationId),
    [annotations, hiddenAnnotationIds, selectedAnnotationId],
  );

  const labelText = resolveLabels(labels);
  const backOrigin = nav.stack[nav.stack.length - 1];

  // If no scientific annotations and no hidden annotations, render original component
  const failureNotice = (
    <Snackbar
      open={!!nav.failed}
      autoHideDuration={5000}
      onClose={() => linkNavigationStore.dismissFailure(windowId)}
      message={labelText.linkNavigationFailed}
    />
  );
  if (customRenderingIds.size === 0 && hiddenAnnotationIds.size === 0) {
    return (
      <>
        {signInPage && <AnnotationSignIn page={signInPage} />}
        {children ?? <TargetComponent {...targetProps} />}
        {failureNotice}
      </>
    );
  }

  // Render mixed annotations - scientific ones custom, others default
  return (
    <LanguageProvider language={language}>
     <LinkContext.Provider value={linkContext}>
     <TermActionsContext.Provider value={termActions}>
      {signInPage && <AnnotationSignIn page={signInPage} />}
      <MenuList disablePadding>
        {visibleAnnotations.map((annotation) => {
          const resource = annotationResources[annotation.id];
          const isScientific = customRenderingIds.has(annotation.id);
          const isSelected = selectedAnnotationId === annotation.id;
          const isHovered = hoveredAnnotationIds.includes(annotation.id);
          const becauseIds = shownBecause?.get(annotation.id);
          const becauseNote = becauseIds?.length ? (
            <Typography variant="caption" role="note" sx={{ display: 'block', mb: 0.5, color: 'text.secondary' }}>
              {fillTemplate(textLabels.shownBecauseLinked, {
                title: [...new Set(becauseIds.map((id) => linkContext.titleOf(id)))].join(', '),
              })}
            </Typography>
          ) : null;
          const showFilterBadge = shownOnlyBecauseSelected(
            annotation.id,
            hiddenAnnotationIds,
            selectedAnnotationId,
          );

          const backLink =
            backOrigin && nav.current && baseAnnotationId(nav.current.annotationId) === baseAnnotationId(annotation.id) ? (
              <Button
                size="small"
                startIcon={<ArrowBackIcon fontSize="inherit" />}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  back();
                }}
                sx={{ textTransform: 'none', mb: 0.5, maxWidth: '100%', justifyContent: 'flex-start' }}
              >
                <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fillTemplate(labelText.backTo, { title: linkContext.titleOf(backOrigin.annotationId) })}
                </Box>
              </Button>
            ) : null;
          const citedBy = <CitedBy annotationId={annotation.id} labels={labels} />;

          if (!isScientific) {
            // Render default annotation
            return (
              <MenuItem
                key={annotation.id}
                component="li"
                ref={(el: HTMLLIElement | null) => {
                  if (el) annotationRefs.current.set(annotation.id, el);
                  else annotationRefs.current.delete(annotation.id);
                }}
                onClick={() => handleAnnotationClick(annotation.id)}
                onMouseEnter={() => handleAnnotationHover(annotation.id)}
                onMouseLeave={() => handleAnnotationHover(null)}
                selected={isSelected}
                sx={{
                  bgcolor: isHovered && !isSelected ? 'action.hover' : undefined,
                }}
              >
                {showFilterBadge && (
                  <Typography
                    variant="caption"
                    role="note"
                    sx={{ display: 'block', mb: 0.5, color: 'warning.main' }}
                  >
                    {FILTER_HIDDEN_BADGE}
                  </Typography>
                )}
                {becauseNote}
                {backLink}
                <ErrorBoundary resetKey={resource} label="annotation" fallback={<ErrorNotice />}>
                  <InsideBoundary>
                    {() => (
                      <ListItemText
                        primary={
                          <SanitizedHtml ruleSet={ruleSet} htmlString={annotation.content ?? ''} />
                        }
                        secondary={annotation.tags?.map((tag) => (
                          <Chip component="span" size="small" variant="outlined" label={tag} key={tag} />
                        ))}
                        slotProps={{ primary: { variant: 'body2' } }}
                      />
                    )}
                  </InsideBoundary>
                </ErrorBoundary>
                {citedBy}
              </MenuItem>
            );
          }

          // Render scientific annotation
          const body = resource?.body as AnnotationBody | AnnotationBody[] | undefined;
          const label = resource?.label;
          const metadata = resource?.metadata;
          const annotationId = resource?.id;
          const seeAlso = resource?.seeAlso;

          return (
            <Box
              key={annotation.id}
              component="li"
              ref={(el: HTMLLIElement | null) => {
                if (el) annotationRefs.current.set(annotation.id, el);
                else annotationRefs.current.delete(annotation.id);
              }}
              onClick={(e: React.MouseEvent<HTMLElement>) => {
                const target = e.target as Element;
                // Ignore portaled content (expand dialog) bubbling through the React tree.
                if (!e.currentTarget.contains(target)) return;
                // Buttons inside the body (Retry, Sign in, ...) must not also select the annotation.
                const control = target.closest?.('button, a, [role="button"]');
                if (control && e.currentTarget.contains(control)) return;
                handleAnnotationClick(annotation.id);
              }}
              role="group"
              aria-label={
                getLocalizedString(label, prefs) ||
                (classificationKind(resource?.motivation) && resource
                  ? buildClassificationView(resource, prefs).title
                  : '') ||
                undefined
              }
              aria-expanded={classificationKind(resource?.motivation) ? isSelected : undefined}
              aria-current={isSelected || undefined}
              tabIndex={0}
              onFocus={() => handleAnnotationHover(annotation.id)}
              onBlur={(e: React.FocusEvent<HTMLElement>) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) handleAnnotationHover(null);
              }}
              // Keep MenuList roving focus / typeahead away from the body and its dialog.
              onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
                if (e.target !== e.currentTarget) {
                  e.stopPropagation();
                  return;
                }
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleAnnotationClick(annotation.id);
                }
              }}
              onMouseEnter={() => handleAnnotationHover(annotation.id)}
              onMouseLeave={() => handleAnnotationHover(null)}
              sx={{
                position: 'relative',
                p: 1.5,
                cursor: 'pointer',
                bgcolor: isHovered ? 'action.hover' : 'transparent',
                borderBottom: '1px solid',
                borderColor: 'divider',
                borderLeft: '3px solid',
                borderLeftColor: isSelected ? 'primary.main' : isHovered ? 'action.hover' : 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
              }}
            >
              {showFilterBadge && (
                <Typography
                  variant="caption"
                  role="note"
                  sx={{ display: 'block', mb: 0.5, pr: 4.5, color: 'warning.main' }}
                >
                  {FILTER_HIDDEN_BADGE}
                </Typography>
              )}
              {becauseNote}
              <ErrorBoundary resetKey={resource} label="annotation" fallback={<ErrorNotice />}>
                <InsideBoundary>
                  {() =>
                    classificationKind(resource?.motivation) ? (
                      <ClassificationCard
                        annotation={resource}
                        isSelected={isSelected}
                        labels={labels}
                        ruleSet={ruleSet}
                        showAnnotationId={showAnnotationId}
                        windowId={windowId}
                        selectAnnotation={selectAnnotation}
                        canvasAnnotationIds={canvasAnnotationIds}
                        beforeKicker={backLink}
                        afterTitle={citedBy}
                        renderOther={(rest) => (
                          <AnnotationBodyRenderer
                            body={rest}
                            annotationLabel={label}
                            dispatch={dispatch}
                            addWindow={addWindow}
                            isActive={isSelected}
                            ruleSet={ruleSet}
                            labels={labels}
                          />
                        )}
                      />
                    ) : (
                    <>
                      <Box sx={{ position: 'absolute', top: 4, right: 4 }}>
                        <AnnotationCardMenu
                          annotationId={annotationId}
                          hideJson={showAnnotationId === 'inline'}
                          labels={resolveLabels(labels)}
                        />
                      </Box>
                      {/* Metadata (right padding keeps the title clear of the menu button) */}
                      <Box sx={{ pr: 4.5 }}>
                        {backLink}
                        <AnnotationMetadata
                          label={label}
                          metadata={metadata}
                          annotationId={showAnnotationId === 'inline' ? annotationId : undefined}
                          seeAlso={seeAlso}
                          body={body}
                        />
                        {citedBy}
                      </Box>

                      {/* Body renderer */}
                      {body && (
                        <AnnotationBodyRenderer
                          body={body}
                          annotationLabel={label}
                          dispatch={dispatch}
                          addWindow={addWindow}
                          isActive={isSelected}
                          onDataLoaded={handleDataLoaded}
                          onVisibilityChange={handleVisibilityChange}
                          ruleSet={ruleSet}
                          annotationId={annotationId}
                          windowId={windowId}
                          selectAnnotation={selectAnnotation}
                          canvasAnnotationIds={canvasAnnotationIds}
                          labels={labels}
                        />
                      )}

                      {/* Tags */}
                      {annotation.tags.length > 0 && (
                        <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {annotation.tags.map((tag, idx) => (
                            <Typography
                              key={idx}
                              variant="caption"
                              sx={{
                                px: 0.75,
                                py: 0.25,
                                bgcolor: 'action.hover',
                                borderRadius: 1,
                              }}
                            >
                              {tag}
                            </Typography>
                          ))}
                        </Box>
                      )}
                    </>
                    )
                  }
                </InsideBoundary>
              </ErrorBoundary>
            </Box>
          );
        })}
      </MenuList>
      {failureNotice}
     </TermActionsContext.Provider>
     </LinkContext.Provider>
    </LanguageProvider>
  );
};

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/** Stable per window object: the canvases a window shows. */
const visibleCache = new WeakMap<object, string[]>();
function visibleIds(win: object | undefined): string[] | undefined {
  const raw = (win as { visibleCanvases?: unknown } | undefined)?.visibleCanvases;
  if (!Array.isArray(raw)) return undefined;
  let ids = visibleCache.get(raw);
  if (!ids) {
    ids = raw.filter((c): c is string => typeof c === 'string');
    visibleCache.set(raw, ids);
  }
  return ids;
}

/**
 * Map state to props - extract annotation resources from Mirador state
 * @internal Exposed for tests; not part of the public API.
 */
export function mapStateToProps(
  state: MiradorState,
  { targetProps }: { targetProps: { windowId: string; canvasId?: string } },
) {
  const { windowId } = targetProps;

  // Mirador renders one panel per visible canvas (book view); fall back to the window's canvas.
  const window = state.windows?.[windowId];
  const canvasId = targetProps.canvasId ?? window?.canvasId;

  // Normalize annotation resources for this canvas (handles both v2 and v3).
  const annotationResources: Record<string, IIIFAnnotation> = normalizeAnnotationResources(
    canvasId ? state.annotations?.[canvasId] : undefined
  );

  return {
    annotationResources,
    language: state.config?.language,
    labels: sanitizeLabels(state.config?.scientificAnnotations?.labels),
    showAnnotationId:
      state.config?.scientificAnnotations?.showAnnotationId === 'inline' ? ('inline' as const) : ('menu' as const),
    signInPage: findSignInPage(canvasId ? state.annotations?.[canvasId] : undefined),
    linkIndex: getLinkIndex(state, windowId),
    linkSubtitleMetadataLabel: str(state.config?.scientificAnnotations?.linkSubtitleMetadataLabel),
    windowCanvasId: window?.canvasId,
    visibleCanvasIds: visibleIds(window),
  };
}

// Stable reference per Redux page object, so connect() doesn't re-render on unrelated ticks.
const signInRefs = new WeakMap<object, AnnotationPageRef>();

/**
 * The first fetched annotation page (a 401 stub, an anonymous 200 or a fetch error) whose
 * declared auth `service` the registered handler says can sign in. An error entry has no
 * body, so the handler falls back to the service the page declared earlier.
 * @internal Exposed for tests; not part of the public API.
 */
export function findSignInPage(
  pages: Record<string, { id?: string; json?: unknown; error?: unknown }> | undefined,
): AnnotationPageRef | undefined {
  const auth = getAnnotationAuth();
  if (!auth || !pages || typeof pages !== 'object') return undefined;
  for (const [key, entry] of Object.entries(pages)) {
    const json = entry?.json;
    // A fetch error has no body: let the handler fall back to the service it saw earlier.
    const failed = json === undefined && entry?.error !== undefined;
    if (!failed && (!json || typeof json !== 'object')) continue;
    const service = failed ? undefined : (json as { service?: unknown }).service;
    if (!failed && !service) continue;
    let ref = signInRefs.get(entry as object);
    if (!ref || ref.service !== service) {
      ref = { id: entry.id ?? key, service };
      signInRefs.set(entry as object, ref);
    }
    if (auth.canSignIn(ref)) return ref;
  }
  return undefined;
}

/**
 * Map dispatch to props - provide Mirador actions
 */
function mapDispatchToProps(dispatch: Dispatch<AnyAction>) {
  return {
    dispatch: dispatch as (action: unknown) => void,
    addWindow: (config: { manifestId: string }) => {
      // Use Mirador's addWindow action creator (thunk)
      // The thunk expects manifestId to be passed directly in the config
      return miradorAddWindow({ manifestId: config.manifestId });
    },
  };
}

/**
 * Connected plugin component
 */
export const ConnectedScientificAnnotationPlugin = connect(
  mapStateToProps,
  mapDispatchToProps
)(ScientificAnnotationPluginComponent);

/**
 * Plugin definition for Mirador
 */
export const scientificAnnotationPlugin: MiradorPlugin = containPlugin({
  target: 'CanvasAnnotations',
  mode: 'wrap',
  name: 'ScientificAnnotationPlugin',
  component: ConnectedScientificAnnotationPlugin as unknown as React.ComponentType<{
    targetProps: Record<string, unknown>;
    TargetComponent: React.ComponentType<unknown>;
  }>,
  mapStateToProps: mapStateToProps as MiradorPlugin['mapStateToProps'],
  mapDispatchToProps: mapDispatchToProps as unknown as MiradorPlugin['mapDispatchToProps'],
});

/** @internal Exposed for tests; not part of the public API. */
export { ScientificAnnotationPluginComponent };

export default scientificAnnotationPlugin;
