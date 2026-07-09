import { useMemo } from 'react';
import { analyzeFormulation, parsePercentOfOil, type LyeCalculationResult, type RecipePropertiesResult } from '@soap-calc/core';
import { calculateFattyAcidsForRecipe } from '../lib/calculateFattyAcids';
import { oilById } from '../lib/oils';
import type { ComputedAdditive } from '../lib/calculateAdditives';
import type { RecipeLine, RecipeSettings, SplitLiquidSettings } from '../lib/recipe';

export function totalAdditivePercentForInsights(
  additivePercents: number[],
  splitLiquid: Pick<SplitLiquidSettings, 'enabled' | 'addAt' | 'percentOfOil'>,
): number {
  const additivePercent = additivePercents.reduce((sum, item) => sum + item, 0);
  const splitLiquidCountsAsAdditive =
    splitLiquid.enabled &&
    (splitLiquid.addAt === 'trace' || splitLiquid.addAt === 'oils');
  const splitLiquidPercent = splitLiquidCountsAsAdditive
    ? parsePercentOfOil(splitLiquid.percentOfOil) ?? 0
    : 0;
  return additivePercent + splitLiquidPercent;
}

type FormulationInsightOptions = {
  excludedOilWeightGrams?: number;
  splitLiquidGrams?: number | null;
  suggestedLyeWaterGrams?: number | null;
  splitLiquidWaterReductionGrams?: number | null;
  additives?: ComputedAdditive[];
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
    const totalAdditivePercent = totalAdditivePercentForInsights(
      (options.additives ?? []).map((item) => item.percentOfOil),
      settings.splitLiquid,
    );
    const oilEntries = lines
      .filter((line) => Number(line.weightGrams) > 0 || Number(line.weightPercent) > 0)
      .map((line) => ({
        oilId: line.oilId,
        name: oilById(line.oilId)?.displayName ?? line.oilId,
      }));
    return analyzeFormulation({
      properties: properties.properties,
      fattyAcids: fattyAcids.profile,
      fattyAcidCoveragePercent: fattyAcids.coveragePercent,
      propertyCoveragePercent: properties.coveragePercent,
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
      splitLiquidAddAt: settings.splitLiquid.enabled ? settings.splitLiquid.addAt : undefined,
      suggestedLyeWaterGrams: options.suggestedLyeWaterGrams ?? null,
      splitLiquidWaterReductionGrams: options.splitLiquidWaterReductionGrams ?? null,
      totalAdditivePercent,
      additiveEntries: (options.additives ?? []).map((item) => ({
        catalogId: item.catalogId,
        name: item.name,
      })),
      oilEntries,
      lyeType: settings.lyeType,
      kohBlendPercent: Number(settings.kohBlendPercent) || 0,
    });
  }, [
    fattyAcids.profile,
    fattyAcids.coveragePercent,
    properties.coveragePercent,
    lines,
    lyeResult,
    options.additives,
    options.excludedOilWeightGrams,
    options.splitLiquidGrams,
    options.suggestedLyeWaterGrams,
    options.splitLiquidWaterReductionGrams,
    properties.properties,
    settings.splitLiquid.addAt,
    settings.splitLiquid.enabled,
    settings.splitLiquid.percentOfOil,
    settings.lyeType,
    settings.kohBlendPercent,
    settings.superfatPercent,
    settings.waterMode,
  ]);

  return { fattyAcids, insights };
}
