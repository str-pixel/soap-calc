import { useMemo } from 'react';
import { analyzeFormulation } from '@soap-calc/core';
import type { LyeCalculationResult } from '@soap-calc/core';
import type { RecipePropertiesResult } from '@soap-calc/core';
import { calculateFattyAcidsForRecipe } from '../lib/calculateFattyAcids';
import type { RecipeLine, RecipeSettings } from '../lib/recipe';

type FormulationInsightOptions = {
  excludedOilWeightGrams?: number;
  splitLiquidGrams?: number | null;
};

export function useFormulationInsights(
  lines: RecipeLine[],
  settings: RecipeSettings,
  properties: RecipePropertiesResult,
  lyeResult: LyeCalculationResult | null,
  options: FormulationInsightOptions = {},
) {
  const fattyAcids = useMemo(
    () => calculateFattyAcidsForRecipe(lines, settings),
    [lines, settings],
  );

  const insights = useMemo(() => {
    if (!lyeResult) return [];
    return analyzeFormulation({
      properties: properties.properties,
      fattyAcids: fattyAcids.profile,
      totalOilGrams: lyeResult.totalOilWeightGrams,
      superfatPercent: Number(settings.superfatPercent) || 0,
      lyeConcentrationPercent: lyeResult.lyeConcentrationPercent,
      waterLyeRatio: lyeResult.waterLyeRatio,
      waterGrams: lyeResult.waterWeightGrams,
      lyeGrams: lyeResult.lyeWeightGrams,
      waterMode: settings.waterMode,
      excludedOilWeightGrams: options.excludedOilWeightGrams ?? 0,
      splitLiquidEnabled: settings.splitLiquid.enabled,
      splitLiquidGrams: options.splitLiquidGrams ?? null,
    });
  }, [
    fattyAcids.profile,
    lyeResult,
    options.excludedOilWeightGrams,
    options.splitLiquidGrams,
    properties.properties,
    settings.splitLiquid.enabled,
    settings.superfatPercent,
    settings.waterMode,
  ]);

  return { fattyAcids, insights };
}
