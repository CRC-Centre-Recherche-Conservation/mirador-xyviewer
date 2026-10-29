/**
 * Filters Store
 * Global state management for annotation filters
 *
 * Facets come from two sources: the annotations' `metadata` (one group per label) and the
 * controlled terms of their SpecificResource bodies (one group per purpose, keyed by the
 * term's source URI so the key does not depend on the reader's language).
 *
 * This store manages:
 * - Active filters by group/value
 * - Filter visibility per window+canvas combination
 */

import type { LocalizedString } from '../types/iiif';
import type { AnnotationBodyLabels } from '../types/mirador';
import { getLocalizedString, getLocalizedStrings, resolvePreferredLanguages } from '../utils/localization';
import { resolveLabels, termGroupCaption } from '../utils/annotationLabels';
import { baseAnnotationId, collectLinkingBodies } from '../utils/linkIndex';
import { srSourceId } from '../types/iiif';
import { extractBodyFacets, FACET_PURPOSES, type FacetPurpose, type PropertyGroupOf } from '../utils/termFacets';

/** Filter value entry */
export interface FilterValue {
  /** Normalized key of this value inside its group (what `toggleValue` expects). */
  key: string;
  /** Raw value string */
  raw: string;
  /** Display text (without URL) */
  displayText: string;
  /** Associated URL if any */
  url?: string;
  /** Total count of annotations carrying this value */
  count: number;
  /** Count of visible annotations carrying this value (after filtering) */
  visibleCount: number;
  /** Annotations that get this value only through a link (inheritance on), and how many are visible. */
  linkedCount: number;
  visibleLinkedCount: number;
  /** Whether this value is selected (checked) */
  selected: boolean;
}

/** Filter group (by label) */
export interface FilterGroup {
  /** Label key (normalized) */
  key: string;
  /** Display label */
  label: string;
  /** Values for this label */
  values: Map<string, FilterValue>;
  /** Whether the group is expanded */
  expanded: boolean;
  /** Where the values come from. */
  kind: 'metadata' | 'body';
  /** Purpose of a body group. */
  purpose?: FacetPurpose;
  /** Annotations carrying a value of the group. */
  appliesTo: number;
  /** Other annotations that get a value through a link. */
  appliesToLinked: number;
  /** Whether a characterization keeps the annotations it cites for this group (every body group). */
  inherits: boolean;
}

/** Host options of the facets. */
export interface FilterOptions {
  /** UI strings: the group captions and "None". */
  labels?: AnnotationBodyLabels;
  /** Groups to leave out: a metadata label, a group caption or a purpose. */
  hiddenGroups?: string[];
  /** Names the group of a descriptive term from its source URI (`scientificAnnotations.propertyGroupOf`). */
  propertyGroupOf?: PropertyGroupOf;
  /** Body groups also keep the annotations cited by a matching one (`scientificAnnotations.extendFiltersToLinked`, default true). */
  extendToLinked?: boolean;
}

/** What the store reads from an annotation. */
export interface FilterableAnnotation {
  id: string;
  metadata?: Array<{
    label: LocalizedString;
    value: LocalizedString;
  }>;
  /** Normalized body: its controlled terms become facets, its `linking` bodies feed the inheritance. */
  body?: unknown;
}

/** Store state per window+canvas */
interface FilterState {
  /** Filter groups by label key */
  groups: Map<string, FilterGroup>;
  /** Set of hidden annotation IDs based on current filters */
  hiddenAnnotationIds: Set<string>;
  /** Language preferences the groups were built with. */
  prefs: string[];
  /** Options the groups were built with, as a comparison key. */
  signature: string;
  options: FilterOptions;
  /** Body groups extend to the annotations cited by a carrier (host option `extendToLinked`). */
  inheritLinked: boolean;
  /** Ids of the annotations the groups were built from: more annotations loading rebuilds them. */
  idsKey: string;
  /** Annotations the profiles were built from. */
  annotations: FilterableAnnotation[];
  profiles: Profile[];
  /** Annotation id -> ids of the annotations it is shown because of (inheritance). */
  shownBecause: Map<string, string[]>;
}

