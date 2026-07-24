import { WORKABILITY_TUNING, type WorkabilityRange } from '@soap-calc/core';

// Display ceiling — single-sourced from the estimator's tuning so the cutoff can't drift.
const CEILING_HOURS = WORKABILITY_TUNING.ceilingHours;
// Label derived from the same constant: retune ceilingHours to 504 and this reads "3+ weeks"
// on its own, rather than lying with a baked-in "2+".
const CEILING_LABEL = `≈ ${WORKABILITY_TUNING.ceilingHours / 168}+ weeks`;
const half = (x: number): number => Math.round(x * 2) / 2;

/**
 * Unit-adaptive label for one range. The unit is chosen from `unitBasisHours` (default: the
 * range's own max), so a caller can render every row of a single estimate in ONE shared unit
 * by passing the block's anchor max — avoiding adjacent rows in mixed units (e.g. unmold in
 * hours, cut in days) and the overstatement that came from rounding each row independently.
 * A row that itself reaches the ceiling still shows the open-ended ceiling label regardless.
 */
export function formatWorkabilityRange(
  range: WorkabilityRange,
  unitBasisHours: number = range.maxHours,
): string {
  if (range.maxHours >= CEILING_HOURS) return CEILING_LABEL;
  if (unitBasisHours < 48) return `≈ ${Math.round(range.minHours)}–${Math.round(range.maxHours)} h`;
  if (unitBasisHours < 240) return `≈ ${half(range.minHours / 24)}–${half(range.maxHours / 24)} days`;
  return `≈ ${half(range.minHours / 168)}–${half(range.maxHours / 168)} weeks`;
}
