/**
 * SpectrumPlot Component
 * Renders spectrum data using Plotly with support for multiple Y series
 */

import React, { useMemo, useState, useEffect, useCallback, useId } from 'react';
import Plot from 'react-plotly.js';
import {
  Box,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { SpectrumData, PlotlyTrace } from '../types/dataset';

// Material "open in full" icon path, Y-flipped for Plotly's modebar coord system.
const EXPAND_ICON = {
  width: 24,
  height: 24,
  path: 'M21 11V3h-8l3.29 3.29-10 10L3 13v8h8l-3.29-3.29 10-10z',
  transform: 'matrix(1 0 0 -1 0 24)',
};

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
  /** Plot height in pixels */
  height?: number;
  /** Custom trace color (used only for single series) */
  color?: string;
  /** Show the "expand to modal" button overlay (default: false; opt-in to avoid nesting Dialogs in unaware consumers) */
  enableExpand?: boolean;
}

export const SpectrumPlot: React.FC<SpectrumPlotProps> = ({
  data,
  height = 250,
  color,
  enableExpand = false,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContentEl, setModalContentEl] = useState<HTMLDivElement | null>(null);
  const [modalPlotHeight, setModalPlotHeight] = useState<number>(500);
  const dialogTitleId = useId();

  const handleOpen = useCallback(() => setModalOpen(true), []);
  const handleClose = useCallback(() => setModalOpen(false), []);

  // Track modal content size so the plot fills the resizable Paper.
  // Callback ref via setState makes the effect re-run once the element mounts.
  useEffect(() => {
    if (!modalContentEl) return;

    const sync = () => {
      const h = modalContentEl.clientHeight;
      if (h > 0) setModalPlotHeight(h);
    };
    sync();

    const observer = new ResizeObserver(sync);
    observer.observe(modalContentEl);
    return () => observer.disconnect();
  }, [modalContentEl]);

  // Build Plotly traces - one per Y series
  const traces: PlotlyTrace[] = useMemo(() => {
    // Use new multi-series format if available
    if (data.series && data.series.length > 0 && data.xValues && data.xValues.length > 0) {
      return data.series.map((series, idx) => ({
        x: data.xValues,
        y: series.yValues,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: series.label,
        visible: true,
        line: {
          color: data.series.length === 1
            ? (color || SERIES_COLORS[0])
            : SERIES_COLORS[idx % SERIES_COLORS.length],
          width: 1.5,
        },
      }));
    }

    // Fallback to legacy single-series format
    const points = data.points ?? [];
    return [{
      x: points.map(p => p.x),
      y: points.map(p => p.y),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: data.label,
      visible: true,
      line: {
        color: color || SERIES_COLORS[0],
        width: 1.5,
      },
    }];
  }, [data, color]);

  // Determine if we should show legend (only for multiple series)
  const showLegend = traces.length > 1;

  // Build Plotly layout - minimize margins to maximize plot area
  const layout = useMemo(() => ({
    xaxis: {
      title: { text: data.xLabel || 'X' },
      autorange: true,
      automargin: true,
    },
    yaxis: {
      title: { text: data.series?.length === 1 ? data.series[0].label : (data.yLabel || 'Y') },
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

  // Base Plotly config — used as-is inside the modal.
  const baseConfig = useMemo(() => ({
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: [
      'select2d',
      'lasso2d',
      'autoScale2d',
    ] as ('select2d' | 'lasso2d' | 'autoScale2d')[],
  }), []);

  // Inline config adds the custom "expand" button to Plotly's modebar.
  const inlineConfig = useMemo(() => {
    if (!enableExpand) return baseConfig;
    return {
      ...baseConfig,
      modeBarButtonsToAdd: [
        {
          name: 'expandPlot',
          title: 'Open in larger view',
          icon: EXPAND_ICON,
          click: handleOpen,
        },
      ],
    };
  }, [baseConfig, enableExpand, handleOpen]);

  // Clone traces/layout for the modal Plot. react-plotly.js mutates these
  // references on user interaction (zoom, pan, legend toggle), and sharing
  // them with the inline Plot would leak interaction state between the two.
  // Re-cloning whenever the modal opens also ensures a fresh starting state.
  const modalTraces = useMemo(() => structuredClone(traces), [traces, modalOpen]);
  const modalLayout = useMemo(() => structuredClone(layout), [layout, modalOpen]);

  const dialogTitle = data.label || (data.series?.length === 1 ? data.series[0].label : 'Spectrum');

  return (
    <Box sx={{ width: '100%' }}>
      <Plot
        data={traces}
        layout={layout}
        config={inlineConfig}
        style={{ width: '100%', height }}
        useResizeHandler
      />

      {enableExpand && (
        <Dialog
          open={modalOpen}
          onClose={handleClose}
          maxWidth={false}
          aria-labelledby={dialogTitleId}
          slotProps={{
            paper: {
              sx: {
                resize: 'both',
                overflow: 'hidden',
                width: '80vw',
                height: '75vh',
                // Clamp the minimums to the viewport so Paper never exceeds the screen
                // (CSS min-* normally wins over max-*, which would push Paper off-screen
                // on narrow phones / short landscape windows).
                minWidth: 'min(480px, 98vw)',
                minHeight: 'min(360px, 95vh)',
                maxWidth: '98vw',
                maxHeight: '95vh',
                display: 'flex',
                flexDirection: 'column',
              },
            },
          }}
        >
          {/* Header row: heading + close button as siblings (not nested in <h2>). */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              pr: 1,
            }}
          >
            {/* flex:1 + minWidth:0 lets DialogTitle shrink so noWrap can ellipsize long labels. */}
            <DialogTitle id={dialogTitleId} sx={{ py: 1, px: 2, flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" component="span" noWrap sx={{ display: 'block' }}>
                {dialogTitle}
              </Typography>
            </DialogTitle>
            <IconButton size="small" onClick={handleClose} aria-label="close" sx={{ flexShrink: 0 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          <DialogContent
            dividers
            sx={{ p: 1, flex: 1, overflow: 'hidden' }}
          >
            <Box ref={setModalContentEl} sx={{ width: '100%', height: '100%' }}>
              <Plot
                data={modalTraces}
                layout={modalLayout}
                config={baseConfig}
                style={{ width: '100%', height: modalPlotHeight }}
                useResizeHandler
              />
            </Box>
          </DialogContent>
        </Dialog>
      )}
    </Box>
  );
};

export default SpectrumPlot;
