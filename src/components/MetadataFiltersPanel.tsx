/**
 * MetadataFiltersPanel
 * Panel component for filtering annotations by what they say (controlled terms of their
 * bodies) and by their metadata.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Switch,
  Button,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FilterListIcon from '@mui/icons-material/FilterList';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CloseIcon from '@mui/icons-material/Close';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import {
  filtersStore,
  NONE_KEY,
  type FilterableAnnotation,
  type FilterGroup,
  type FilterValue,
} from '../state/filtersStore';
import { fillTemplate, resolveLabels } from '../utils/annotationLabels';
import { FACET_PURPOSES } from '../utils/termFacets';
import type { AnnotationBodyLabels } from '../types/mirador';

/** Values shown before "Show N more". */
const COLLAPSED_VALUES = 8;

type PanelText = ReturnType<typeof resolveLabels>;

interface MetadataFiltersPanelProps {
  /** Window ID */
  windowId: string;
  /** Canvas ID */
  canvasId: string;
  /** Callback when filters change */
  onFiltersChange?: (hiddenAnnotationIds: Set<string>) => void;
  /** Callback to close the panel */
  onClose?: () => void;
  /** Annotations to filter: their metadata and bodies are the facets */
  annotations: FilterableAnnotation[];
  /** UI string overrides (`config.scientificAnnotations.labels`) */
  labels?: AnnotationBodyLabels;
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
  text: PanelText;
  /** `recomputed`: the store already refreshed what is hidden. */
  onChange: (recomputed?: boolean) => void;
}> = ({ value, labelKey, windowId, canvasId, text, onChange }) => {
  const handleChange = useCallback(() => {
    filtersStore.toggleFacet(windowId, canvasId, labelKey, value.key);
    onChange(true);
  }, [windowId, canvasId, labelKey, value.key, onChange]);

  const part = (visible: number, total: number) => (visible !== total ? `${visible}/${total}` : `${total}`);
  const counts =
    part(value.visibleCount, value.count) +
    (value.linkedCount > 0
      ? ` · ${fillTemplate(text.plusLinked, { n: part(value.visibleLinkedCount, value.linkedCount) })}`
      : '');
  const nothingVisible = value.visibleCount + value.visibleLinkedCount === 0;

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
              label={counts}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.7rem',
                bgcolor: value.selected
                  ? (nothingVisible ? 'action.disabledBackground' : 'primary.light')
                  : 'action.disabledBackground',
                color: value.selected
                  ? (nothingVisible ? 'text.secondary' : 'primary.contrastText')
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
  text: PanelText;
  onChange: (recomputed?: boolean) => void;
}> = ({ group, windowId, canvasId, text, onChange }) => {
  const [expanded, setExpanded] = useState(group.expanded);
  const [showAll, setShowAll] = useState(false);

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

  // "None" last, then by count. Deselected values stay visible so the active filter is readable.
  const sorted = [...values].sort((a, b) => {
    if (a.key === NONE_KEY) return 1;
    if (b.key === NONE_KEY) return -1;
    return b.count - a.count;
  });
  const folded = !showAll && sorted.length > COLLAPSED_VALUES;
  const shownValues = folded
    ? sorted.filter((v, i) => i < COLLAPSED_VALUES || !v.selected)
    : sorted;
  const hiddenValues = sorted.length - shownValues.length;

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
        <IconButton
          size="small"
          sx={{ mr: 0.5, p: 0.25 }}
          aria-label={fillTemplate(expanded ? text.collapseGroup : text.expandGroup, { name: group.label })}
        >
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
        <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600 }}>
          {group.label}
          {group.appliesTo > 0 && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, fontWeight: 400 }}>
              {group.appliesTo === 1 ? text.appliesToOne : fillTemplate(text.appliesTo, { n: group.appliesTo })}
              {group.appliesToLinked > 0 && ` (${fillTemplate(text.plusLinked, { n: group.appliesToLinked })})`}
            </Typography>
          )}
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
        <Tooltip title={fillTemplate(text.selectAllIn, { name: group.label })}>
          {/* span wrapper: a disabled button doesn't fire the events Tooltip needs. */}
          <span>
            <IconButton
              size="small"
              onClick={handleSelectAll}
              aria-label={fillTemplate(text.selectAllIn, { name: group.label })}
              sx={{ p: 0.25 }}
              disabled={allSelected}
            >
              <CheckBoxIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={fillTemplate(text.deselectAllIn, { name: group.label })}>
          <span>
            <IconButton
              size="small"
              onClick={handleDeselectAll}
              aria-label={fillTemplate(text.deselectAllIn, { name: group.label })}
              sx={{ p: 0.25 }}
              disabled={noneSelected}
            >
              <CheckBoxOutlineBlankIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Group values */}
      <Collapse in={expanded}>
        <Box sx={{ pl: 2, borderLeft: '2px solid', borderColor: 'divider', ml: 1.5, mt: 0.5 }}>
          {shownValues.map((value) => (
            <FilterValueItem
              key={`${group.key}-${value.key}`}
              value={value}
              labelKey={group.key}
              windowId={windowId}
              canvasId={canvasId}
              text={text}
              onChange={onChange}
            />
          ))}
          {(folded || (showAll && sorted.length > COLLAPSED_VALUES)) && (
            <Button size="small" onClick={() => setShowAll((prev) => !prev)} sx={{ textTransform: 'none', ml: 0.5 }}>
              {folded ? fillTemplate(text.showMore, { n: hiddenValues }) : text.showFewer}
            </Button>
          )}
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
  labels,
  onFiltersChange,
  onClose,
  embedded = false,
}) => {
  const text = useMemo(() => resolveLabels(labels), [labels]);
  const [groups, setGroups] = useState<FilterGroup[]>([]);
  const [, forceUpdate] = useState({});

  // Load current filter state (initialization is handled by the plugin)
  useEffect(() => {
    setGroups(filtersStore.getGroups(windowId, canvasId));
  }, [windowId, canvasId, annotations]);

  // Handle filter changes
  const handleFiltersChange = useCallback((recomputed?: boolean) => {
    const hiddenIds = recomputed
      ? filtersStore.getHiddenAnnotationIds(windowId, canvasId)
      : filtersStore.updateHiddenAnnotations(windowId, canvasId, annotations);
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

  const handleInheritChange = useCallback(
    (_e: React.ChangeEvent<HTMLInputElement>, on: boolean) => {
      const hiddenIds = filtersStore.setInheritLinked(windowId, canvasId, on);
      setGroups(filtersStore.getGroups(windowId, canvasId));
      onFiltersChange?.(hiddenIds);
    },
    [windowId, canvasId, onFiltersChange]
  );

  const hasFilters = filtersStore.hasActiveFilters(windowId, canvasId);
  const hiddenCount = filtersStore.getHiddenAnnotationIds(windowId, canvasId).size;
  const stats = filtersStore.getStats(windowId, canvasId);

  // Terms of the bodies first (in the order of the cards), then the metadata.
  const contentGroups = groups
    .filter((g) => g.kind === 'body')
    .sort((a, b) => FACET_PURPOSES.indexOf(a.purpose!) - FACET_PURPOSES.indexOf(b.purpose!) || a.label.localeCompare(b.label));
  const metadataGroups = groups.filter((g) => g.kind === 'metadata').sort((a, b) => a.label.localeCompare(b.label));
  const showHeadings = contentGroups.length > 0 && metadataGroups.length > 0;
  const renderGroups = (list: FilterGroup[]) =>
    list.map((group) => (
      <FilterGroupItem
        key={group.key}
        group={group}
        windowId={windowId}
        canvasId={canvasId}
        text={text}
        onChange={handleFiltersChange}
      />
    ));
  const heading = (title: string) => (
    <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mt: 0.5, lineHeight: 2 }}>
      {title}
    </Typography>
  );

  const filterBody = (
    <>
      {groups.some((g) => g.inherits) && (
        <Box sx={{ mb: 1 }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={filtersStore.getInheritLinked(windowId, canvasId)}
                onChange={handleInheritChange}
              />
            }
            label={<Typography variant="body2">{text.applyToLinked}</Typography>}
          />
          {hasFilters && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 1 }}>
              {fillTemplate(text.shownOf, { shown: stats.filterable - stats.hidden, total: stats.filterable })}
            </Typography>
          )}
        </Box>
      )}
      {contentGroups.length > 0 && (
        <>
          {showHeadings && heading(text.filtersFromContent)}
          {renderGroups(contentGroups)}
        </>
      )}
      {metadataGroups.length > 0 && (
        <>
          {showHeadings && heading(text.filtersFromMetadata)}
          {renderGroups(metadataGroups)}
        </>
      )}
    </>
  );

  if (groups.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {text.filtersEmpty}
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
          {filterBody}
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
        {filterBody}
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
