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
import { fetchDataset, abortFetch, validateDatasetUrl } from '../services/datasetFetcher';
import { datasetCache } from '../services/datasetCache';
import { isValidUrl } from '../utils/security';
import { getLocalizedString } from '../utils/localization';
import { SpectrumPlot } from './SpectrumPlot';

/** Handler invoked when an auth-protected dataset needs the user to sign in. */
export type DatasetAuthHandler = (body: DatasetBodyType) => void | Promise<void>;

/** Global sign-in handler, used by any DatasetBody without an `onAuthRequired` prop. */
let registeredAuthHandler: DatasetAuthHandler | undefined;

/**
 * Register a global sign-in handler for auth-protected datasets. Use this with the
 * Mirador plugin, where the host can't pass props to the internally-rendered panel;
 * the per-component `onAuthRequired` prop overrides it. Pass `undefined` to reset.
 */
export function configureDatasetAuth(handler: DatasetAuthHandler | undefined): void {
  registeredAuthHandler = handler;
}

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

interface ProtectedDatasetNoticeProps {
  label: string;
  format?: string;
  host?: string;
  resourceUrl: string;
  /** Present only when a sign-in handler is wired; absent → no Sign in action. */
  onSignIn?: () => void;
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
  onRetry,
}) => {
  const message = onSignIn
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
            endIcon={<OpenInNewIcon fontSize="small" />}
            onClick={onSignIn}
            sx={{ textTransform: 'none' }}
          >
            Sign in
          </Button>
        )}
        <Link
          href={resourceUrl}
          target="_blank"
          rel="noopener noreferrer"
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

  const mountedRef = useRef(true);
  const urlRef = useRef(body.id);

  // Per-component prop wins over a global handler registered via configureDatasetAuth.
  const authHandler = onAuthRequired ?? registeredAuthHandler;

  // Host to authenticate against, surfaced in the protected-dataset notice.
  const host = useMemo(() => safeHost(body.id), [body.id]);

  // Get display label
  const displayLabel = getLocalizedString(body.label) ||
    getLocalizedString(annotationLabel) ||
    'Spectrum Data';

  // Validate URL on mount
  const validation = validateDatasetUrl(body.id, body.format);

  // Check cache on mount
  useEffect(() => {
    const cached = datasetCache.get(body.id);
    if (cached) {
      setData(cached);
      setStatus('success');
    }
  }, [body.id]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    urlRef.current = body.id;

    return () => {
      mountedRef.current = false;
      abortFetch(urlRef.current);
    };
  }, [body.id]);

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

    const result = await fetchDataset(body.id, body.format, displayLabel, requestOptions, {
      service: body.service,
    });

    if (!mountedRef.current) return;

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
  }, [body.id, body.format, body.service, displayLabel, validation, onDataLoaded, requestOptions]);

  const handleRetry = useCallback(() => {
    datasetCache.delete(body.id);
    handleFetch();
  }, [body.id, handleFetch]);

  // Sign-in affordance for auth-protected datasets. The host runs the login flow;
  // if it returns a Promise we re-fetch once it resolves (login window closed),
  // otherwise the user re-triggers with Retry after signing in.
  const handleSignIn = useCallback(async () => {
    if (!authHandler) return;
    const maybePromise = authHandler(body);
    if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
      await maybePromise;
      if (!mountedRef.current) return;
      datasetCache.delete(body.id);
      handleFetch();
    }
  }, [authHandler, body, handleFetch]);

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

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
              <Link href={body.id} target="_blank" rel="noopener noreferrer">
                Open resource
              </Link>
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
              Loading spectrum...
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
            onSignIn={authHandler ? handleSignIn : undefined}
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
            <Button
              variant="text"
              size="small"
              onClick={toggleExpanded}
              startIcon={<ShowChartIcon />}
              endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{ textTransform: 'none', flexGrow: 1, justifyContent: 'flex-start' }}
            >
              {displayLabel} ({data.points.length} points)
            </Button>
          </Box>
        )}
      </Box>

      {/* Collapsible plot area */}
      <Collapse in={expanded && status === 'success' && data !== null}>
        {data && (
          <Box sx={{ mt: 1, width: '100%' }}>
            <SpectrumPlot data={data} enableExpand />
          </Box>
        )}
      </Collapse>
    </Box>
  );
};

export default DatasetBody;