/** What an annotation carries, per group. */
interface Profile {
  id: string;
  base: string;
  values: Map<string, Set<string>>;
  /** Carries at least one metadata value. */
  metadata: boolean;
  /** Purposes of the body terms it carries. */
  purposes: Set<string>;
  /** Base ids of the annotations it links to. */
  links: string[];
  /** Describing sub-groups (group keys) it carries a value in. */
  describing: Set<string>;
  /** Has facets at all; the others stay outside filtering. */
  filterable: boolean;
}

/** Event types for subscribers */
type FiltersStoreEvent =
  | { type: 'init'; windowId: string; canvasId: string }
  | { type: 'toggle-value'; windowId: string; canvasId: string; labelKey: string; valueKey: string; selected: boolean }
  | { type: 'toggle-group'; windowId: string; canvasId: string; labelKey: string; expanded: boolean }
  | { type: 'select-all'; windowId: string; canvasId: string; labelKey: string }
  | { type: 'deselect-all'; windowId: string; canvasId: string; labelKey: string }
  | { type: 'update-hidden'; windowId: string; canvasId: string; hiddenIds: Set<string> }
  | { type: 'clear'; windowId: string; canvasId: string };

type FiltersStoreListener = (event: FiltersStoreEvent) => void;

/**
 * Parse value to extract display text and URL
 * Format: "Display text (http://...)" or just "Display text"
 * @internal Exposed for tests; not part of the public API.
 */
export function parseValueWithUrl(value: string): { displayText: string; url?: string } {
  // Linear scan (no backtracking regex on the free-text head).
  const start = value.endsWith(')') ? value.lastIndexOf('(http') : -1;
  if (start > 0) {
    const tail = /^\((https?:\/\/[^)]+)\)$/.exec(value.slice(start));
    const head = value.slice(0, start).trim();
    if (tail && head) return { displayText: head, url: tail[1] };
  }
  return { displayText: value };
}

/**
 * Normalize a label key for grouping
 * @internal Exposed for tests; not part of the public API.
 */
export function normalizeKey(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, '_');
}

/** Key of the synthetic "None" value (annotations of the population without a value for the group). */
export const NONE_KEY = '\u0000none';

/** Store-wide caps: pages are remote, untrusted JSON. Entries beyond them are ignored. */
export const MAX_GROUPS = 100;
export const MAX_VALUES_PER_GROUP = 500;

/** Shown-because carriers kept per annotation (the UI lists a few and counts the rest). */
const MAX_CARRIERS_PER_TARGET = 5;

/** Group key of a metadata label (own namespace, apart from `body:` keys). */
export function metadataGroupKey(labelText: string): string {
  return `meta:${normalizeKey(labelText)}`;
}

/**
 * Single place that turns a metadata entry into its label/value texts and keys,
 * in the reader's language. Keys therefore depend on the language preferences.
 * @internal Exposed for tests; not part of the public API.
 */
export function entryKeys(
  entry: { label: LocalizedString; value: LocalizedString },
  prefs: string[]
): { labelText: string; labelKey: string; valueText: string; valueKey: string } {
  const labelText = getLocalizedString(entry.label, prefs) || 'Unknown';
  const valueText = getLocalizedString(entry.value, prefs) || '';
  return { labelText, labelKey: normalizeKey(labelText), valueText, valueKey: normalizeKey(valueText) };
}

/** Group key of a body group: one per purpose, `describing` also per sub-group name. */
export function facetGroupKey(purpose: string, groupName?: string): string {
  return groupName ? `body:${purpose}:${normalizeKey(groupName)}` : `body:${purpose}`;
}

/** One value of one group, as an annotation carries it. */
interface FacetEntry {
  groupKey: string;
  groupLabel: string;
  kind: 'metadata' | 'body';
  purpose?: FacetPurpose;
  valueKey: string;
  valueText: string;
}

/** Values shown before a group is collapsed at load: groups unfold while the running total stays within it. */
const INITIAL_VALUE_BUDGET = 12;

/** Values shown before "Show N more" in the panel. */
export const COLLAPSED_VALUES = 8;

