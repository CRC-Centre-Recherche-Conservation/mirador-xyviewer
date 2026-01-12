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
  [key: string]: (...args: unknown[]) => AnyAction;
}

/** Mirador Redux store state (partial) */
export interface MiradorState {
  windows: Record<string, MiradorWindow>;
  manifests: Record<string, MiradorManifest>;
  annotations: Record<string, Record<string, unknown>>;
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

/** Mirador config */
export interface MiradorConfig {
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
