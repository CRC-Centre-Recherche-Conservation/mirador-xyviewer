/**
 * View model of a classifying / identifying annotation (W3C Web Annotation only).
 *
 * Pure: bodies in, display structure out. Assessments are never paired with classes by
 * position (producers may deduplicate bodies); they are paired only when the data says so:
 * a single class, or a `Composite` holding one class and its assessments.
 */

import type {
  AnnotationBody,
  IIIFAnnotation,
  SeeAlsoEntry,
  SpecificResourceBody,
  TextualBody,
} from '../types/iiif';
import {
  isChoiceBody,
  isCompositeBody,
  isIndependentsBody,
  isListBody,
  isSpecificResourceBody,
  isTextualBody,
  srLabel,
  srSourceId,
  stringPurposes,
} from '../types/iiif';
import { pickChoiceItem, selectLanguageVariants } from '../components/AnnotationBodyRenderer';
import { getLocalizedString } from './localization';
import { baseAnnotationId } from './linkIndex';
import { hostGroupName, lastSegment, schemeName, type PropertyGroupOf } from './termFacets';
import { isValidUrl, stripTags } from './security';

export type ClassificationKind = 'classifying' | 'identifying';

/** A controlled term (or free-text term) of the annotation. */
export interface Term {
  /** Stable key: the source URI, else the text. */
  key: string;
  label: string;
  /** Source URI, empty for a free-text term. */
  uri: string;
}

/** A class with the assessments that qualify it, known from the data. */
export interface PairedTerm {
  term: Term;
  assessments: Term[];
}

/** Descriptive terms sharing a name (enclosing Composite label, else the source's scheme, else the host hook). */
export interface PropertyGroup {
  /** Undefined for the default "Description" row. */
  name?: string;
  terms: Term[];
}

export interface ProseBlock {
  text: string;
  format?: string;
  language?: string;
}

export interface ClassificationLink {
  href: string;
  label: string;
}

export interface ClassificationView {
  kind: ClassificationKind;
  /** Annotation label, else the class labels, else the start of the text; '' when none. */
  title: string;
  prose: ProseBlock[];
  /** Classes (`classifying`) and identified terms not shown as a pair. */
  terms: { classifying: Term[]; identifying: Term[] };
  /** Classes tied to their assessments by the data; their presence makes the structure primary. */
  pairs: PairedTerm[];
  /** Assessments that cannot be tied to one class. */
  assessments: Term[];
  /** True when the unpaired assessments qualify the annotation as a whole (several classes). */
  assessmentsOverall: boolean;
  properties: PropertyGroup[];
  tags: Term[];
  other: Term[];
  /** `linking` bodies, one per target. */
  related: SpecificResourceBody[];
  /** Bodies shown as they are (Dataset, Manifest...). */
  rest: AnnotationBody[];
  /** Human page about the annotation (homepage, else a `text/html` seeAlso). */
  report?: ClassificationLink;
  /** seeAlso entries that are not the report nor HTML pages. */
  links: ClassificationLink[];
}

const stripPrefix = (m: string): string => m.replace(/^.*[:/#]/, '');

/** True when the motivation(s) include `classifying` or `identifying`. */
export function classificationKind(motivation: unknown): ClassificationKind | undefined {
  const list = [motivation ?? []].flat().filter((m): m is string => typeof m === 'string').map(stripPrefix);
  if (list.includes('classifying')) return 'classifying';
  if (list.includes('identifying')) return 'identifying';
  return undefined;
}

type Slot = 'classifying' | 'identifying' | 'assessing' | 'describing' | 'tagging' | 'other';
/** Display order; a body with several purposes goes to the first of its slots. */
const SLOTS: Slot[] = ['classifying', 'identifying', 'assessing', 'describing', 'tagging'];

function slotOf(body: { purpose?: unknown }): Slot {
  const purposes = stringPurposes(body);
  return SLOTS.find((s) => purposes.includes(s)) ?? 'other';
}

const MAX_DEPTH = 4;
const TITLE_FROM_TEXT = 80;

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decode the common named and numeric HTML entities (single pass, no DOM). */
function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]{2,6}));/g, (m, dec, hex, name) => {
    if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? m;
    const cp = dec ? parseInt(dec, 10) : parseInt(hex, 16);
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : m;
  });
}