/** Whether a host-hidden group name matches a group. */
function isHiddenGroup(hidden: ReadonlySet<string>, key: string, label: string, purpose?: string): boolean {
  return hidden.has(normalizeKey(key)) || hidden.has(normalizeKey(label)) || (!!purpose && hidden.has(purpose));
}

/** Facet entries of an annotation: metadata values (one per array entry) and controlled body terms. */
function facetEntries(
  annotation: FilterableAnnotation,
  prefs: string[],
  options: FilterOptions,
  hidden: ReadonlySet<string>
): FacetEntry[] {
  const out: FacetEntry[] = [];
  if (Array.isArray(annotation.metadata)) {
    for (const entry of annotation.metadata) {
      const labelText = getLocalizedString(entry?.label, prefs) || 'Unknown';
      const groupKey = metadataGroupKey(labelText);
      if (isHiddenGroup(hidden, normalizeKey(labelText), labelText)) continue;
      // IIIF: every string of the chosen language is a value; strings are never split.
      for (const valueText of getLocalizedStrings(entry?.value, prefs)) {
        const valueKey = normalizeKey(valueText);
        if (valueKey) out.push({ groupKey, groupLabel: labelText, kind: 'metadata', valueKey, valueText });
      }
    }
  }
  if (annotation.body) {
    for (const f of extractBodyFacets(annotation.body, prefs, options.propertyGroupOf)) {
      const groupLabel = f.groupName ?? termGroupCaption(options.labels, f.purpose);
      const groupKey = facetGroupKey(f.purpose, f.groupName);
      if (isHiddenGroup(hidden, groupKey, groupLabel, f.purpose)) continue;
      out.push({ groupKey, groupLabel, kind: 'body', purpose: f.purpose, valueKey: f.uri, valueText: f.label });
    }
  }
  return out;
}

/**
 * Whether an annotation has anything to filter on: a metadata value or a controlled body term.
 * Those without are outside filtering: never hidden, never counted.
 * @internal Exposed for tests; not part of the public API.
 */
export function hasFacets(annotation: { metadata?: unknown[]; body?: unknown }): boolean {
  if (Array.isArray(annotation.metadata) && annotation.metadata.length > 0) return true;
  return !!annotation.body && extractBodyFacets(annotation.body, []).length > 0;
}

/**
 * Create a composite key from windowId and canvasId
 * @internal Exposed for tests; not part of the public API.
 */
export function createKey(windowId: string, canvasId: string): string {
  return `${windowId}::${canvasId}`;
}

const hookIds = new WeakMap<object, number>();
/** Stable per-function id, so a new hook rebuilds the groups. */
function hookId(fn: unknown): number {
  if (typeof fn !== 'function') return 0;
  let id = hookIds.get(fn);
  if (!id) {
    id = ++hookCounter;
    hookIds.set(fn, id);
  }
  return id;
}
let hookCounter = 0;

const signatureOf = (options: FilterOptions): string =>
  JSON.stringify([
    options.hiddenGroups ?? [],
    hookId(options.propertyGroupOf),
    FACET_PURPOSES.map((p) => termGroupCaption(options.labels, p)),
    resolveLabels(options.labels).filterNone,
    options.extendToLinked !== false,
  ]);

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** An annotation's membership in one group, for one evaluation. */
interface Row {
  profile: Profile;
  group: FilterGroup;
  own: ReadonlySet<string>;
  /** Value -> annotations carrying it that link to this one. */
  inherited?: Map<string, Profile[]>;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

/** Selection of a "None" value that vanished (no member left), restored if it comes back. */
const droppedNone = new WeakMap<FilterGroup, boolean>();

/**
 * Global filters store class
 */
class FiltersStore {
  private states: Map<string, FilterState> = new Map();
  private listeners: Set<FiltersStoreListener> = new Set();

