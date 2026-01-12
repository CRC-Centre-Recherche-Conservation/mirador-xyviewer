/**
 * Spectrum Store
 * Global state management for spectrum data and visibility
 *
 * This store manages:
 * - Loaded spectrum data across all annotations
 * - Visibility state for each spectrum trace
 * - Shared Plotly instance configuration
 */

import type { SpectrumData } from '../types/dataset';

/** Spectrum entry in the store */
interface SpectrumEntry {
  data: SpectrumData;
  visible: boolean;
  annotationId: string;
  canvasId?: string;
  windowId?: string;
  color: string;
}

/** Store state */
interface SpectrumStoreState {
  spectra: Map<string, SpectrumEntry>;
  activeWindowId: string | null;
  colorIndex: number;
}

/** Color palette for spectrum traces */
const TRACE_COLORS = [
  '#1976d2', // blue
  '#d32f2f', // red
  '#388e3c', // green
  '#f57c00', // orange
  '#7b1fa2', // purple
  '#0097a7', // cyan
  '#c2185b', // pink
  '#455a64', // blue-grey
  '#5d4037', // brown
  '#512da8', // deep purple
];

/** Event types for subscribers */
type SpectrumStoreEvent =
  | { type: 'add'; id: string; entry: SpectrumEntry }
  | { type: 'remove'; id: string }
  | { type: 'visibility'; id: string; visible: boolean }
  | { type: 'clear' };

type SpectrumStoreListener = (event: SpectrumStoreEvent) => void;

/**
 * Global spectrum store class
 */
class SpectrumStore {
  private state: SpectrumStoreState = {
    spectra: new Map(),
    activeWindowId: null,
    colorIndex: 0,
  };

  private listeners: Set<SpectrumStoreListener> = new Set();

  /**
   * Subscribe to store changes
   */
  subscribe(listener: SpectrumStoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of an event
   */
  private notify(event: SpectrumStoreEvent): void {
    this.listeners.forEach(listener => listener(event));
  }

  /**
   * Get next color from palette
   */
  private getNextColor(): string {
    const color = TRACE_COLORS[this.state.colorIndex % TRACE_COLORS.length];
    this.state.colorIndex++;
    return color;
  }

  /**
   * Add spectrum data to store
   */
  addSpectrum(
    id: string,
    data: SpectrumData,
    annotationId: string,
    windowId?: string,
    canvasId?: string
  ): void {
    if (this.state.spectra.has(id)) {
      // Update existing entry
      const existing = this.state.spectra.get(id)!;
      existing.data = data;
      return;
    }

    const entry: SpectrumEntry = {
      data,
      visible: true,
      annotationId,
      windowId,
      canvasId,
      color: this.getNextColor(),
    };

    this.state.spectra.set(id, entry);
    this.notify({ type: 'add', id, entry });
  }

  /**
   * Remove spectrum from store
   */
  removeSpectrum(id: string): void {
    if (!this.state.spectra.has(id)) return;
    this.state.spectra.delete(id);
    this.notify({ type: 'remove', id });
  }

  /**
   * Toggle spectrum visibility
   */
  setVisibility(id: string, visible: boolean): void {
    const entry = this.state.spectra.get(id);
    if (!entry) return;
    entry.visible = visible;
    this.notify({ type: 'visibility', id, visible });
  }

  /**
   * Get spectrum entry
   */
  getSpectrum(id: string): SpectrumEntry | undefined {
    return this.state.spectra.get(id);
  }

  /**
   * Get all spectra
   */
  getAllSpectra(): Map<string, SpectrumEntry> {
    return new Map(this.state.spectra);
  }

  /**
   * Get spectra for a specific window
   */
  getSpectraForWindow(windowId: string): Map<string, SpectrumEntry> {
    const result = new Map<string, SpectrumEntry>();
    for (const [id, entry] of this.state.spectra) {
      if (entry.windowId === windowId) {
        result.set(id, entry);
      }
    }
    return result;
  }

  /**
   * Get spectra for a specific canvas
   */
  getSpectraForCanvas(canvasId: string): Map<string, SpectrumEntry> {
    const result = new Map<string, SpectrumEntry>();
    for (const [id, entry] of this.state.spectra) {
      if (entry.canvasId === canvasId) {
        result.set(id, entry);
      }
    }
    return result;
  }

  /**
   * Set active window
   */
  setActiveWindow(windowId: string | null): void {
    this.state.activeWindowId = windowId;
  }

  /**
   * Get active window
   */
  getActiveWindow(): string | null {
    return this.state.activeWindowId;
  }

  /**
   * Clear all spectra
   */
  clear(): void {
    this.state.spectra.clear();
    this.state.colorIndex = 0;
    this.notify({ type: 'clear' });
  }

  /**
   * Clear spectra for a specific window
   */
  clearWindow(windowId: string): void {
    for (const [id, entry] of this.state.spectra) {
      if (entry.windowId === windowId) {
        this.state.spectra.delete(id);
        this.notify({ type: 'remove', id });
      }
    }
  }

  /**
   * Get store statistics
   */
  getStats(): { total: number; visible: number; windows: number } {
    let visible = 0;
    const windows = new Set<string>();

    for (const entry of this.state.spectra.values()) {
      if (entry.visible) visible++;
      if (entry.windowId) windows.add(entry.windowId);
    }

    return {
      total: this.state.spectra.size,
      visible,
      windows: windows.size,
    };
  }
}

// Singleton instance
export const spectrumStore = new SpectrumStore();

// Export types
export type { SpectrumEntry, SpectrumStoreEvent, SpectrumStoreListener };
