import type { ProcessProfile } from './processProfile';
import { PROCESS_DEFINITIONS } from './process';

export type CureEstimate = {
  minWeeks: number;
  maxWeeks?: number;
  usableAtUnmold: boolean;
  /** The profile's own process finishing label (Cure/Sequester) — single-sourced from the
   * same profile the cure window is derived from, so it can never disagree with a
   * transiently mismatched process prop. */
  finishingLabel: string;
};

/** Cure/sequester window for a process; hot process is usable straight from the mold. */
export function estimateCure(profile: ProcessProfile): CureEstimate {
  return {
    minWeeks: profile.finish.minWeeks,
    maxWeeks: profile.finish.maxWeeks,
    usableAtUnmold: profile.process === 'hp',
    finishingLabel: PROCESS_DEFINITIONS[profile.process].terms.finishingLabel,
  };
}

/**
 * Cured / label weight after water evaporates over cure. Only the water-bearing base
 * batter (lye + water + saponifiable oils — NOT after-cook extras like fragrance, PCSF
 * oil, or additives, which don't lose water) evaporates, so the loss is computed from
 * `evaporatingBaseGrams` and subtracted off the full batch weight.
 */
export function labelWeightGrams(
  batchGrams: number,
  evaporatingBaseGrams: number,
  waterLossPercent: number,
): number {
  return batchGrams - evaporatingBaseGrams * waterLossPercent;
}