  /**
   * Subscribe to store changes
   */
  subscribe(listener: FiltersStoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of an event
   */
  private notify(event: FiltersStoreEvent): void {
    this.listeners.forEach(listener => listener(event));
  }

  /**
   * Get or create state for window+canvas combination
   */
  private getState(key: string): FilterState {
    if (!this.states.has(key)) {
      this.states.set(key, {
        groups: new Map(),
        hiddenAnnotationIds: new Set(),
        prefs: resolvePreferredLanguages(),
        signature: '',
        options: {},
        inheritLinked: true,
        idsKey: '',
        annotations: [],
        profiles: [],
        shownBecause: new Map(),
      });
    }
    return this.states.get(key)!;
  }

  /**
   * Check if filters are already initialized for a window+canvas
   */
  hasFiltersInitialized(windowId: string, canvasId: string): boolean {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    return state !== undefined && state.groups.size > 0;
  }

  private hiddenSet(options: FilterOptions): Set<string> {
    return new Set((options.hiddenGroups ?? []).filter((g) => typeof g === 'string').map(normalizeKey));
  }

  private profileOf(
    annotation: FilterableAnnotation,
    state: FilterState,
    entries: FacetEntry[]
  ): Profile {
    const values = new Map<string, Set<string>>();
    const purposes = new Set<string>();
    const describing = new Set<string>();
    let metadata = false;
    for (const e of entries) {
      // Only what the groups know (annotations loaded after the init may carry new values).
      if (!state.groups.get(e.groupKey)?.values.has(e.valueKey)) continue;
      let set = values.get(e.groupKey);
      if (!set) values.set(e.groupKey, (set = new Set()));
      set.add(e.valueKey);
      if (e.kind === 'metadata') metadata = true;
      else if (e.purpose) {
        purposes.add(e.purpose);
        if (e.purpose === 'describing') describing.add(e.groupKey);
      }
    }
    const links = annotation.body
      ? [...new Set(collectLinkingBodies(annotation.body).map((b) => baseAnnotationId(srSourceId(b))).filter(Boolean))]
      : [];
    return {
      id: annotation.id,
      base: baseAnnotationId(annotation.id),
      values,
      metadata,
      purposes,
      describing,
      links,
      filterable: values.size > 0,
    };
  }

  private buildProfiles(state: FilterState, annotations: FilterableAnnotation[]): void {
    const hidden = this.hiddenSet(state.options);
    state.annotations = annotations;
    state.profiles = annotations.map((a) =>
      this.profileOf(a, state, facetEntries(a, state.prefs, state.options, hidden))
    );
  }

  /**
   * Initialize filters from annotations (only if not already initialized).
   *
   * Metadata labels and values are keyed in the reader's language (`prefs`, default: the
   * browser language); terms of the bodies are keyed by their source URI. Calling again
   * with different prefs or options rebuilds the groups, so the current selection is reset.
   */
  initializeFromAnnotations(
    windowId: string,
    canvasId: string,
    annotations: FilterableAnnotation[],
    force: boolean = false,
    prefs: string[] = resolvePreferredLanguages(),
    options: FilterOptions = {}
  ): void {
    const key = createKey(windowId, canvasId);
    const previous = this.states.get(key);
    const signature = signatureOf(options);
    const same = (previous?.prefs ?? []).join('|') === prefs.join('|') && previous?.signature === signature;
    const idsKey = annotations.map((a) => a.id).join('\n');

    // Skip if already initialized with these annotations (unless forced or the language or options changed)
    if (!force && same && previous?.idsKey === idsKey && this.hasFiltersInitialized(windowId, canvasId)) {
      return;
    }
    // More annotations loaded (e.g. a second page): rebuild, keeping what the reader selected.
    const kept = !force && same ? new Map(previous?.groups) : undefined;

    const state = this.getState(key);
    state.prefs = prefs;
    state.options = options;
    state.inheritLinked = options.extendToLinked !== false;
    state.signature = signature;
    state.idsKey = idsKey;
    state.groups.clear();
    state.hiddenAnnotationIds.clear();
    state.shownBecause.clear();

    const hidden = this.hiddenSet(options);
    const noneText = resolveLabels(options.labels).filterNone;
    const entriesOf = annotations.map((a) => facetEntries(a, prefs, options, hidden));

    for (const entries of entriesOf) {
      for (const e of entries) {
        let group = state.groups.get(e.groupKey);
        if (!group) {
          if (state.groups.size >= MAX_GROUPS) continue;
          group = {
            key: e.groupKey,
            label: e.groupLabel,
            values: new Map(),
            expanded: true, // refined below once the values are known
            kind: e.kind,
            ...(e.purpose ? { purpose: e.purpose } : {}),
            appliesTo: 0,
            appliesToLinked: 0,
            inherits: e.kind === 'body',
          };
          state.groups.set(e.groupKey, group);
        }
        if (!group.values.has(e.valueKey)) {
          if (group.values.size >= MAX_VALUES_PER_GROUP) continue;
          // Metadata values may carry a link: "Text (http://...)".
          const parsed = e.kind === 'metadata' ? parseValueWithUrl(e.valueText) : { displayText: e.valueText, url: undefined };
          group.values.set(e.valueKey, {
            key: e.valueKey,
            raw: e.valueText,
            displayText: parsed.displayText,
            url: parsed.url,
            count: 0,
            visibleCount: 0,
            linkedCount: 0,
            visibleLinkedCount: 0,
            selected: true, // All selected by default
          });
        }
      }
    }

    for (const [groupKey, old] of kept ?? []) {
      const group = state.groups.get(groupKey);
      if (!group) continue;
      for (const [valueKey, value] of group.values) {
        const before = old.values.get(valueKey);
        if (before) value.selected = before.selected;
      }
      const none = old.values.get(NONE_KEY);
      if (none && !none.selected) group.values.set(NONE_KEY, { ...none });
    }

    // Profiles need the groups, which need the entries: built in this order.
    state.annotations = annotations;
    state.profiles = annotations.map((a, i) => this.profileOf(a, state, entriesOf[i]));
    this.recompute(state, noneText);

    // Unfold the groups in display order while their rows (with "Not specified", folded values excluded) fit the budget; the first always unfolds.
    let budget = INITIAL_VALUE_BUDGET;
    const displayOrder = [...state.groups.values()].sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === 'body' ? -1 : 1) ||
        (a.kind === 'body' ? FACET_PURPOSES.indexOf(a.purpose!) - FACET_PURPOSES.indexOf(b.purpose!) : 0) ||
        a.label.localeCompare(b.label)
    );
    displayOrder.forEach((group, i) => {
      budget -= Math.min(group.values.size, COLLAPSED_VALUES + 1);
      group.expanded = kept?.get(group.key)?.expanded ?? (i === 0 || budget >= 0);
    });

