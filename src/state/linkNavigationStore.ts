/**
 * Per-window back stack of followed annotation links ("<- origin" breadcrumb).
 * Module-level singleton with subscribe, like the other plugin stores.
 */

export interface LinkOrigin {
  /** Id of the origin annotation as listed on its canvas. */
  annotationId: string;
  canvasId?: string;
}

export interface LinkNavigationState {
  stack: readonly LinkOrigin[];
  /** The annotation reached by the last move, which the stack belongs to. */
  current?: LinkOrigin;
  /** False until the selection has actually reached `current` (a cross-canvas move takes a moment). */
  reached: boolean;
  /** A move could not complete; the panel tells the reader, then calls `dismissFailure`. */
  failed?: boolean;
  /** Annotation to give focus to once it is selected (after "back"). */
  focus?: string;
}

export type LinkNavigationListener = (windowId: string) => void;

const EMPTY: LinkNavigationState = { stack: [], reached: false };

/** Oldest origins are dropped past this depth. */
export const MAX_STACK = 50;

const baseId = (id: string): string => id.replace(/#target-\d+$/, '');

class LinkNavigationStore {
  private states = new Map<string, LinkNavigationState>();
  private listeners = new Set<LinkNavigationListener>();

  /** Stable snapshot per window (same object until it changes). */
  get(windowId: string): LinkNavigationState {
    return this.states.get(windowId) ?? EMPTY;
  }

  /** Records that the reader follows a link from `from` to `to`. */
  push(windowId: string, from: LinkOrigin, to: LinkOrigin): void {
    const s = this.get(windowId);
    this.set(windowId, { stack: [...s.stack, from].slice(-MAX_STACK), current: to, reached: false });
  }

  /** Takes the last origin off the stack; it becomes the move's destination. */
  pop(windowId: string): LinkOrigin | undefined {
    const s = this.get(windowId);
    const origin = s.stack[s.stack.length - 1];
    if (!origin) return undefined;
    const stack = s.stack.slice(0, -1);
    this.set(windowId, stack.length ? { stack, current: origin, reached: false } : EMPTY);
    return origin;
  }

  /** A move could not complete: the stack is dropped and the panel is told. */
  fail(windowId: string): void {
    this.set(windowId, { stack: [], reached: false, failed: true });
  }

  dismissFailure(windowId: string): void {
    const s = this.get(windowId);
    if (!s.failed) return;
    this.set(windowId, s.stack.length ? { ...s, failed: false } : EMPTY);
  }

  /** Asks the panel showing `annotationId` to focus its card once selected. */
  setFocus(windowId: string, annotationId: string | undefined): void {
    const s = this.get(windowId);
    if (s.focus === annotationId) return;
    this.set(windowId, annotationId || s.stack.length || s.failed ? { ...s, focus: annotationId } : EMPTY);
  }

  clear(windowId: string): void {
    if (this.states.has(windowId)) this.set(windowId, EMPTY);
  }

  /**
   * Called with the window's selection and canvas: the stack is dropped as soon as the
   * reader selects something else or leaves the visible canvases after the move completed.
   */
  reconcile(windowId: string, selectedId: string | undefined, visibleCanvasIds: readonly (string | undefined)[]): void {
    const s = this.get(windowId);
    const current = s.current;
    if (!current || s.stack.length === 0) return;
    const onTarget = !!selectedId && baseId(selectedId) === baseId(current.annotationId);
    if (!s.reached) {
      if (onTarget) this.set(windowId, { ...s, reached: true });
      return;
    }
    const visible = visibleCanvasIds.filter((c): c is string => !!c);
    if (!onTarget || (current.canvasId && visible.length > 0 && !visible.includes(current.canvasId))) this.clear(windowId);
  }

  subscribe(listener: LinkNavigationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(windowId: string, state: LinkNavigationState): void {
    if (state === EMPTY) this.states.delete(windowId);
    else this.states.set(windowId, state);
    this.listeners.forEach((l) => l(windowId));
  }
}

export const linkNavigationStore = new LinkNavigationStore();
