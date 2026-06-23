/**
 * Demo application for mirador-xyviewer
 *
 * This demo shows how to integrate the scientific annotation plugin with Mirador 4.
 * It includes Redux DevTools support for debugging.
 */

import Mirador from 'mirador';
import { miradorImageToolsPlugin } from 'mirador-image-tools';
import { scientificAnnotationPlugin, imageComparisonPlugin, metadataFiltersPlugin, selectionHighlightPlugin, annotationPostprocessor } from '../src';
import { setupDemoAuth, rewriteBackendUrls } from './demo-auth';

// The demo runs against the REAL published Avranches manuscript manifest — itself
// IIIF Presentation v2 (sc:Manifest / sequences / canvases) and carrying NO
// annotations. We "link" our bundled v2 annotation lists (sc:AnnotationList) to
// its canvases at fetch time via a request postprocessor, so there is no
// maintained copy of the manifest. The lists are read through the same
// version-agnostic path as v3 (see annotationNormalizer). A local v3 manifest is
// also registered in the catalog so both IIIF versions are available from
// Mirador's own "Add resource" UI.
const EMMSM_MANIFEST = 'https://emmsm.unicaen.fr/manifests/Avranches_BM_59.json';
const V3_MANIFEST = `${import.meta.env.BASE_URL}avranches-manifest-v3.json`;

// Canvases (…/AVRANCHES_MS059/<N>) for which a v2 annotation list is bundled.
const ANNOTATED_CANVASES = [10, 11, 34, 70, 91, 114, 115, 118, 163, 260];

/** Absolute URL (on the demo origin) of a bundled v2 annotation list. */
const annotationListUrl = (n: number): string =>
  new URL(`${import.meta.env.BASE_URL}annotations-v2-canvas-${n}.json`, window.location.origin).href;

/** Append a version tag to a IIIF label (string / array / language-map forms). */
function tagLabel(label: unknown, tag: string): unknown {
  if (typeof label === 'string') return `${label} (${tag})`;
  if (Array.isArray(label)) {
    return label.map((l, i) => (i === 0 && typeof l === 'string' ? `${l} (${tag})` : l));
  }
  if (label && typeof label === 'object') {
    const out = { ...(label as Record<string, unknown>) };
    for (const k of Object.keys(out)) {
      if (Array.isArray(out[k])) {
        out[k] = (out[k] as unknown[]).map((s, i) => (i === 0 ? `${s} (${tag})` : s));
      }
    }
    return out;
  }
  return `Avranches BM, 59 (${tag})`;
}

/**
 * Mirador request postprocessor: when the published Avranches manifest is fetched,
 * tag its title "(IIIF v2)" and inject `otherContent` (IIIF v2 annotation lists)
 * onto the annotated canvases — linking our annotations without copying it.
 */
function injectAvranchesAnnotations(url: string, action: Record<string, unknown>): void {
  if (!url.includes('Avranches_BM_59')) return;
  const manifest = action.manifestJson as
    | { label?: unknown; sequences?: { canvases?: Record<string, unknown>[] }[] }
    | undefined;
  if (!manifest?.sequences) return;

  // Tag the title so v2/v3 are distinguishable in Mirador's catalog & window bar.
  manifest.label = tagLabel(manifest.label, 'IIIF v2');

  for (const sequence of manifest.sequences) {
    for (const canvas of sequence.canvases ?? []) {
      const id = (canvas['@id'] ?? canvas.id) as string | undefined;
      const n = id ? Number(/\/AVRANCHES_MS059\/(\d+)$/.exec(id)?.[1]) : NaN;
      if (ANNOTATED_CANVASES.includes(n)) {
        canvas.otherContent = [{ '@id': annotationListUrl(n), '@type': 'sc:AnnotationList' }];
      }
    }
  }
}

/**
 * Initialize Mirador with the scientific annotation plugin
 */
