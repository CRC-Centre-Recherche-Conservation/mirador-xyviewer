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
  /** Linking button (default "Evidence"). */
  evidence?: string;
  /** Tooltip of a linking button whose target is not on the canvas. */
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
  /** Title of a classification card without any label or text (default "Untitled annotation"). */
  untitled?: string;
}

/** Host options for the scientific annotation plugin, read from the Mirador config key `scientificAnnotations`. */
export interface ScientificAnnotationsConfig {
  /** Overrides for the plugin's UI strings (evidence button, purpose captions). */
  labels?: AnnotationBodyLabels;
  /** Where the annotation IIIF id is shown: in each card's "⋮" menu (default) or inline. */
  showAnnotationId?: 'menu' | 'inline';
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
