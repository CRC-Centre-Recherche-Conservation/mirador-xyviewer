# Documentation

Welcome to the mirador-xyviewer documentation. This plugin enables visualization of physicochemical analysis data (XRF, Raman, FTIR, UV-Vis) within the Mirador IIIF viewer.

## Guides

### For Content Creators / Data Publishers

| Guide | Description |
|-------|-------------|
| [IIIF Annotations](./IIIF-ANNOTATIONS.md) | How to structure IIIF annotations for physicochemical data |
| [Spectral Data Format](./SPECTRAL-DATA-FORMAT.md) | CSV/TSV format specification for spectral data |

### For Developers / Integrators

| Guide | Description |
|-------|-------------|
| [Mirador Configuration](./MIRADOR-CONFIGURATION.md) | How to configure Mirador to use the plugins |
| [Metadata Filters](./METADATA-FILTERS.md) | Filter annotations by metadata values |
| [Developer Guide](./DEVELOPER-GUIDE.md) | Architecture overview and extension guide |

## Quick Start

### 1. Install

```bash
npm install mirador mirador-xyviewer
```

### 2. Configure

```javascript
import Mirador from 'mirador';
import {
  scientificAnnotationPlugin,
  imageComparisonPlugin,       // Optional: image comparison
  metadataFiltersPlugin,       // Optional: annotation filtering
  annotationPostprocessor
} from 'mirador-xyviewer';

const viewer = Mirador.viewer({
  id: 'mirador-container',
  windows: [{
    manifestId: 'https://example.org/manifest.json',
    highlightAllAnnotations: true,
  }],
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
  scientificAnnotationPlugin,  // Required: spectrum visualization
  imageComparisonPlugin,       // Optional: image comparison
  metadataFiltersPlugin        // Optional: metadata filters
]);
```

### 3. Create Annotations

```json
{
  "id": "https://example.org/annotation/xrf-001",
  "type": "Annotation",
  "motivation": "supplementing",
  "body": {
    "id": "https://example.org/data/spectrum.csv",
    "type": "Dataset",
    "format": "text/csv",
    "label": { "en": ["XRF Spectrum"] }
  },
  "target": "https://example.org/canvas/1#xywh=100,200,1,1"
}
```

### 4. Prepare Spectral Data

```csv
energy_kev,counts
1.0,234
2.0,567
3.0,890
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Annotations not visible | Add `supplementing` to `filteredMotivations` |
| Points not showing | Add `annotationPostprocessor` to `requests.postprocessors` |
| CORS errors | Set `osdConfig.crossOriginPolicy: 'Anonymous'` |
| Spectra not loading | Check MIME type and file size (<5MB) |

See [Mirador Configuration](./MIRADOR-CONFIGURATION.md#troubleshooting) for detailed troubleshooting.

## Support

- [GitHub Issues](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/issues)
- [IIIF Community](https://iiif.io/community/)
