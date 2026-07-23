import { estimateWorkability, type GelMode, type WorkabilityEstimate } from '@soap-calc/core';
import type { ComputedAdditive } from './calculateAdditives';
import type { ProcessId } from './process';

/** Normalize computed additives (grams, any basis/unit) to percent-of-oil doses for the core estimator. */
export function additivesToDoses(
  additives: ComputedAdditive[],
  totalOilGrams: number,
): { id: string; dosePercent: number }[] {
  if (totalOilGrams <= 0) return [];
  return additives.map((a) => ({ id: a.catalogId, dosePercent: (a.grams / totalOilGrams) * 100 }));
}

export function computeWorkability(args: {
  hardness: number | null | undefined;
  coveragePercent: number;
  lyeConcentrationPercent: number | null | undefined;
  superfatPercent: string;
  process: ProcessId;
  gelMode: GelMode;
  additives: ComputedAdditive[];
  totalOilGrams: number;
}): WorkabilityEstimate | null {
  return estimateWorkability({
    hardnessScore: args.hardness ?? 0,
    faCoverage: args.coveragePercent,
    lyeConcentrationPercent: args.lyeConcentrationPercent ?? Number.NaN,
    superfatPercent: Number.parseFloat(args.superfatPercent),
    process: args.process,
    gelMode: args.gelMode,
    additives: additivesToDoses(args.additives, args.totalOilGrams),
  });
}
