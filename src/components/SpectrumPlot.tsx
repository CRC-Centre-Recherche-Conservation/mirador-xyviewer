/**
 * SpectrumPlot Component
 * Renders spectrum data using Plotly with support for multiple Y series
 */

import React, { useMemo, useCallback } from 'react';
import Plot from 'react-plotly.js';
import { Box, IconButton, Tooltip } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import type { SpectrumData, PlotlyTrace } from '../types/dataset';

/** Color palette for multiple series */
const SERIES_COLORS = [
  '#1976d2', // blue
  '#d32f2f', // red
  '#388e3c', // green
  '#f57c00', // orange
  '#7b1fa2', // purple
  '#0097a7', // cyan
  '#c2185b', // pink
  '#5d4037', // brown
  '#455a64', // blue-grey
  '#fbc02d', // yellow
];

export interface SpectrumPlotProps {
  /** Spectrum data to plot */
  data: SpectrumData;
  /** Whether the plot trace is visible */
  visible?: boolean;
  /** Callback to toggle visibility */
  onVisibilityToggle?: () => void;
  /** Plot height in pixels */
  height?: number;
  /** Custom trace color (used only for single series) */
  color?: string;
}

export const SpectrumPlot: React.FC<SpectrumPlotProps> = ({
  data,
  visible = true,
  onVisibilityToggle,
  height = 250,
  color,
}) => {
  // Build Plotly traces - one per Y series
  const traces: PlotlyTrace[] = useMemo(() => {
    // Use new multi-series format if available
    if (data.series && data.series.length > 0 && data.xValues) {
      return data.series.map((series, idx) => ({
        x: data.xValues,
        y: series.yValues,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: series.label,
        visible: visible,
        line: {
          color: data.series.length === 1
            ? (color || SERIES_COLORS[0])
            : SERIES_COLORS[idx % SERIES_COLORS.length],
          width: 1.5,
        },
      }));
    }

    // Fallback to legacy single-series format
    return [{
      x: data.points.map(p => p.x),
      y: data.points.map(p => p.y),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: data.label,
      visible: visible,
      line: {
        color: color || SERIES_COLORS[0],
        width: 1.5,
      },
    }];
  }, [data, visible, color]);

  // Determine if we should show legend (only for multiple series)
  const showLegend = traces.length > 1;

  // Build Plotly layout - minimize margins to maximize plot area
  const layout = useMemo(() => ({
    xaxis: {
      title: data.xLabel || 'X',
      autorange: true,
      automargin: true,
    },
    yaxis: {
      title: data.series?.length === 1 ? data.series[0].label : (data.yLabel || 'Y'),
      autorange: true,
      automargin: true,
    },
    showlegend: showLegend,
    legend: showLegend ? {
      x: 0.01,
      y: 0.99,
      xanchor: 'left' as const,
      yanchor: 'top' as const,
      bgcolor: 'rgba(255,255,255,0.8)',
      bordercolor: 'rgba(0,0,0,0.1)',
      borderwidth: 1,
    } : undefined,
    autosize: true,
    margin: {
      l: 40,
      r: 10,
      t: 10,
      b: 35,
      pad: 0,
    },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'rgba(0,0,0,0.02)',
  }), [data.xLabel, data.yLabel, data.series, showLegend]);

  // Plotly config
  const config = useMemo(() => ({
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: [
      'select2d',
      'lasso2d',
      'autoScale2d',
    ] as ('select2d' | 'lasso2d' | 'autoScale2d')[],
  }), []);

  const handleVisibilityClick = useCallback(() => {
    onVisibilityToggle?.();
  }, [onVisibilityToggle]);

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      {/* Visibility toggle */}
      {onVisibilityToggle && (
        <Tooltip title={visible ? 'Hide trace' : 'Show trace'}>
          <IconButton
            size="small"
            onClick={handleVisibilityClick}
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              zIndex: 1,
              bgcolor: 'background.paper',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            {visible ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      )}

      {/* Plotly chart - fills container width */}
      <Plot
        data={traces}
        layout={layout}
        config={config}
        style={{ width: '100%', height }}
        useResizeHandler
      />
    </Box>
  );
};

export default SpectrumPlot;
