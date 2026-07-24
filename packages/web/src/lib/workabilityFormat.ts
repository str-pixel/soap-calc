import { WORKABILITY_TUNING, type WorkabilityRange } from '@soap-calc/core';

// Display ceiling — single-sourced from the estimator's tuning so the cutoff can't drift.
const CEILING_HOURS = WORKABILITY_TUNING.ceilingHours;
// Label derived from the same constant: retune ceilingHours to 504 and this reads "3+ weeks"
// on its own, rather than lying with a baked-in "2+".
const CEILING_LABEL = `≈ ${WORKABILITY_TUNING.ceilingHours / 168}+ weeks`;
const half = (x: number): number => Math.round(x * 2) / 2;

/**
 * Unit-adaptive label for one range, chosen from the range's own max: hours under 48 h,
 * days under 240 h, weeks beyond. Rows format independently — a block can legitimately
 * show unmold in hours next to cut in days once cut crosses the 48 h seam.
 * A row that reaches the ceiling shows the open-ended ceiling label regardless.
 */
export function formatWorkabilityRange(range: WorkabilityRange): string {
  if (range.maxHours >= CEILING_HOURS) return CEILING_LABEL;
  if (range.maxHours < 48) return `≈ ${Math.round(range.minHours)}–${Math.round(range.maxHours)} h`;
  if (range.maxHours < 240) return `≈ ${half(range.minHours / 24)}–${half(range.maxHours / 24)} days`;
  return `≈ ${half(range.minHours / 168)}–${half(range.maxHours / 168)} weeks`;
}
