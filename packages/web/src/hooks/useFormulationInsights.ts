import { useMemo } from 'react';
import { analyzeFormulation } from '@soap-calc/core';
import type { LyeCalculationResult } from '@soap-calc/core';
import type { RecipePropertiesResult } from '@soap-calc/core';
import { calculateFattyAcidsForRecipe } from '../lib/calculateFattyAcids';
import type { RecipeLine, RecipeSettings } from '../lib/recipe';

export function useFormulationInsights(
  lines: RecipeLine[],
  settings: RecipeSettings,
  properties: RecipePropertiesResult,
  lyeResult: LyeCalculationResult | null,
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
    });
  }, [fattyAcids.profile, lyeResult, properties.properties, settings.superfatPercent]);

  return { fattyAcids, insights };
}
