# Mirador XY Viewer

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Mirador](https://img.shields.io/badge/Mirador-4.0-green.svg)](https://projectmirador.org/)
[![IIIF](https://img.shields.io/badge/IIIF-v3-orange.svg)](https://iiif.io/)

A Mirador 4 plugin for visualizing physicochemical analysis data in IIIF format. Developed by the [Centre de Recherche sur la Conservation (CRC)](https://crc.mnhn.fr/) for museum and heritage applications requiring spectral data visualization (XRF, Raman, FTIR, UV-Vis, etc.).

- Document physicochemical analyses on artworks or heritage objects
- Associate spectral data (XRF, Raman, FTIR, UV-Vis) with specific regions of high-resolution images
- Need to visually compare different imaging modalities (visible light, UV, IR, X-ray)
- Publish their analysis data following IIIF standards

## Features

- **Spectrum Visualization**: Load and display CSV/TSV spectral data with Plotly
- **Manifest Links**: Open related IIIF manifests in new windows
- **Image Comparison**: Side-by-side comparison with synchronized zoom/pan
- **Point Annotations**: Automatic conversion of analysis points to visible markers
- **Metadata Filters**: Filter annotations by metadata values
- **Selection Highlight**: Pulse animation to locate selected annotations on the image (technique, date, operator, etc.)

## Quick Start

```bash
npm install mirador mirador-xyviewer plotly.js react-plotly.js
```

```typescript
import Mirador from 'mirador';
import {
  scientificAnnotationPlugin,
  imageComparisonPlugin,
  metadataFiltersPlugin,
  selectionHighlightPlugin,
  annotationPostprocessor
} from 'mirador-xyviewer';

Mirador.viewer({
  id: 'mirador-container',
  windows: [{ manifestId: 'https://example.org/manifest.json' }],
  annotations: {
    filteredMotivations: [
      'oa:commenting', 'oa:tagging', 'sc:painting',
      'commenting', 'tagging', 'supplementing'
    ],
  },
  requests: {
    postprocessors: [annotationPostprocessor],
  },
}, [
  scientificAnnotationPlugin,   // Spectrum visualization, manifest links
  imageComparisonPlugin,        // Image comparison (optional)
  metadataFiltersPlugin,        // Metadata filters (optional)
  selectionHighlightPlugin      // Selection highlight pulse (optional)
]);
```

## Documentation

| Guide | Description |
|-------|-------------|
| [IIIF Annotations](./docs/IIIF-ANNOTATIONS.md) | How to structure annotations for physicochemical data |
| [Spectral Data Format](./docs/SPECTRAL-DATA-FORMAT.md) | CSV/TSV format specification |
| [Mirador Configuration](./docs/MIRADOR-CONFIGURATION.md) | Full configuration options |
| [Metadata Filters](./docs/METADATA-FILTERS.md) | Filter annotations by metadata |
| [Developer Guide](./docs/DEVELOPER-GUIDE.md) | Architecture and extension |

## Demo

> **Note:** The local demo data is currently unavailable as the database has not been deployed yet. The demo manifest references external IIIF resources that require the backend infrastructure to be set up.

For this demonstration, we are using the [ManuSpectrum](https://github.com/CRC-Centre-Recherche-Conservation/ManuSpectrum/) application, built on the Arches platform. Please note that ManuSpectrum is still under development and has not yet been deployed.

```bash
npm run dev:demo
```

## Development

```bash
npm install          # Install dependencies
npm run dev:demo     # Start dev server
npm run build        # Build for production
npm run typecheck    # Type checking
npm run lint         # Lint
```

## License

Apache License 2.0 - see [LICENSE](LICENSE)

## Author

**Maxime Humeau** - [Centre de Recherche sur la Conservation (CRC)](https://crc.mnhn.fr/)

## Related Projects

- [Mirador](https://github.com/ProjectMirador/mirador) - IIIF image viewer
- [mirador-image-tools](https://github.com/ProjectMirador/mirador-image-tools) - Image manipulation tools for Mirador