    this.notify({ type: 'init', windowId, canvasId });
  }

  /**
   * Counts and hidden set from the profiles and the current selection.
   *
   * A group only tests its population: annotations with metadata for a metadata group,
   * carriers of the purpose for a body group (all filterable annotations for every body
   * group while the extension to linked annotations is on). Within a group an annotation passes
   * when one of its values is selected; across groups it must pass every one.
   */
  private recompute(state: FilterState, noneText = resolveLabels(state.options.labels).filterNone): Set<string> {
    const filterable = state.profiles.filter((p) => p.filterable);
    const byBase = new Map<string, Profile[]>();
    for (const p of filterable) pushTo(byBase, p.base, p);

    for (const group of state.groups.values()) {
      group.appliesTo = 0;
      group.appliesToLinked = 0;
      for (const v of group.values.values()) {
        v.count = v.visibleCount = v.linkedCount = v.visibleLinkedCount = 0;
      }
    }

    // Values reaching an annotation through the links of a carrier (one hop, carrier -> target).
    const inheritedBy = new Map<string, Map<Profile, Map<string, Profile[]>>>();
    for (const group of state.groups.values()) {
      if (!(group.inherits && state.inheritLinked)) continue;
      const perTarget = new Map<Profile, Map<string, Profile[]>>();
      for (const carrier of filterable) {
        const own = carrier.values.get(group.key);
        if (!own?.size) continue;
        for (const link of carrier.links) {
          for (const target of byBase.get(link) ?? []) {
            if (target.base === carrier.base) continue;
            let perValue = perTarget.get(target);
            if (!perValue) perTarget.set(target, (perValue = new Map()));
            for (const valueKey of own) pushTo(perValue, valueKey, carrier);
          }
        }
      }
      inheritedBy.set(group.key, perTarget);
    }

    // Population of every group.
    const rows: Row[] = [];
    const noneCounts = new Map<string, number>();
    for (const p of filterable) {
      for (const group of state.groups.values()) {
        const extended = group.inherits && state.inheritLinked;
        const subGroup = group.purpose === 'describing' && group.key !== facetGroupKey('describing');
        const inPopulation =
          group.kind === 'metadata'
            ? p.metadata
            : extended || (subGroup ? p.describing.has(group.key) : !!group.purpose && p.purposes.has(group.purpose));
        if (!inPopulation) continue;
        const own = p.values.get(group.key) ?? EMPTY_SET;
        const inherited = inheritedBy.get(group.key)?.get(p);
        rows.push({ profile: p, group, own, inherited });
        if (own.size === 0 && !inherited) noneCounts.set(group.key, (noneCounts.get(group.key) ?? 0) + 1);
      }
    }

    // "None" exists for the groups having members without a value.
    for (const group of state.groups.values()) {
      const n = noneCounts.get(group.key) ?? 0;
      if (n === 0) {
        const gone = group.values.get(NONE_KEY);
        if (gone) droppedNone.set(group, gone.selected);
        group.values.delete(NONE_KEY);
      } else if (group.values.has(NONE_KEY)) {
        group.values.get(NONE_KEY)!.displayText = noneText;
      } else {
        group.values.set(NONE_KEY, {
          key: NONE_KEY,
          raw: NONE_KEY,
          displayText: noneText,
          count: 0,
          visibleCount: 0,
          linkedCount: 0,
          visibleLinkedCount: 0,
          selected: droppedNone.get(group) ?? true,
        });
      }
    }

    for (const { group, own, inherited } of rows) {
      if (own.size > 0) group.appliesTo++;
      else if (inherited) group.appliesToLinked++;
      if (own.size === 0 && !inherited) {
        group.values.get(NONE_KEY)!.count++;
        continue;
      }
      for (const k of own) {
        const v = group.values.get(k);
        if (v) v.count++;
      }
      for (const k of inherited?.keys() ?? []) {
        const v = !own.has(k) ? group.values.get(k) : undefined;
        if (v) v.linkedCount++;
      }
    }

    // Visibility.
    const rowsOf = new Map<Profile, Row[]>();
    for (const row of rows) pushTo(rowsOf, row.profile, row);
    const hiddenIds = new Set<string>();
    const shownBecause = new Map<string, string[]>();
    const seenBases = new Map<string, Set<string>>();
    const filteringByGroup = new Map<string, boolean>();
    for (const g of state.groups.values()) filteringByGroup.set(g.key, [...g.values.values()].some((v) => !v.selected));
    const isSelected = (group: FilterGroup, key: string) => group.values.get(key)?.selected ?? true;

    for (const p of filterable) {
      const own = rowsOf.get(p) ?? [];
      const passes = own.every(({ group, own: ownKeys, inherited }) => {
        const keys = new Set([...ownKeys, ...(inherited?.keys() ?? [])]);
        if (keys.size === 0) return isSelected(group, NONE_KEY);
        return [...keys].some((k) => isSelected(group, k));
      });
      if (!passes) {
        hiddenIds.add(p.id);
        continue;
      }
      for (const { group, own: ownKeys, inherited } of own) {
        if (ownKeys.size === 0 && !inherited) {
          group.values.get(NONE_KEY)!.visibleCount++;
          continue;
        }
        for (const k of ownKeys) {
          const v = group.values.get(k);
          if (v) v.visibleCount++;
        }
        for (const k of inherited?.keys() ?? []) {
          const v = !ownKeys.has(k) ? group.values.get(k) : undefined;
          if (v) v.visibleLinkedCount++;
        }
        // Kept only because a selected carrier links to it, while the group is being filtered.
        if (filteringByGroup.get(group.key) && ownKeys.size === 0 && inherited) {
          for (const [k, carriers] of inherited) {
            if (!isSelected(group, k)) continue;
            for (const c of carriers) {
              // A multi-target carrier counts once (its expansions share a base id).
              let seen = seenBases.get(p.id);
              if (!seen) seenBases.set(p.id, (seen = new Set()));
              if (seen.has(c.base)) continue;
              seen.add(c.base);
              const list = shownBecause.get(p.id) ?? [];
              if (list.length < MAX_CARRIERS_PER_TARGET) list.push(c.id);
              shownBecause.set(p.id, list);
            }
          }
        }
      }
    }

    state.hiddenAnnotationIds = hiddenIds;
    state.shownBecause = shownBecause;
    return hiddenIds;
  }

