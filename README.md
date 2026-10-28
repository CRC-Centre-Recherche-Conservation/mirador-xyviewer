# Mirador XY Viewer

[![CI](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/CRC-Centre-Recherche-Conservation/mirador-xyviewer/branch/main/graph/badge.svg)](https://codecov.io/gh/CRC-Centre-Recherche-Conservation/mirador-xyviewer)
[![npm version](https://img.shields.io/npm/v/mirador-xyviewer.svg)](https://www.npmjs.com/package/mirador-xyviewer)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Mirador](https://img.shields.io/badge/Mirador-4.2.2%2B-green.svg)](https://projectmirador.org/)
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
- **Point Annotations**: Automatic conversion of analysis points (tiny `xywh`, `PointSelector`) to visible markers, with selector arrays, SVG polygons and `pixel:` fragments handled
- **Metadata Filters**: Filter annotations by the controlled terms of their bodies and by metadata values, optionally extended to linked annotations (panel list and canvas shapes)
- **Web Annotation bodies**: `SpecificResource` terms as chips grouped by purpose, `linking` bodies as named rows that select the linked annotation (also on another canvas, with a way back and "Cited by" on the target), and `Choice` alternatives (any producer; WADM §4.1, §4.3)
- **Page sections**: when a canvas has several `AnnotationPage`s with a `label`, the Annotations panel groups the cards under collapsible, sticky headers (page label in the reader's language, count), in manifest order
- **Reader language**: IIIF language maps (labels, metadata, localized text bodies) follow Mirador's `language` setting (IIIF Presentation 3 §4.4)
- **Error containment**: A rendering error in a plugin, annotation or body is contained (the viewer keeps running); `ErrorBoundary` is exported for hosts embedding the standalone components
- **Selection Highlight**: Pulse animation to locate selected annotations on the image (technique, date, operator, etc.)

## Reader language

Labels, metadata and `TextualBody` variants that differ only by language are shown in
one language, following IIIF Presentation 3 §4.4. Preference order: Mirador's
`language` config (also the language switcher), then the browser's `navigator.languages`,
then values tagged `none` / `@none`, then the first available language. Regional
tags match their primary subtag in both directions (`fr-CA` → `fr`, `fr` → `fr-FR`, and `pt-PT` → `pt-BR` when neither `pt-PT` nor `pt` exists),
and every value of the chosen language is displayed.

```js
Mirador.viewer({ id: 'mirador', language: 'fr' /* ... */ }, plugins);
```

Notes: Mirador always defines `language` (default `'en'`), so a host that never sets it
behaves as English even for a French browser; set it explicitly. The metadata filter
selection resets when the language changes, because filter keys are language-specific.
Exported components used outside Mirador fall back to the browser language and accept
a `LanguageProvider` to override it. Fallback UI strings such as the `seeAlso` link
label are English and overridable via props (`fallbackLinkLabel`, `seeAlsoHeading`).

## Plugin options

UI strings of the annotation cards (captions, linked-annotation rows) are English and
overridable through the Mirador config key `scientificAnnotations.labels`; see
[docs/MIRADOR-CONFIGURATION.md](docs/MIRADOR-CONFIGURATION.md#annotation-labels).

```js
Mirador.viewer({ id: 'mirador', scientificAnnotations: { labels: { linkedAnnotations: 'Evidence' } } }, plugins);
```

Annotations with a `classifying` or `identifying` motivation are shown as summary cards
(title, text, terms grouped by role, linked annotations, report link). The annotation id
is in each card's "⋮" menu; set `scientificAnnotations.showAnnotationId: 'inline'` to keep
it visible on the card. `scientificAnnotations.linkSubtitleMetadataLabel` (for example `'Technique'`)
names the metadata whose value is shown under each linked-annotation row. `scientificAnnotations.propertyGroupOf(uri)` names the card row
and filter group of a `describing` term when neither the enclosing `Composite` label nor the
source's `inScheme` does (see docs/MIRADOR-CONFIGURATION.md).

## IIIF API compatibility

The plugin reads its data from Mirador's store and only post-processes annotation
responses, so it composes cleanly with the rest of the IIIF stack:

| IIIF API | Status | Notes |
|----------|--------|-------|
| Presentation 2.x / 3.0 | ✅ Full | v2 (`sc:AnnotationList`) is normalized internally to v3 |
| Image 2.x / 3.0 | ✅ Full | Served by Mirador/OpenSeadragon; the plugin never calls it directly |
| Content Search 1.0 / 2.0 | ✅ Untouched | The annotation post-processor is gated to annotation responses only — search `hits`/pagination are preserved. See [Enabling IIIF Content Search](docs/MIRADOR-CONFIGURATION.md#iiif-content-search) for setup and caveats. |
| Authorization Flow 1.0 / 2.0 | ⚠️ Opt-in | Manifest/image auth is handled by Mirador. Access-controlled **datasets** need [`configureDatasetRequests`](#protected-datasets-iiif-auth) |
| Content State 1.0 | ✅ Plugin helpers | Mirador itself has no Content State support. The library parses, resolves and turns content states into Mirador windows, see [Opening a IIIF Content State](docs/MIRADOR-CONFIGURATION.md#opening-a-iiif-content-state) |
| Change Discovery 1.0 | — Out of scope | Server-side discovery; not a viewer concern |

### Reading hints for spectra (`xyReading`)

A Dataset body can carry an optional, advisory `xyReading` extension object that configures the XY
renderer: localized axis titles, column roles (left/right Y axes), CSV dialect, a reversed X axis,
a reference normalization, and a link to the raw file (offered as **Download raw data**). It is validated
defensively with the exported `parseXyReading`; when it is absent, invalid or of an unknown type the file
is read as before. See [Spectral data format](docs/SPECTRAL-DATA-FORMAT.md#reading-hints-the-xyreading-extension).

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

// Once at setup. trustedOrigins is OPTIONAL — omit it for the host-driven default (reuse a
// token only on its own issuing origin), or pass an allowlist to enable cross-origin / cookies.
wireMiradorDatasetAuth(store, { trustedOrigins: ['https://data.lab.example'] }); // optional
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

> **Trust model.** `trustedOrigins` is **optional**: omit it for the host-driven default (a
> token is reused only for the **exact origin that issued it**), pass an allowlist to enable
> cross-origin reuse / cookies, or pass `[]` as a deny-all kill-switch. A token is attached
> only when (a) the origin is permitted by that mode, (b) the transport is **https** (plaintext
> http refused except loopback), and (c) a Mirador token service is matched — either the one the
> resource **declares** in its IIIF auth `service` (spec-correct, works **cross-origin** when
> both origins are trusted), or any token service sharing the content origin (*host-inheritance*;
> avoid on multi-tenant hosts).
>
> A second layer — an **SSRF blocklist** — refuses non-public hosts (private/reserved/loopback/
> link-local IPs, internal names like `localhost`/`.internal`) before any credential or login.
> Loopback is blocked by default, so for **local dev** opt in with
> `blocklist: { allow: ['loopback', 'localhost'] }`.
>
> **Split content/auth domains** — including two **subdomains** of one institution (content on
> `manuspectrum.mnhn.fr`, SSO on `sso.mnhn.fr`) — need **both** origins trusted: the content
> origin to permit the fetch, and the declared token-service origin to permit reusing that token
> (an anti-exfiltration gate). A subdomain *host* itself is never blocked, and the strict default
> is **fail-safe** — it never leaks a token; at worst a cross-subdomain dataset needs the second
> origin listed. If only the content origin is trusted, the declared path is skipped and the
> dataset falls back to the protected-record notice.
>
#### Starting a login (image-less / cross-host datasets)

`wireMiradorDatasetAuth` also registers a sign-in handler, so the "Sign in" button on a
protected dataset starts the IIIF Auth 1.0 flow when the resource **declares** its auth
`service` — including datasets with no image on the same host. It opens the access window,
retrieves the token into Mirador's store, and the panel auto-retries. Resources that declare
no auth service — or whose declared origin isn't the resource's own (host-driven) / isn't
trusted (explicit mode) — fall back to the manual "Open resource" → "Try again" path.

> The login window opens directly from your click, so popup blockers allow it. A login is only
> driven to a **secure, non-internal** auth/token origin that is either explicitly trusted or —
> host-driven — the resource's **own** origin (same gate as token reuse), and the token
> service's reply is origin-checked. Pass `loginDriver` to override the built-in flow
> (e.g. in tests). See the **[IIIF Auth integration guide](./docs/IIIF-AUTH.md)** for the
> trust model, cross-origin setup, API reference, and troubleshooting.

#### Annotation pages (opt-in)

Servers that protect or filter annotation pages per reader are covered by a second, separate
wire. It sends the stored token on **annotation page requests only**, re-requests the affected
pages once after a login, drops a token the server rejected, and shows a small **Sign in**
notice in the annotation panel when a page declares a trusted IIIF Auth 1.0 service (a `401`,
or an anonymous `200` that still declares one). It shares the trust gates of
`wireMiradorDatasetAuth` (same `trustedOrigins` / `blocklist`).

```typescript
import { wireMiradorAnnotationAuth } from 'mirador-xyviewer/mirador-auth';

wireMiradorAnnotationAuth(store, { trustedOrigins: ['https://annotations.lab.example'] });
```

See [docs/IIIF-AUTH.md](./docs/IIIF-AUTH.md#wiremiradorannotationauthstore-options) for the
caching notes and limits (a `403` hides the service; Mirador keeps one list per URL).

## Quick Start

```bash
npm install mirador mirador-xyviewer @mui/material @mui/icons-material plotly.js react-plotly.js
```

### Compatibility

Requires **Mirador 4.2.2 or later** (4.2.0 is deprecated upstream), React 18 or 19,
`plotly.js` 3 or 4 and `react-plotly.js` 2.6, 3 or 4 (`react-plotly.js` 3+ needs `plotly.js` 3+).
`@mui/material` and `@mui/icons-material` are peer dependencies and must share the same major
as the MUI version your Mirador build uses:

| Mirador | MUI |
|---|---|
| 4.2.2 to 4.2.4 | 7 |
| 4.2.5 | 7 or 9 |
| 4.2.6 | 7 (9 installs with a peer-override warning: this release pins `@mui/icons-material` 7) |
| 4.3+ | 9 |

Mirador 4.3 also expects `@mui/system` 9 in the host. `plotly.js` 2 is no longer supported.

> **Upgrading from 1.x:** see [Migration](./docs/MIRADOR-CONFIGURATION.md#migration-requiring-mirador-422).

```typescript
import Mirador from 'mirador';
import {
  scientificAnnotationPlugin,
  imageComparisonPlugin,
  ...metadataFiltersPlugin,
  selectionHighlightPlugin,
  annotationPostprocessor
} from 'mirador-xyviewer';

Mirador.viewer({
  id: 'mirador-container',
  windows: [{ manifestId: 'https://example.org/manifest.json' }],
  requests: {
    postprocessors: [annotationPostprocessor],
  },
}, [
  scientificAnnotationPlugin,   // Spectrum visualization, manifest links
  imageComparisonPlugin,        // Image comparison (optional)
  ...metadataFiltersPlugin,     // Metadata filters + hides filtered shapes on the canvas (optional; an array, spread it)
  selectionHighlightPlugin      // Selection highlight pulse (optional)
]);
```

`annotationPostprocessor` also covers annotation pages embedded in a manifest. If you inject manifests yourself with `receiveManifest` (which skips request postprocessors), pass the JSON through `transformEmbeddedAnnotationPages(json)` first.

`annotationPostprocessor` converts IIIF Presentation 2 annotations to the W3C model, so their motivations reach Mirador without the `oa:` prefix (`oa:commenting` becomes `commenting`; `sc:painting` is kept). If you restrict `annotations.filteredMotivations`, list the bare names.

## Documentation

| Guide | Description |
|-------|-------------|
| [IIIF Annotations](./docs/IIIF-ANNOTATIONS.md) | How to structure annotations for physicochemical data |
| [Spectral Data Format](./docs/SPECTRAL-DATA-FORMAT.md) | CSV/TSV format specification |
| [Mirador Configuration](./docs/MIRADOR-CONFIGURATION.md) | Full configuration options |
| [Metadata Filters](./docs/METADATA-FILTERS.md) | Filter annotations by body terms and metadata |
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
- [mirador-image-tools](https://github.com/ProjectMirador/mirador-image-tools) - Optional companion plugin for image manipulation tools (install it separately)
