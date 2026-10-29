/**
 * MetadataFiltersPanel
 * Panel component for filtering annotations by what they say (controlled terms of their
 * bodies) and by their metadata.
 */

import React, { useState, useEffect, useCallback, useMemo, useId } from 'react';
import {
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  IconButton,
  ButtonBase,
  Collapse,
  Chip,
  Tooltip,
  Divider,
  Button,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterListIcon from '@mui/icons-material/FilterList';
import CloseIcon from '@mui/icons-material/Close';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import {
  filtersStore,
  NONE_KEY,
  COLLAPSED_VALUES,
  type FilterableAnnotation,
  type FilterGroup,
  type FilterValue,
} from '../state/filtersStore';
import { fillTemplate, resolveLabels } from '../utils/annotationLabels';
import { FACET_PURPOSES } from '../utils/termFacets';
import type { AnnotationBodyLabels } from '../types/mirador';

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

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
 * One value: checkbox, label, "Only" shortcut and the number of annotations kept by it.
 */
const FilterValueItem: React.FC<{
  value: FilterValue;
  labelKey: string;
  windowId: string;
  canvasId: string;
  text: PanelText;
  /** Whether "Only" does something (the group has several values). */
  canOnly: boolean;
  /** `recomputed`: the store already refreshed what is hidden. */
  onChange: (recomputed?: boolean) => void;
}> = ({ value, labelKey, windowId, canvasId, text, canOnly, onChange }) => {
  const handleChange = useCallback(() => {
    filtersStore.toggleFacet(windowId, canvasId, labelKey, value.key);
    onChange(true);
  }, [windowId, canvasId, labelKey, value.key, onChange]);

  const handleOnly = useCallback(() => {
    filtersStore.toggleFacet(windowId, canvasId, labelKey, value.key, 'only');
    onChange(true);
  }, [windowId, canvasId, labelKey, value.key, onChange]);

  // One number: annotations kept by the value (carrying it + cited by them); "visible/total" under a filter.
  const total = value.count + value.linkedCount;
  const visible = value.visibleCount + value.visibleLinkedCount;
  const isNone = value.key === NONE_KEY;
  const countText = visible !== total ? `${visible}/${total}` : `${total}`;
  const accessibleCount =
    (total === 1 ? text.valueCountOne : fillTemplate(text.valueCount, { n: total })) +
    (visible !== total ? `, ${fillTemplate(text.valueCountVisible, { visible, n: total })}` : '');
  const countTitle =
    value.linkedCount > 0
      ? fillTemplate(text.valueCountLinked, { own: value.count, linked: value.linkedCount })
      : '';
  const countLabel = total === 1 ? text.valueCountOne : fillTemplate(text.valueCount, { n: total });
  const dimmed = visible === 0;

  const label = (
    <Typography
      variant="body2"
      noWrap
      sx={{
        fontSize: '0.85rem',
        fontStyle: isNone ? 'italic' : 'normal',
        color: isNone || dimmed ? (dimmed ? 'text.disabled' : 'text.secondary') : 'text.primary',
      }}
    >
      {value.displayText}
    </Typography>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        py: 0.25,
        px: 1,
        minWidth: 0,
        '&:hover': { bgcolor: 'action.hover' },
        '&:hover .filter-only, &:focus-within .filter-only': { opacity: 1 },
      }}
    >
      <FormControlLabel
        control={<Checkbox checked={value.selected} onChange={handleChange} size="small" sx={{ py: 0.25 }} />}
        label={
          <Tooltip describeChild title={isNone ? text.noneHint : value.displayText} placement="top-start" enterDelay={600}>
            {label}
          </Tooltip>
        }
        sx={{ m: 0, flex: 1, minWidth: 0, '& .MuiFormControlLabel-label': { minWidth: 0 } }}
      />
      {canOnly && (
        <Button
          className="filter-only"
          size="small"
          onClick={handleOnly}
          aria-label={fillTemplate(text.onlyTerm, { term: value.displayText })}
          sx={{
            textTransform: 'none',
            minWidth: 0,
            py: 0,
            px: 0.75,
            fontSize: '0.75rem',
            opacity: 0,
            '&:focus-visible': { opacity: 1 },
            '@media (hover: none)': { opacity: 1 },
          }}
        >
          {text.only}
        </Button>
      )}
      <Tooltip describeChild title={countTitle ? `${countLabel}: ${countTitle}` : ''} disableHoverListener={!countTitle}>
        <Typography
          component="span"
          variant="caption"
          sx={{ minWidth: 32, textAlign: 'right', ml: 0.5, color: dimmed ? 'text.disabled' : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
        >
          <span aria-hidden="true">{countText}</span>
          <Box component="span" sx={visuallyHidden}>{accessibleCount}</Box>
        </Typography>
      </Tooltip>
    </Box>
  );
};

/**
 * Filter group: master checkbox, collapsible values
 */
const FilterGroupItem: React.FC<{
  group: FilterGroup;
  windowId: string;
  canvasId: string;
  text: PanelText;
  onChange: (recomputed?: boolean) => void;
}> = ({ group, windowId, canvasId, text, onChange }) => {
  const expanded = group.expanded;
  const [showAll, setShowAll] = useState(false);
  const panelId = `filter-group-${useId()}`;

  const handleToggleExpand = useCallback(() => {
    filtersStore.toggleGroupExpanded(windowId, canvasId, group.key);
  }, [windowId, canvasId, group.key]);

  const values = Array.from(group.values.values());
  const selectedCount = values.filter(v => v.selected).length;
  const totalCount = values.length;
  const allSelected = selectedCount === totalCount;
  const noneSelected = selectedCount === 0;

  const handleMaster = useCallback(() => {
    if (allSelected) filtersStore.deselectAll(windowId, canvasId, group.key);
    else filtersStore.selectAll(windowId, canvasId, group.key);
    onChange();
  }, [allSelected, windowId, canvasId, group.key, onChange]);

  // "Not specified" last, then by count. Deselected values stay visible so the active filter is readable.
  const sorted = [...values].sort((a, b) => {
    if (a.key === NONE_KEY) return 1;
    if (b.key === NONE_KEY) return -1;
    return b.count + b.linkedCount - (a.count + a.linkedCount);
  });
  const folded = !showAll && sorted.length > COLLAPSED_VALUES;
  const shownValues = folded
    ? sorted.filter((v, i) => i < COLLAPSED_VALUES || !v.selected)
    : sorted;
  const hiddenValues = sorted.length - shownValues.length;

  return (
    <Box sx={{ mb: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}>
        <Checkbox
          size="small"
          checked={allSelected}
          indeterminate={!allSelected && !noneSelected}
          onChange={handleMaster}
          onClick={(e) => e.stopPropagation()}
          slotProps={{ input: { 'aria-label': fillTemplate(text.allValuesIn, { name: group.label }) } }}
          sx={{ py: 0.5 }}
        />
        <ButtonBase
          onClick={handleToggleExpand}
          aria-expanded={expanded}
          aria-label={fillTemplate(expanded ? text.collapseGroup : text.expandGroup, { name: group.label })}
          aria-controls={panelId}
          sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', py: 0.5, pr: 0.5, textAlign: 'left', borderRadius: 1 }}
        >
          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600, minWidth: 0 }}>
            {group.label}
          </Typography>
          {!allSelected && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, flexShrink: 0 }}>
              {fillTemplate(text.selectedOf, { selected: selectedCount, total: totalCount })}
            </Typography>
          )}
          <Box sx={{ flex: 1 }} />
          <ExpandMoreIcon
            fontSize="small"
            aria-hidden="true"
            sx={{ transition: 'transform 150ms', transform: expanded ? 'rotate(180deg)' : 'none', color: 'text.secondary' }}
          />
        </ButtonBase>
      </Box>

      <Collapse in={expanded} id={panelId}>
        <Box sx={{ pl: 2, ml: 1.5, mt: 0.25 }}>
          {shownValues.map((value) => (
            <React.Fragment key={`${group.key}-${value.key}`}>
              {value.key === NONE_KEY && shownValues.length > 1 && (
                <Divider sx={{ borderStyle: 'dotted', my: 0.25 }} />
              )}
              <FilterValueItem
                value={value}
                labelKey={group.key}
                windowId={windowId}
                canvasId={canvasId}
                text={text}
                canOnly={totalCount > 1}
                onChange={onChange}
              />
            </React.Fragment>
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

  const hasFilters = filtersStore.hasActiveFilters(windowId, canvasId);
  const hiddenCount = filtersStore.getHiddenAnnotationIds(windowId, canvasId).size;
  const stats = filtersStore.getStats(windowId, canvasId);

  // Terms of the bodies first (in the order of the cards), then the metadata.
  const contentGroups = groups
    .filter((g) => g.kind === 'body')
    .sort((a, b) => FACET_PURPOSES.indexOf(a.purpose!) - FACET_PURPOSES.indexOf(b.purpose!) || a.label.localeCompare(b.label));
  const metadataGroups = groups.filter((g) => g.kind === 'metadata').sort((a, b) => a.label.localeCompare(b.label));
  const renderGroups = (list: FilterGroup[]) =>
    list.map((group) => (
      <FilterGroupItem
        key={`${canvasId}|${group.key}`}
        group={group}
        windowId={windowId}
        canvasId={canvasId}
        text={text}
        onChange={handleFiltersChange}
      />
    ));

  const filterBody = (
    <>
      {renderGroups(contentGroups)}
      {contentGroups.length > 0 && metadataGroups.length > 0 && <Divider sx={{ my: 1 }} />}
      {renderGroups(metadataGroups)}
    </>
  );

  const shown = stats.filterable - stats.hidden;
  const footer = (
    <>
      <Divider />
      <Box sx={{ p: 1, bgcolor: 'action.hover' }} role="status" aria-live="polite">
        <Typography variant="caption" color="text.secondary">
          {hasFilters
            ? fillTemplate(text.showingOf, { shown, total: stats.filterable })
            : stats.filterable === 1
              ? text.annotationCountOne
              : fillTemplate(text.annotationCount, { n: stats.filterable })}
        </Typography>
      </Box>
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

        {footer}
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
          <Tooltip title={text.resetFilters}>
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

      {footer}
    </Box>
  );
};

export default MetadataFiltersPanel;
