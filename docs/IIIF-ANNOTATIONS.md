# IIIF Annotation Structure Guide

This guide explains how to structure IIIF annotations for use with mirador-xyviewer.

## Table of Contents

- [Overview](#overview)
- [Annotation Page Structure](#annotation-page-structure)
- [Annotation Structure](#annotation-structure)
- [Body Types](#body-types)
- [Target Structure](#target-structure)
- [Complete Examples](#complete-examples)

## Overview

Mirador-xyviewer supports **IIIF Presentation API 3.0** annotations. Annotations must be:

1. Referenced from a Canvas via `annotations` property
2. Contained in an **AnnotationPage**
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

**Supported formats:**
- `text/csv` - Comma-separated values
- `text/plain` - Plain text (auto-detect delimiter)
- `text/tab-separated-values` - Tab-separated values

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
- [ ] Dataset bodies have allowed `format` (`text/csv`, `text/plain`, `text/tab-separated-values`)
- [ ] `target` references a valid canvas URI
- [ ] Point annotations use `xywh=x,y,1,1` format
- [ ] AnnotationPage is properly linked from Canvas `annotations` array
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
