/**
 * Mirador 4 Type Definitions
 * Types for Mirador actions, state, and plugin system
 */

import type { Dispatch, AnyAction, Store } from 'redux';

/** Mirador window configuration */
export interface MiradorWindowConfig {
  manifestId?: string;
  canvasId?: string;
  id?: string;
  thumbnailNavigationPosition?: 'far-bottom' | 'far-right' | 'off';
  [key: string]: unknown;
}

/** Mirador actions interface */
export interface MiradorActions {
  addWindow: (config: MiradorWindowConfig) => AnyAction;
  focusWindow: (windowId: string, pan?: boolean) => AnyAction;
  removeWindow: (windowId: string) => AnyAction;
  updateWindow: (windowId: string, payload: Partial<MiradorWindowConfig>) => AnyAction;
  selectAnnotation: (windowId: string, canvasId: string, annotationId: string) => AnyAction;
  deselectAnnotation: (windowId: string, canvasId: string) => AnyAction;
  hoverAnnotation: (windowId: string, annotationIds: string[]) => AnyAction;
}

/** A fetched annotation resource as stored in Mirador's per-canvas annotation state. */
export interface MiradorAnnotationEntry {
  json?: unknown;
  [key: string]: unknown;
}

/** Mirador Redux store state (partial) */
export interface MiradorState {
  windows: Record<string, MiradorWindow>;
  manifests: Record<string, MiradorManifest>;
  /** canvasId -> (annotation-list URL -> fetched resource). */
  annotations: Record<string, Record<string, MiradorAnnotationEntry>>;
  config: MiradorConfig;
  workspace: MiradorWorkspace;
  [key: string]: unknown;
}

/** Mirador window state */
export interface MiradorWindow {
  id: string;
  manifestId?: string;
  canvasId?: string;
  view?: string;
  hoveredAnnotationIds?: string[];
  [key: string]: unknown;
}

/** Mirador manifest state */
export interface MiradorManifest {
  id: string;
  json?: unknown;
  error?: string;
  isFetching?: boolean;
  [key: string]: unknown;
}

/** User-facing strings, overridable by the host. */
export interface AnnotationBodyLabels {
  /** @deprecated Linked annotations are listed as rows; use `linkedAnnotations` for the caption. */
  evidence?: string;
  /** @deprecated Use `linkUnavailable`. */
  evidenceUnavailable?: string;
  /** Caption per SpecificResource purpose (default: the purpose itself). */
  purposes?: Record<string, string>;
  /** Kicker of a card whose motivation is `classifying` (default "Classification"). */
  classification?: string;
  /** Kicker of a card whose motivation is `identifying` (default "Identification"). */
  identification?: string;
  /** Captions of the term groups of a classification card. */
  classifiedAs?: string;
  identifiedAs?: string;
  assessment?: string;
  /** Caption of assessments that cannot be tied to one class (default "Overall assessment (see text)"). */
  overallAssessment?: string;
  description?: string;
  tags?: string;
  otherTerms?: string;
  /** Caption of the `linking` group (default "Linked annotations"). */
  linkedAnnotations?: string;
  /** Row detail of a linked annotation on the current canvas (default "on this page"). */
  linkOnThisPage?: string;
  /** Row detail of a linked annotation on another canvas; `{canvas}` is its label (default "on {canvas}"). */
  linkOnCanvas?: string;
  /** Link count in a card header (defaults "{n} linked annotations" and "1 linked annotation"). */
  linkCount?: string;
  linkCountOne?: string;
  /** Row detail when the linked annotation is not loaded (default "Not available in this viewer"). */
  linkUnavailable?: string;
  /** Button opening a linked annotation on another canvas (default "Go to page"). */
  goToPage?: string;
  /** Suffix of a linked row hidden by the metadata filter (default "(hidden by filter)"). */
  hiddenByFilter?: string;
  /** Button framing the zone and its linked zones (default "Show all"). */
  showAll?: string;
  /** Breadcrumb after a link was followed; `{title}` is the origin (default "Back to {title}"). */
  backTo?: string;
  /** Row accessible name; `{n}`, `{total}` and `{details}` are filled in (default "Select linked annotation {n} of {total}: {details}"). */
  selectLinked?: string;
  /** Caption of the annotations citing this one (default "Cited by"). */
  citedBy?: string;
  /** Message when a linked annotation on another page could not be opened (default "The linked annotation could not be opened"). */
  linkNavigationFailed?: string;
  /** Disclosure holding the prose when the terms are shown as a structure (default "Full statement"). */
  fullStatement?: string;
  /** Report button (default "Open report"). */
  openReport?: string;
  /** Term menu entry (default "Open in vocabulary"). */
  openVocabulary?: string;
  /** Card menu (default "Annotation actions") and its entries. */
  cardMenu?: string;
  copyAnnotationId?: string;
  openJson?: string;
  zoomToZone?: string;
  /** Title of a classification card without any label or text (default "Untitled annotation"). */
  untitled?: string;
  /** Filter groups: fold/unfold (defaults "Show {n} more" and "Show fewer"). */
  showMore?: string;
  showFewer?: string;
  /** Accessible names of the group toggles (defaults "Expand {name}", "Collapse {name}") and of its master checkbox ("All values of {name}"). */
  expandGroup?: string;
  collapseGroup?: string;
  allValuesIn?: string;
  /** Group caption when only part of its values is selected (default "{selected} of {total}"). */
  selectedOf?: string;
  /** Text of the "Only" button of a value (default "Only") and its accessible name (default "Only {term}", must start with the text). */
  only?: string;
  onlyTerm?: string;
  /** Accessible count of a value (defaults "{n} annotations" and "1 annotation"). */
  valueCount?: string;
  valueCountOne?: string;
  /** Count tooltip when annotations are kept through links (default "{own} carrying it, {linked} cited by them"). */
  valueCountLinked?: string;
  /** Added to the accessible count while a filter hides some (default "{visible} of {n} visible"). */
  valueCountVisible?: string;
  /** Tooltip of the absence value (default "No value in this group, and not cited by an annotation that has one"). */
  noneHint?: string;
  /** Filter value standing for annotations without a value (default "Not specified"). */
  filterNone?: string;
  /** Panel status while a filter is active, and otherwise (defaults "Showing {shown} of {total} annotations" and "{n} annotations"). */
  showingOf?: string;
  annotationCount?: string;
  annotationCountOne?: string;
  /** Tooltip of the reset icon and of the filter button (defaults "Reset all filters" and "Filter annotations"). */
  resetFilters?: string;
  filterButton?: string;
  /** Note on an annotation kept by a filter only through a link (default "shown because linked to {title}"). */
  shownBecauseLinked?: string;
  /** Term menu entries (defaults "Filter by {term}", "Remove filter: {term}" and "Highlight annotations with this term"). */
  filterBy?: string;
  removeFilter?: string;
  highlightTerm?: string;
  /** Chip state added to its accessible name while its term filters the canvas (default "filter active"). */
  filterActive?: string;
  /** Filter panel without any facet (default "No annotation on this canvas can be filtered"). */
  filtersEmpty?: string;
}

