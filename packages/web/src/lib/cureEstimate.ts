import {
  estimateCureModel,
  type CureModelEstimate,
  type FattyAcidProfile,
  type WorkabilityEstimate,
} from '@soap-calc/core';
import type { ProcessProfile } from './processProfile';
import { PROCESS_DEFINITIONS, type ProcessId } from './process';

export type CureEstimate = {
  minWeeks: number;
  maxWeeks?: number;
  usableAtUnmold: boolean;
  /** The profile's own process finishing label (Cure/Sequester) — single-sourced from the
   * same profile the cure window is derived from, so it can never disagree with a
   * transiently mismatched process prop. */
  finishingLabel: string;
  workability?: WorkabilityEstimate | null;
  /** Recipe-derived two-milestone model; null falls back to the fixed per-process window
   * above (LS sequester, mid-edit recipes, unresolvable FA data). */
  model?: CureModelEstimate | null;
};

/** Cure/sequester window for a process; hot process is usable straight from the mold. */
export function estimateCure(
  profile: ProcessProfile,
  workability: WorkabilityEstimate | null = null,
  model: CureModelEstimate | null = null,
): CureEstimate {
  return {
    minWeeks: profile.finish.minWeeks,
    maxWeeks: profile.finish.maxWeeks,
    usableAtUnmold: profile.process === 'hp',
    finishingLabel: PROCESS_DEFINITIONS[profile.process].terms.finishingLabel,
    workability,
    model,
  };
}

/** Build the core model input from view-model state (mirrors computeWorkability's role). */
export function computeCureModel(args: {
  faProfile: FattyAcidProfile | null;
  coveragePercent: number;
  lyeConcentrationPercent: number | null | undefined;
  process: ProcessId;
}): CureModelEstimate | null {
  if (!args.faProfile) return null;
  return estimateCureModel({
    fa: args.faProfile,
    faCoverage: args.coveragePercent,
    lyeConcentrationPercent: args.lyeConcentrationPercent ?? Number.NaN,
    process: args.process,
  });
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
