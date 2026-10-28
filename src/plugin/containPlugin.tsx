/**
 * Plugin-level error containment.
 * Wraps a plugin component so a rendering error stays inside the plugin:
 * wrap plugins fall back to the rest of the wrap chain (or Mirador's original component), add plugins render nothing.
 */

import React from 'react';
import { ErrorBoundary, logContainedError } from '../components/ErrorBoundary';
import type { MiradorPlugin } from '../types/mirador';

/** Prop set by the guarded mapStateToProps when it threw. */
const CONTAINED_ERROR = '__xyviewerContainedError';

interface AnyProps {
  windowId?: unknown;
  canvasId?: unknown;
  targetProps?: { windowId?: unknown; canvasId?: unknown } & Record<string, unknown>;
  TargetComponent?: React.ComponentType<Record<string, unknown>>;
  children?: React.ReactNode;
  [CONTAINED_ERROR]?: boolean;
}

/** Changes with the window, canvas(es) and selection, whichever of them the target exposes. */
function resetKeyOf(props: AnyProps): string {
  const tp = props.targetProps;
  const canvases = (tp?.canvasWorld as { canvases?: Array<{ id?: unknown }> } | undefined)?.canvases;
  const canvasIds = Array.isArray(canvases) ? canvases.map((c) => String(c?.id)).join(',') : '';
  return [
    tp?.windowId ?? props.windowId,
    tp?.canvasId ?? props.canvasId,
    canvasIds,
    tp?.selectedAnnotationId,
  ].map(String).join('|');
}

/** Returns a component that renders `Inner` inside an error boundary. */
export function containPluginComponent(
  Inner: React.ComponentType<never>,
  mode: MiradorPlugin['mode'],
  name: string,
): MiradorPlugin['component'] {
  const Component = Inner as unknown as React.ComponentType<AnyProps>;

  const Contained = React.forwardRef<unknown, AnyProps>((props, ref) => {
    const { targetProps, TargetComponent, children } = props;
    const resetKey = resetKeyOf(props);

    // Keep Mirador's default behaviour; a nested boundary stops a throwing fallback too.
    const fallback = mode === 'wrap' && TargetComponent
      ? (
        <ErrorBoundary resetKey={resetKey} label={`${name} fallback`}>
          {children ?? <TargetComponent {...(targetProps ?? {})} />}
        </ErrorBoundary>
      )
      : null;

    // mapStateToProps threw: it runs above the boundary, so show the fallback directly.
    if (props[CONTAINED_ERROR]) return fallback;

    return (
      <ErrorBoundary
        label={name}
        fallback={fallback}
        resetKey={resetKey}
      >
        <Component {...props} {...(ref ? { ref } : {})} />
      </ErrorBoundary>
    );
  });
  Contained.displayName = `Contained(${name})`;
  return Contained as unknown as MiradorPlugin['component'];
}

/** Keeps a throwing mapStateToProps (it parses producer data) from reaching Mirador's window boundary. */
function guardMapStateToProps(
  mapState: MiradorPlugin['mapStateToProps'],
  name: string,
): MiradorPlugin['mapStateToProps'] {
  if (!mapState) return mapState;
  const fn = mapState as unknown as (state: unknown, ownProps: unknown) => Record<string, unknown>;
  const guarded = (state: unknown, ownProps: unknown) => {
    try {
      return fn(state, ownProps);
    } catch (error) {
      logContainedError(error, `${name} state mapping`);
      return { [CONTAINED_ERROR]: true };
    }
  };
  return guarded as unknown as MiradorPlugin['mapStateToProps'];
}

/** Same plugin object shape, with its component and state mapping contained. */
export function containPlugin<T extends MiradorPlugin>(plugin: T): T {
  const name = plugin.name ?? plugin.target;
  return {
    ...plugin,
    component: containPluginComponent(
      plugin.component as unknown as React.ComponentType<never>,
      plugin.mode,
      name,
    ),
    mapStateToProps: guardMapStateToProps(plugin.mapStateToProps, name),
  };
}
