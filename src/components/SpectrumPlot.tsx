/**
 * SpectrumPlot Component
 * Renders spectrum data using Plotly
 */

import React, { useMemo, useCallback } from 'react';
import Plot from 'react-plotly.js';
import { Box, IconButton, Tooltip } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import type { SpectrumData, PlotlyTrace, PlotlyLayout } from '../types/dataset';

export interface SpectrumPlotProps {
  /** Spectrum data to plot */
  data: SpectrumData;
  /** Whether the plot trace is visible */
  visible?: boolean;
  /** Callback to toggle visibility */
  onVisibilityToggle?: () => void;
  /** Plot height in pixels */
  height?: number;
  /** Custom trace color */
  color?: string;
}

export const SpectrumPlot: React.FC<SpectrumPlotProps> = ({
  data,
  visible = true,
  onVisibilityToggle,
  height = 250,
  color = '#1976d2',
}) => {
  // Build Plotly trace
  const trace: PlotlyTrace = useMemo(() => ({
    x: data.points.map(p => p.x),
    y: data.points.map(p => p.y),
    type: 'scatter',
    mode: 'lines',
    name: data.label,
    visible: visible,
    line: {
      color,
      width: 1.5,
    },
  }), [data, visible, color]);

  // Build Plotly layout
  const layout: PlotlyLayout = useMemo(() => ({
    xaxis: {
      title: data.xLabel || 'X',
      autorange: true,
    },
    yaxis: {
      title: data.yLabel || 'Y',
      autorange: true,
    },
    showlegend: false,
    autosize: true,
    margin: {
      l: 50,
      r: 20,
      t: 20,
      b: 40,
    },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'rgba(0,0,0,0.02)',
  }), [data.xLabel, data.yLabel]);

  // Plotly config
  const config = useMemo(() => ({
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: [
      'select2d',
      'lasso2d',
      'autoScale2d',
    ] as const,
  }), []);

  const handleVisibilityClick = useCallback(() => {
    onVisibilityToggle?.();
  }, [onVisibilityToggle]);

  return (
    <Box sx={{ position: 'relative' }}>
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

      {/* Plotly chart */}
      <Plot
        data={[trace]}
        layout={layout}
        config={config}
        style={{ width: '100%', height }}
        useResizeHandler
      />
    </Box>
  );
};

export default SpectrumPlot;
