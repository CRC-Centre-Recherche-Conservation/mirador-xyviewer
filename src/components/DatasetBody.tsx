/**
 * DatasetBody Component
 * Case 2: Fetches dataset and renders spectrum plot using Plotly
 *
 * Features:
 * - Lazy loading on user interaction
 * - AbortController for cleanup
 * - Cached data reuse
 * - Error handling with retry
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  Alert,
  Collapse,
  IconButton,
  Link,
} from '@mui/material';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { DatasetBody as DatasetBodyType, LocalizedString } from '../types/iiif';
import type { SpectrumData, FetchStatus, DatasetRequestOptions } from '../types/dataset';
import { fetchDataset, fetchDatasetFile, abortFetch, validateDatasetUrl, datasetCacheKey } from '../services/datasetFetcher';
import {
  configureDatasetAuth,
  getRegisteredAuthHandler,
  getRegisteredCanStartLogin,
} from '../services/datasetAuth';
import type { DatasetAuthHandler } from '../services/datasetAuth';
import { datasetCache } from '../services/datasetCache';
import { isValidUrl } from '../utils/security';
import { parseXyReading } from '../utils/xyReading';
import { hasExtension, resolveDownloadName, sanitizeFileName } from '../utils/downloadName';
import { getLocalizedString } from '../utils/localization';
import { useLanguagePreferences } from '../utils/LanguageContext';
import { SpectrumPlot } from './SpectrumPlot';

// The global sign-in handler registry lives in a lightweight, React-free module
// (`services/datasetAuth`) so the `mirador-auth` subexport can register a handler
// without importing this component. Re-exported here for backward compatibility.
export { configureDatasetAuth };
export type { DatasetAuthHandler };

/** Monospace utility face for the data "spec" readout — the instrument-readout signature. */
const MONO_STACK = 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace';

/** The host the user must authenticate against, e.g. `data.lab.example`. */
const safeHost = (url: string): string | undefined => {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
};

/** Extensions for known raw-file formats; anything else gets none. */
const RAW_EXTENSIONS: Record<string, string> = {
  'text/csv': '.csv',
  'text/tab-separated-values': '.tsv',
  'text/plain': '.txt',
};

/** The resource's own file name (last path segment), for a download's suggested name. */
const sameOrigin = (a: string, b: string): boolean => {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
};

const filenameFromUrl = (url: string): string => {
  try {
    const name = new URL(url).pathname.split('/').pop();
    return name ? decodeURIComponent(name) : '';
  } catch {
    return '';
  }
};

interface ProtectedDatasetNoticeProps {
  label: string;
  format?: string;
  host?: string;
  resourceUrl: string;
  /** Present only when a login can actually start for this body; absent → no Sign in action. */
  onSignIn?: () => void;
  /** Open/download the raw file through an AUTHENTICATED fetch (carries the token). */
  onOpenResource: () => void;
  /** Login in progress — disables the button and shows a "Signing in…" state. */
  busy?: boolean;
  onRetry: () => void;
}

/**
 * The access-controlled state of a dataset, shown as a quiet "protected record"
 * (a sealed instrument readout) rather than a red error — the data exists, it's
 * just sealed. Names the host the user must authenticate against, which is the
 * load-bearing fact in the cross-origin museum↔lab case.
 */
