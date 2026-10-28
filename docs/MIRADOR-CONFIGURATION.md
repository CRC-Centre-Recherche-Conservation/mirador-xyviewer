# Mirador Configuration Guide

This guide explains how to configure Mirador 4 to work with mirador-xyviewer.

## Table of Contents

- [Basic Setup](#basic-setup)
- [Required Configuration](#required-configuration)
- [Optional Configuration](#optional-configuration)
- [Full Configuration Example](#full-configuration-example)
- [Troubleshooting](#troubleshooting)
- [IIIF Content Search](#iiif-content-search)
- [Opening a IIIF Content State](#opening-a-iiif-content-state)

## Basic Setup

### Installation

```bash
npm install mirador mirador-xyviewer @mui/icons-material plotly.js react-plotly.js
```

**Peer requirements:** `mirador` ^4.2.2, `@mui/material` and `@mui/icons-material` ^7 or ^9
(same major as your Mirador build: 4.2.2-4.2.4 use MUI 7, 4.2.5 accepts 7 or 9, 4.2.6 should stay on 7 because it pins `@mui/icons-material` 7, 4.3+ needs 9),
`plotly.js` ^3 or ^4, `react-plotly.js` ^2.6, ^3 or ^4, React 18 or 19.

#### Migration: requiring Mirador 4.2.2+

- Upgrade Mirador to 4.2.2 or later.
- Install `@mui/icons-material` next to `@mui/material` (now a peer dependency), same major.
- Upgrade `plotly.js` to 3 or 4. With `plotly.js` 3+, `react-plotly.js` 2.6, 3 or 4 all work.
- `react-i18next` is no longer a peer dependency of this package (Mirador still needs it).
- The Plotly "send to cloud" modebar button is explicitly disabled, so plotly.js 4 does not enable it by default.

### HTML Container

```html
<!DOCTYPE html>
<html>
<head>
  <title>Mirador with XY Viewer</title>
  <style>
    #mirador-container {
      width: 100%;
      height: 100vh;
    }
  </style>
</head>
<body>
  <div id="mirador-container"></div>
  <script type="module" src="./main.js"></script>
</body>
</html>
```

### JavaScript Initialization

```javascript
import Mirador from 'mirador';
import {
  scientificAnnotationPlugin,
  imageComparisonPlugin,
  selectionHighlightPlugin
} from 'mirador-xyviewer';

const viewer = Mirador.viewer(
  {
    id: 'mirador-container',
    windows: [
      {
        manifestId: 'https://example.org/manifest.json',
      }
    ],
  },
  [scientificAnnotationPlugin, imageComparisonPlugin]
);
```

## Required Configuration

### Annotation Motivation Filter

With Mirador 4.2+, leave `annotations.filteredMotivations` unset: its default (an empty array) shows
every motivation, including the W3C motivations `classifying`, `identifying`, `describing`, `assessing`
and `linking`, and IIIF `supplementing`. If you restrict it, list every motivation your annotations
use, bare and `oa:`-prefixed for IIIF v2; anything missing is loaded but not displayed.

```javascript
annotations: {
  filteredMotivations: [
    'commenting', 'tagging', 'painting', 'classifying', 'identifying',
    'describing', 'assessing', 'linking', 'supplementing',
    'oa:commenting', 'oa:tagging', 'oa:classifying', 'oa:identifying',
    'oa:describing', 'oa:assessing', 'oa:linking', 'sc:painting',
  ],
}
```

Without this, annotations will load but won't display in the UI.

> **v2 motivations:** Open Annotation motivations reach Mirador without the `oa:` prefix (`oa:commenting` becomes `commenting`, `oa:classifying` becomes `classifying`); `sc:painting` is unchanged. Keep both forms in `filteredMotivations` as above. A host that filters on the `oa:` form of a motivation other than `oa:commenting` / `oa:tagging` must add the bare form.

### Point Annotation Postprocessor

To make point annotations (1x1 pixel) visible as circles:

```javascript
import { annotationPostprocessor } from 'mirador-xyviewer';

const viewer = Mirador.viewer({
  id: 'mirador-container',
  requests: {
    postprocessors: [annotationPostprocessor],
  },
}, [scientificAnnotationPlugin]);
```

## Optional Configuration

### Window Settings

```javascript
const viewer = Mirador.viewer({
  id: 'mirador-container',
  windows: [
    {
      manifestId: 'https://example.org/manifest.json',
      // Show annotation overlays on canvas
      highlightAllAnnotations: true,
      // Show sidebar with annotations
      sideBarOpen: true,
      sideBarPanel: 'annotations',
    }
  ],
}, [scientificAnnotationPlugin]);
```

### CORS Configuration

Enable CORS for cross-origin images:

```javascript
const viewer = Mirador.viewer({
  id: 'mirador-container',
  osdConfig: {
    crossOriginPolicy: 'Anonymous',
  },
}, [scientificAnnotationPlugin]);
```

### HTML Sanitization

Configure how HTML in annotations is sanitized:

```javascript
const viewer = Mirador.viewer({
  id: 'mirador-container',
  annotations: {
    htmlSanitizationRuleSet: 'iiif',  // or 'liberal', 'mirador2', 'noHtml'
  },
}, [scientificAnnotationPlugin]);
```

Options:
- `'iiif'` - Strict, IIIF-compliant sanitization (default, recommended)
- `'liberal'` - More permissive
- `'mirador2'` - Mirador 2 compatible rules
- `'noHtml'` - Strip all markup, keep text only

The plugin honours this setting for plain annotations and `text/html` bodies (rendered through Mirador's `SanitizedHtml`). `text/plain` bodies are always shown as literal text.

### Workspace Settings

```javascript
const viewer = Mirador.viewer({
  id: 'mirador-container',
  workspace: {
    type: 'mosaic',           // 'mosaic' or 'elastic'
    allowNewWindows: true,    // Allow opening new windows
  },
  workspaceControlPanel: {
    enabled: true,
  },
}, [scientificAnnotationPlugin]);
```

### Language Settings

```javascript
const viewer = Mirador.viewer({
  id: 'mirador-container',
  language: 'fr',  // 'en', 'fr', 'de', etc.
}, [scientificAnnotationPlugin]);
```

### Theme Customization

```javascript
const viewer = Mirador.viewer({
  id: 'mirador-container',
  theme: {
    palette: {
      primary: {
        main: '#1976d2',
      },
      secondary: {
        main: '#dc004e',
      },
      shades: {
        dark: '#000000',
        main: '#424242',
        light: '#f5f5f5',
      },
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    },
  },
}, [scientificAnnotationPlugin]);
```

## Full Configuration Example

```javascript
import Mirador from 'mirador';
import {
  scientificAnnotationPlugin,
  imageComparisonPlugin,
  metadataFiltersPlugin,
  selectionHighlightPlugin,
  annotationPostprocessor
} from 'mirador-xyviewer';

const viewer = Mirador.viewer(
  {
    id: 'mirador-container',

    // Windows to open on startup
    windows: [
      {
        manifestId: 'https://example.org/manifest.json',
        highlightAllAnnotations: true,
        sideBarOpen: true,
        sideBarPanel: 'annotations',
      }
    ],

    // Annotation configuration
    annotations: {
      htmlSanitizationRuleSet: 'iiif',
      // Leave filteredMotivations unset to show every motivation (see Troubleshooting)
    },

    // Request postprocessors
    requests: {
      postprocessors: [annotationPostprocessor],
    },

    // OpenSeadragon configuration
    osdConfig: {
      crossOriginPolicy: 'Anonymous',
      showNavigationControl: true,
      showNavigator: true,
      navigatorPosition: 'BOTTOM_RIGHT',
    },

    // Workspace configuration
    workspace: {
      type: 'mosaic',
      allowNewWindows: true,
    },
    workspaceControlPanel: {
      enabled: true,
    },

    // Language
    language: 'en',

    // Theme
    theme: {
      palette: {
        primary: { main: '#1976d2' },
        secondary: { main: '#dc004e' },
      },
    },
  },
  // Plugins (all are optional and independent)
  [
    scientificAnnotationPlugin,  // Spectrum visualization
    imageComparisonPlugin,       // Image comparison (optional)
    metadataFiltersPlugin,       // Metadata filters (optional)
    selectionHighlightPlugin     // Selection highlight (optional)
  ]
);

// Expose for debugging
window.miradorInstance = viewer;
```

## Plugin-Specific Options

Mirador-xyviewer provides four independent plugins that can be used separately or combined:

| Plugin | Description |
|--------|-------------|
| `scientificAnnotationPlugin` | Spectrum visualization (CSV/TSV), manifest links, metadata display |
| `imageComparisonPlugin` | Side-by-side image comparison with synchronized zoom/pan |
| `metadataFiltersPlugin` | Filter annotations by metadata values |
| `selectionHighlightPlugin` | Pulse animation to highlight selected annotations on the image |

### Using Only the Annotation Plugin

```javascript
import { scientificAnnotationPlugin } from 'mirador-xyviewer';

const viewer = Mirador.viewer(config, [scientificAnnotationPlugin]);
```

### Using Only the Image Comparison Plugin

```javascript
import { imageComparisonPlugin } from 'mirador-xyviewer';

const viewer = Mirador.viewer(config, [imageComparisonPlugin]);
```

### Using Only the Metadata Filters Plugin

```javascript
import { metadataFiltersPlugin } from 'mirador-xyviewer';

const viewer = Mirador.viewer(config, [metadataFiltersPlugin]);
```

### Using Only the Selection Highlight Plugin

```javascript
import { selectionHighlightPlugin } from 'mirador-xyviewer';

const viewer = Mirador.viewer(config, [selectionHighlightPlugin]);
```

This plugin enhances annotation selection with a **pulse animation**: displays an animated pulse effect (orange rings) around the selected annotation for 2 seconds to help locate it on the image.

### Combining Plugins

All plugins are independent and can be combined as needed:

```javascript
import {
  scientificAnnotationPlugin,
  imageComparisonPlugin,
  metadataFiltersPlugin,
  selectionHighlightPlugin
} from 'mirador-xyviewer';

// Use all plugins
const viewer = Mirador.viewer(config, [
  scientificAnnotationPlugin,
  imageComparisonPlugin,
  metadataFiltersPlugin,
  selectionHighlightPlugin
]);

// Or pick only what you need
const viewer = Mirador.viewer(config, [
  scientificAnnotationPlugin,
  selectionHighlightPlugin  // Spectrum + selection highlight
]);
```

### Combining with Other Mirador Plugins

```javascript
import { scientificAnnotationPlugin, metadataFiltersPlugin } from 'mirador-xyviewer';
// Optional companion plugin: npm install mirador-image-tools
import { miradorImageToolsPlugin } from 'mirador-image-tools';

const viewer = Mirador.viewer(config, [
  scientificAnnotationPlugin,
  metadataFiltersPlugin,
  ...miradorImageToolsPlugin,  // Array of plugins: spread it
]);
```

## Troubleshooting

### Annotations Not Showing

**Symptom:** Annotations load (visible in Redux DevTools) but don't appear.

**Solution:** With Mirador 4.2+, leave `annotations.filteredMotivations` unset: its default (an empty array) shows
every motivation, including the W3C motivations `classifying`, `identifying`, `describing`, `assessing`
and `linking`, and IIIF `supplementing`. If you restrict it, list every motivation your annotations
use, bare and `oa:`-prefixed for IIIF v2; anything missing is loaded but not displayed.

```javascript
annotations: {
  filteredMotivations: [
    'commenting', 'tagging', 'painting', 'classifying', 'identifying',
    'describing', 'assessing', 'linking', 'supplementing',
    'oa:commenting', 'oa:tagging', 'oa:classifying', 'oa:identifying',
    'oa:describing', 'oa:assessing', 'oa:linking', 'sc:painting',
  ],
}
```

### Point Annotations Not Visible

**Symptom:** Point annotations (1x1 pixel) don't show on canvas.

**Solution:** Add the annotation postprocessor:

```javascript
import { annotationPostprocessor } from 'mirador-xyviewer';

requests: {
  postprocessors: [annotationPostprocessor],
}
```

### CORS Errors

**Symptom:** Console shows CORS errors when loading images or data.

**Solution 1:** Configure OpenSeadragon:

```javascript
osdConfig: {
  crossOriginPolicy: 'Anonymous',
}
```

**Solution 2:** Ensure your server sends proper CORS headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

### Spectra Not Loading

**Symptom:** Click "Load Spectrum" but nothing happens.

**Possible causes:**

1. **CORS:** Server doesn't allow cross-origin requests
2. **MIME type:** Server returns wrong Content-Type
3. **File size:** File exceeds 5MB limit
4. **URL:** Invalid or inaccessible URL

**Debug:** Check browser console for error messages.

### Plugin Not Working

**Symptom:** Plugin features don't appear.

**Checklist:**

1. Plugin imported correctly?
2. Plugin passed to `Mirador.viewer()` as second argument?
3. Using array syntax `[plugin1, plugin2]`?

```javascript
// Correct
const viewer = Mirador.viewer(config, [scientificAnnotationPlugin]);

// Wrong - plugin not in array
const viewer = Mirador.viewer(config, scientificAnnotationPlugin);
```

### Redux DevTools

For debugging, use Redux DevTools browser extension:

1. Install [Redux DevTools](https://github.com/reduxjs/redux-devtools)
2. Open browser DevTools (F12)
3. Navigate to "Redux" tab
4. Inspect state and actions

Key state paths:
- `annotations` - Loaded annotations
- `windows` - Window configurations
- `manifests` - Loaded manifests

### Console Debugging

Access Mirador instance from console:

```javascript
// Expose instance
window.miradorInstance = viewer;

// In console:
miradorInstance.store.getState()  // Get Redux state
miradorInstance.store.dispatch(action)  // Dispatch action
```

## IIIF Content Search

This plugin does **not** implement Content Search — it relies on Mirador 4's built-in
search and is designed to never corrupt search responses. To enable search alongside the
plugin:

1. Use a manifest that advertises a search service (profile
   `http://iiif.io/api/search/1/search`). **Mirador 4 supports IIIF Search API 0 and 1
   only — not 2.0.** A Search 2.0 service yields no results in Mirador 4.
2. Show the search panel, e.g.:

   ```js
   window: {
     panels: { search: true /* …other panels… */ },
   }
   ```

### Interaction with scientific annotations

- **`filteredMotivations` does not affect search.** Mirador renders search hits from a
  separate state slice that ignores annotation motivation, so restricting or widening
  `annotations.filteredMotivations` neither helps nor hinders search-hit display.
- **Index only text annotations.** Scientific bodies are `Dataset` (CSV/spectra) with no
  searchable text; index transcription/commenting annotations in your search service, not
  the scientific ones.
- **The plugin leaves search responses untouched by design.** `annotationPostprocessor`
  runs only on annotation responses (`annotationJson`), so search `hits`/pagination pass
  through unchanged. If you call the exported `transformPointAnnotations` directly, pass it
  only plain annotation pages — never a Content Search response.
- **Selection feedback covers search hits.** Clicking a search result pulses its region via
  `SelectionHighlightPlugin`, and selecting an annotation the metadata filter has hidden
  surfaces it (with a "hidden by filter" badge) instead of dead-ending.

See `demo/vite-demo-search.ts` and `demo/main.tsx` for a runnable example that wires a mock Content Search service into the demo.

## Opening a IIIF Content State

Mirador 4 has no [IIIF Content State 1.0](https://iiif.io/api/content-state/1.0/) support
(no `iiif-content` parameter, no paste or drop handling). mirador-xyviewer provides it as
library helpers, independent of any producer: the host reads the content state however it
likes (query string, paste, drop, file) and the library turns it into Mirador windows.

Requires Mirador >= 4.2 (zoom to a region uses `initialViewerConfig.bounds`).

### What is understood

| Input (spec) | Handling |
|---|---|
| `iiif-content` as an unencoded URI (§3.1.1) | Fetched, then processed by the `type` of the response (§4) |
| `iiif-content` as encoded JSON (§3.1.2, §6) | base64url without padding of `encodeURIComponent(json)`; padding, `+/` and legacy base64 of raw JSON are tolerated |
| Full Annotation with `motivation: contentState`, a bare target, or an Annotation with another motivation (§2.2) | Its `target` is processed |
| `Manifest` / `Collection` / `Canvas` / `Range` (§4) | Manifest or collection opened; Canvas and Range open their `partOf` (dereferenced when missing) |
| Canvas, `Canvas#xywh=`, `SpecificResource` with a selector | Canvas opened, zoomed to the region |
| Selectors | `FragmentSelector` `xywh=` (also `pixel:` and `percent:`), `PointSelector`, `SvgSelector` (bounding box of its shapes, arcs included), `ImageApiSelector` region, and arrays of them (union) |
| Several targets (an array) | **One window per target**, so a comparison of two canvases opens two windows |
| Paste, drop of `text/plain` or `text/uri-list` (§3.3, §3.4), local file (§3.5) | `parseContentStateInput` / `contentStateTextFromDataTransfer` / `readContentStateFile` |

Percent regions need the canvas size: pass `canvasSize` to `buildMiradorWindows`
(`findCanvasSize(manifestJson, canvasId)` reads it from a Presentation 2 or 3 manifest);
without it the canvas opens unzoomed.

### Host example

```typescript
import Mirador, { addWindow } from 'mirador';
import {
  parseContentStateQuery,
  resolveContentState,
  buildMiradorWindows,
} from 'mirador-xyviewer';

const viewer = Mirador.viewer({ id: 'mirador', windows: [] });

// ?iiif-content=<uri or encoded JSON> (or ?manifest=<uri>)
const input = parseContentStateQuery(window.location.search);
if (input) {
  const { targets, warnings } = await resolveContentState(input);
  for (const config of buildMiradorWindows(targets)) {
    viewer.store.dispatch(addWindow(config));
  }
  if (!targets.length) console.warn(warnings);
}
```

`resolveContentState` never throws: problems come back in `warnings`, and unusable input
gives no targets. Each window config is `{ manifestId, canvasId?, view?, initialViewerConfig?: { bounds } }`,
with `bounds` in canvas pixels (`[x, y, width, height]`, padded; points get a small view).
A target without a manifest (a lone Canvas) is skipped unless you pass
`defaultManifestId`. Content states opened from a local file carry the manifest document in
`target.manifestJson`; dispatch Mirador's `receiveManifest(id, json)` before `addWindow`
if the manifest is not reachable by URL (it then bypasses request postprocessors).

### Security

- Only `http(s)` URIs are accepted; `javascript:`, `data:`, `file:` and others are rejected, in
  inputs and in every `id` of a content state.
- Fetches use `credentials: 'omit'`, a 10 s timeout and a 1 MB cap (`CONTENT_STATE_MAX_BYTES`),
  follow at most 3 nested references with loop detection, and make at most 10 requests per
  resolution (`maxFetches`), so a crafted link cannot fan out.
- Pass `isAllowedUrl` to `resolveContentState` (or `fetchContentStateJson`) to veto addresses,
  also checked on the final URL after redirects; hosts can plug in a private-network blocklist
  such as the one in `mirador-auth`.
- A content state is only ever parsed as JSON and read as data; SVG selectors are scanned as
  text, never inserted in the DOM. At most 20 targets are kept.
- When pasting or dropping, ignore input fields so you do not hijack typing, and only stop
  propagation of what you must consume (Mirador has its own drop target via react-dnd, and
  stopping propagation of a drop keeps it from clearing its overlay, so let text and links
  through and leave `?manifest=` links to Mirador).

The demo (`demo/contentStateInputs.ts`) wires `?iiif-content=`, `?manifest=`, paste, drop
and an "Open file…" button this way.
