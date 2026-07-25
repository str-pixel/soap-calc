import type { WaterMode } from './lye.js';

export type SplitLiquidWaterSuggestion = {
  suggestedWaterGrams: number;
  reductionGrams: number;
  /** When water mode is % of oils, equivalent suggested water %. */
  suggestedWaterPercentOfOils: number | null;
};

export function lyeConcentrationPercent(lyeGrams: number, waterGrams: number): number | null {
  if (!Number.isFinite(lyeGrams) || !Number.isFinite(waterGrams) || lyeGrams <= 0 || waterGrams < 0) {
    return null;
  }
  const total = lyeGrams + waterGrams;
  if (total <= 0) return null;
  return (lyeGrams / total) * 100;
}

export type LyeSolutionWaterStatus = {
  /** Water actually available to dissolve the lye: plain water plus the water fraction of
   * an alternative liquid added to the lye solution. */
  effectiveWaterGrams: number;
  /** The 1:1 water:lye dissolving floor. */
  floorGrams: number;
  /** How far the effective water falls below the floor (0 when the floor is met). */
  shortfallGrams: number;
};

/** Checks whether the lye solution still has enough real water to dissolve the lye when an
 * alternative liquid (which is never 100% water) is part of it. Liquids like canned coconut
 * milk (~68% water) or greek yogurt (~81%) can silently starve a 1:1 solution. */
export function lyeSolutionWaterStatus(input: {
  waterGrams: number;
  lyeGrams: number;
  splitLiquidGrams: number;
  waterFraction: number;
}): LyeSolutionWaterStatus | null {
  const { waterGrams, lyeGrams, splitLiquidGrams, waterFraction } = input;
  if (
    !Number.isFinite(waterGrams) ||
    !Number.isFinite(lyeGrams) ||
    !Number.isFinite(splitLiquidGrams) ||
    !Number.isFinite(waterFraction) ||
    waterGrams < 0 ||
    lyeGrams <= 0 ||
    splitLiquidGrams < 0 ||
    waterFraction <= 0 ||
    waterFraction > 1
  ) {
    return null;
  }

  const effectiveWaterGrams = waterGrams + splitLiquidGrams * waterFraction;
  const floorGrams = lyeGrams;
  const shortfallGrams = Math.max(0, floorGrams - effectiveWaterGrams);
  return { effectiveWaterGrams, floorGrams, shortfallGrams };
}

export function suggestLyeWaterWithSplitLiquid(input: {
  waterGrams: number;
  lyeGrams: number;
  totalOilGrams: number;
  splitLiquidGrams: number;
  waterMode: WaterMode;
}): SplitLiquidWaterSuggestion | null {
  const { waterGrams, lyeGrams, totalOilGrams, splitLiquidGrams, waterMode } = input;
  if (
    !Number.isFinite(waterGrams) ||
    !Number.isFinite(lyeGrams) ||
    !Number.isFinite(totalOilGrams) ||
    !Number.isFinite(splitLiquidGrams) ||
    splitLiquidGrams <= 0 ||
    totalOilGrams <= 0 ||
    waterGrams <= 0 ||
    lyeGrams <= 0
  ) {
    return null;
  }

  const minWaterGrams = lyeGrams;
  const maxReplaceable = Math.max(0, waterGrams - minWaterGrams);
  const reductionGrams = Math.min(splitLiquidGrams, maxReplaceable);
  const suggestedWaterGrams = waterGrams - reductionGrams;

  const suggestedWaterPercentOfOils =
    waterMode === 'percent_of_oils'
      ? (suggestedWaterGrams / totalOilGrams) * 100
      : null;

  return {
    suggestedWaterGrams,
    reductionGrams,
    suggestedWaterPercentOfOils,
  };
}
