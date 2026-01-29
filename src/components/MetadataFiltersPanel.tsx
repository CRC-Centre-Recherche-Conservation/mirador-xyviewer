/**
 * MetadataFiltersPanel
 * Panel component for filtering annotations by metadata
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  IconButton,
  Collapse,
  Chip,
  Tooltip,
  Divider,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FilterListIcon from '@mui/icons-material/FilterList';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CloseIcon from '@mui/icons-material/Close';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { filtersStore, type FilterGroup, type FilterValue } from '../state/filtersStore';

interface MetadataFiltersPanelProps {
  /** Window ID */
  windowId: string;
  /** Canvas ID */
  canvasId: string;
  /** Callback when filters change */
  onFiltersChange?: (hiddenAnnotationIds: Set<string>) => void;
  /** Callback to close the panel */
  onClose?: () => void;
  /** Annotations with metadata */
  annotations: Array<{
    id: string;
    metadata?: Array<{
      label: { [lang: string]: string[] };
      value: { [lang: string]: string[] };
    }>;
  }>;
  /** Embedded mode - no header/footer (used when inside a window) */
  embedded?: boolean;
}

/**
 * Single filter value checkbox
 */
const FilterValueItem: React.FC<{
  value: FilterValue;
  labelKey: string;
  windowId: string;
  canvasId: string;
  onChange: () => void;
}> = ({ value, labelKey, windowId, canvasId, onChange }) => {
  const handleChange = useCallback(() => {
    filtersStore.toggleValue(windowId, canvasId, labelKey, value.raw.toLowerCase().trim().replace(/\s+/g, '_'));
    onChange();
  }, [windowId, canvasId, labelKey, value.raw, onChange]);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        py: 0.25,
        px: 1,
        '&:hover': {
          bgcolor: 'action.hover',
        },
      }}
    >
      <FormControlLabel
        control={
          <Checkbox
            checked={value.selected}
            onChange={handleChange}
            size="small"
            sx={{ py: 0.25 }}
          />
        }
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
              {value.displayText}
            </Typography>
            <Chip
              label={value.visibleCount !== value.count ? `${value.visibleCount}/${value.count}` : value.count}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.7rem',
                bgcolor: value.selected
                  ? (value.visibleCount === 0 ? 'action.disabledBackground' : 'primary.light')
                  : 'action.disabledBackground',
                color: value.selected
                  ? (value.visibleCount === 0 ? 'text.secondary' : 'primary.contrastText')
                  : 'text.secondary',
              }}
            />
          </Box>
        }
        sx={{ m: 0, flex: 1 }}
      />
    </Box>
  );
};

/**
 * Filter group with collapsible values
 */
const FilterGroupItem: React.FC<{
  group: FilterGroup;
  windowId: string;
  canvasId: string;
  onChange: () => void;
}> = ({ group, windowId, canvasId, onChange }) => {
  const [expanded, setExpanded] = useState(group.expanded);

  const handleToggleExpand = useCallback(() => {
    setExpanded(prev => !prev);
    filtersStore.toggleGroupExpanded(windowId, canvasId, group.key);
  }, [windowId, canvasId, group.key]);

  const handleSelectAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    filtersStore.selectAll(windowId, canvasId, group.key);
    onChange();
  }, [windowId, canvasId, group.key, onChange]);

  const handleDeselectAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    filtersStore.deselectAll(windowId, canvasId, group.key);
    onChange();
  }, [windowId, canvasId, group.key, onChange]);

  // Count selected values
  const values = Array.from(group.values.values());
  const selectedCount = values.filter(v => v.selected).length;
  const totalCount = values.length;
  const allSelected = selectedCount === totalCount;
  const noneSelected = selectedCount === 0;

  return (
    <Box sx={{ mb: 1 }}>
      {/* Group header */}
      <Box
        onClick={handleToggleExpand}
        sx={{
          display: 'flex',
          alignItems: 'center',
          py: 0.75,
          px: 1,
          cursor: 'pointer',
          bgcolor: 'action.hover',
          borderRadius: 1,
          '&:hover': {
            bgcolor: 'action.selected',
          },
        }}
      >
        <IconButton size="small" sx={{ mr: 0.5, p: 0.25 }}>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
        <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600 }}>
          {group.label}
        </Typography>
        <Chip
          label={`${selectedCount}/${totalCount}`}
          size="small"
          sx={{
            height: 20,
            fontSize: '0.75rem',
            mr: 0.5,
            bgcolor: allSelected ? 'success.light' : noneSelected ? 'error.light' : 'warning.light',
            color: 'white',
          }}
        />
        <Tooltip title="Select all">
          <IconButton
            size="small"
            onClick={handleSelectAll}
            sx={{ p: 0.25 }}
            disabled={allSelected}
          >
            <CheckBoxIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Deselect all">
          <IconButton
            size="small"
            onClick={handleDeselectAll}
            sx={{ p: 0.25 }}
            disabled={noneSelected}
          >
            <CheckBoxOutlineBlankIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Group values */}
      <Collapse in={expanded}>
        <Box sx={{ pl: 2, borderLeft: '2px solid', borderColor: 'divider', ml: 1.5, mt: 0.5 }}>
          {values
            .sort((a, b) => {
              // "None" always at the end
              if (a.raw === '__none__') return 1;
              if (b.raw === '__none__') return -1;
              // Sort by count descending
              return b.count - a.count;
            })
            .map((value, index) => (
              <FilterValueItem
                key={`${group.key}-${index}`}
                value={value}
                labelKey={group.key}
                windowId={windowId}
                canvasId={canvasId}
                onChange={onChange}
              />
            ))}
        </Box>
      </Collapse>
    </Box>
  );
};