interface Leaf {
  /** Source order, across Composites. */
  seq: number;
  slot: Slot;
  term: Term;
  /** Name of the group the term was found in (Composite label, source scheme or host hook). */
  group?: string;
}
interface Composite {
  label: string;
  leaves: Leaf[];
}

export function buildClassificationView(
  annotation: IIIFAnnotation,
  prefs: string[],
  propertyGroupOf?: PropertyGroupOf,
): ClassificationView {
  const kind = classificationKind(annotation.motivation) ?? 'classifying';
  const prose: ProseBlock[] = [];
  const related: SpecificResourceBody[] = [];
  const rest: AnnotationBody[] = [];
  const flat: Leaf[] = [];
  const composites: Composite[] = [];
  const seenLinks = new Set<string>();
  let seq = 0;

  const termOf = (body: SpecificResourceBody): Term => {
    const uri = srSourceId(body);
    const label = getLocalizedString(srLabel(body), prefs) || (uri ? lastSegment(uri) : '');
    return { key: uri || label, label, uri };
  };

  function walk(bodies: AnnotationBody[], depth: number, into: Leaf[], group?: string): void {
    const list = selectLanguageVariants(bodies.filter((b) => b && typeof b === 'object'), prefs);
    for (const body of list) {
      if (isChoiceBody(body)) {
        const item = depth < MAX_DEPTH ? pickChoiceItem(body, prefs) : undefined;
        if (item) walk([item], depth + 1, into, group);
      } else if (isCompositeBody(body)) {
        if (depth >= MAX_DEPTH) continue;
        const leaves: Leaf[] = [];
        const label = getLocalizedString(body.label, prefs);
        walk(body.items, depth + 1, leaves, label || group);
        composites.push({ label, leaves });
      } else if (isListBody(body) || isIndependentsBody(body)) {
        if (depth < MAX_DEPTH) walk(body.items, depth + 1, into, group);
      } else if (isTextualBody(body)) {
        const text = body.value;
        if (typeof text !== 'string' || !text.trim()) continue;
        const slot = slotOf(body);
        // Free-text concept (no URI) vs the annotation's prose (describing, commenting or no purpose).
        if (slot === 'describing' || slot === 'other') pushProse(prose, body);
        else into.push({ seq: seq++, slot, term: { key: text, label: text, uri: '' }, group });
      } else if (isSpecificResourceBody(body)) {
        if (stringPurposes(body).includes('linking')) {
          const id = baseAnnotationId(srSourceId(body));
          if (id && !seenLinks.has(id)) {
            seenLinks.add(id);
            related.push(body);
          }
        } else {
          const term = termOf(body);
          const slot = slotOf(body);
          if (term.label) {
            const named = group ?? schemeName(body, prefs) ?? (slot === 'describing' ? hostGroupName(propertyGroupOf, term.uri) : undefined);
            into.push({ seq: seq++, slot, term, group: named });
          }
        }
      } else {
        rest.push(body);
      }
    }
  }

  const topBodies = [annotation.body ?? []].flat() as AnnotationBody[];
  walk(topBodies, 0, flat);

  // Composite holding exactly one class: that class and its assessments form a pair.
  const pairs: PairedTerm[] = [];
  const leftovers: Leaf[] = [...flat];
  for (const c of composites) {
    const classes = c.leaves.filter((l) => l.slot === 'classifying' || l.slot === 'identifying');
    const assessments = c.leaves.filter((l) => l.slot === 'assessing');
    if (classes.length === 1 && assessments.length > 0) {
      pairs.push({ term: classes[0].term, assessments: assessments.map((l) => l.term) });
      leftovers.push(...c.leaves.filter((l) => l !== classes[0] && l.slot !== 'assessing'));
    } else {
      leftovers.push(...c.leaves);
    }
  }

  // Distinct classes of the whole annotation.
  const classKeys = new Set(
    [...flat, ...composites.flatMap((c) => c.leaves)]
      .filter((l) => l.slot === 'classifying' || l.slot === 'identifying')
      .map((l) => l.term.key),
  );

  // A single class: the annotation's assessments qualify it.
  const hasCompositePair = pairs.length > 0;
  const assessLeaves = leftovers.filter((l) => l.slot === 'assessing');
  if (!hasCompositePair && classKeys.size === 1 && assessLeaves.length > 0) {
    const cls = leftovers.find((l) => l.slot === 'classifying' || l.slot === 'identifying')!;
    pairs.push({ term: cls.term, assessments: dedupe(assessLeaves.map((l) => l.term)) });
    leftovers.splice(0, leftovers.length, ...leftovers.filter((l) => l !== cls && l.slot !== 'assessing'));
  }

  leftovers.sort((a, b) => a.seq - b.seq);
  const pairedKeys = new Set(pairs.map((p) => p.term.key));
  const pick = (slot: Slot) =>
    dedupe(leftovers.filter((l) => l.slot === slot && !(pairedKeys.has(l.term.key) && (slot === 'classifying' || slot === 'identifying'))).map((l) => l.term));

  const properties: PropertyGroup[] = [];
  for (const leaf of leftovers.filter((l) => l.slot === 'describing')) {
    let g = properties.find((p) => p.name === leaf.group);
    if (!g) properties.push((g = { name: leaf.group, terms: [] }));
    if (!g.terms.some((t) => t.key === leaf.term.key)) g.terms.push(leaf.term);
  }

  const assessments = pick('assessing');
  const classLabels = [...pairs.map((p) => p.term), ...pick('classifying'), ...pick('identifying')];

  const { report, links } = webLinks(annotation, prefs);

  let title = getLocalizedString(annotation.label, prefs);
  if (!title) title = dedupe(classLabels).map((t) => t.label).join(', ');
  if (!title && prose[0]) {
    // Cap before stripping so a huge remote body costs nothing.
    const head = prose[0].text.slice(0, TITLE_FROM_TEXT * 64);
    const plain = prose[0].format === 'text/html' ? decodeEntities(stripTags(head)) : head;
    title = plain.replace(/\s+/g, ' ').trim().slice(0, TITLE_FROM_TEXT);
  }

  return {
    kind,
    title,
    prose,
    terms: { classifying: pick('classifying'), identifying: pick('identifying') },
    pairs,
    assessments,
    assessmentsOverall: assessments.length > 0 && classKeys.size > 1,
    properties,
    tags: pick('tagging'),
    other: pick('other'),
    related,
    rest,
    ...(report ? { report } : {}),
    links,
  };
}

