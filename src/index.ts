/**
 * mirador-xyviewer
 * Mirador 4 plugin for scientific IIIF annotations with spectra visualization
 *
 * @example
 * ```typescript
 * import Mirador from 'mirador';
 * import { scientificAnnotationPlugin } from 'mirador-xyviewer';
 *
 * const viewer = Mirador.viewer({
 *   id: 'mirador-container',
 *   windows: [{
 *     manifestId: 'https://example.org/manifest.json',
 *   }],
 * }, [scientificAnnotationPlugin]);
 * ```
 */

// Main plugin export
export { scientificAnnotationPlugin, imageComparisonPlugin, metadataFiltersPlugin, selectionHighlightPlugin } from './plugin';
export { scientificAnnotationPlugin as default } from './plugin';

// Individual components for custom use
export {
  ManifestBody,
  DatasetBody,
  TextualBody,
  SpectrumPlot,
  AnnotationBodyRenderer,
  MetadataDisplay,
  ImageComparisonSlider,
} from './components';

export type {
  ManifestBodyProps,
  DatasetBodyProps,
  TextualBodyProps,
  SpectrumPlotProps,
  AnnotationBodyRendererProps,
  MetadataDisplayProps,
  ImageComparisonSliderProps,
  CanvasInfo,
} from './components';

// Services for advanced usage
export {
  datasetCache,
  fetchDataset,
  abortFetch,
  abortAllFetches,
  validateDatasetUrl,
  parseDataset,
} from './services';

// Types
export type {
  // IIIF types
  LocalizedString,
  MetadataEntry,
  ManifestBody as ManifestBodyType,
  DatasetBody as DatasetBodyType,
  TextualBody as TextualBodyType,
  AnnotationBody,
  IIIFAnnotation,
  // Dataset types
  DataPoint,
  SpectrumData,
  FetchStatus,
  DatasetFetchResult,
  PlotlyTrace,
  PlotlyLayout,
  // Mirador types
  MiradorPlugin,
  MiradorWindowConfig,
  MiradorInstance,
} from './types';

// Type guards
export {
  isManifestBody,
  isDatasetBody,
  isTextualBody,
  normalizeBody,
  isAllowedMimeType,
} from './types';

// Utilities
export {
  getLocalizedString,
  getAllLocalizedStrings,
  isValidUrl,
  escapeHtml,
  sanitizeText,
  validateContentType,
  annotationPostprocessor,
  createAnnotationPostprocessor,
  transformPointAnnotations,
} from './utils';

// Constants
export {
  ALLOWED_MIME_TYPES,
  MAX_DATASET_SIZE,
  MAX_DATA_POINTS,
  CACHE_TTL,
} from './types/dataset';

// State management (for advanced usage)
export { spectrumStore, filtersStore } from './state';
export type {
  SpectrumEntry,
  SpectrumStoreEvent,
  SpectrumStoreListener,
  FilterGroup,
  FilterValue,
  FiltersStoreEvent,
  FiltersStoreListener,
} from './state';
