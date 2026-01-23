# Mirador Configuration Guide

This guide explains how to configure Mirador 4 to work with mirador-xyviewer.

## Table of Contents

- [Basic Setup](#basic-setup)
- [Required Configuration](#required-configuration)
- [Optional Configuration](#optional-configuration)
- [Full Configuration Example](#full-configuration-example)
- [Troubleshooting](#troubleshooting)

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
  imageComparisonPlugin
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
  // Plugins
  [scientificAnnotationPlugin, imageComparisonPlugin]
);

// Expose for debugging
window.miradorInstance = viewer;
```

## Plugin-Specific Options

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

### Using Both Plugins

```javascript
import {
  scientificAnnotationPlugin,
  imageComparisonPlugin
} from 'mirador-xyviewer';

const viewer = Mirador.viewer(config, [
  scientificAnnotationPlugin,
  imageComparisonPlugin
]);
```

### Combining with Other Plugins

```javascript
import { scientificAnnotationPlugin } from 'mirador-xyviewer';
import miradorImageToolsPlugin from 'mirador-image-tools';

const viewer = Mirador.viewer(config, [
  scientificAnnotationPlugin,
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
