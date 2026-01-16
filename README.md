# mirador-xyviewer

A Mirador 4 plugin for handling scientific IIIF annotations with spectrum visualization support.

## Features

- **Manifest Links (Case 1)**: Clickable links that open related IIIF manifests in new Mirador windows
- **Dataset Visualization (Case 2)**: Fetches and plots CSV/TSV spectral data using Plotly
- **TextualBody Support (Case 3)**: Clean rendering of textual annotations
- **Security**: Strict MIME type validation, URL sanitization, file size limits
- **Performance**: Lazy loading, caching, AbortController cleanup, downsampling

## Installation

```bash
npm install mirador-xyviewer
```

## Usage

```typescript
import Mirador from 'mirador';
import { scientificAnnotationPlugin } from 'mirador-xyviewer';

const viewer = Mirador.viewer({
  id: 'mirador-container',
  windows: [{
    manifestId: 'https://example.org/manifest.json',
  }],
}, [scientificAnnotationPlugin]);
```

## Important: Annotation Motivation Filter

Mirador filters annotations by their `motivation` field. By default, it only displays:
- `oa:commenting`, `oa:tagging`, `sc:painting`, `commenting`, `tagging`

**Scientific annotations typically use `motivation: "supplementing"`**, which is not included by default. You must explicitly add it to your Mirador configuration:

```typescript
const viewer = Mirador.viewer({
  id: 'mirador-container',
  windows: [{
    manifestId: 'https://example.org/manifest.json',
    highlightAllAnnotations: true,  // Show annotation overlays on canvas
  }],
  annotations: {
    htmlSanitizationRuleSet: 'iiif',
    filteredMotivations: [
      'oa:commenting',
      'oa:tagging',
      'sc:painting',
      'commenting',
      'tagging',
      'supplementing',  // Required for IIIF v3 scientific annotations
    ],
  },
}, [scientificAnnotationPlugin]);
```

Without this configuration, annotations will be loaded into the Redux store but will not appear in the sidebar or on the canvas.

## Annotation Body Types

### Case 1: Manifest Body

Opens the linked manifest in a new Mirador window without fetching it manually.

```json
{
  "body": {
    "id": "https://example.org/iiif/manifest.json",
    "type": "Manifest",
    "format": "application/ld+json",
    "label": { "en": ["Related Analysis"] }
  }
}
```

### Case 2: Dataset Body

Fetches and plots spectral data (CSV/TSV).

```json
{
  "body": {
    "id": "https://example.org/data/spectrum.csv",
    "type": "Dataset",
    "format": "text/csv",
    "label": { "en": ["XRF Spectrum"] }
  }
}
```

**Allowed MIME types:**
- `text/csv`
- `text/plain`
- `text/tab-separated-values`

### Case 3: TextualBody

Renders static text content.

```json
{
  "body": {
    "type": "TextualBody",
    "value": "Analysis notes here...",
    "format": "text/plain",
    "language": "en"
  }
}
```

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev:demo

# Build for production
npm run build

# Type check
npm run typecheck

# Lint
npm run lint
```

### DevTools

For debugging:

1. Install [React DevTools](https://react.dev/learn/react-developer-tools) browser extension
2. Install [Redux DevTools](https://github.com/reduxjs/redux-devtools) browser extension
3. Open browser DevTools (F12) and navigate to React/Redux tabs

The Mirador instance is exposed at `window.miradorInstance` for console debugging.

## Architecture

```
src/
├── components/          # React components
│   ├── ManifestBody.tsx    # Case 1: Manifest links
│   ├── DatasetBody.tsx     # Case 2: Dataset loading/plotting
│   ├── TextualBody.tsx     # Case 3: Text rendering
│   ├── SpectrumPlot.tsx    # Plotly wrapper
│   └── MetadataDisplay.tsx # IIIF metadata rendering
├── services/            # Data services
│   ├── datasetCache.ts     # URL-based caching
│   ├── datasetFetcher.ts   # Secure async fetching
│   └── datasetParser.ts    # CSV/TSV parsing
├── plugin/              # Mirador plugin
│   └── ConnectedScientificAnnotationPlugin.tsx
├── state/               # State management
│   └── spectrumStore.ts    # Global spectrum state
├── types/               # TypeScript definitions
│   ├── iiif.ts             # IIIF types
│   ├── mirador.ts          # Mirador types
│   └── dataset.ts          # Dataset types
└── utils/               # Utilities
    ├── security.ts         # URL/HTML sanitization
    └── localization.ts     # IIIF i18n helpers
```

## Security

- Only `http://` and `https://` URLs are allowed
- MIME types strictly validated against allowlist
- Maximum file size: 5MB
- HTML content is sanitized to prevent XSS
- No auto-follow of `seeAlso` links

## Performance

- Datasets are loaded lazily on user interaction
- Global cache with 30-minute TTL
- AbortController cleanup on unmount
- Large datasets (>10,000 points) are downsampled using LTTB algorithm
- Plotly instances are reused