/**
 * Main filter panel component
 */
export const MetadataFiltersPanel: React.FC<MetadataFiltersPanelProps> = ({
  windowId,
  canvasId,
  annotations,
  onFiltersChange,
  onClose,
  embedded = false,
}) => {
  const [groups, setGroups] = useState<FilterGroup[]>([]);
  const [, forceUpdate] = useState({});

  // Load current filter state (initialization is handled by the plugin)
  useEffect(() => {
    setGroups(filtersStore.getGroups(windowId, canvasId));
  }, [windowId, canvasId, annotations]);

  // Handle filter changes
  const handleFiltersChange = useCallback(() => {
    const hiddenIds = filtersStore.updateHiddenAnnotations(windowId, canvasId, annotations);
    setGroups(filtersStore.getGroups(windowId, canvasId));
    forceUpdate({});
    onFiltersChange?.(hiddenIds);
  }, [windowId, canvasId, annotations, onFiltersChange]);

  // Handle reset all filters
  const handleResetAll = useCallback(() => {
    filtersStore.resetAll(windowId, canvasId);
    setGroups(filtersStore.getGroups(windowId, canvasId));
    forceUpdate({});
    onFiltersChange?.(new Set());
  }, [windowId, canvasId, onFiltersChange]);

  // Subscribe to store changes
  useEffect(() => {
    const unsubscribe = filtersStore.subscribe((event) => {
      if (event.windowId === windowId && event.canvasId === canvasId) {
        setGroups(filtersStore.getGroups(windowId, canvasId));
      }
    });
    return unsubscribe;
  }, [windowId, canvasId]);

  const hasFilters = filtersStore.hasActiveFilters(windowId, canvasId);
  const hiddenCount = filtersStore.getHiddenAnnotationIds(windowId, canvasId).size;

  if (groups.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No metadata available for filtering
        </Typography>
      </Box>
    );
  }

  // Embedded mode - simplified layout without header/footer (used inside a window)
  if (embedded) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          bgcolor: 'background.paper',
        }}
      >
        {/* Filter groups */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            p: 1.5,
          }}
        >
          {groups
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((group) => (
              <FilterGroupItem
                key={group.key}
                group={group}
                windowId={windowId}
                canvasId={canvasId}
                onChange={handleFiltersChange}
              />
            ))}
        </Box>

        {/* Footer with stats */}
        <Divider />
        <Box sx={{ p: 1, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary">
            {annotations.length} annotations | {groups.length} filter groups
            {hasFilters && ` | ${hiddenCount} hidden`}
          </Typography>
        </Box>
      </Box>
    );
  }

  // Standalone mode - full panel with header
  return (
    <Box
      sx={{
        width: 320,
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderRadius: 1,
        boxShadow: 3,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          p: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
        }}
      >
        <FilterListIcon sx={{ mr: 1 }} />
        <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600 }}>
          Filters
        </Typography>
        {hasFilters && (
          <Chip
            label={`${hiddenCount} hidden`}
            size="small"
            sx={{
              mr: 1,
              bgcolor: 'warning.main',
              color: 'warning.contrastText',
            }}
          />
        )}
        {hasFilters && (
          <Tooltip title="Reset all filters">
            <IconButton size="small" onClick={handleResetAll} sx={{ color: 'inherit', mr: 0.5 }}>
              <RestartAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {onClose && (
          <IconButton size="small" onClick={onClose} sx={{ color: 'inherit' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Filter groups */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 1.5,
        }}
      >
        {groups
          .sort((a, b) => a.label.localeCompare(b.label)) // Sort alphabetically
          .map((group) => (
            <FilterGroupItem
              key={group.key}
              group={group}
              windowId={windowId}
              canvasId={canvasId}
              onChange={handleFiltersChange}
            />
          ))}
      </Box>

      {/* Footer with stats */}
      <Divider />
      <Box sx={{ p: 1, bgcolor: 'action.hover' }}>
        <Typography variant="caption" color="text.secondary">
          {annotations.length} annotations | {groups.length} filter groups
          {hasFilters && ` | ${hiddenCount} hidden`}
        </Typography>
      </Box>
    </Box>
  );
};

export default MetadataFiltersPanel;
