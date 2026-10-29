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
export { scientificAnnotationPlugin, imageComparisonPlugin, metadataFiltersPlugin, selectionHighlightPlugin, searchResultFocusPlugin } from './plugin';
export { scientificAnnotationPlugin as default } from './plugin';

// Individual components for custom use
export {
  ManifestBody,
  DatasetBody,
  configureDatasetAuth,
  TextualBody,
  SpecificResourceBody,
  EvidenceLinkBody,
  ClassificationCard,
  TermChip,
  AnnotationCardMenu,
  SpectrumPlot,
  AnnotationBodyRenderer,
  MetadataDisplay,
  ImageComparisonSlider,
  ErrorBoundary,
  ErrorNotice,
  DEFAULT_ERROR_NOTICE,
} from './components';

export type {
  ManifestBodyProps,
  DatasetBodyProps,
  DatasetAuthHandler,
  TextualBodyProps,
  SpecificResourceBodyProps,
  EvidenceLinkBodyProps,
  ClassificationCardProps,
  TermChipProps,
  TermChipAction,
  AnnotationCardMenuProps,
  SpectrumPlotProps,
  SpectrumPlotLabels,
  AnnotationBodyRendererProps,
  AnnotationBodyLabels,
  MetadataDisplayProps,
  ImageComparisonSliderProps,
  CanvasInfo,
  ErrorBoundaryProps,
} from './components';

// Services for advanced usage
export {
  datasetCache,
  fetchDataset,
  abortFetch,
  abortAllFetches,
  validateDatasetUrl,
  configureDatasetRequests,
  parseDataset,
  resolveContentState,
  fetchContentStateJson,
  readContentStateFile,
} from './services';
export type {
  ContentStateFetcher,
  FetchContentStateOptions,
  ResolveContentStateOptions,
} from './services';

// Types
export type {
  // IIIF types
  LocalizedString,
  MetadataEntry,
  IiifService,
  ManifestBody as ManifestBodyType,
  DatasetBody as DatasetBodyType,
  TextualBody as TextualBodyType,
  SpecificResourceBody as SpecificResourceBodyType,
  ChoiceBody as ChoiceBodyType,
  CompositeBody as CompositeBodyType,
  ListBody as ListBodyType,
  IndependentsBody as IndependentsBodyType,
  AnnotationBody,
  IIIFAnnotation,
  // Dataset types
  DataPoint,
  SpectrumData,
  FetchStatus,
  DatasetFetchResult,
  DatasetRequestOptions,
  DatasetRequestContext,
  DatasetRequestProvider,
  PlotlyTrace,
  PlotlyLayout,
  // Mirador types
  MiradorPlugin,
  MiradorWindowConfig,
  MiradorInstance,
  ScientificAnnotationsConfig,
} from './types';

// Type guards
export {
  isManifestBody,
  isDatasetBody,
  isTextualBody,
  isSpecificResourceBody,
  isChoiceBody,
  isCompositeBody,
  isListBody,
  isIndependentsBody,
  isLinkingBody,
  srSourceId,
  srLabel,
  normalizeBody,
  isAllowedMimeType,
} from './types';

// Utilities
export {
  getLocalizedString,
  getLocalizedStrings,
  getAllLocalizedStrings,
  resolvePreferredLanguages,
  pickLanguageKey,
  LanguageProvider,
  useLanguagePreferences,
  isValidUrl,
  escapeHtml,
  sanitizeText,
  validateContentType,
  parseXyReading,
  annotationPostprocessor,
  createAnnotationPostprocessor,
  transformPointAnnotations,
  transformEmbeddedAnnotationPages,
  // IIIF Content State 1.0
  parseContentStateInput,
  parseContentStateQuery,
  decodeContentState,
  encodeContentState,
  contentStateTextFromDataTransfer,
  extractContentStateTargets,
  buildMiradorWindows,
  regionToBounds,
  findCanvasSize,
  CONTENT_STATE_MAX_BYTES,
  CONTENT_STATE_MAX_TARGETS,
} from './utils';
export type {
  ContentStateInput,
  ContentStateRegion,
  ContentStateTarget,
  ContentStateResult,
  ContentStateWindowConfig,
  ParseContentStateOptions,
  BuildWindowsOptions,
} from './utils';

export type {
  XyReading,
  XyColumn,
  XyColumnRole,
  XyDialect,
  XyCorrection,
  XyDerivedFrom,
} from './types';

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
