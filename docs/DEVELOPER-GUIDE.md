# Developer Guide

This guide explains the plugin architecture and how to extend mirador-xyviewer.

## Table of Contents

- [Architecture Overview](#architecture-overview)
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
│  └─ TextualBody       → Renders text content                │
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

Components use `react-i18next`. Add translations:

```typescript
// src/locales/en.json
{
  "loadSpectrum": "Load Spectrum",
  "loading": "Loading...",
  "error": "Failed to load data"
}

// src/locales/fr.json
{
  "loadSpectrum": "Charger le spectre",
  "loading": "Chargement...",
  "error": "Échec du chargement"
}
```

## Testing

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