function initMirador() {
  const isDev = import.meta.env.DEV;

  // Check for Redux DevTools extension (dev only)
  if (isDev) {
    const devToolsAvailable = typeof window !== 'undefined' &&
      (window as unknown as { __REDUX_DEVTOOLS_EXTENSION__?: unknown }).__REDUX_DEVTOOLS_EXTENSION__;

    if (devToolsAvailable) {
      console.log('%c[XYViewer] Redux DevTools detected', 'color: #4CAF50; font-weight: bold');
    } else {
      console.log(
        '%c[XYViewer] Install Redux DevTools for state debugging: https://github.com/reduxjs/redux-devtools',
        'color: #FF9800'
      );
    }
  }

  // Initialize Mirador with our plugin
  const miradorInstance = Mirador.viewer(
    {
      id: 'mirador-container',
      windows: [
        {
          manifestId: EMMSM_MANIFEST,
          // Open directly on an annotated folio (canvas 10) so the analyses show.
          canvasId: 'https://iiif.unicaen.fr/mrsh/bvmsm/AVRANCHES_MS059/10',
          // Enable info panel (annotations panel requires mirador-annotations plugin)
          sideBarOpen: true,
          sideBarPanel: 'info',
        },
      ],
      // Pre-register both IIIF flavors in Mirador's "Add resource" catalog:
      // the real v2 manifest (annotations injected) and a local v3 manifest.
      catalog: [
        { manifestId: EMMSM_MANIFEST },
        { manifestId: V3_MANIFEST },
      ],
      // Mirador configuration
      window: {
        allowClose: true,
        allowFullscreen: true,
        allowMaximize: true,
        allowTopMenuButton: true,
        allowWindowSideBar: true,
        sideBarOpenByDefault: true,
        defaultSideBarPanel: 'info',
        // Show annotation markers on canvas for every window (else only on hover).
        highlightAllAnnotations: true,
        panels: {
          annotations: true,
          info: true,
          attribution: true,
          canvas: true,
        },
      },
      // Workspace configuration
      workspace: {
        type: 'mosaic',
        allowNewWindows: true,
      },
      // Annotation configuration
      annotations: {
        htmlSanitizationRuleSet: 'iiif',
        // Include 'supplementing' motivation (used by scientific annotations)
        // Default Mirador only shows: oa:commenting, oa:tagging, sc:painting, commenting, tagging
        filteredMotivations: [
          'oa:commenting',
          'oa:tagging',
          'sc:painting',
          'commenting',
          'tagging',
          'supplementing',  // Required for IIIF v3 scientific annotations
        ],
      },
      // OpenSeadragon configuration for CORS
      osdConfig: {
        crossOriginPolicy: 'Anonymous',
      },
      // Request postprocessors: inject the v2 annotation lists onto the published
      // manifest, and transform point annotations (xywh w=1,h=1) into SVG circles.
      requests: {
        // Demo auth: route the lab backend through /lab and declare each protected
        // resource's own auth service (datasets here; maXRF images via Mirador's own flow).
        postprocessors: [injectAvranchesAnnotations, rewriteBackendUrls, annotationPostprocessor],
      },
    },
    // Pass the plugins (image tools + scientific annotation + image comparison + metadata filters + selection highlight)
    [...miradorImageToolsPlugin, scientificAnnotationPlugin, imageComparisonPlugin, metadataFiltersPlugin, selectionHighlightPlugin]
  );

  // Demo-only: the full carto-chimie auth story on REAL data — one Sign-in unlocks the
  // spectra AND the maXRF maps, all proxied through /lab. See demo-auth.ts.
  setupDemoAuth(miradorInstance.store);

  // Expose to window for DevTools inspection (dev only)
  if (isDev && typeof window !== 'undefined') {
    (window as unknown as { miradorInstance: typeof miradorInstance }).miradorInstance = miradorInstance;
    console.log('%c[XYViewer] Mirador instance available at window.miradorInstance', 'color: #2196F3');

    // Log plugin initialization
    console.log('%c[XYViewer] Scientific annotation plugin loaded', 'color: #4CAF50; font-weight: bold');
    console.log('%c[XYViewer] Image comparison plugin loaded', 'color: #4CAF50; font-weight: bold');
    console.log('%c[XYViewer] Metadata filters plugin loaded', 'color: #4CAF50; font-weight: bold');
    console.log('%c[XYViewer] Selection highlight plugin loaded', 'color: #4CAF50; font-weight: bold');
    console.log('[XYViewer] Supported body types: Manifest, Dataset, TextualBody');
  }

  return miradorInstance;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMirador);
} else {
  initMirador();
}
