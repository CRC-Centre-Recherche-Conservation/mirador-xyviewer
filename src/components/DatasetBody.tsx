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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  Alert,
  Collapse,
  IconButton,
} from '@mui/material';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import type { DatasetBody as DatasetBodyType, LocalizedString } from '../types/iiif';
import type { SpectrumData, FetchStatus } from '../types/dataset';
import { fetchDataset, abortFetch, validateDatasetUrl } from '../services/datasetFetcher';
import { datasetCache } from '../services/datasetCache';
import { getLocalizedString } from '../utils/localization';
import { SpectrumPlot } from './SpectrumPlot';

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
}

export const DatasetBody: React.FC<DatasetBodyProps> = ({
  body,
  annotationLabel,
  isActive = false,
  onDataLoaded,
}) => {
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [data, setData] = useState<SpectrumData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const mountedRef = useRef(true);
  const urlRef = useRef(body.id);

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

    const result = await fetchDataset(body.id, body.format, displayLabel);

    if (!mountedRef.current) return;

    if (result.status === 'success' && result.data) {
      setData(result.data);
      setStatus('success');
      setExpanded(true);
      onDataLoaded?.(body.id, result.data);
    } else {
      setError(result.error || 'Failed to load dataset');
      setStatus('error');
    }
  }, [body.id, body.format, displayLabel, validation, onDataLoaded]);

  const handleRetry = useCallback(() => {
    datasetCache.delete(body.id);
    handleFetch();
  }, [body.id, handleFetch]);

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  // Render validation error
  if (!validation.valid) {
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

        {status === 'error' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Alert
              severity="error"
              sx={{ py: 0, flexGrow: 1 }}
              action={
                <IconButton size="small" onClick={handleRetry}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              }
            >
              <Typography variant="body2">{error || 'Error'}</Typography>
            </Alert>
          </Box>
        )}

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
            <SpectrumPlot data={data} />
          </Box>
        )}
      </Collapse>
    </Box>
  );
};

export default DatasetBody;
