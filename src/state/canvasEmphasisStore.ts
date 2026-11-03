/**
 * Per-window emphasis of the numbered zone badges. Only panel gestures set it (pointer or focus
 * on a card or row, "Show all", following a link), so the canvas itself never produces badges.
 * Module-level singleton with subscribe, like the other plugin stores.
 */

/** Why the badges are shown; decides what ends them. */
export type EmphasisSource = 'hover' | 'timed' | 'follow';

export interface CanvasEmphasis {
  /** Classification whose links are numbered. */
  ownerId: string;
  /** Every row, or these row numbers. */
  rows: 'all' | readonly number[];
  source: EmphasisSource;
  /** Epoch ms after which the emphasis is dropped (`timed` only). */
  expiresAt?: number;
}

export type CanvasEmphasisListener = (windowId: string) => void;

/** How long "Show all" keeps the badges. */
export const SHOW_ALL_BADGES_MS = 4000;

class CanvasEmphasisStore {
  private states = new Map<string, CanvasEmphasis>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private listeners = new Set<CanvasEmphasisListener>();

  /** Stable snapshot per window (same object until it changes). */
  get(windowId: string): CanvasEmphasis | undefined {
    return this.states.get(windowId);
  }

  /** Pointer or focus is on a card (`'all'`) or on one of its rows. */
  hover(windowId: string, ownerId: string, rows: 'all' | readonly number[]): void {
    const s = this.states.get(windowId);
    const same = s?.source === 'hover' && s.ownerId === ownerId && sameRows(s.rows, rows);
    if (!same) this.set(windowId, { ownerId, rows, source: 'hover' });
  }

  /**
   * Pointer or focus left a card or row: only a hover emphasis ends. With `fallback` (left a
   * row, still inside the card) the card's badges come back instead.
   */
  release(windowId: string, fallback?: { ownerId: string; rows: 'all' | readonly number[] }): void {
    if (this.states.get(windowId)?.source !== 'hover') return;
    if (fallback) this.set(windowId, { ...fallback, source: 'hover' });
    else this.clear(windowId);
  }

  /** All badges of `ownerId` for `ms`, or until the next emphasis change. */
  showTimed(windowId: string, ownerId: string, ms = SHOW_ALL_BADGES_MS): void {
    this.set(windowId, { ownerId, rows: 'all', source: 'timed', expiresAt: Date.now() + ms }, ms);
  }

  /** Row `n` of `ownerId` was followed: its badge stays while the move is current. */
  follow(windowId: string, ownerId: string, n: number): void {
    this.set(windowId, { ownerId, rows: [n], source: 'follow' });
  }

  /** Drops a `follow` emphasis (the move is over); other sources are left alone. */
  endFollow(windowId: string): void {
    if (this.states.get(windowId)?.source === 'follow') this.clear(windowId);
  }

  clear(windowId: string): void {
    if (this.states.has(windowId)) this.set(windowId, undefined);
  }

  subscribe(listener: CanvasEmphasisListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(windowId: string, state: CanvasEmphasis | undefined, expireIn?: number): void {
    clearTimeout(this.timers.get(windowId));
    this.timers.delete(windowId);
    if (state) this.states.set(windowId, state);
    else this.states.delete(windowId);
    if (state && expireIn !== undefined) {
      this.timers.set(
        windowId,
        setTimeout(() => {
          this.timers.delete(windowId);
          if (this.states.get(windowId) === state) this.set(windowId, undefined);
        }, expireIn),
      );
    }
    this.listeners.forEach((l) => l(windowId));
  }
}

function sameRows(a: 'all' | readonly number[], b: 'all' | readonly number[]): boolean {
  if (a === 'all' || b === 'all') return a === b;
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

export const canvasEmphasisStore = new CanvasEmphasisStore();
