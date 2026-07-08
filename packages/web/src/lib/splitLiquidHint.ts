import {
  lyeConcentrationPercent,
  type SplitLiquidWaterSuggestion,
  type WaterMode,
} from '@soap-calc/core';
import { formatInputNumber } from './format';
import { formatWeight, type WeightUnit } from './weightUnits';

export function splitLiquidManualWaterHint(input: {
  waterMode: WaterMode;
  waterSuggestion: SplitLiquidWaterSuggestion;
  lyeGrams: number;
  totalOilGrams: number;
  weightUnit: WeightUnit;
}): string | null {
  const { waterMode, waterSuggestion, lyeGrams, totalOilGrams, weightUnit } = input;
  if (waterMode === 'percent_of_oils') return null;

  const target = formatWeight(waterSuggestion.suggestedWaterGrams, weightUnit);
  const percentNote =
    totalOilGrams > 0
      ? ` (~${formatInputNumber((waterSuggestion.suggestedWaterGrams / totalOilGrams) * 100, 1)}% of oils)`
      : '';

  if (waterMode === 'lye_concentration') {
    const suggestedConc = lyeConcentrationPercent(lyeGrams, waterSuggestion.suggestedWaterGrams);
    if (suggestedConc !== null) {
      return `Aim for about ${target}${percentNote} — try ~${formatInputNumber(suggestedConc, 1)}% lye concentration.`;
    }
    return `Aim for about ${target}${percentNote} in the lye solution.`;
  }

  if (waterMode === 'lye_water_ratio') {
    if (lyeGrams > 0) {
      const ratio = waterSuggestion.suggestedWaterGrams / lyeGrams;
      return `Set water : lye ratio to about ${formatInputNumber(ratio, 2)} : 1 for ${target}${percentNote}.`;
    }
    return `Aim for about ${target}${percentNote} in the lye solution.`;
  }

  return null;
}
