import type { CureWeeksRange } from '@soap-calc/core';

// Average weeks per month; the display threshold (13 wk ≈ 3 months) is from the spec —
// weeks become unreadable at castile scale.
const WEEKS_PER_MONTH = 4.345;
const MONTHS_THRESHOLD_WEEKS = 13;
const half = (x: number): number => Math.round(x * 2) / 2;

/** "≈ 4–6.5 weeks" below the threshold, "≈ 6–9 months" at or above; equal endpoints collapse. */
export function formatCureRange(range: CureWeeksRange): string {
  if (range.maxWeeks >= MONTHS_THRESHOLD_WEEKS) {
    const lo = Math.round(range.minWeeks / WEEKS_PER_MONTH);
    const hi = Math.round(range.maxWeeks / WEEKS_PER_MONTH);
    return lo === hi ? `≈ ${lo} months` : `≈ ${lo}–${hi} months`;
  }
  const lo = half(range.minWeeks);
  const hi = half(range.maxWeeks);
  return lo === hi ? `≈ ${lo} weeks` : `≈ ${lo}–${hi} weeks`;
}
