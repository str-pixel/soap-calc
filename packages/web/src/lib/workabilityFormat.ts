import { WORKABILITY_TUNING, type WorkabilityRange } from '@soap-calc/core';

// 14 days — display ceiling only. Single-sourced from the estimator's tuning so the
// display cutoff can never silently drift from the model's own ceiling constant.
const CEILING_HOURS = WORKABILITY_TUNING.ceilingHours;
const half = (x: number): number => Math.round(x * 2) / 2;

/** Unit-adaptive label chosen from maxHours; open-ended "2+ weeks" at/over the 14-day ceiling. */
export function formatWorkabilityRange(range: WorkabilityRange): string {
  const { minHours, maxHours } = range;
  if (maxHours >= CEILING_HOURS) return '≈ 2+ weeks';
  if (maxHours < 48) return `≈ ${Math.round(minHours)}–${Math.round(maxHours)} h`;
  if (maxHours < 240) return `≈ ${half(minHours / 24)}–${half(maxHours / 24)} days`;
  return `≈ ${half(minHours / 168)}–${half(maxHours / 168)} weeks`;
}
