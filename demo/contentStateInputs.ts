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
} from '../src';
import type { ContentStateInput, ContentStateTarget } from '../src';

type DemoStore = { dispatch(action: unknown): unknown };

/** True for elements the user types into; paste and drop there are not ours. */
function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

/** Short-lived message; text only, never HTML. */
function notify(message: string): void {
  const toast = document.createElement('div');
  toast.setAttribute('role', 'alert');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '56px', left: '76px', maxWidth: '420px', padding: '10px 14px',
    background: '#b71c1c', color: '#fff', borderRadius: '4px', font: '14px sans-serif',
    zIndex: '10001', boxShadow: '0 2px 8px rgba(0,0,0,.4)',
  });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
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
  return async function open(input: ContentStateInput | string, options: { fromFile?: boolean } = {}): Promise<void> {
    const result = await resolveContentState(input);
    if (!result.targets.length) {
      notify(result.warnings[0] ?? 'Nothing to open.');
      return;
    }
    if (result.warnings.length) console.warn('[XYViewer] Content State:', result.warnings);

    // Only local files bypass Mirador's own fetch (and its postprocessors).
    const manifests = new Map<string, unknown>();
    for (const t of result.targets) {
      if (options.fromFile && t.manifestId && t.manifestJson) {
        store.dispatch(receiveManifest(t.manifestId, t.manifestJson));
        manifests.set(t.manifestId, t.manifestJson);
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
    if (!windows.length) {
      notify('The content state does not say which manifest to open.');
      return;
    }
    for (const config of windows) store.dispatch(addWindow({ ...config, sideBarOpen: true, sideBarPanel: 'info' }));
  };
}

/** Wire the paste, drop and file entry points. Returns a cleanup function. */
export function setupContentStateInputs(
  store: DemoStore,
  openButton: HTMLElement | null,
  fileInput: HTMLInputElement | null
): () => void {
  const open = createContentStateOpener(store);

  // Spec 3.3: paste.
  const onPaste = (e: ClipboardEvent) => {
    if (isEditable(e.target)) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!looksLikeContentState(text)) return;
    e.preventDefault();
    void open(parseContentStateInput(text, { allowEncoded: false }));
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
    if (file) void readContentStateFile(file).then((input) => open(input, { fromFile: true }));
    else void open(parseContentStateInput(text, { allowEncoded: false }));
  };

  // Spec 3.5: local file.
  const onFile = () => {
    const file = fileInput?.files?.[0];
    if (!file) return;
    void readContentStateFile(file).then((input) => open(input, { fromFile: true }));
    if (fileInput) fileInput.value = '';
  };
  const onClick = () => fileInput?.click();

  document.addEventListener('paste', onPaste);
  document.addEventListener('drop', onDrop, true);
  fileInput?.addEventListener('change', onFile);
  openButton?.addEventListener('click', onClick);
  return () => {
    document.removeEventListener('paste', onPaste);
    document.removeEventListener('drop', onDrop, true);
    fileInput?.removeEventListener('change', onFile);
    openButton?.removeEventListener('click', onClick);
  };
}

/** Content state requested by the page URL (`?iiif-content=` wins over `?manifest=`). */
export function contentStateFromLocation(): ContentStateInput | null {
  return parseContentStateQuery(window.location.search);
}
