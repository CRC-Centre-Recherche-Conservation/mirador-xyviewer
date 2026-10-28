/**
 * Demo-only: open IIIF Content State 1.0 from every entry point the spec lists
 * (query string, paste, drag and drop, local file), using the library's parser.
 * NOT part of the published plugin.
 */
import { addWindow, receiveManifest } from 'mirador';
import {
  buildMiradorWindows,
  contentStateTextFromDataTransfer,
  fetchContentStateJson,
  findCanvasSize,
  parseContentStateInput,
  parseContentStateQuery,
  readContentStateFile,
  resolveContentState,
  transformEmbeddedAnnotationPages,
} from '../src';
import type { ContentStateInput, ContentStateTarget } from '../src';

type DemoStore = { dispatch(action: unknown): unknown };

/** True for elements the user types into; paste and drop there are not ours. */
function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

export type NoticeSeverity = 'error' | 'warning' | 'info' | 'success';
type Listener = (message: string, severity: NoticeSeverity) => void;
const listeners = new Set<Listener>();

/** Subscribe to notices; returns the unsubscribe function. */
export function subscribeNotices(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Publish a notice to the Mirador-side Snackbar; plain text only. */
export function notify(message: string, severity: NoticeSeverity = 'error'): void {
  listeners.forEach((l) => l(message, severity));
}

/** Read a local file and open it; resolves true only once a window was added. */
export async function openFileInto(open: ReturnType<typeof createContentStateOpener>, file: File): Promise<boolean> {
  if (!/\.(json|jsonld)$/i.test(file.name) && !/json/.test(file.type)) {
    notify(`Could not open ${file.name}: it is not a .json or .jsonld file.`);
    return false;
  }
  try {
    return await open(await readContentStateFile(file), { fromFile: true, fileName: file.name });
  } catch (err) {
    console.warn('[XYViewer] Could not open file:', err);
    const reason = err instanceof SyntaxError ? 'not valid JSON.' : 'a linked resource could not be loaded.';
    notify(`Could not open ${file.name}: ${reason}`);
    return false;
  }
}

/** Text that is plausibly a content state, so unrelated pastes and drops are left alone. */
function looksLikeContentState(text: string): boolean {
  const t = text.trim();
  return t.startsWith('{') || t.startsWith('[') || /^https?:\/\//i.test(t);
}

/** JSON text, or an http(s) link; `?manifest=` links stay with Mirador's own drop target. */
function carriesContentState(text: string): boolean {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) return true;
  try {
    const url = new URL(t);
    return /^https?:$/.test(url.protocol) && !url.searchParams.has('manifest');
  } catch {
    return false;
  }
}

/** Resolve a content state and open one Mirador window per target. */
export function createContentStateOpener(store: DemoStore) {
  return async function open(input: ContentStateInput | string, options: { fromFile?: boolean; fileName?: string } = {}): Promise<boolean> {
    // Files get a plain-language message naming the file; the raw reason stays in the console.
    const fail = (reason: string) => {
      console.warn('[XYViewer] Content State:', reason);
      notify(options.fileName ? `Could not open ${options.fileName}: it is not a IIIF manifest or Content State.` : reason);
      return false;
    };
    const result = await resolveContentState(input);
    if (!result.targets.length) return fail(result.warnings[0] ?? 'Nothing to open.');
    if (result.warnings.length) console.warn('[XYViewer] Content State:', result.warnings);

    // Only local files bypass Mirador's own fetch (and its postprocessors).
    const manifests = new Map<string, unknown>();
    for (const t of result.targets) {
      if (options.fromFile && t.manifestId && t.manifestJson) {
        // receiveManifest skips request postprocessors: run the embedded-page pass here.
        const manifest = transformEmbeddedAnnotationPages(t.manifestJson);
        store.dispatch(receiveManifest(t.manifestId, manifest));
        manifests.set(t.manifestId, manifest);
      }
    }

    // Percent regions need the canvas size, which only the manifest knows.
    const sizes = new Map<string, { width: number; height: number }>();
    const needSize = result.targets.filter((t: ContentStateTarget) => t.region?.unit === 'percent' && t.canvasId && t.manifestId);
    for (const t of needSize) {
      try {
        if (!manifests.has(t.manifestId!)) manifests.set(t.manifestId!, await fetchContentStateJson(t.manifestId!));
        const size = findCanvasSize(manifests.get(t.manifestId!), t.canvasId!);
        if (size) sizes.set(t.canvasId!, size);
      } catch {
        /* open the canvas without zooming */
      }
    }

    const windows = buildMiradorWindows(result, { canvasSize: (id) => sizes.get(id) });
    if (!windows.length) return fail('The content state does not say which manifest to open.');
    for (const config of windows) store.dispatch(addWindow({ ...config, sideBarOpen: true, sideBarPanel: 'info' }));
    return true;
  };
}

/** Open a content state, turning any failure into a notice. */
export function openContentState(open: ReturnType<typeof createContentStateOpener>, input: ContentStateInput | string): Promise<boolean> {
  return open(input).catch((err) => {
    notify(err instanceof Error ? err.message : 'Could not open this content state.');
    return false;
  });
}

/** Wire the paste and drop entry points. Returns a cleanup function. */
export function setupContentStateInputs(store: DemoStore): () => void {
  const open = createContentStateOpener(store);
  const openText = (text: string) =>
    openContentState(open, parseContentStateInput(text, { allowEncoded: false }));

  // Spec 3.3: paste.
  const onPaste = (e: ClipboardEvent) => {
    if (isEditable(e.target)) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!looksLikeContentState(text)) return;
    e.preventDefault();
    void openText(text);
  };

  // Spec 3.4: drop. Capture phase; Mirador's own drop target keeps handling
  // `?manifest=` links.
  const onDrop = (e: DragEvent) => {
    if (isEditable(e.target) || !e.dataTransfer) return;
    const file = Array.from(e.dataTransfer.files ?? []).find((f) => /\.(json|jsonld)$/i.test(f.name) || /json/.test(f.type));
    const text = file ? '' : contentStateTextFromDataTransfer(e.dataTransfer);
    if (!file && !carriesContentState(text)) return;
    e.preventDefault();
    // Only files are stopped (Mirador would load them as a manifest). Text and
    // links keep propagating so react-dnd can end its native drag and clear its overlay.
    if (file) e.stopPropagation();
    if (file) void openFileInto(open, file);
    else void openText(text);
  };

  document.addEventListener('paste', onPaste);
  document.addEventListener('drop', onDrop, true);
  return () => {
    document.removeEventListener('paste', onPaste);
    document.removeEventListener('drop', onDrop, true);
  };
}

/** Content state requested by the page URL (`?iiif-content=` wins over `?manifest=`). */
export function contentStateFromLocation(): ContentStateInput | null {
  return parseContentStateQuery(window.location.search);
}
