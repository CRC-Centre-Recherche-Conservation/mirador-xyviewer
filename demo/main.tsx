/**
 * Demo application for mirador-xyviewer
 *
 * This demo shows how to integrate the scientific annotation plugin with Mirador 4.
 * It includes Redux DevTools support for debugging.
 */

import Mirador from 'mirador';
import { miradorImageToolsPlugin } from 'mirador-image-tools';
import { scientificAnnotationPlugin, imageComparisonPlugin, metadataFiltersPlugin, annotationPostprocessor } from '../src';

// Demo manifest with scientific annotations
// Using local Avranches manuscript manifest (IIIF 3.0) with spectral analysis annotations
// Served from public/ directory as static Vite endpoint
const DEMO_MANIFEST = '/avranches-manifest-v3.json';

/**
 * Initialize Mirador with the scientific annotation plugin
 */
function initMirador() {
  // Check for Redux DevTools extension
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

  // Initialize Mirador with our plugin
  const miradorInstance = Mirador.viewer(
    {
      id: 'mirador-container',
      windows: [
        {
          manifestId: DEMO_MANIFEST,
          // Enable info panel (annotations panel requires mirador-annotations plugin)
          sideBarOpen: true,
          sideBarPanel: 'info',
          // Enable annotation overlay display on canvas
          highlightAllAnnotations: true,
        },
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
      // Transform point annotations (xywh with w=1,h=1) to visible SVG circles
      requests: {
        postprocessors: [annotationPostprocessor],
      },
    },
    // Pass the plugins (image tools + scientific annotation + image comparison + metadata filters)
    [...miradorImageToolsPlugin, scientificAnnotationPlugin, imageComparisonPlugin, metadataFiltersPlugin]
  );

  // Expose to window for DevTools inspection
  if (typeof window !== 'undefined') {
    (window as unknown as { miradorInstance: typeof miradorInstance }).miradorInstance = miradorInstance;
    console.log('%c[XYViewer] Mirador instance available at window.miradorInstance', 'color: #2196F3');
  }

  // Log plugin initialization
  console.log('%c[XYViewer] Scientific annotation plugin loaded', 'color: #4CAF50; font-weight: bold');
  console.log('%c[XYViewer] Image comparison plugin loaded', 'color: #4CAF50; font-weight: bold');
  console.log('%c[XYViewer] Metadata filters plugin loaded', 'color: #4CAF50; font-weight: bold');
  console.log('[XYViewer] Supported body types: Manifest, Dataset, TextualBody');

  return miradorInstance;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMirador);
} else {
  initMirador();
}
