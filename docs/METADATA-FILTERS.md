# Metadata Filters Guide

This guide explains how to use the metadata filtering system to filter annotations in mirador-xyviewer.

## Table of Contents

- [Overview](#overview)
- [User Interface](#user-interface)
- [How Filtering Works](#how-filtering-works)
- [Annotation Metadata Structure](#annotation-metadata-structure)
- [Plugin Configuration](#plugin-configuration)
- [Best Practices](#best-practices)

## Overview

The metadata filter system allows users to dynamically filter annotations based on their metadata values. This is useful when you have many annotations with different characteristics (technique, date, operator, material, etc.) and want to focus on specific subsets.

**Key Features:**

- Filter by any metadata label/value pairs in annotations
- Multiple filters can be active simultaneously (AND logic)
- Real-time count of visible/hidden annotations
- Draggable and resizable filter panel
- Automatic grouping by metadata labels
- "None" filter for annotations missing specific metadata

## User Interface

### Filter Button

A filter button appears on the bottom-right of the OpenSeadragon viewer when annotations with metadata are available:

- **Gray button**: No filters active, all annotations visible
- **Orange button**: Filters active, some annotations hidden
- **Badge**: Shows the number of hidden annotations

### Filter Panel

Clicking the filter button opens a draggable/resizable panel with:

1. **Header**: Title, hidden count, reset button, close button
2. **Filter Groups**: One expandable group per metadata label
3. **Filter Values**: Checkboxes for each unique value with counts
4. **Footer**: Summary of annotations and filter groups

### Interactions

| Action | Result |
|--------|--------|
| Click checkbox | Toggle visibility of annotations with that value |
| Click group header | Expand/collapse the group |
| "Select all" icon | Show all annotations with values in that group |
| "Deselect all" icon | Hide all annotations with values in that group |
| Reset button | Reset all filters to default (all visible) |
| Drag header | Move the panel |
| Drag corner | Resize the panel |

## How Filtering Works

### Filter Logic

The filter uses **AND** logic across groups and **OR** logic within groups:

1. An annotation is **hidden** if ANY of its metadata values are deselected
2. Annotations missing metadata for a group are tracked via a "None" filter value

### Example

Given annotations with these metadata:

| Annotation | Technique | Material |
|------------|-----------|----------|
| A | XRF | Paint |
| B | Raman | Paint |
| C | XRF | Canvas |
| D | (none) | Paint |

If you deselect "XRF" in the Technique group:
- **Hidden**: A, C (have XRF)
- **Visible**: B, D (B has Raman, D has no technique)

If you also deselect "None" in the Technique group:
- **Hidden**: A, C, D (A and C have XRF, D has no technique)
- **Visible**: B

### Visible Count Display

Each filter value shows two numbers:
- **Single number** (e.g., `5`): Total count equals visible count
- **Fraction** (e.g., `3/5`): 3 visible out of 5 total (some hidden by other filters)

This helps understand the impact of filters across groups.

## Annotation Metadata Structure

### Basic Metadata

Annotations must include a `metadata` array with label/value pairs:

```json
{
  "id": "https://example.org/annotation/1",
  "type": "Annotation",
  "motivation": "supplementing",
  "metadata": [
    {
      "label": { "en": ["Technique"] },
      "value": { "en": ["X-Ray Fluorescence (XRF)"] }
    },
    {
      "label": { "en": ["Operator"] },
      "value": { "en": ["Dr. Smith"] }
    }
  ],
  "body": { /* ... */ },
  "target": "https://example.org/canvas/1#xywh=100,200,1,1"
}
```

### Localized Strings

Labels and values use IIIF localized strings (language maps):

```json
{
  "label": {
    "en": ["Technique"],
    "fr": ["Technique"]
  },
  "value": {
    "en": ["X-Ray Fluorescence"],
    "fr": ["Fluorescence X"]
  }
}
```

The filter system uses the first available language value for display.

### Values with Links

Values can include URLs in parentheses for reference (URL is stripped for display):

```json
{
  "label": { "en": ["Material"] },
  "value": { "en": ["Azurite (https://example.org/materials/azurite)"] }
}
```

This displays as "Azurite" in the filter panel.

### Recommended Metadata Labels

Common metadata labels for physicochemical analysis:

| Label | Example Values |
|-------|----------------|
| Technique | XRF, Raman, FTIR, UV-Vis |
| Material | Paint, Canvas, Varnish, Ground |
| Element | Fe, Cu, Pb, Ca |
| Pigment | Azurite, Vermilion, Lead White |
| Date | 2024-01-15, 2024 Q1 |
| Operator | Dr. Smith, Lab Team A |
| Instrument | Bruker M6, Horiba LabRAM |
| Campaign | Summer 2024, Restoration Project |

## Plugin Configuration

### Enabling the Filter Plugin

The metadata filter plugin is a **separate, optional plugin**. Add it alongside other plugins:

```typescript
import Mirador from 'mirador';
import {
  scientificAnnotationPlugin,
  metadataFiltersPlugin
} from 'mirador-xyviewer';

const viewer = Mirador.viewer({
  id: 'mirador-container',
  windows: [
    {
      manifestId: 'https://example.org/manifest.json',
    }
  ],
}, [scientificAnnotationPlugin, metadataFiltersPlugin]);
```

### Using Only the Filter Plugin

If you want only the filter functionality without scientific annotation features:

```typescript
import { metadataFiltersPlugin } from 'mirador-xyviewer';

const viewer = Mirador.viewer(config, [metadataFiltersPlugin]);
```

### Combining with Other Plugins

All three plugins are independent and can be combined as needed:

```typescript
import {
  scientificAnnotationPlugin,  // Spectrum visualization, manifest links
  imageComparisonPlugin,        // Image comparison slider
  metadataFiltersPlugin         // Metadata-based filtering
} from 'mirador-xyviewer';

// Use all plugins
const viewer = Mirador.viewer(config, [
  scientificAnnotationPlugin,
  imageComparisonPlugin,
  metadataFiltersPlugin
]);

// Or pick only what you need
const viewer = Mirador.viewer(config, [
  scientificAnnotationPlugin,
  metadataFiltersPlugin
]);
```

### Disabling Filters for a Specific Window

You can disable filters for specific windows:

```typescript
const viewer = Mirador.viewer({
  id: 'mirador-container',
  windows: [
    {
      manifestId: 'https://example.org/manifest.json',
      filtersEnabled: false,  // Disable filters for this window
    }
  ],
}, [metadataFiltersPlugin]);
```

## Best Practices

### For Data Publishers

1. **Consistent Labels**: Use the same label text across all annotations for proper grouping
   ```json
   // Good - consistent label
   { "label": { "en": ["Technique"] }, "value": { "en": ["XRF"] } }
   { "label": { "en": ["Technique"] }, "value": { "en": ["Raman"] } }

   // Bad - inconsistent labels create separate groups
   { "label": { "en": ["Technique"] }, "value": { "en": ["XRF"] } }
   { "label": { "en": ["Analysis Type"] }, "value": { "en": ["Raman"] } }
   ```

2. **Meaningful Values**: Use clear, descriptive values
   ```json
   // Good
   { "value": { "en": ["X-Ray Fluorescence (XRF)"] } }

   // Less clear
   { "value": { "en": ["XRF"] } }
   ```

3. **Limit Value Cardinality**: Avoid too many unique values per label (e.g., avoid using timestamps as values)

4. **Include Important Metadata**: Add metadata for any dimension users might want to filter by

### For Users

1. **Start Broad**: Begin with all filters selected, then narrow down
2. **Check "None"**: Remember that "None" filters catch annotations without that metadata
3. **Watch Counts**: Use visible/total counts to understand filter impact
4. **Reset Often**: Use the reset button to start fresh if confused

## Technical Details

### State Management

The filter state is managed per window+canvas combination using `filtersStore`:

- Filter selections persist when navigating between canvases
- Each canvas maintains its own filter state
- State is reset when the window is closed

### Performance

- Filters are applied client-side with no additional server requests
- Filter computation is efficient even with thousands of annotations
- UI updates are debounced to prevent excessive re-renders

### Integration with Mirador

The filter system integrates with Mirador's Redux store:

- Reads annotation data from `state.annotations`
- Does not modify Mirador's state directly
- Uses its own internal store for filter selections
- Communicates hidden annotations to the annotation display system
