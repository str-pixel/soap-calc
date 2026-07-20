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
