import { WORKABILITY_TUNING, type WorkabilityRange } from '@soap-calc/core';

// Display ceiling — single-sourced from the estimator's tuning so the cutoff can't drift.
const CEILING_HOURS = WORKABILITY_TUNING.ceilingHours;
// Label derived from the same constant: retune ceilingHours to 504 and this reads "3+ weeks"
// on its own, rather than lying with a baked-in "2+".
const CEILING_LABEL = `≈ ${WORKABILITY_TUNING.ceilingHours / 168}+ weeks`;
const half = (x: number): number => Math.round(x * 2) / 2;

/** Each endpoint carries its own unit tier: hours up to 48 h, days up to 240 h, weeks
 * beyond. The tier is chosen from the ROUNDED hour value so 47.6 h reads "2 days", never
 * a nonsensical "48 h". */
function endpoint(hours: number): { value: number; unit: 'h' | 'days' | 'weeks' } {
  const h = Math.round(hours);
  if (h < 48) return { value: h, unit: 'h' };
  if (hours < 240) return { value: half(hours / 24), unit: 'days' };
  return { value: half(hours / 168), unit: 'weeks' };
}

/**
 * Unit-adaptive label for one range, resolved PER ENDPOINT: time up to 48 h renders in
 * hours, beyond it in days (then weeks past 10 days). A range that straddles a seam mixes
 * units — "≈ 24 h – 2.5 days" — rather than dragging the early endpoint into the later
 * unit. A row that reaches the ceiling shows the open-ended ceiling label regardless.
 */
export function formatWorkabilityRange(range: WorkabilityRange): string {
  if (range.maxHours >= CEILING_HOURS) return CEILING_LABEL;
  const lo = endpoint(range.minHours);
  const hi = endpoint(range.maxHours);
  if (lo.unit !== hi.unit) return `≈ ${lo.value} ${lo.unit} – ${hi.value} ${hi.unit}`;
  if (lo.value === hi.value) return `≈ ${hi.value} ${hi.unit}`;
  return `≈ ${lo.value}–${hi.value} ${hi.unit}`;
}