/** Host options for the scientific annotation plugin, read from the Mirador config key `scientificAnnotations`. */
export interface ScientificAnnotationsConfig {
  /** Overrides for the plugin's UI strings (evidence button, purpose captions). */
  labels?: AnnotationBodyLabels;
  /** Where the annotation IIIF id is shown: in each card's "⋮" menu (default) or inline. */
  showAnnotationId?: 'menu' | 'inline';
  /** Metadata label whose value is shown under each linked-annotation row (e.g. "Technique"). */
  linkSubtitleMetadataLabel?: string;
  /**
   * Names the group of a descriptive term from its source URI (e.g. one row per thesaurus), used
   * when neither the enclosing Composite label nor the source's `inScheme` names it.
   */
  propertyGroupOf?: (uri: string) => string | undefined;
  /** Filter groups to leave out of the filter panel: a metadata label, a term group caption or a purpose (e.g. "Identified materials"). */
  hiddenFilterGroups?: string[];
  /** Whether a characterization keeps the annotations it cites when a body filter applies (default true). */
  extendFiltersToLinked?: boolean;
}

/** Mirador config */
export interface MiradorConfig {
  /** Mirador UI language (defaults to 'en'); also the reader's language for IIIF language maps. */
  language?: string;
  /** Options of mirador-xyviewer's annotation plugin. */
  scientificAnnotations?: ScientificAnnotationsConfig;
  annotations?: {
    htmlSanitizationRuleSet?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Mirador workspace */
export interface MiradorWorkspace {
  type?: string;
  [key: string]: unknown;
}

/** Mirador viewer instance */
export interface MiradorInstance {
  store: Store<MiradorState>;
  actions: MiradorActions;
}

/** Plugin component props from Mirador */
export interface PluginComponentProps {
  targetProps: Record<string, unknown>;
  TargetComponent: React.ComponentType<unknown>;
}

/** Props passed to annotation components */
export interface AnnotationComponentProps {
  annotation: {
    id: string;
    content: string;
    tags: string[];
    targetId: string;
    body?: unknown;
    resource?: unknown;
  };
  windowId: string;
  canvasId?: string;
  selected?: boolean;
  hovered?: boolean;
  dispatch?: Dispatch;
  [key: string]: unknown;
}

/** Plugin configuration */
export interface MiradorPlugin {
  target: string;
  mode: 'wrap' | 'add' | 'replace';
  name?: string;
  component: React.ComponentType<PluginComponentProps>;
  mapDispatchToProps?: Record<string, (...args: unknown[]) => AnyAction>;
  mapStateToProps?: (state: MiradorState, ownProps: unknown) => Record<string, unknown>;
  reducers?: Record<string, (state: unknown, action: AnyAction) => unknown>;
}

/** Companion window props */
export interface CompanionWindowProps {
  id: string;
  windowId: string;
  position?: string;
  title?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}
