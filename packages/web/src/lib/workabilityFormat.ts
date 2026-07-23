import type { WorkabilityRange } from '@soap-calc/core';

const CEILING_HOURS = 336; // 14 days — display ceiling only (see design doc)
const half = (x: number): number => Math.round(x * 2) / 2;

/** Unit-adaptive label chosen from maxHours; open-ended "2+ weeks" at/over the 14-day ceiling. */
export function formatWorkabilityRange(range: WorkabilityRange): string {
  const { minHours, maxHours } = range;
  if (maxHours >= CEILING_HOURS) return '≈ 2+ weeks';
  if (maxHours < 48) return `≈ ${Math.round(minHours)}–${Math.round(maxHours)} h`;
  if (maxHours < 240) return `≈ ${half(minHours / 24)}–${half(maxHours / 24)} days`;
  return `≈ ${half(minHours / 168)}–${half(maxHours / 168)} weeks`;
}
