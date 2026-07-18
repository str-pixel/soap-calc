import type { ProcessProfile } from './processProfile';

export type CureEstimate = { minWeeks: number; maxWeeks?: number; usableAtUnmold: boolean };

/** Cure/sequester window for a process; hot process is usable straight from the mold. */
export function estimateCure(profile: ProcessProfile): CureEstimate {
  return {
    minWeeks: profile.finish.minWeeks,
    maxWeeks: profile.finish.maxWeeks,
    usableAtUnmold: profile.process === 'hp',
  };
}

/** Cured / label weight after water evaporates over cure (loss is 0 for liquid soap). */
export function labelWeightGrams(batchGrams: number, waterLossPercent: number): number {
  return batchGrams * (1 - waterLossPercent);
}