function pushProse(out: ProseBlock[], body: TextualBody): void {
  out.push({
    text: body.value,
    ...(body.format ? { format: body.format } : {}),
    ...(typeof body.language === 'string' ? { language: body.language } : {}),
  });
}

function dedupe(terms: Term[]): Term[] {
  const seen = new Set<string>();
  return terms.filter((t) => (seen.has(t.key) ? false : (seen.add(t.key), true)));
}

const asList = <T,>(v: T | T[] | undefined): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

function entryUrl(e: SeeAlsoEntry | undefined): string {
  const id = e && typeof e === 'object' ? e.id : undefined;
  const url = typeof id === 'string' ? id : id && typeof id === 'object' ? id.url : '';
  return typeof url === 'string' && isValidUrl(url) ? url : '';
}

/** Report page: `homepage`, else a `text/html` seeAlso. Other seeAlso entries become menu links. */
function webLinks(
  annotation: IIIFAnnotation,
  prefs: string[],
): { report?: ClassificationLink; links: ClassificationLink[] } {
  const title = getLocalizedString(annotation.label, prefs);
  const see = asList(annotation.seeAlso).filter((e) => e && typeof e === 'object');
  const home = asList(annotation.homepage).filter((e) => e && typeof e === 'object');
  const isHtml = (e: SeeAlsoEntry) => e.format === 'text/html';

  const reportEntry = home.find((e) => entryUrl(e)) ?? see.find((e) => isHtml(e) && entryUrl(e));
  let report: ClassificationLink | undefined;
  if (reportEntry) {
    const label = getLocalizedString(reportEntry.label, prefs);
    report = { href: entryUrl(reportEntry), label: label && label !== title ? label : '' };
  }

  const links: ClassificationLink[] = [];
  for (const e of see) {
    const href = entryUrl(e);
    if (!href || e === reportEntry) continue;
    const type = typeof e.type === 'string' ? e.type : '';
    links.push({ href, label: getLocalizedString(e.label, prefs) || type || lastSegment(href) });
  }
  return { report, links };
}