  /**
   * Toggle a specific value's selection
   */
  toggleValue(windowId: string, canvasId: string, labelKey: string, valueKey: string): void {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return;

    const group = state.groups.get(labelKey);
    if (!group) return;

    const value = group.values.get(valueKey);
    if (!value) return;

    value.selected = !value.selected;
    this.notify({ type: 'toggle-value', windowId, canvasId, labelKey, valueKey, selected: value.selected });
  }

  /** Whether the group has this value. */
  hasFacet(windowId: string, canvasId: string, groupKey: string, valueKey: string): boolean {
    return !!this.states.get(createKey(windowId, canvasId))?.groups.get(groupKey)?.values.has(valueKey);
  }

  /** Whether the group is being filtered by this value alone (the only one selected among several). */
  isFacetActive(windowId: string, canvasId: string, groupKey: string, valueKey: string): boolean {
    const group = this.states.get(createKey(windowId, canvasId))?.groups.get(groupKey);
    const value = group?.values.get(valueKey);
    return !!group && !!value && group.values.size > 1 && value.selected && [...group.values.values()].every((v) => v.key === valueKey || !v.selected);
  }

  /**
   * Change the selection of one value and refresh what is hidden. Used by the panel
   * ('toggle': flip the value) and the term menu ('only': keep only this value, or clear
   * the group's filter when it is already filtering by it).
   */
  toggleFacet(
    windowId: string,
    canvasId: string,
    groupKey: string,
    valueKey: string,
    mode: 'toggle' | 'only' = 'toggle'
  ): Set<string> {
    const state = this.states.get(createKey(windowId, canvasId));
    const group = state?.groups.get(groupKey);
    const value = group?.values.get(valueKey);
    if (!state || !group || !value) return new Set();

    if (mode === 'toggle') {
      value.selected = !value.selected;
    } else {
      const clear = this.isFacetActive(windowId, canvasId, groupKey, valueKey);
      for (const v of group.values.values()) v.selected = clear || v.key === valueKey;
    }
    const hiddenIds = this.recompute(state);
    this.notify({ type: 'update-hidden', windowId, canvasId, hiddenIds });
    return hiddenIds;
  }