const ProtectedDatasetNotice: React.FC<ProtectedDatasetNoticeProps> = ({
  label,
  format,
  host,
  resourceUrl,
  onSignIn,
  onOpenResource,
  busy,
  onRetry,
}) => {
  const message = busy
    ? 'Complete sign-in in the new window…'
    : onSignIn
      ? host
        ? `Hosted by ${host} — sign in to view.`
        : 'Sign in to view this dataset.'
      : host
        ? `Hosted by ${host}. Sign in there, then retry.`
        : 'This dataset is protected. Sign in, then retry.';
  const spec = [format, host].filter(Boolean).join(' · ');

  return (
    <Box
      role="status"
      sx={{
        width: '100%',
        p: 1.25,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
      }}
    >
      {/* Lock + dataset label, with a Protected eyebrow */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <LockOutlinedIcon fontSize="small" sx={{ color: 'warning.main' }} />
          <Typography variant="subtitle2" noWrap title={label}>{label}</Typography>
        </Box>
        <Typography
          variant="caption"
          sx={{
            flexShrink: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 600,
            color: 'text.secondary',
          }}
        >
          Protected
        </Typography>
      </Box>

      {/* Spec readout (mono): format · host */}
      {spec && (
        <Typography
          variant="caption"
          component="div"
          sx={{ mt: 0.25, fontFamily: MONO_STACK, color: 'text.secondary', wordBreak: 'break-all' }}
        >
          {spec}
        </Typography>
      )}

      {/* Plain-language status */}
      <Typography variant="body2" sx={{ mt: 0.75, color: 'text.secondary' }}>{message}</Typography>

      {/* One primary action (Sign in ↗) + quiet fallbacks */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
        {onSignIn && (
          <Button
            variant="contained"
            size="small"
            disableElevation
            disabled={busy}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
            endIcon={busy ? undefined : <OpenInNewIcon fontSize="small" />}
            onClick={onSignIn}
            sx={{ textTransform: 'none' }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        )}
        <Link
          component="button"
          type="button"
          onClick={onOpenResource}
          title={resourceUrl}
          variant="caption"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}
        >
          Open resource
          <OpenInNewIcon sx={{ fontSize: 12 }} />
        </Link>
        <Link
          component="button"
          type="button"
          onClick={onRetry}
          variant="caption"
          sx={{ color: 'text.secondary' }}
        >
          Try again
        </Link>
      </Box>
    </Box>
  );
};

export interface DatasetBodyProps {
  /** The dataset body from the annotation */
  body: DatasetBodyType;
  /** Optional: Additional label from annotation */
  annotationLabel?: LocalizedString;
  /** Whether the annotation is currently selected/active */
  isActive?: boolean;
  /** Callback when spectrum data is loaded (for global plot controller) */
  onDataLoaded?: (id: string, data: SpectrumData) => void;
  /** Callback when spectrum visibility changes */
  onVisibilityChange?: (id: string, visible: boolean) => void;
  /** Optional IIIF Auth overrides (credentials/headers) for the dataset fetch. */
  requestOptions?: DatasetRequestOptions;
  /**
   * Called when the dataset fetch fails because it needs authentication (401/403).
   * Providing it (or a global {@link configureDatasetAuth} handler) surfaces a
   * "Sign in" button on the error. The host performs the login (e.g. opens the data
   * host's IIIF Auth / login window); if it returns a Promise, the dataset is
   * re-fetched automatically once that Promise resolves.
   */
  onAuthRequired?: DatasetAuthHandler;
}

export const DatasetBody: React.FC<DatasetBodyProps> = ({
  body,
  annotationLabel,
  isActive = false,
  onDataLoaded,
  requestOptions,
  onAuthRequired,
}) => {
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [data, setData] = useState<SpectrumData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const mountedRef = useRef(true);
  const urlRef = useRef(body.id);
  // Guards the one-shot silent session re-acquisition (zero-click reload) per body.
  const silentTriedRef = useRef(false);

  // Per-component prop wins over a global handler registered via configureDatasetAuth.
  const authHandler = onAuthRequired ?? getRegisteredAuthHandler();
  // Show "Sign in" only when a login can actually start for this body: a per-component prop
  // is the host's responsibility; the global handler exposes a predicate (when wired) so we
  // don't render a dead button for a resource that declares no (trusted) auth service.
  const canSignIn =
    Boolean(authHandler) && (onAuthRequired ? true : (getRegisteredCanStartLogin()?.(body) ?? true));

  // Host to authenticate against, surfaced in the protected-dataset notice.
  const host = useMemo(() => safeHost(body.id), [body.id]);

  // Get display label
  const langPrefs = useLanguagePreferences();
  const displayLabel = getLocalizedString(body.label, langPrefs) ||
    getLocalizedString(annotationLabel, langPrefs) ||
    'Spectrum Data';

  // Stable string key: an equal-but-new xyReading object must not re-run the effects.
  const cacheKey = useMemo(() => datasetCacheKey(body.id, body.xyReading), [body.id, body.xyReading]);

  // Validate URL on mount
  const validation = validateDatasetUrl(body.id, body.format);

  // Check cache on mount
  useEffect(() => {
    silentTriedRef.current = false; // a different dataset gets its own silent attempt
    const cached = datasetCache.get(cacheKey);
    if (cached) {
      setData(cached);
      setStatus('success');
    }
  }, [cacheKey]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    urlRef.current = cacheKey;

    return () => {
      mountedRef.current = false;
      abortFetch(urlRef.current);
    };
  }, [cacheKey]);

  // Auto-expand when active
  useEffect(() => {
    if (isActive && status === 'success') {
      setExpanded(true);
    }
  }, [isActive, status]);

  const handleFetch = useCallback(async () => {
    if (!validation.valid) {
      setError(validation.error || 'Invalid dataset');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setError(null);
    setAuthRequired(false);

    const load = () =>
      fetchDataset(body.id, body.format, displayLabel, requestOptions, { service: body.service }, body.xyReading);
    let result = await load();
    if (!mountedRef.current) return;

    // Zero-click recovery: on 401, try ONCE to reuse a still-valid session silently (the
    // token service, no window) before prompting. After a reload the access cookie persists,
    // so the token is re-derived and the dataset reappears on its own — like the image canvas.
    if (result.status === 'error' && result.authRequired && authHandler && !silentTriedRef.current) {
      silentTriedRef.current = true;
      try {
        await authHandler(body, { interactive: false });
      } catch {
        /* no session — fall through to the protected notice */
      }
      if (!mountedRef.current) return;
      datasetCache.delete(cacheKey);
      result = await load();
      if (!mountedRef.current) return;
    }

    if (result.status === 'success' && result.data) {
      setData(result.data);
      setStatus('success');
      setExpanded(true);
      onDataLoaded?.(body.id, result.data);
    } else {
      setError(result.error || 'Failed to load dataset');
      setAuthRequired(result.authRequired === true);
      setStatus('error');
    }
  }, [body, displayLabel, validation, onDataLoaded, requestOptions, authHandler]);

  const handleRetry = useCallback(() => {
    datasetCache.delete(cacheKey);
    handleFetch();
  }, [cacheKey, handleFetch]);

  // Sign-in affordance for auth-protected datasets. The host runs the login flow;
  // if it returns a Promise we re-fetch once it resolves (login window closed),
  // otherwise the user re-triggers with Retry after signing in.
  const handleSignIn = useCallback(async () => {
    if (!authHandler) return;
    setSigningIn(true);
    try {
      const maybePromise = authHandler(body);
      if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
        await maybePromise;
        if (!mountedRef.current) return;
        datasetCache.delete(cacheKey);
        handleFetch();
      }
    } catch (err) {
      // A host onAuthRequired may reject (e.g. the user closed the popup); recover quietly
      // rather than surface an unhandled rejection. The user can Retry.
      console.debug('[mirador-xyviewer] sign-in did not complete:', err);
    } finally {
      if (mountedRef.current) setSigningIn(false);
    }
  }, [authHandler, body, handleFetch]);

  // Download the raw file via an AUTHENTICATED fetch (the token rides along), via a synthetic
  // <a download> click: browsers exempt downloads from popup blocking (unlike window.open after
  // an await, which loses the user gesture and is blocked silently), and it keeps the real file
  // name instead of a blob UUID.
  const triggerDownload = useCallback(async (url: string, fallbackName?: string, label?: string) => {
    // Host headers/credentials only go to the dataset's own origin; the raw file may live elsewhere.
    const options = sameOrigin(url, body.id) ? requestOptions : undefined;
    const { blob, filename } = await fetchDatasetFile(url, options, { service: body.service });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = resolveDownloadName({
      urlName: filenameFromUrl(url),
      headerName: filename,
      label,
      fallback: fallbackName,
    });
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }, [body.id, body.service, requestOptions]);

  // "Open resource": download the file, and if the server says we're not authed yet, run the
  // login and download automatically once it completes — one click, not "sign in" then a
  // second click on download. (Unlike handleSignIn, this re-attempts the download, not a plot
  // reload.) The download itself rides a fresh <a download> so it is never popup-blocked.
  // The raw file of an xyReading `derivedFrom` rides the same path and the same sign-in.
  const downloadWithAuth = useCallback(async (url: string, fallbackName?: string, label?: string) => {
    try {
      await triggerDownload(url, fallbackName, label);
    } catch (err) {
      if (!(err as { authRequired?: boolean }).authRequired || !authHandler) {
        console.debug('[mirador-xyviewer] could not open dataset resource:', err);
        return;
      }
      setSigningIn(true);
      try {
        const maybePromise = authHandler(body);
        if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
          await maybePromise;
        }
        if (!mountedRef.current) return;
        await triggerDownload(url, fallbackName, label);
      } catch (signInErr) {
        console.debug('[mirador-xyviewer] could not open dataset resource after sign-in:', signInErr);
      } finally {
        if (mountedRef.current) setSigningIn(false);
      }
    }
  }, [triggerDownload, authHandler, body]);

  const handleOpenResource = useCallback(() => {
    const ext = RAW_EXTENSIONS[body.format ?? ''] ?? '';
    const stem = filenameFromUrl(body.id).replace(/\.[^.]*$/, '') || 'dataset';
    return downloadWithAuth(body.id, ext ? `${stem}${ext}` : undefined, getLocalizedString(body.label, langPrefs));
  }, [downloadWithAuth, body.id, body.format, body.label, langPrefs]);

  // Raw file the curve was derived from (xyReading derivedFrom); never fetched automatically.
  const rawSource = useMemo(() => parseXyReading(body.xyReading)?.derivedFrom, [body.xyReading]);
  const handleDownloadRaw = useCallback(() => {
    if (!rawSource) return;
    const ext = RAW_EXTENSIONS[rawSource.format ?? ''] ?? '';
    const label = getLocalizedString(rawSource.label, langPrefs);
    // Last resort: the label (or the dataset's own name) as the stem, plus the format's extension.
    const stem = sanitizeFileName(label.replace(/[\\/]/g, '_')) || `${filenameFromUrl(body.id).replace(/\.[^.]*$/, '') || 'dataset'}-raw`;
    return downloadWithAuth(rawSource.id, hasExtension(stem) ? stem : `${stem}${ext}`, label);
  }, [rawSource, body.id, downloadWithAuth, langPrefs]);
  const rawTitle = rawSource ? getLocalizedString(rawSource.label, langPrefs) || rawSource.id : undefined;
  // Offered in every state: the plain seeAlso link to this file is hidden in its favour.
  const rawLink = rawSource ? (
    <Link
      component="button"
      type="button"
      onClick={handleDownloadRaw}
      title={rawTitle}
      aria-label={`Download raw data${rawTitle ? `: ${rawTitle}` : ''}`}
      variant="caption"
    >
      Download raw data
    </Link>
  ) : null;

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  // Tooltip for the plot's "download data file" button — name the extension when known so it
  // reads distinctly from Plotly's "Download plot as png". Memoized objects keep Plotly's
  // modebar config stable across renders (a fresh labels object would redraw the modebar).
  const downloadLabel = useMemo(() => {
    const ext = filenameFromUrl(body.id).match(/\.([A-Za-z0-9]+)$/)?.[1];
    return ext ? `Download data file (.${ext.toLowerCase()})` : 'Download data file';
  }, [body.id]);
  const plotLabels = useMemo(() => ({ downloadButton: downloadLabel }), [downloadLabel]);

  // Render validation outcome. Distinguish a broken URL (a real error) from a
  // valid resource whose format we deliberately don't plot (e.g. binary /
  // proprietary): the latter is not an error — we say so and link to the
  // resource itself (the annotation's seeAlso links are rendered above).
  if (!validation.valid) {
    if (isValidUrl(body.id)) {
      return (
        <Box sx={{ my: 1 }}>
          <Alert severity="warning" sx={{ py: 0.5 }}>
            <Typography variant="body2">
              Format not supported for plotting{body.format ? ` (${body.format})` : ''}.{' '}
              <Link component="button" type="button" onClick={handleOpenResource} title={body.id}>
                Open resource
              </Link>
              {rawLink && <> {rawLink}</>}
            </Typography>
          </Alert>
        </Box>
      );
    }
    return (
      <Box sx={{ my: 1 }}>
        <Alert severity="warning" sx={{ py: 0.5 }}>
          <Typography variant="body2">
            {validation.error || 'Invalid dataset configuration'}
          </Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ my: 1 }}>
      {/* Header with load button or expand toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        {status === 'idle' && (
          <Button
            variant="outlined"
            size="small"
            onClick={handleFetch}
            startIcon={<ShowChartIcon />}
            sx={{ textTransform: 'none' }}
          >
            Load {displayLabel}
          </Button>
        )}

        {status === 'loading' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Loading spectrum…
            </Typography>
          </Box>
        )}

        {status === 'error' && (authRequired ? (
          // Protected, not broken: a sealed record with one path forward (Sign in).
          <ProtectedDatasetNotice
            label={displayLabel}
            format={body.format}
            host={host}
            resourceUrl={body.id}
            onSignIn={canSignIn ? handleSignIn : undefined}
            onOpenResource={handleOpenResource}
            busy={signingIn}
            onRetry={handleRetry}
          />
        ) : (
          // Genuinely broken (404 / network / parse): the loud error + Retry.
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Alert
              severity="error"
              sx={{ py: 0, flexGrow: 1 }}
              action={
                <IconButton size="small" onClick={handleRetry} aria-label="Retry">
                  <RefreshIcon fontSize="small" />
                </IconButton>
              }
            >
              <Typography variant="body2">{error || 'Error'}</Typography>
            </Alert>
          </Box>
        ))}

        {status === 'success' && data && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
            <Button
              variant="text"
              size="small"
              onClick={toggleExpanded}
              startIcon={<ShowChartIcon />}
              endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{ textTransform: 'none', justifyContent: 'flex-start', textAlign: 'left' }}
            >
              {displayLabel} ({data.points.length} points)
            </Button>
            {rawLink && <Box sx={{ pl: 1 }}>{rawLink}</Box>}
          </Box>
        )}

        {status !== 'success' && rawLink}
      </Box>

      {/* Collapsible plot area */}
      <Collapse in={expanded && status === 'success' && data !== null}>
        {data && (
          <Box sx={{ mt: 1, width: '100%' }}>
            <SpectrumPlot
              data={data}
              enableExpand
              onDownloadSource={handleOpenResource}
              labels={plotLabels}
            />
            {data.readingIgnored && (
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                Plotted as published: this dataset declares a correction this viewer cannot apply.
              </Typography>
            )}
          </Box>
        )}
      </Collapse>
    </Box>
  );
};

export default DatasetBody;
