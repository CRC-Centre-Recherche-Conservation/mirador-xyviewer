# Metadata Filters Guide

This guide explains how to use the filtering system to filter annotations in mirador-xyviewer, by the controlled terms their bodies carry and by their metadata.

## Table of Contents

- [Overview](#overview)
- [User Interface](#user-interface)
- [How Filtering Works](#how-filtering-works)
- [Facets From Annotation Bodies](#facets-from-annotation-bodies)
- [Linked Annotations](#linked-annotations-1)
- [Annotation Metadata Structure](#annotation-metadata-structure)
- [Plugin Configuration](#plugin-configuration)
- [Best Practices](#best-practices)

## Overview

The filter system lets users filter annotations dynamically. Filters come from two sources:

- **From annotation content**: the controlled terms of `SpecificResource` bodies (what an annotation classifies, identifies, assesses, describes or tags with), one group per purpose.
- **From metadata**: the annotation's `metadata` label/value pairs, one group per label.

This is useful when you have many annotations with different characteristics (technique, date, operator, material, etc.) and want to focus on specific subsets.

**Key Features:**

- Filter by the terms of classifying, identifying, assessing, describing and tagging bodies, keyed by the term's URI (independent of the reader's language)
- Filter by any metadata label/value pairs in annotations; array values give one filter value per entry
- A characterization keeps the annotations it cites (host option `extendFiltersToLinked`, on by default)
- Multiple filters can be active simultaneously (AND logic across groups)
- Real-time count of visible/hidden annotations
- Draggable and resizable filter panel
- "Not specified" value for annotations in a group's population that have no value for it
- The same filters from a term chip's menu on classification cards

## User Interface

### Filter Button

A filter button appears on the bottom-right of the OpenSeadragon viewer when annotations with metadata or controlled body terms are available:

- **Gray button**: No filters active, all annotations visible
- **Orange button**: Filters active, some annotations hidden
- **Badge**: Shows the number of hidden annotations

### Filter Panel

Clicking the filter button opens a draggable/resizable panel with:

1. **Header**: Title, hidden count, reset button, close button
2. **Groups**: terms of the annotation bodies first (one group per purpose in the order of the cards: Classified as, Identified as, Assessment, Description, Tags; Description splits into sub-groups such as Colour or Layer), a thin rule, then one group per metadata label, alphabetical. A group header has a **master checkbox** (checked, indeterminate or empty), the group name, `2 of 5` when only part of its values is selected, and a chevron. Groups unfold at load while the running total of values stays within 12; the rest start collapsed.
3. **Values**: a checkbox, the label (one line, full text in a tooltip), an **Only** button (visible on hover and keyboard focus) and **one count**: the annotations kept when the value is ticked, those carrying it plus those they cite (`6`). Under a filter the count reads `visible/total` (`4/6`) and is dimmed at `0`. A group of more than 8 values folds behind "Show N more" (deselected values always stay visible). The last row, after a dotted rule, is **Not specified**: annotations of the group's population with no value for it (tooltip: *No value in this group, and not cited by an annotation that has one*).
4. **Status footer** (announced to assistive technology): `16 annotations`, or `Showing 6 of 16 annotations` while a filter is active

The reader's mental model: tick the terms you want; an annotation stays when it matches every group, and a characterization also keeps the annotations it cites.

### Interactions

| Action | Result |
|--------|--------|
| Click checkbox | Toggle visibility of annotations with that value |
| "Only" button of a value | Keep only that value in its group; clicking it again when it is already the only one restores the group |
| "Show N more" | Unfold the values of a long group |
| Chip menu "Filter by <term>" (classification card) | Keep only that term in its group; a second use ("Remove filter: <term>") clears the group's filter |
| Chip menu "Highlight annotations with this term" | Light the zones of the annotations carrying the term on the canvas |
| Click group name or chevron | Expand/collapse the group |
| Master checkbox of a group | All values selected: deselect them all; otherwise select them all |
| Reset button | Reset all filters to default (all visible) |
| Drag header | Move the panel |
| Drag corner | Resize the panel |

## How Filtering Works

### Filter Logic

The filter uses **AND** logic across groups and **OR** logic within a group:

1. Within a group, an annotation is **visible** when at least one of its values is selected. An annotation with several values (for example two classes) therefore stays visible while any of them is selected.
2. Across groups, an annotation must pass every group that applies to it.
3. **Each group only tests its own population**:
   - a metadata group tests the annotations that have metadata;
   - a body group tests the carriers of that purpose (plus, with `extendFiltersToLinked` on, the filterable annotations of the canvas, see below).
   So "Technique = pXRF" never hides a characterization, and "Classified as" never acts on an annotation outside its population.
4. **"Not specified"** is a value of a group counting only the annotations *of its population* without a value for it, never the others.
5. An annotation with **neither metadata nor controlled body terms** (no `metadata` array, an empty one, only empty values in the reader's languages, only text bodies, or only terms the host hid with `hiddenFilterGroups`) is outside filtering: never hidden by any filter, and not counted under "Not specified". Motivations play no role: filtering never depends on `motivation` (analyses may be `commenting` in v2 or `supplementing` in v3).

### Linked annotations

In the annotation panel, a linked-annotation row whose target is hidden by the current filter is dimmed and
suffixed "(hidden by filter)"; it stays clickable (selecting it shows the card, as for any selected annotation).
Filter state is per window and canvas, so it never applies to rows pointing to another canvas.

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

If you also deselect "Not specified" in the Technique group:
- **Hidden**: A, C, D (A and C have XRF, D has no technique)
- **Visible**: B

With several values per annotation, the OR rule within a group applies. If annotation E has Technique `XRF` and `Raman`, deselecting only "XRF" keeps E visible (Raman is still selected).

### Visible Count Display

Each filter value shows one number, in annotations, whatever the way they match (carrying the term or cited by an annotation carrying it):
- **Single number** (e.g., `6`): total equals visible
- **Fraction** (e.g., `4/6`): 4 visible out of 6 total (some hidden by other groups); dimmed when 0 are visible

When the count includes cited annotations, its tooltip splits it: *1 carrying it, 5 cited by them*.

## Facets From Annotation Bodies

Annotations carry their meaning in `SpecificResource` bodies whose `purpose` says why the term is there. Such bodies become filter values, with the group captions the cards use (`labels.classifiedAs`, `identifiedAs`, `assessment`, `description`, `tags`, or `labels.purposes`):

| `purpose` | Group |
|-----------|-------|
| `classifying` | Classified as |
| `identifying` | Identified as |
| `assessing` | Assessment |
| `describing` | Description (split into sub-groups named after the enclosing `Composite` label, else the source's `inScheme` label, else the host's `propertyGroupOf(uri)`) |
| `tagging` | Tags |

Rules:

- The value key is the **source URI**, so it does not change with the reader's language and the same term on two annotations is one value. The displayed text is the localized `label` (the body's, else the source's), else the last segment of the URI.
- **`TextualBody` is never faceted**: prose is not analysed, even with a `classifying` purpose.
- `linking` bodies are not facets (they feed the inheritance below). A body with several purposes is read under the first of the five above.
- Bodies in `Choice`, `Composite`, `List` and `Independents` are read; terms without a source URI are ignored.
- An annotation with only text bodies and no metadata stays outside filtering.

```json
{
  "id": "https://example.org/annotation/char-1",
  "type": "Annotation",
  "motivation": "classifying",
  "body": [
    { "type": "SpecificResource", "purpose": "classifying",
      "source": "https://thesaurus.example.org/lapis-lazuli",
      "label": { "en": ["lapis lazuli"], "fr": ["lapis-lazuli"] } },
    { "type": "SpecificResource", "purpose": "assessing",
      "source": "https://example.org/lists/highly-reliable",
      "label": { "en": ["Highly reliable"] } },
    { "type": "SpecificResource", "purpose": "linking",
      "source": { "id": "https://example.org/annotation/analysis-7", "type": "Annotation" } }
  ],
  "target": "https://example.org/canvas/1#xywh=100,200,50,50"
}
```

This annotation has no `metadata`, yet it is filterable: it carries one value in Classified as and one in Assessment.

## Linked Annotations

Analyses are usually *cited by* a characterization (`linking` bodies) rather than classified themselves. By default a characterization keeps the annotations it cites, **for every body group** (Classified as, Identified as, Assessment, Description sub-groups, Tags): selecting "lapis lazuli" keeps the characterization **and the annotations it links to**.

- **One rule**: a characterization keeps/drags the annotations it cites. There is no switch in the panel.
- **One hop, one direction**: only carrier to target, as written in the carrier's `linking` bodies. Links of linked annotations and links pointing back are not followed.
- Filterable annotations neither carrying nor cited count as "Not specified" in these groups (with "lapis lazuli" as the only selected value, they are hidden).
- An annotation kept only because of a link says so on its card: *shown because linked to <title of the carrier>*.
- Linked annotations on other canvases are not reached: filter state is per window and canvas, so inheritance never crosses canvases. `#target-N` ids of expanded multi-target annotations are folded to the annotation they belong to.

A host can turn the extension off with `scientificAnnotations.extendFiltersToLinked: false`: only the annotations carrying the term are then filtered (typically the characterizations) and their linked analyses are not touched. Changing the option rebuilds the groups.

Example (Paris, Bibliothèque Mazarine, Ms 416, f. 009: two characterizations citing 8 of the 14 analyses): with "lapis lazuli" as the only selected value, the lapis-lazuli characterization and its 5 analyses stay (`6`); the red lead characterization, its 3 analyses and the 6 uncited analyses are hidden. With `extendFiltersToLinked: false`, only the red lead characterization is hidden.

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

The filter system displays the language chosen by the reader's language preferences (IIIF §4.4), and keys metadata labels and values in that language. When the reader's language changes the groups are rebuilt and the selection resets.

### Multi-valued Metadata

Per IIIF Presentation 3 a language holds an **array** of strings, and each string is one value. The filter makes **one facet value per entry**:

```json
{ "label": { "en": ["Materials"] }, "value": { "en": ["lapis lazuli", "lead white"] } }
```

gives the values "lapis lazuli" and "lead white" (the annotation counts under both). A single string such as `"lapis lazuli, lead white"` stays **one** value: strings are never split on commas or any other separator. Publish multiple values as an array.

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

The metadata filter plugin is a **separate, optional plugin** (an array of two Mirador plugins: the panel and the canvas overlay). Add it alongside other plugins:

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
}, [scientificAnnotationPlugin, ...metadataFiltersPlugin]);
```

### Hiding Filtered Shapes on the Canvas

`metadataFiltersPlugin` also removes filtered annotations from the shapes Mirador draws on the
image, live as filters change. Nothing else to register:

```typescript
const viewer = Mirador.viewer(config, [scientificAnnotationPlugin, ...metadataFiltersPlugin]);
```

It is exported as an array of two Mirador plugins (a Mirador plugin has a single target: the
filters button attaches to `OpenSeadragonViewer`, the shapes live in `AnnotationsOverlay`).
Spread it (`...metadataFiltersPlugin`), the same convention as `miradorImageToolsPlugin`. Passing it unspread only works through `Mirador.viewer`; hosts that build the store and React tree themselves (`createPluggableStore`, `<PluginProvider plugins>`) must spread it. In TypeScript the export is a `MiradorPlugin[]`, so read `.target` on its elements, not on the export. Behaviour:

- Hidden ids are the same ids as the panel's, including multi-target annotations expanded to `id#target-N`.
- The selected annotation stays drawn, as in the panel.
- Content Search hits (`searchAnnotations`) are never filtered.
- Only canvases whose filters are initialized are affected; each canvas uses its own hidden set. Filters are set for the window's current canvas; another visible canvas (book view) keeps the filters last set on it, which can only be changed after navigating to it.
- Without `metadataFiltersPlugin`, or while nothing is hidden, the overlay is untouched.

### Opening From a Content State

A IIIF Content State targeting an annotation is resolved to its target canvas and region only
(`extractContentStateTargets` keeps no annotation id), so the window zooms there but Mirador
does not select the annotation. If an active filter hides it, it is hidden both in the panel and
on the canvas until the filter value is re-selected or the filters are reset. Nothing couples the two modules.

### Using Only the Filter Plugin

If you want only the filter functionality without scientific annotation features:

```typescript
import { metadataFiltersPlugin } from 'mirador-xyviewer';

const viewer = Mirador.viewer(config, [...metadataFiltersPlugin]);
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
  ...metadataFiltersPlugin
]);

// Or pick only what you need
const viewer = Mirador.viewer(config, [
  scientificAnnotationPlugin,
  ...metadataFiltersPlugin
]);
```

### Linked annotations option

`scientificAnnotations.extendFiltersToLinked` (default `true`): when `false`, body filters no longer keep the annotations cited by a matching characterization. See [Linked Annotations](#linked-annotations-1).

### Hiding Filter Groups

A group that duplicates another (for example a joined-string metadata whose terms are also bodies) can be left out of the panel with the `hiddenFilterGroups` option of the Mirador config key `scientificAnnotations`:

```typescript
const config = {
  scientificAnnotations: {
    hiddenFilterGroups: ['Identified materials', 'assessing'],
  },
};
```

Each entry matches, case-insensitively, a metadata label (in the reader's language), a body group caption (for example `Classified as`, or a `Composite` / scheme sub-group name) or a purpose (`describing` hides all its sub-groups). Annotations whose only facets are hidden are outside filtering.

### UI Strings

Panel texts are English by default and overridable through `scientificAnnotations.labels` (see [MIRADOR-CONFIGURATION.md](./MIRADOR-CONFIGURATION.md)): `showMore`, `showFewer`, `expandGroup`, `collapseGroup`, `allValuesIn`, `selectedOf`, `only`, `onlyTerm` (must start with `only`, WCAG 2.5.3), `valueCount`, `valueCountOne`, `valueCountLinked`, `valueCountVisible`, `noneHint`, `filterNone` ("Not specified"), `showingOf`, `annotationCount`, `annotationCountOne`, `resetFilters`, `filterButton`, `shownBecauseLinked`, `filterBy`, `removeFilter`, `highlightTerm`, `filterActive`, `filtersEmpty`, and the group captions `classifiedAs`, `identifiedAs`, `assessment`, `description`, `tags`.

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
}, [...metadataFiltersPlugin]);
```

## Best Practices

### For Data Publishers

0. **Controlled Terms Over Prose**: Put classes, identifications, assessments and descriptive terms in `SpecificResource` bodies with a stable URI; they are filterable in every language. Express several values of a metadata as an array, not a joined string.

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
2. **Check "Not specified"**: Remember that it catches annotations without that metadata
3. **Watch Counts**: Use visible/total counts to understand filter impact
4. **Reset Often**: Use the reset button to start fresh if confused

## Technical Details

### State Management

The filter state is managed per window+canvas combination using `filtersStore`:

- Filter selections persist when navigating between canvases
- Each canvas maintains its own filter state (inheritance never crosses canvases)
- State is reset when the window is closed
- When more annotations load for a canvas (for example a second annotation page), the groups are rebuilt and the current selection is kept
- With page sections, the header counts show the annotations the filters leave visible, and a section whose annotations are all hidden is not shown (an annotation shown only because it is selected still counts in its section)
- The panel and the term chip menu act through the same `filtersStore.toggleFacet`, so a chip shows a filter icon when its term is being filtered

### Upgrading

Facets from bodies change what the filters count and hide:

- Annotations carrying only controlled body terms (typically `classifying` ones without `metadata`) are now filterable instead of outside filtering.
- Groups count only their own population; "Not specified" no longer counts annotations outside it.
- Within a group an annotation is hidden only when **all** its values are deselected (it used to be hidden when **any** was).
- Array metadata values give one value per entry (only the first was used).
- Body filters also hide uncited annotations of the canvas, since a characterization keeps what it cites. Set `extendFiltersToLinked: false`, or hide the groups with `hiddenFilterGroups`, to keep the previous behaviour.
- The "Apply to linked annotations" switch, the "From …" block titles, `+N linked`, the group `n/m` chip and the select/deselect icons are gone. Label keys removed: `applyToLinked`, `filtersFromContent`, `filtersFromMetadata`, `appliesTo`, `appliesToOne`, `plusLinked`, `selectAllIn`, `deselectAllIn`, `shownOf` (ignored if still set). The default of `filterNone` is now "Not specified".

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

### Limits and group keys

Pages are remote JSON, so the store caps what it builds per canvas: at most 100 groups and 500 values per group; the rest is ignored. Metadata group keys are `meta:<label>`, body group keys `body:<purpose>[:<group>]`, and the "Not specified" value key is `\u0000none`, so a remote label or value cannot collide with them. A chip shows the "filter active" state when its term is the only one selected in its group.