  /** Whether body groups extend to cited annotations (host option, on by default). */
  getInheritLinked(windowId: string, canvasId: string): boolean {
    return this.states.get(createKey(windowId, canvasId))?.inheritLinked ?? true;
  }

  setInheritLinked(windowId: string, canvasId: string, on: boolean): Set<string> {
    const state = this.states.get(createKey(windowId, canvasId));
    if (!state) return new Set();
    state.inheritLinked = on;
    const hiddenIds = this.recompute(state);
    this.notify({ type: 'update-hidden', windowId, canvasId, hiddenIds });
    return hiddenIds;
  }

  /** Visible annotations carrying the value themselves (not through a link). */
  getAnnotationIdsWithValue(windowId: string, canvasId: string, groupKey: string, valueKey: string): string[] {
    const state = this.states.get(createKey(windowId, canvasId));
    if (!state) return [];
    return state.profiles
      .filter((p) => p.values.get(groupKey)?.has(valueKey) && !state.hiddenAnnotationIds.has(p.id))
      .map((p) => p.id);
  }

  /** Annotations kept visible only through a link, with the annotations they are linked from. */
  getShownBecauseLinked(windowId: string, canvasId: string): ReadonlyMap<string, string[]> {
    return this.states.get(createKey(windowId, canvasId))?.shownBecause ?? new Map();
  }

  /** Annotations the filters act on, and how many of them are hidden. */
  getStats(windowId: string, canvasId: string): { filterable: number; hidden: number } {
    const state = this.states.get(createKey(windowId, canvasId));
    if (!state) return { filterable: 0, hidden: 0 };
    return { filterable: state.profiles.filter((p) => p.filterable).length, hidden: state.hiddenAnnotationIds.size };
  }

