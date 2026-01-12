/**
 * Demo application for mirador-xyviewer
 *
 * This demo shows how to integrate the scientific annotation plugin with Mirador 4.
 * It includes Redux DevTools support for debugging.
 */

import Mirador from 'mirador';
import { scientificAnnotationPlugin } from '../src';

// Demo manifest with scientific annotations
// In production, replace with your actual manifest URL
const DEMO_MANIFEST = 'https://iiif.io/api/cookbook/recipe/0001-mvm-image/manifest.json';

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
          // Enable annotations panel
          sideBarOpen: true,
          sideBarPanel: 'annotations',
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
        defaultSideBarPanel: 'annotations',
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
      },
    },
    // Pass the scientific annotation plugin
    [scientificAnnotationPlugin]
  );

  // Expose to window for DevTools inspection
  if (typeof window !== 'undefined') {
    (window as unknown as { miradorInstance: typeof miradorInstance }).miradorInstance = miradorInstance;
    console.log('%c[XYViewer] Mirador instance available at window.miradorInstance', 'color: #2196F3');
  }

  // Log plugin initialization
  console.log('%c[XYViewer] Scientific annotation plugin loaded', 'color: #4CAF50; font-weight: bold');
  console.log('[XYViewer] Supported body types: Manifest, Dataset, TextualBody');

  return miradorInstance;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMirador);
} else {
  initMirador();
}
