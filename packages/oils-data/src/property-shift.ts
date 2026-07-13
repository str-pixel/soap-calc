import { oilPropertiesFromFattyAcids } from '@soap-calc/core';

/**
 * Property bars that move by ≥ this many percentage-points when a backfill replaces a profile are
 * flagged for human eyes. The profile-consistency (SAP) gate is nearly invariant to a
 * palmitic↔oleic swap (similar molar mass), but the property bars are NOT — so a backfill can be
 * SAP-consistent yet swing hardness/conditioning a lot. This guard makes that swing loud instead
 * of silent. It does not block the build (a correction is *meant* to move scores); it surfaces the
 * large ones so a single-source outlier (which moves scores more than a reconciled value) is caught.
 */
export const PROPERTY_SHIFT_THRESHOLD = 15;

export type PropertyShift = { property: string; before: number; after: number; delta: number };

/** Per-property score deltas from replacing `before` (legacy) with `after` (backfill). Only
 *  non-zero deltas, largest magnitude first. */
export function propertyShift(
  before: Record<string, number> | undefined,
  after: Record<string, number>,
): PropertyShift[] {
  const b = oilPropertiesFromFattyAcids(before ?? {});
  const a = oilPropertiesFromFattyAcids(after);
  const out: PropertyShift[] = [];
  for (const property of Object.keys(a) as (keyof typeof a)[]) {
    const delta = Math.round((a[property] - b[property]) * 10) / 10;
    if (delta !== 0) out.push({ property, before: b[property], after: a[property], delta });
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

/** The largest single-property shift, or 0 if none. */
export function maxAbsShift(shifts: PropertyShift[]): number {
  return shifts.reduce((max, s) => Math.max(max, Math.abs(s.delta)), 0);
}