  /**
   * Toggle group expansion
   */
  toggleGroupExpanded(windowId: string, canvasId: string, labelKey: string): void {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return;

    const group = state.groups.get(labelKey);
    if (!group) return;

    group.expanded = !group.expanded;
    this.notify({ type: 'toggle-group', windowId, canvasId, labelKey, expanded: group.expanded });
  }

  /**
   * Select all values in a group
   */
  selectAll(windowId: string, canvasId: string, labelKey: string): void {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return;

    const group = state.groups.get(labelKey);
    if (!group) return;

    for (const value of group.values.values()) {
      value.selected = true;
    }
    this.notify({ type: 'select-all', windowId, canvasId, labelKey });
  }

  /**
   * Deselect all values in a group
   */
  deselectAll(windowId: string, canvasId: string, labelKey: string): void {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return;

    const group = state.groups.get(labelKey);
    if (!group) return;

    for (const value of group.values.values()) {
      value.selected = false;
    }
    this.notify({ type: 'deselect-all', windowId, canvasId, labelKey });
  }

  /**
   * Get filter groups for a window+canvas
   */
  getGroups(windowId: string, canvasId: string): FilterGroup[] {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return [];
    return Array.from(state.groups.values());
  }

  /**
   * Get hidden annotation IDs for a window+canvas
   */
  getHiddenAnnotationIds(windowId: string, canvasId: string): Set<string> {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return new Set();
    return state.hiddenAnnotationIds;
  }

  /**
   * Update hidden annotation IDs based on current filters. The annotations are only
   * re-read when they are not the array the filters were last computed from.
   */
  updateHiddenAnnotations(
    windowId: string,
    canvasId: string,
    annotations: FilterableAnnotation[]
  ): Set<string> {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return new Set();

    if (annotations !== state.annotations) this.buildProfiles(state, annotations);
    const hiddenIds = this.recompute(state);
    this.notify({ type: 'update-hidden', windowId, canvasId, hiddenIds });
    return hiddenIds;
  }

  /**
   * Check if an annotation should be visible based on filters
   */
  isAnnotationVisible(windowId: string, canvasId: string, annotationId: string): boolean {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return true;
    return !state.hiddenAnnotationIds.has(annotationId);
  }

  /**
   * Reset all filters to default (all selected)
   */
  resetAll(windowId: string, canvasId: string): void {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return;

    for (const group of state.groups.values()) {
      for (const value of group.values.values()) {
        value.selected = true;
      }
    }
    this.recompute(state);
    this.notify({ type: 'update-hidden', windowId, canvasId, hiddenIds: new Set() });
  }

  /**
   * Clear filters for a window+canvas
   */
  clearFilters(windowId: string, canvasId: string): void {
    const key = createKey(windowId, canvasId);
    this.states.delete(key);
    this.notify({ type: 'clear', windowId, canvasId });
  }

  /**
   * Clear all filters for a window (all canvases)
   */
  clearWindow(windowId: string): void {
    const prefix = `${windowId}::`;
    for (const key of this.states.keys()) {
      if (key.startsWith(prefix)) {
        this.states.delete(key);
      }
    }
  }

  /**
   * Get all active filter selections for a window+canvas
   */
  getActiveFilters(windowId: string, canvasId: string): Map<string, Set<string>> {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return new Map();

    const active = new Map<string, Set<string>>();
    for (const [labelKey, group] of state.groups) {
      const selectedValues = new Set<string>();
      for (const [valueKey, value] of group.values) {
        if (value.selected) {
          selectedValues.add(valueKey);
        }
      }
      if (selectedValues.size > 0) {
        active.set(labelKey, selectedValues);
      }
    }
    return active;
  }

  /**
   * Check if any filters are active (not all selected)
   */
  hasActiveFilters(windowId: string, canvasId: string): boolean {
    const key = createKey(windowId, canvasId);
    const state = this.states.get(key);
    if (!state) return false;

    for (const group of state.groups.values()) {
      for (const value of group.values.values()) {
        if (!value.selected) return true;
      }
    }
    return false;
  }
}

// Singleton instance
export const filtersStore = new FiltersStore();

// Export types
export type { FiltersStoreEvent, FiltersStoreListener };
