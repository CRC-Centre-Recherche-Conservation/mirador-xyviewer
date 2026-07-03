# Mirador Configuration Guide

This guide explains how to configure Mirador 4 to work with mirador-xyviewer.

## Table of Contents

- [Basic Setup](#basic-setup)
- [Required Configuration](#required-configuration)
- [Optional Configuration](#optional-configuration)
- [Full Configuration Example](#full-configuration-example)
- [Troubleshooting](#troubleshooting)
- [IIIF Content Search](#iiif-content-search)

## Basic Setup

### Installation

```bash
npm install mirador mirador-xyviewer
```

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

**This is critical.** Mirador filters annotations by `motivation`. Physicochemical annotations use `supplementing`, which is NOT in the default list.

```javascript
const viewer = Mirador.viewer({
  id: 'mirador-container',
  annotations: {
    filteredMotivations: [
      // Default motivations
      'oa:commenting',
      'oa:tagging',
      'sc:painting',
      'commenting',
      'tagging',
      // Add this for physicochemical annotations
      'supplementing',
    ],
  },
}, [scientificAnnotationPlugin]);
```

Without this, annotations will load but won't display in the UI.

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
    htmlSanitizationRuleSet: 'iiif',  // or 'liberal' or 'none'
  },
}, [scientificAnnotationPlugin]);
```

Options:
- `'iiif'` - Strict, IIIF-compliant sanitization (recommended)
- `'liberal'` - More permissive
- `'none'` - No sanitization (not recommended)

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
      filteredMotivations: [
        'oa:commenting',
        'oa:tagging',
        'sc:painting',
        'commenting',
        'tagging',
        'supplementing',  // Required for physicochemical annotations
      ],
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
import miradorImageToolsPlugin from 'mirador-image-tools';

const viewer = Mirador.viewer(config, [
  scientificAnnotationPlugin,
  metadataFiltersPlugin,
  ...miradorImageToolsPlugin,  // Image manipulation tools
]);
```

## Troubleshooting

### Annotations Not Showing

**Symptom:** Annotations load (visible in Redux DevTools) but don't appear.

**Solution:** Add `supplementing` to `filteredMotivations`:

```javascript
annotations: {
  filteredMotivations: [
    'oa:commenting', 'oa:tagging', 'sc:painting',
    'commenting', 'tagging',
    'supplementing'  // Add this
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

- **`filteredMotivations` does not affect search.** Scientific annotations require
  `supplementing` in `annotations.filteredMotivations`, but Mirador renders search hits
  from a separate state slice that ignores annotation motivation — adding `supplementing`
  neither helps nor hinders search-hit display.
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
