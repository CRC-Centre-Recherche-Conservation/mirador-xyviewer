# Mirador XY Viewer

[![CI](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/CRC-Centre-Recherche-Conservation/mirador-xyviewer/branch/main/graph/badge.svg)](https://codecov.io/gh/CRC-Centre-Recherche-Conservation/mirador-xyviewer)
[![npm version](https://img.shields.io/npm/v/mirador-xyviewer.svg)](https://www.npmjs.com/package/mirador-xyviewer)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Mirador](https://img.shields.io/badge/Mirador-4.0-green.svg)](https://projectmirador.org/)
[![IIIF](https://img.shields.io/badge/IIIF-v2%20%26%20v3-orange.svg)](https://iiif.io/)

A Mirador 4 plugin for visualizing physicochemical analysis data in IIIF format. Developed by the [Centre de Recherche sur la Conservation (CRC)](https://crc.mnhn.fr/) for museum and heritage applications requiring spectral data visualization (XRF, Raman, FTIR, UV-Vis, etc.).

- Document physicochemical analyses on artworks or heritage objects
- Associate spectral data (XRF, Raman, FTIR, UV-Vis) with specific regions of high-resolution images
- Need to visually compare different imaging modalities (visible light, UV, IR, X-ray)
- Publish their analysis data following IIIF standards

## Features

- **IIIF v2 & v3 Annotations**: Reads both IIIF Presentation API 2.0/2.1 (`sc:AnnotationList`) and 3.0 (`AnnotationPage`) annotation lists — v2 is normalized internally to v3, so all features below work identically for either version
- **Spectrum Visualization**: Load and display CSV/TSV spectral data with Plotly
- **Manifest Links**: Open related IIIF manifests in new windows
- **Image Comparison**: Side-by-side comparison with synchronized zoom/pan
- **Point Annotations**: Automatic conversion of analysis points to visible markers
- **Metadata Filters**: Filter annotations by metadata values
- **Selection Highlight**: Pulse animation to locate selected annotations on the image (technique, date, operator, etc.)

## IIIF API compatibility

The plugin reads its data from Mirador's store and only post-processes annotation
responses, so it composes cleanly with the rest of the IIIF stack:

| IIIF API | Status | Notes |
|----------|--------|-------|
| Presentation 2.x / 3.0 | ✅ Full | v2 (`sc:AnnotationList`) is normalized internally to v3 |
| Image 2.x / 3.0 | ✅ Full | Served by Mirador/OpenSeadragon; the plugin never calls it directly |
| Content Search 1.0 / 2.0 | ✅ Untouched | The annotation post-processor is gated to annotation responses only — search `hits`/pagination are preserved |
| Authorization Flow 1.0 / 2.0 | ⚠️ Opt-in | Manifest/image auth is handled by Mirador. Access-controlled **datasets** need [`configureDatasetRequests`](#protected-datasets-iiif-auth) |
| Content State 1.0 | ✅ No conflict | Handled by Mirador; the plugin does not interfere |
| Change Discovery 1.0 | — Out of scope | Server-side discovery; not a viewer concern |

### Protected datasets (IIIF Auth)

Dataset/spectrum files are fetched by the plugin itself. By default the request uses
`credentials: 'omit'` and no auth headers (the safe, CORS-friendly default for open
data). To fetch **access-controlled** datasets, register a request provider once at
setup — cookie- or token-based:

```typescript
import { configureDatasetRequests } from 'mirador-xyviewer';

// Same-origin cookie auth:
configureDatasetRequests(() => ({ credentials: 'include' }));

// Bearer token (e.g. resolved from your auth store):
configureDatasetRequests((url) => {
  const token = selectTokenForUrl(url);
  return token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
});
```

> Cross-origin requests with `credentials: 'include'` additionally require the server
> to send `Access-Control-Allow-Credentials: true` and an explicit
> `Access-Control-Allow-Origin`. See the [IIIF Annotations guide](./docs/IIIF-ANNOTATIONS.md#protected-datasets-iiif-auth) for details.

#### Reusing Mirador's IIIF Auth session (recommended)

> Full guide: **[docs/IIIF-AUTH.md](./docs/IIIF-AUTH.md)** — trust model, cross-origin, API, troubleshooting.

If your protected datasets live on the **same origin** as protected images, you don't
need to plumb tokens by hand. Mirador 4 already runs the IIIF Auth 1.0 flow for images;
`wireMiradorDatasetAuth` reuses that stored token so a **single login unlocks images and
same-host datasets** — no second sign-in.

```typescript
import { wireMiradorDatasetAuth } from 'mirador-xyviewer/mirador-auth';

const { store } = Mirador.viewer(config, [scientificAnnotationPlugin]);

// Once at setup. trustedOrigins is a required allowlist (anti-leak); no wildcard.
wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab.example'] });
```

This registers a `configureDatasetRequests` provider that attaches the matching Mirador
token as `Authorization: Bearer …` on dataset fetches. The lower-level
`configureDatasetRequests` above remains available as an escape hatch (e.g. a non-Mirador
auth store); `wireMiradorDatasetAuth` takes exclusive ownership of that slot, so use one
or the other.

For **split content/auth domains** — content on one host, the IIIF auth/token service on
another (e.g. spectra on `data.lab`, login on `auth.museum`) — trust **both** origins:

```typescript
wireMiradorDatasetAuth(store, {
  trustedOrigins: ['https://data.lab.example', 'https://auth.example'],
});
```

> **Trust model.** A token is attached only when (a) the content origin is in
> `trustedOrigins`, (b) the transport is **https** (plaintext http is refused except
> loopback), and (c) a Mirador token service is matched — either the one the resource
> **declares** in its IIIF auth `service` (the spec-correct path, which works
> **cross-origin**), or, as a fallback, any token service sharing the content origin
> (*host-inheritance* — it trusts every path on a trusted origin, so avoid on
> multi-tenant hosts).
>
> **Split content/auth domains** need **both** origins trusted: the content origin to
> permit the fetch, and the declared token-service origin to permit reusing that token
> (an anti-exfiltration gate). If only the content origin is trusted, the declared path
> is skipped and the dataset falls back to the protected-record notice.
>
#### Starting a login (image-less / cross-host datasets)

`wireMiradorDatasetAuth` also registers a sign-in handler, so the "Sign in" button on a
protected dataset starts the IIIF Auth 1.0 flow when the resource **declares** its auth
`service` — including datasets with no image on the same host. It opens the access window,
retrieves the token into Mirador's store, and the panel auto-retries. Resources that
declare no auth service (or whose auth/token origin isn't in `trustedOrigins`) fall back to
the manual "Open resource" → "Try again" path.

> The login window opens directly from your click, so popup blockers allow it. The login is
> only driven to a **trusted, https** auth/token origin (same gate as token reuse), and the
> token service's reply is origin-checked. Pass `loginDriver` to override the built-in flow
> (e.g. in tests). See the **[IIIF Auth integration guide](./docs/IIIF-AUTH.md)** for the
> trust model, cross-origin setup, API reference, and troubleshooting.

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
