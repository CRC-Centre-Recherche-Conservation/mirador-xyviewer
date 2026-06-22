# IIIF Annotation Structure Guide

This guide explains how to structure IIIF annotations for use with mirador-xyviewer.

## Table of Contents

- [Overview](#overview)
- [IIIF Presentation API v2 support](#iiif-presentation-api-v2-support)
- [Annotation Page Structure](#annotation-page-structure)
- [Annotation Structure](#annotation-structure)
- [Body Types](#body-types)
- [Target Structure](#target-structure)
- [Complete Examples](#complete-examples)
- [Protected datasets (IIIF Auth)](#protected-datasets-iiif-auth)

## Overview

Mirador-xyviewer supports **both IIIF Presentation API 2.0/2.1 and 3.0** annotations. v2
annotation lists are normalized internally to the v3 model, so everything in this guide
applies to either version (see [IIIF Presentation API v2 support](#iiif-presentation-api-v2-support)
for the v2 equivalents). The examples below use the v3 shape, which is also the canonical
internal model.

Annotations must be:

1. Referenced from a Canvas via `annotations` property (v3) or `otherContent` (v2)
2. Contained in an **AnnotationPage** (v3) or an **`sc:AnnotationList`** (v2)
3. Use `motivation: "supplementing"` (for physicochemical data)

```
Manifest
└── Canvas
    └── annotations (reference to AnnotationPage)
        └── AnnotationPage
            └── items[] (array of Annotations)
                └── Annotation
                    ├── body (content)
                    └── target (location on canvas)
```

## IIIF Presentation API v2 support

You do not need to author v3 to use the viewer: IIIF Presentation API **2.0/2.1**
(`sc:AnnotationList` / Open Annotation) lists are accepted as-is and converted to the
internal v3 model at load time. The conversion lives in a single module
(`src/utils/annotationNormalizer.ts`); every renderer, type guard and filter downstream
only ever sees the v3 shape. There is **no functional difference between 2.0 and 2.1** —
both use the `http://iiif.io/api/presentation/2/context.json` context.

### v2 ⇄ v3 mapping

| Internal model (v3)      | v3 source        | v2 source (Open Annotation)                                  |
|--------------------------|------------------|--------------------------------------------------------------|
| container                | `AnnotationPage` / `items[]` | `sc:AnnotationList` / `resources[]`               |
| `id`                     | `id`             | `@id`                                                        |
| `type` (`Annotation`)    | `type`           | `@type` (`oa:Annotation`)                                    |
| `motivation`             | `motivation`     | `motivation` (e.g. `oa:commenting`, `sc:painting`)           |
| `body`                   | `body`           | `resource` (single object or array)                          |
| `target`                 | `target`         | `on` (string `<canvas>#xywh=…` or `oa:SpecificResource`)     |
| `label` / `metadata`     | LocalizedString  | plain string or `{ "@value", "@language" }` (single/array)   |
| `seeAlso`                | `seeAlso`        | `seeAlso` (`@id` may be a URL string **or** a `{ url, url_label }` object — both preserved) |

### Body-type mapping (`resource.@type` → internal `type`)

| Internal body | Detected from v2 |
|---------------|------------------|
| `Dataset`     | `@type === 'dctypes:Dataset'`, or an open dataset MIME (`text/csv`, `text/plain`, `text/tab-separated-values`). `text/txt` is normalized to `text/plain`. |
| `Manifest`    | `@type === 'sc:Manifest'`, or `format === 'application/ld+json'`. |
| `TextualBody` | `@type ∈ { cnt:ContentAsText, dctypes:Text, oa:Tag, oa:SemanticTag }`, or a `chars` field is present (`value` ← `chars`). |
| (fallback)    | Unknown `@type`: the namespace prefix is stripped (`ns:Foo` → `Foo`) and the body degrades gracefully. |

### Open-format policy (binary datasets)

Only **open text** dataset formats are plotted (`text/csv`, `text/plain`,
`text/tab-separated-values`). Proprietary/binary payloads (e.g. `application/octet-stream`)
are **intentionally not plotted**: such a body is still recognized as a `Dataset`, but the
panel shows a short "format not supported for plotting" notice with a link to the resource
itself (its `seeAlso` links render just above). This is by design — see the open-format note
under [Body Types](#body-types).

### Minimal v2 annotation list

```json
{
  "@context": "http://iiif.io/api/presentation/2/context.json",
  "@id": "https://example.org/annotations/canvas1-list.json",
  "@type": "sc:AnnotationList",
  "resources": [
    {
      "@id": "https://example.org/annotation/xrf-001",
      "@type": "oa:Annotation",
      "motivation": "oa:commenting",
      "resource": {
        "@id": "https://example.org/data/xrf-blue-001.csv",
        "@type": "dctypes:Dataset",
        "format": "text/csv"
      },
      "on": "https://example.org/canvas/painting#xywh=1250,890,1,1"
    }
  ]
}
```

This is the v2 equivalent of [Example 1](#example-1-xrf-point-analysis) below and renders
identically.

## Annotation Page Structure

AnnotationPages are containers for annotations. They can be **embedded** or **external**.

### Embedded AnnotationPage

```json
{
  "@context": "http://iiif.io/api/presentation/3/context.json",
  "id": "https://example.org/manifest.json",
  "type": "Manifest",
  "items": [
    {
      "id": "https://example.org/canvas/1",
      "type": "Canvas",
      "height": 4000,
      "width": 3000,
      "annotations": [
        {
          "id": "https://example.org/canvas/1/annotations",
          "type": "AnnotationPage",
          "items": [
            { /* Annotation 1 */ },
            { /* Annotation 2 */ }
          ]
        }
      ]
    }
  ]
}
```

### External AnnotationPage (Recommended)

Manifest references an external AnnotationPage:

```json
{
  "id": "https://example.org/canvas/1",
  "type": "Canvas",
  "annotations": [
    {
      "id": "https://example.org/annotations/canvas1.json",
      "type": "AnnotationPage"
    }
  ]
}
```

External AnnotationPage file (`canvas1.json`):

```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "id": "https://example.org/annotations/canvas1.json",
  "type": "AnnotationPage",
  "items": [
    { /* Annotation 1 */ },
    { /* Annotation 2 */ }
  ]
}
```

## Annotation Structure

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | URI | Unique identifier for the annotation |
| `type` | string | Must be `"Annotation"` |
| `motivation` | string | Use `"supplementing"` for physicochemical data |
| `body` | object/array | Content of the annotation |
| `target` | URI/object | Location on the canvas |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `label` | LocalizedString | Display name |
| `metadata` | array | Key-value metadata entries |
| `seeAlso` | array | Related resources |

### Minimal Annotation

```json
{
  "id": "https://example.org/annotation/1",
  "type": "Annotation",
  "motivation": "supplementing",
  "body": {
    "type": "TextualBody",
    "value": "Analysis note"
  },
  "target": "https://example.org/canvas/1"
}
```

### Full Annotation with Metadata

```json
{
  "id": "https://example.org/annotation/xrf-001",
  "type": "Annotation",
  "motivation": "supplementing",
  "label": {
    "en": ["XRF Analysis - Point 1"],
    "fr": ["Analyse XRF - Point 1"]
  },
  "metadata": [
    {
      "label": { "en": ["Technique"] },
      "value": { "en": ["X-Ray Fluorescence (XRF)"] }
    },
    {
      "label": { "en": ["Date"] },
      "value": { "en": ["2024-01-15"] }
    },
    {
      "label": { "en": ["Operator"] },
      "value": { "en": ["Dr. Smith"] }
    }
  ],
  "seeAlso": [
    {
      "id": "https://example.org/reports/xrf-001.pdf",
      "type": "Text",
      "format": "application/pdf",
      "label": { "en": ["Full Analysis Report"] }
    }
  ],
  "body": { /* see Body Types */ },
  "target": { /* see Target Structure */ }
}
```

> **Tip:** Metadata labels are used by the [Metadata Filters](./METADATA-FILTERS.md) plugin to create filter groups. Use consistent labels across annotations for effective filtering (e.g., always use "Technique" instead of mixing "Technique" and "Analysis Type").

## Body Types

Mirador-xyviewer supports three body types:

### 1. Dataset Body (Spectral Data)

For CSV/TSV spectral data files.

```json
{
  "body": {
    "id": "https://example.org/data/spectrum.csv",
    "type": "Dataset",
    "format": "text/csv",
    "label": {
      "en": ["XRF Spectrum"],
      "fr": ["Spectre XRF"]
    }
  }
}
```

**Supported (plottable) formats:**
- `text/csv` - Comma-separated values
- `text/plain` - Plain text (auto-detect delimiter)
- `text/tab-separated-values` - Tab-separated values
- `text/txt` - non-standard alias, normalized to `text/plain`

> **Open-format policy:** only the open text formats above are fetched and plotted. A
> Dataset body in a proprietary/binary format (e.g. `application/octet-stream`) is still
> recognized, but is **not** plotted: the panel shows a short "format not supported for
> plotting" notice linking to the resource (`body.id`). This applies identically to v2 and
> v3 inputs.

### 2. Manifest Body (Linked Manifests)

For linking to related IIIF manifests.

```json
{
  "body": {
    "id": "https://example.org/iiif/related-analysis/manifest.json",
    "type": "Manifest",
    "format": "application/ld+json",
    "label": {
      "en": ["Detailed Analysis View"]
    }
  }
}
```

### 3. TextualBody (Text Content)

For plain text or HTML annotations.

**Plain text:**
```json
{
  "body": {
    "type": "TextualBody",
    "value": "Blue pigment identified as lapis lazuli.",
    "format": "text/plain",
    "language": "en"
  }
}
```

**HTML content:**
```json
{
  "body": {
    "type": "TextualBody",
    "value": "<p>Elements detected: <strong>Fe</strong>, <strong>Cu</strong>, <strong>Pb</strong></p>",
    "format": "text/html",
    "language": "en"
  }
}
```

### Multiple Bodies

An annotation can have multiple bodies:

```json
{
  "body": [
    {
      "type": "TextualBody",
      "value": "XRF analysis showing iron-based pigment",
      "format": "text/plain"
    },
    {
      "id": "https://example.org/data/xrf-spectrum.csv",
      "type": "Dataset",
      "format": "text/csv",
      "label": { "en": ["XRF Spectrum"] }
    }
  ]
}
```

## Target Structure

### Full Canvas Target

Annotate the entire canvas:

```json
{
  "target": "https://example.org/canvas/1"
}
```

### Region Target (xywh selector)

Annotate a rectangular region using pixel coordinates:

```json
{
  "target": "https://example.org/canvas/1#xywh=100,200,50,50"
}
```

Format: `#xywh=x,y,width,height`

- `x`: X coordinate (left edge)
- `y`: Y coordinate (top edge)
- `width`: Width in pixels
- `height`: Height in pixels

### Point Annotation

For analysis points, use 1x1 pixel rectangle:

```json
{
  "target": "https://example.org/canvas/1#xywh=1500,2000,1,1"
}
```

> **Note:** The `annotationPostprocessor` automatically converts 1x1 rectangles to visible SVG circles.

### Structured Target with Selector

For more complex selections:

```json
{
  "target": {
    "type": "SpecificResource",
    "source": "https://example.org/canvas/1",
    "selector": {
      "type": "FragmentSelector",
      "conformsTo": "http://www.w3.org/TR/media-frags/",
      "value": "xywh=100,200,50,50"
    }
  }
}
```

### Multiple Targets

An annotation can target multiple regions:

```json
{
  "target": [
    "https://example.org/canvas/1#xywh=100,200,1,1",
    "https://example.org/canvas/1#xywh=500,600,1,1",
    "https://example.org/canvas/1#xywh=900,300,1,1"
  ]
}
```

## Complete Examples

### Example 1: XRF Point Analysis

```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "id": "https://example.org/annotations/canvas1.json",
  "type": "AnnotationPage",
  "items": [
    {
      "id": "https://example.org/annotation/xrf-001",
      "type": "Annotation",
      "motivation": "supplementing",
      "label": {
        "en": ["XRF - Blue pigment area"]
      },
      "metadata": [
        {
          "label": { "en": ["Technique"] },
          "value": { "en": ["X-Ray Fluorescence"] }
        },
        {
          "label": { "en": ["Elements"] },
          "value": { "en": ["Cu, As, S (Azurite)"] }
        }
      ],
      "body": {
        "id": "https://example.org/data/xrf-blue-001.csv",
        "type": "Dataset",
        "format": "text/csv",
        "label": { "en": ["XRF Spectrum"] }
      },
      "target": "https://example.org/canvas/painting#xywh=1250,890,1,1"
    }
  ]
}
```

### Example 2: Raman Analysis with Description

```json
{
  "id": "https://example.org/annotation/raman-001",
  "type": "Annotation",
  "motivation": "supplementing",
  "label": {
    "en": ["Raman - Red pigment identification"]
  },
  "body": [
    {
      "type": "TextualBody",
      "value": "Raman spectroscopy confirms the presence of vermilion (HgS) based on characteristic peaks at 253 and 343 cm⁻¹.",
      "format": "text/plain",
      "language": "en"
    },
    {
      "id": "https://example.org/data/raman-red-001.csv",
      "type": "Dataset",
      "format": "text/csv",
      "label": { "en": ["Raman Spectrum"] }
    }
  ],
  "target": "https://example.org/canvas/painting#xywh=2100,1500,1,1"
}
```

### Example 3: Linked Manifest for Detailed View

```json
{
  "id": "https://example.org/annotation/detail-001",
  "type": "Annotation",
  "motivation": "supplementing",
  "label": {
    "en": ["High-resolution detail"]
  },
  "body": {
    "id": "https://example.org/iiif/painting-detail/manifest.json",
    "type": "Manifest",
    "format": "application/ld+json",
    "label": { "en": ["Detail view with UV imaging"] }
  },
  "target": "https://example.org/canvas/painting#xywh=500,500,200,200"
}
```

## Validation Checklist

Before publishing your annotations, verify:

- [ ] Each annotation has a unique `id`
- [ ] `type` is `"Annotation"`
- [ ] `motivation` is `"supplementing"` (or other configured motivation)
- [ ] `body` has valid `type` (`Dataset`, `Manifest`, or `TextualBody`)
- [ ] Plottable Dataset bodies have an open `format` (`text/csv`, `text/plain`, `text/tab-separated-values`); binary formats are accepted but shown as a resource link, not plotted
- [ ] `target` references a valid canvas URI
- [ ] Point annotations use `xywh=x,y,1,1` format
- [ ] AnnotationPage is properly linked from Canvas `annotations` array (v3) or `otherContent` (v2 `sc:AnnotationList`)
- [ ] External resources (CSV files, linked manifests) are accessible via CORS

## Mirador Configuration

Remember to configure Mirador to display your annotations:

```typescript
const viewer = Mirador.viewer({
  annotations: {
    filteredMotivations: [
      'oa:commenting', 'oa:tagging', 'sc:painting',
      'commenting', 'tagging',
      'supplementing'  // Required for physicochemical annotations
    ]
  }
}, [scientificAnnotationPlugin]);
```

## Protected datasets (IIIF Auth)

Manifests, images and their `info.json` go through Mirador, which implements the
[IIIF Authorization Flow API](https://iiif.io/api/auth/) (cookie + access-token
services). **Dataset/spectrum files, however, are fetched by this plugin directly.**

> **Recommended:** if your datasets share an origin (or a declared auth service) with
> protected images, use `wireMiradorDatasetAuth` to **reuse Mirador's session** — one
> login unlocks both. See the **[IIIF Auth integration guide](./IIIF-AUTH.md)**. The
> manual `configureDatasetRequests` path below is the lower-level escape hatch.

By default that fetch uses `credentials: 'omit'` and sends no authentication
headers — the safe, CORS-friendly default for open data. Under that default an
access-controlled dataset returns `401/403`; the panel then shows a **protected
record** — a quiet, sealed readout (not a red error) that names the host to sign in
against and offers a single **Sign in** action (a developer hint pointing to
`configureDatasetRequests` is logged to the console).

To fetch access-controlled datasets, register a **request provider** once at app
setup. The provider receives the dataset URL and returns optional `credentials`
and/or `headers`; returning `undefined` keeps the secure default. This mirrors the
spirit of Mirador's own `requests.preprocessors`.

```typescript
import { configureDatasetRequests } from 'mirador-xyviewer';

// Option A — same-origin cookie auth (the access cookie is sent with the request):
configureDatasetRequests(() => ({ credentials: 'include' }));

// Option B — Bearer token. Resolve it however your app stores it; e.g. from the
// IIIF access-token service kept in Mirador's store, or your own auth layer:
configureDatasetRequests((url) => {
  const token = resolveTokenForUrl(url);            // your logic
  return token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
});

// Reset to the secure default:
configureDatasetRequests(undefined);
```

For one-off control (e.g. when rendering `<DatasetBody>` / `<AnnotationBodyRenderer>`
yourself), pass `requestOptions` as a prop instead — it takes precedence over the
global provider for that fetch.

**CORS caveat.** A cross-origin request with `credentials: 'include'` only succeeds
if the dataset server responds with `Access-Control-Allow-Credentials: true` and an
explicit (non-wildcard) `Access-Control-Allow-Origin`. Token requests
(`Authorization` header) similarly require the server to allow that header via
`Access-Control-Allow-Headers`. The design keeps `credentials: 'omit'` as the
default precisely to avoid this friction for open datasets.

> **Scope.** This seam does not couple to Mirador's internal auth state, so it stays
> stable across Mirador versions: the glue that reads a token lives in *your*
> provider callback, not in the plugin.

### Prompting the user to sign in

`configureDatasetRequests` carries credentials, but it can't *establish* a session.
When the data is hosted on a **different origin** than the viewer — e.g. a
physico-chemistry lab hosting embargoed spectra linked from a museum's manifest —
the user may need to log into that data host, and Mirador's own login flow only
covers images, not datasets.

Register a sign-in handler to surface a **"Sign in" button** on the dataset error.
It appears *only* on a `401/403` auth error *and* only when a handler is set. The
handler runs your login flow; if it returns a Promise, the dataset is re-fetched
automatically once that Promise resolves.

```typescript
import { configureDatasetAuth, configureDatasetRequests } from 'mirador-xyviewer';

// Plugin-wide (the Mirador plugin renders the panel internally, so use the global):
configureDatasetAuth(async (dataset) => {
  await openLabLogin(new URL(dataset.id).origin); // resolves when login completes
});

// Pair with credentials scoped to the data host, so the retry carries them:
configureDatasetRequests((url) =>
  new URL(url).origin === 'https://data.lab.example'
    ? { credentials: 'include' }
    : undefined,
);
```

For standalone use of `<DatasetBody>` / `<AnnotationBodyRenderer>`, pass an
`onAuthRequired` prop instead (it overrides the global handler). Without any handler,
the protected record still shows an **Open resource** link and a **Try again** action
— fine when the user signs in out-of-band (already logged into the data host).

> **Note.** A browser still won't send cross-origin credentials unless the data host
> returns the matching CORS headers (`Access-Control-Allow-Credentials: true` and an
> explicit `Access-Control-Allow-Origin`). That server-side configuration is the real
> prerequisite — the plugin can carry credentials, but only the data host can accept them.
