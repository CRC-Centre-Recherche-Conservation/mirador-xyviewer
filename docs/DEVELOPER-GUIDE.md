# Developer Guide

This guide explains the plugin architecture and how to extend mirador-xyviewer.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Annotation Normalizer](#annotation-normalizer)
- [Plugin System](#plugin-system)
- [Components](#components)
- [Services](#services)
- [State Management](#state-management)
- [Adding New Body Types](#adding-new-body-types)
- [Customizing the UI](#customizing-the-ui)
- [Testing](#testing)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    MIRADOR 4 (Redux Store)                  │
│  - Manifest state                                           │
│  - Window state                                             │
│  - Annotation state                                         │
└─────────────────────────────────────────────────────────────┘
        ▲                           │
        │ dispatch                  │ mapStateToProps
        │                           ▼
┌─────────────────────────────────────────────────────────────┐
│              PLUGIN LAYER                                    │
│  ConnectedScientificAnnotationPlugin                        │
│  - Wraps CanvasAnnotations component                        │
│  - Connects to Redux store                                  │
│  - Filters scientific annotations                           │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              COMPONENT LAYER                                 │
│  AnnotationBodyRenderer (router)                            │
│  ├─ ManifestBody      → Opens linked manifests              │
│  ├─ DatasetBody       → Loads/displays spectra              │
│  ├─ TextualBody       → Renders text content                │
│  ├─ SpecificResourceBody → Chips grouped by purpose         │
│  ├─ EvidenceLinkBody  → Selects a linked annotation         │
│  └─ Choice            → Renders one item (reader language)  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              SERVICE LAYER                                   │
│  datasetFetcher  → Secure HTTP fetching                     │
│  datasetParser   → CSV/TSV parsing + downsampling           │
│  datasetCache    → URL-based caching with TTL               │
└─────────────────────────────────────────────────────────────┘
```

## Annotation Normalizer

`src/utils/annotationNormalizer.ts` is the only module that knows IIIF wire formats. An ordered adapter registry recognizes a container (IIIF Presentation 2 / Open Annotation, or Presentation 3 / W3C Web Annotation) and reads its fields; version-blind mappers translate them into one normalized v3 model. It is tolerant: malformed producer input is dropped or passed through, never thrown on.

| Wire input (v2 / Open Annotation) | Normalized (v3) |
|---|---|
| `sc:AnnotationList` / `resources` / `@id` / `resource` / `on` | `AnnotationPage`-style annotation: `id` / `body` / `target` |
| `motivation: "oa:commenting"` (string, `{@id}` or array) | `commenting`; only a leading `oa:` is stripped, `sc:painting` is kept |
| `cnt:ContentAsText`, `dctypes:Text`, `oa:Tag` + `chars` | `TextualBody` (`value`, `language`, `purpose`; `oa:Tag` defaults to `purpose: "tagging"`) |
| `dctypes:Dataset` | `Dataset`; unmapped keys (e.g. `xyReading`) are kept, `license` becomes `rights` when `rights` is absent |
| `sc:Manifest` or `application/ld+json` | `Manifest` |
| `oa:SpecificResource` + `full` (string) | `SpecificResource`, `source` = the string |
| `oa:SpecificResource` + `full` (untyped object) | `source` = `full["@id"]`, `full.label` hoisted to the body `label` |
| `oa:SpecificResource` + `full` (typed object) | `source` = `{ id, type }` (prefix stripped) |
| `oa:SpecificResource` without an id | body dropped |
| `oa:hasPurpose` / `hasPurpose` / `purpose` (string, `{@id\|id}`, array) | `purpose` without the `oa:` prefix |
| `on` string `canvas#xywh=...` | `SpecificResource` target + `FragmentSelector` |
| `on` object with `selector` (`oa:Choice`, arrays) | `selector` = `[default, ...item]` flattened; one selector stays an object, several become an array |
| `FragmentSelector` / `SvgSelector` without a string `value` | selector dropped (Mirador calls `value.match` unguarded) |
| `seeAlso`, `metadata`, `label` (`@value` / `@language`) | v3 equivalents (`LocalizedString` maps) |

Presentation 3 annotations keep every property the normalizer does not model (`bodyValue`, `created`, `creator`, `rights`, `stylesheet`, ...); the normalized keys are written last and win. Selectors on v3 targets go through the same selector mapper.

### Selector display pass

`utils/annotationSelectors.ts` (`normalizeTargetSelector`) prepares each target's selector(s) for display. It works over WADM §4.2 arrays (items select the same content), never throws and is idempotent:

- an existing `SvgSelector` is preferred and a `<path>` is left as is;
- a `PointSelector` (numeric `x`, `y`; a temporal-only point is ignored) without an SVG gets a circle `SvgSelector` appended;
- a tiny `xywh` (<= 5 px, decimals allowed) becomes a circle; when the value carries other parts such as `&t=`, the circle is appended and the fragment kept;
- `<polygon>`/`<polyline>` is rebuilt as a `<path>` from the parsed numbers only (no producer markup is kept; plain `fill`, `stroke` and `stroke-width` values carry over). An SVG that also holds other shapes is left untouched, a malformed or oversized one (> 256 000 characters) is dropped and the `FragmentSelector` bbox stays;
- `xywh=pixel:` is canonicalised to `xywh=` (Mirador's `parseInt` yields `NaN` otherwise). `xywh=percent:` is left alone: it cannot be resolved without the canvas size, which the transformer does not know.

The pass runs in `annotationPostprocessor` (fetched pages). `normalizeAnnotationResources` applies it too, only to keep the panel's copy of the data consistent: nothing in the panel reads `target.selector` today.

Pages embedded in a manifest never go through the `annotationJson` branch of the postprocessor: Mirador's `fetchCanvasAnnotations` saga dispatches `receiveAnnotation` directly for inline `items`, so the canvas overlay reads them unprocessed from the store. An embedded `PointSelector`-only target is therefore not drawn; embedded pages must ship their own `SvgSelector` (or use a regular `xywh`). Normalising them would need a pass on the manifest response (`manifestJson`), planned as a follow-up. Meanwhile `getAnnotationBounds` tolerates what Mirador cannot draw (PointSelector, `pixel:` fragments, the coordinates of any SVG path/polygon/polyline/circle/ellipse/rect), so the selection pulse works either way.

To support a new format, implement `AnnotationAdapter` and register it; do not add wire-format knowledge anywhere else.

---

## Plugin System

### How Mirador Plugins Work

Mirador 4 plugins use a **component wrapping** system:

```typescript
const myPlugin = {
  component: MyPluginComponent,
  target: 'TargetComponent',    // Component to wrap
  mode: 'wrap' | 'add',         // wrap = replace, add = alongside
  mapStateToProps: (state, ownProps) => ({ /* props from Redux */ }),
  mapDispatchToProps: { /* action creators */ }
};
```

### Error containment

Mirador isolates errors per window, viewer area and companion window, not per plugin. Mirador 4.3's `CompanionWindowFactory` passes `fallbackComponent` (lowercase f) to `react-error-boundary`, so its fallback is not applied there. A rendering error from malformed producer data therefore replaces the whole Mirador window (or blanks the canvas area). This library adds three layers:

- **Plugin level** (`src/plugin/containPlugin.tsx`): every exported plugin has its component wrapped in an `ErrorBoundary`. A `wrap` plugin that throws falls back to Mirador's original `TargetComponent` (nothing if that throws too); an `add` plugin renders nothing. The plugin object keeps its shape (`target`, `mode`, `mapDispatchToProps`; `mapStateToProps` stays a function but is wrapped so a throw there, e.g. while parsing producer data, is contained too). The boundary resets when the window, the visible canvases or the selected annotation changes.
- **Item level**: each annotation in the list and each body in `AnnotationBodyRenderer` has its own boundary showing "This annotation could not be displayed."; sibling items keep rendering.
- **Standalone components** (`DatasetBody`, `SpectrumPlot`, ...) are not wrapped. Hosts can use the exported `ErrorBoundary`:

```tsx
<ErrorBoundary resetKey={annotationId} fallback={<ErrorNotice />}>
  <DatasetBody body={body} />
</ErrorBoundary>
```

The library's own log line has a `[mirador-xyviewer]` prefix and only the error name. React 19 still reports each caught error through the root's `onCaughtError` (`console.error` by default, message included); Mirador owns the root, so hosts that need to silence it must pass `onCaughtError` to their own `createRoot`.

### Scientific Annotation Plugin

Location: `src/plugin/ConnectedScientificAnnotationPlugin.tsx`

```typescript
export const scientificAnnotationPlugin = {
  component: ConnectedScientificAnnotationPlugin,
  target: 'CanvasAnnotations',
  mode: 'wrap',
  mapStateToProps: (state, { windowId }) => ({
    annotations: getAnnotationsFromState(state, windowId),
    selectedAnnotationIds: getSelectedAnnotationIds(state, windowId),
  }),
  mapDispatchToProps: {
    addWindow: actions.addWindow,
    selectAnnotation: actions.selectAnnotation,
  }
};
```

### Image Comparison Plugin

Location: `src/plugin/ImageComparisonPlugin.tsx`

```typescript
export const imageComparisonPlugin = {
  component: ImageComparisonPlugin,
  target: 'OpenSeadragonViewer',
  mode: 'add',
  mapStateToProps: (state, { windowId }) => ({
    canvases: getCanvases(state, windowId),
  }),
};
```

## Components

### AnnotationBodyRenderer

The central router that delegates to specific body renderers.

```typescript
// src/components/AnnotationBodyRenderer.tsx

interface Props {
  body: AnnotationBody | AnnotationBody[];
  annotation: IIIFAnnotation;
  addWindow: (config: WindowConfig) => void;
}

export function AnnotationBodyRenderer({ body, annotation, addWindow }: Props) {
  const bodies = Array.isArray(body) ? body : [body];

  return (
    <>
      {bodies.map((b, index) => {
        if (isDatasetBody(b)) {
          return <DatasetBody key={index} body={b} />;
        }
        if (isManifestBody(b)) {
          return <ManifestBody key={index} body={b} addWindow={addWindow} />;
        }
        if (isTextualBody(b)) {
          return <TextualBody key={index} body={b} />;
        }
        return null;
      })}
    </>
  );
}
```

### HTML sanitization

Annotation HTML (plain annotation content and `text/html` bodies) is never injected by the plugin itself: it goes through Mirador's `SanitizedHtml` with the host's `htmlSanitizationRuleSet` (default `iiif`). `text/plain` bodies are React text children, so React escapes them. `escapeHtml` and `sanitizeText` in `utils/security.ts` are only for non-React string contexts; do not apply them to React children.

### DatasetBody

Handles loading and displaying spectral data.

```typescript
// src/components/DatasetBody.tsx

interface Props {
  body: DatasetBody;
}

export function DatasetBody({ body }: Props) {
  const [data, setData] = useState<SpectrumData | null>(null);
  const [status, setStatus] = useState<FetchStatus>('idle');

  const handleLoad = async () => {
    setStatus('loading');

    // Check cache first
    const cached = datasetCache.get(body.id);
    if (cached) {
      setData(cached);
      setStatus('success');
      return;
    }

    // Fetch and parse
    const result = await fetchDataset(body.id, body.format);
    if (result.success) {
      const parsed = parseDataset(result.data, result.mimeType);
      datasetCache.set(body.id, parsed);
      setData(parsed);
      setStatus('success');
    } else {
      setStatus('error');
    }
  };

  return (
    <Box>
      {status === 'idle' && (
        <Button onClick={handleLoad}>Load Spectrum</Button>
      )}
      {status === 'loading' && <CircularProgress />}
      {status === 'success' && data && (
        <SpectrumPlot data={data} />
      )}
      {status === 'error' && <Alert severity="error">Failed to load</Alert>}
    </Box>
  );
}
```

### SpectrumPlot

Plotly wrapper for spectrum visualization.

```typescript
// src/components/SpectrumPlot.tsx

interface Props {
  data: SpectrumData;
  height?: number;
}

export function SpectrumPlot({ data, height = 300 }: Props) {
  const traces: PlotlyTrace[] = data.series.map((series, index) => ({
    x: data.xValues,
    y: series.values,
    name: series.label,
    type: 'scatter',
    mode: 'lines',
    line: { color: COLORS[index % COLORS.length] }
  }));

  const layout: PlotlyLayout = {
    height,
    xaxis: { title: data.xLabel },
    yaxis: { title: data.yLabel },
    margin: { t: 20, r: 20, b: 40, l: 50 },
  };

  return <Plot data={traces} layout={layout} config={{ responsive: true }} />;
}
```

## IIIF Auth for annotation pages

`src/mirador-auth/trust.ts` (`createTrustGates`) is the single implementation of the trust
rules (allowlist or host-driven default, https except loopback, SSRF blocklist, token and
login-service matching). `wire.ts` (datasets) and `annotationAuth.ts` (annotation pages) both
consume it, so they cannot drift.

`wireMiradorAnnotationAuth(store)` needs a store with `subscribe` (kept out of
`MiradorStoreLike` to avoid a breaking type change). It relies on how Mirador 4.2.2 - 4.3 fetches
annotation pages: the saga marks `state.annotations[target][url].isFetching`, then applies
`config.requests.preprocessors` as `(url, options) => options` at fetch time, so a preprocessor
added later with `updateConfig` (arrays replace) applies. A `401` with a JSON body is stored as a
successful page; other errors drop the body. The wire keeps small module-level maps (declared
services, sent tokens, deny-list, once-per-token refetch keys) and only the newest wire is live.

The core never sees Mirador's auth state: the wire registers `canSignIn` / `signIn` through
`configureAnnotationAuth` (`src/services/annotationAuth.ts`), and `ConnectedScientificAnnotationPlugin`
renders `AnnotationSignIn` above the list when `findSignInPage` finds a stored page that
declares a service the handler accepts. Pages Mirador stored as errors have no `json` and are skipped.

## Services

### Dataset Fetcher

Secure HTTP fetching with validation.

```typescript
// src/services/datasetFetcher.ts

export async function fetchDataset(
  url: string,
  expectedFormat?: string,
  signal?: AbortSignal
): Promise<DatasetFetchResult> {
  // Validate URL
  if (!isValidUrl(url)) {
    return { success: false, error: 'Invalid URL' };
  }

  // Fetch with timeout
  const response = await fetch(url, {
    signal,
    headers: { 'Accept': ALLOWED_MIME_TYPES.join(', ') }
  });

  // Validate MIME type
  const contentType = response.headers.get('Content-Type');
  if (!validateContentType(contentType)) {
    return { success: false, error: 'Invalid content type' };
  }

  // Check size
  const size = parseInt(response.headers.get('Content-Length') || '0');
  if (size > MAX_DATASET_SIZE) {
    return { success: false, error: 'File too large' };
  }

  const data = await response.text();
  return { success: true, data, mimeType: contentType };
}
```

### Content State

`utils/contentState.ts` (pure: input classification, base64url codec, selectors to regions,
target extraction, Mirador window configs) and `services/contentStateResolver.ts` (guarded
fetch, URI following with depth and loop limits, file reading) implement IIIF Content State
1.0. They are public API and know nothing about any producer. See
[Opening a IIIF Content State](MIRADOR-CONFIGURATION.md#opening-a-iiif-content-state) for
usage and the security model; `demo/contentStateInputs.ts` is a reference host.

### Dataset Parser

CSV/TSV parsing with LTTB downsampling.

```typescript
// src/services/datasetParser.ts

export function parseDataset(content: string, mimeType: string): SpectrumData {
  // Detect delimiter
  const delimiter = detectDelimiter(content, mimeType);

  // Parse with PapaParse
  const result = Papa.parse(content, {
    delimiter,
    skipEmptyLines: true,
    dynamicTyping: true,
  });

  // Find header row and X column
  const { headerIndex, xColumnIndex } = findHeaders(result.data);

  // Extract data
  const headers = result.data[headerIndex];
  const dataRows = result.data.slice(headerIndex + 1);

  // Build spectrum data
  const xValues = dataRows.map(row => row[xColumnIndex]);
  const series = headers
    .filter((_, i) => i !== xColumnIndex)
    .map((label, i) => ({
      label: String(label),
      values: dataRows.map(row => row[i < xColumnIndex ? i : i + 1])
    }));

  // Downsample if needed
  if (xValues.length > MAX_DATA_POINTS) {
    return downsampleLTTB({ xValues, series }, MAX_DATA_POINTS);
  }

  return { xValues, series, xLabel: headers[xColumnIndex] };
}
```

### Dataset Cache

Global cache with TTL.

```typescript
// src/services/datasetCache.ts

class DatasetCache {
  private cache = new Map<string, CacheEntry>();
  private cleanupInterval: NodeJS.Timer;

  constructor() {
    // Cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  get(url: string): SpectrumData | null {
    const entry = this.cache.get(url);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(url);
      return null;
    }
    return entry.data;
  }

  set(url: string, data: SpectrumData): void {
    this.cache.set(url, {
      data,
      expiresAt: Date.now() + CACHE_TTL,
    });
  }

  cleanup(): void {
    const now = Date.now();
    for (const [url, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(url);
      }
    }
  }
}

export const datasetCache = new DatasetCache();
```

## State Management

### Spectrum Store

Global state for spectrum data across windows.

```typescript
// src/state/spectrumStore.ts

interface SpectrumEntry {
  id: string;
  windowId: string;
  canvasId: string;
  data: SpectrumData;
  visible: boolean;
  color: string;
}

class SpectrumStore {
  private spectra = new Map<string, SpectrumEntry>();
  private listeners = new Set<() => void>();

  add(entry: SpectrumEntry): void {
    this.spectra.set(entry.id, entry);
    this.notify();
  }

  remove(id: string): void {
    this.spectra.delete(id);
    this.notify();
  }

  setVisibility(id: string, visible: boolean): void {
    const entry = this.spectra.get(id);
    if (entry) {
      entry.visible = visible;
      this.notify();
    }
  }

  getByWindow(windowId: string): SpectrumEntry[] {
    return Array.from(this.spectra.values())
      .filter(e => e.windowId === windowId);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(l => l());
  }
}

export const spectrumStore = new SpectrumStore();
```

## Adding New Body Types

### Step 1: Define the Type

```typescript
// src/types/iiif.ts

export interface ChartBody {
  id: string;
  type: 'Chart';
  format: 'application/json';
  label?: LocalizedString;
  chartType: 'bar' | 'pie' | 'line';
}

export function isChartBody(body: unknown): body is ChartBody {
  return (body as ChartBody)?.type === 'Chart';
}
```

### Step 2: Create the Component

```typescript
// src/components/ChartBody.tsx

interface Props {
  body: ChartBody;
}

export function ChartBody({ body }: Props) {
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    fetch(body.id)
      .then(res => res.json())
      .then(setChartData);
  }, [body.id]);

  if (!chartData) return <CircularProgress />;

  return (
    <Box>
      <Typography>{getLocalizedString(body.label)}</Typography>
      {/* Render chart based on body.chartType */}
    </Box>
  );
}
```

### Step 3: Register in Router

```typescript
// src/components/AnnotationBodyRenderer.tsx

import { ChartBody, isChartBody } from './ChartBody';

export function AnnotationBodyRenderer({ body, ... }: Props) {
  // ... existing code ...

  if (isChartBody(b)) {
    return <ChartBody key={index} body={b} />;
  }

  // ... rest of code ...
}
```

### Step 4: Export

```typescript
// src/components/index.ts

export { ChartBody } from './ChartBody';

// src/types/index.ts

export type { ChartBody } from './iiif';
export { isChartBody } from './iiif';
```

## Customizing the UI

### Theming

Components use MUI theming. Customize via Mirador's theme:

```typescript
const viewer = Mirador.viewer({
  theme: {
    palette: {
      primary: { main: '#1976d2' },
      secondary: { main: '#dc004e' },
    },
  },
}, [scientificAnnotationPlugin]);
```

### Custom Plot Colors

```typescript
// src/components/SpectrumPlot.tsx

const COLORS = [
  '#1f77b4', // blue
  '#ff7f0e', // orange
  '#2ca02c', // green
  '#d62728', // red
  '#9467bd', // purple
  '#8c564b', // brown
  '#e377c2', // pink
  '#7f7f7f', // gray
];
```

### Localization

Components do not use `react-i18next`. User-facing strings are overridable props, for example
`SpectrumPlot` accepts a `labels` object that is merged over `DEFAULT_LABELS`:

```tsx
<SpectrumPlot data={data} labels={{ expandButton: 'Agrandir', closeButton: 'Fermer' }} />
```

### Reader language (IIIF Presentation 3 §4.4)

All language-map rendering goes through `src/utils/localization.ts`:

- `resolvePreferredLanguages(configured?)` builds the ordered list: configured language(s), then `navigator.languages`, then `none`, `@none`.
- `pickLanguageKey(map, prefs)` picks ONE key: per preference the exact key (case-insensitive), the primary subtag (`fr-CA` → `fr`), then a regional variant (`fr` → `fr-FR`, also a sibling `pt-PT` → `pt-BR` when no `pt-PT`/`pt` exists); then `none`, `@none`, then the first non-empty key. Empty arrays are ignored.
- `getLocalizedStrings` returns every value of the chosen language; `getLocalizedString` keeps its signature and returns the first. `getAllLocalizedStrings` mixes languages and is not §4.4-compliant for display.

**Where the language comes from.** Mirador always defines `config.language` (default `'en'`), so "host did not set a language" cannot be told apart from "host chose English". The configured value is therefore authoritative (Mirador's per-window Info-panel locale selector is not followed); `navigator.languages` only acts as a fallback after it, or when there is no store. Hosts wanting the browser language set `language` themselves.

**Wiring.** The plugins read `state.config.language` (what Mirador's `getConfig(state)` returns, kept as a plain property read so `mapStateToProps` stays testable with plain state objects) in `mapStateToProps`. `ConnectedScientificAnnotationPlugin` provides it via `LanguageProvider`; components read it with `useLanguagePreferences()` (default: browser language, so they work without a store). `MetadataDisplay`, `DatasetBody` and `AnnotationBodyRenderer` consume the context; `ImageComparisonPlugin` resolves canvas labels in `mapStateToProps`.

**Text bodies.** `selectLanguageVariants` groups `TextualBody` by (type, purpose, format); when a group holds two or more languages only the reader's is rendered. Bodies without a language are always kept; order is preserved.

**Filters.** `filtersStore.initializeFromAnnotations(w, c, annotations, force, prefs)` keys labels and values (`entryKeys`) in the reader's language and stores the prefs. Calling it with different prefs rebuilds the groups, which resets the selection (keys differ per language). `FilterValue.key` is the key to pass to `toggleValue`; external callers must not assume keys are language-independent.

### Web Annotation bodies

`AnnotationBodyRenderer` groups the bodies of one annotation into blocks: all non-linking `SpecificResource` bodies form one chip block (`SpecificResourceBody`, grouped by purpose in source order, no dividers between chips), all `linking` ones one button block (`EvidenceLinkBody`), every other body its own block. Unknown body types and absent bodies render nothing (`console.debug`).

- **Chips.** Label = `body.label ?? source.label` (`srLabel`), picked with `useLanguagePreferences()`, else the source id (`srSourceId`). The chip is an anchor only when the id passes `isValidUrl`, and it stops click propagation so it does not select the annotation.
- **Evidence.** The plugin passes `windowId`, Mirador's `selectAnnotation` and the ids of the canvas annotations. `resolveLinkedAnnotationId` matches the exact id, else the `#target-N` form made by `expandAnnotations`. No match: disabled button with a tooltip. Labels are overridable through the `labels` prop (`evidence`, `evidenceUnavailable`, `purposes`).
- **Choice.** `pickChoiceItem` keeps the item whose `language` matches the reader's preferences, else the first, then routes it through the normal renderer (depth bounded by `MAX_CHOICE_DEPTH`).
- **Plugin trigger.** `shouldUseCustomRendering` is also true for `SpecificResource` and `Choice` bodies, so characterization annotations get the rich rendering instead of Mirador's plain-text list.

### Build externals and peer policy

`config/externals.ts` decides what stays out of `dist/`: every `peerDependencies` entry plus `redux` (type-only import), matched with their subpaths (`react/jsx-runtime`, `@mui/material/styles`, ...). Only `papaparse` and `ipaddr.js` are bundled. `config/externals.test.ts` guards this: when you import a new host-provided package, declare it as a peer.

### Peer dependency policy

Peers are the range we test: the lower end (Mirador 4.2.2, MUI 7, plotly.js 3, react-plotly.js 2.6)
and the upper end (Mirador 4.3, MUI 9, plotly.js 4, react-plotly.js 4). Dev dependencies track the
upper end. The lower end is verified by the `Lower-end peers` CI job, which rewrites the dev dependencies to
that range (see `.github/workflows/ci.yml`) and runs typecheck + tests without the lockfile.

## Testing

### Testing Conventions

- **Co-location**: a test sits next to its source — `Foo.ts` ↔ `Foo.test.ts`. No `__tests__/` directory.
- **No helper re-implementation**: never copy a source function into a test. If a helper isn't exported, export it with an `@internal` JSDoc tag and import it. `@internal` exports are stripped from the published `.d.ts` via `tsconfig.build.json` (`stripInternal: true`), so they don't leak into the public API.
- **Pattern A (pure logic)**: utils, stores, type guards — test the public API directly, no mocks.
- **Pattern A′ (async/streaming)**: e.g. `datasetFetcher` — mock `fetch` and the collaborators (`datasetParser`, `datasetCache`); write one test per error/guard branch.
- **Pattern B (components)**: React Testing Library; mock heavy deps (`react-plotly.js`, `openseadragon`) with `vi.mock`; assert via `getByRole`/`getByText` and ARIA state, not test ids.
- **Pattern D (integration)**: a few `*.integration.test.tsx` run the real module chain with only the outer boundary mocked (`fetch`, `react-plotly.js`, `mirador`) — they catch contract drift between modules. Few and targeted, not per-file.
- **Top-of-file JSDoc**: each test file opens with a short comment stating what it covers.
- **Regression tests**: when a test pins a past bug, prefix it with a `// Regression:` comment explaining the bug.

### Unit Tests

```typescript
// src/services/__tests__/datasetParser.test.ts

import { parseDataset } from '../datasetParser';

describe('parseDataset', () => {
  it('parses CSV with header', () => {
    const csv = 'wavelength,intensity\n400,0.12\n410,0.15';
    const result = parseDataset(csv, 'text/csv');

    expect(result.xValues).toEqual([400, 410]);
    expect(result.series[0].values).toEqual([0.12, 0.15]);
  });

  it('handles multiple Y columns', () => {
    const csv = 'x,y1,y2\n1,10,20\n2,15,25';
    const result = parseDataset(csv, 'text/csv');

    expect(result.series).toHaveLength(2);
  });
});
```

### Integration Tests

```typescript
// src/components/__tests__/DatasetBody.test.tsx

import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetBody } from '../DatasetBody';

describe('DatasetBody', () => {
  it('loads data on button click', async () => {
    const body = {
      id: 'https://example.org/data.csv',
      type: 'Dataset',
      format: 'text/csv',
    };

    render(<DatasetBody body={body} />);

    fireEvent.click(screen.getByText('Load Spectrum'));

    await screen.findByRole('img'); // Plotly chart
  });
});
```

### Running Tests

```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
npm test -- --coverage # Coverage report
```
