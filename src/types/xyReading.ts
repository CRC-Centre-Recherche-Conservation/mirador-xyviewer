/**
 * xyReading types: the validated form of the optional `xyReading` extension
 * object carried by IIIF Dataset bodies (see docs/SPECTRAL-DATA-FORMAT.md).
 */

import type { LocalizedString } from './iiif';

export type XyColumnRole = 'x' | 'yLeft' | 'yRight' | 'reference' | 'dark' | 'ignore';

export interface XyColumn {
  index: number;
  role: XyColumnRole;
}

/** CSV dialect (CSV on the Web terms). */
export interface XyDialect {
  delimiter?: string;
  headerRowCount?: number;
  encoding?: string;
}

export interface XyAxisLabel {
  label?: LocalizedString;
}

export interface XyXAxis extends XyAxisLabel {
  /** Axis drawn right to left; rows keep the file order. */
  reversed?: boolean;
}

export interface XyYAxis extends XyAxisLabel {
  axis?: 'left' | 'right';
}

/** `y' = (y - dark) / (reference - dark)`, dropping invalid rows. Defaults are filled in. */
export interface XyReferenceNormalize {
  type: 'reference-normalize';
  darkDefault: number;
  epsilon: number;
}

export type XyCorrection = XyReferenceNormalize;

export interface XyDerivedFrom {
  id: string;
  type: 'Dataset';
  format?: string;
  label?: LocalizedString;
  xyReading?: XyReading;
}

export interface XyReading {
  type: 'XYReading';
  dialect?: XyDialect;
  columns?: XyColumn[];
  x?: XyXAxis;
  y?: XyYAxis[];
  /** Known corrections, in order. Absent or empty: the file already holds the curve. */
  corrections?: XyCorrection[];
  /** True when `corrections` listed a type (or option) this version does not know. */
  hasUnsupportedCorrection?: boolean;
  /** True when `columns` was declared but is invalid (unknown role, duplicate or bad index). */
  columnsInvalid?: boolean;
  derivedFrom?: XyDerivedFrom;
}
