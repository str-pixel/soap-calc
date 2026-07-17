import { useMemo } from 'react';
import {
  analyzeFormulation,
  parsePercentOfOil,
  sumFattyAcids,
  FATTY_ACID_GROUP_KEYS,
  type LyeCalculationResult,
  type RecipeFattyAcidResult,
  type RecipePropertiesResult,
} from '@soap-calc/core';
import { oilById } from '../lib/oils';
import { processProfileById, isProcessVariantId } from '../lib/processProfile';
import type { ComputedAdditive, ComputedPostCookSuperfat } from '../lib/calculateAdditives';
import type { RecipeLine, RecipeSettings, SplitLiquidSettings } from '../lib/recipe';

export function totalAdditivePercentForInsights(
  additives: Array<{ grams: number }>,
  oilGrams: number,
  splitLiquid: Pick<SplitLiquidSettings, 'enabled' | 'addAt' | 'percentOfOil'>,
): number {
  const additivePercent =
    oilGrams > 0 ? additives.reduce((sum, item) => sum + (item.grams / oilGrams) * 100, 0) : 0;
  const splitLiquidCountsAsAdditive =
    splitLiquid.enabled &&
    (splitLiquid.addAt === 'trace' || splitLiquid.addAt === 'oils');
  const splitLiquidPercent = splitLiquidCountsAsAdditive
    ? parsePercentOfOil(splitLiquid.percentOfOil) ?? 0
    : 0;
  return additivePercent + splitLiquidPercent;
}

export function postCookSuperfatPufaPercent(oilId: string): number | undefined {
  const fa = oilById(oilId)?.fattyAcids;
  return fa ? sumFattyAcids(fa, FATTY_ACID_GROUP_KEYS.polyunsaturated) : undefined;
}

type FormulationInsightOptions = {
  excludedOilWeightGrams?: number;
  splitLiquidGrams?: number | null;
  suggestedLyeWaterGrams?: number | null;
  splitLiquidWaterReductionGrams?: number | null;
  additives?: ComputedAdditive[];
  postCookSuperfat?: ComputedPostCookSuperfat | null;
  isLiquidSoap?: boolean;
};

export function useFormulationInsights(
  lines: RecipeLine[],
  settings: RecipeSettings,
  properties: RecipePropertiesResult,
  // Computed once by useRecipeProperties and shared, so the FA aggregation doesn't
  // run twice per lines change.
  fattyAcids: RecipeFattyAcidResult,
  lyeResult: LyeCalculationResult | null,
  options: FormulationInsightOptions = {},
) {
  const insights = useMemo(() => {
    if (!lyeResult) return [];
    const totalAdditivePercent = totalAdditivePercentForInsights(
      options.additives ?? [],
      lyeResult.totalOilWeightGrams,
      settings.splitLiquid,
    );
    const oilEntries = lines
      .filter((line) => Number(line.weightGrams) > 0 || Number(line.weightPercent) > 0)
      .map((line) => ({
        oilId: line.oilId,
        name: oilById(line.oilId)?.displayName ?? line.oilId,
      }));
    const profile = isProcessVariantId(settings.processVariant)
      ? processProfileById(settings.processVariant)
      : null;
    const waterBand =
      profile && !options.isLiquidSoap && profile.process !== 'ls' ? profile.waterBand : undefined;
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
      postCookSuperfatPufaPercent: options.postCookSuperfat
        ? postCookSuperfatPufaPercent(options.postCookSuperfat.oilId)
        : undefined,
      isLiquidSoap: options.isLiquidSoap ?? false,
      waterBand,
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
    options.postCookSuperfat,
    properties.properties,
    settings.splitLiquid.addAt,
    settings.splitLiquid.enabled,
    settings.splitLiquid.percentOfOil,
    settings.lyeType,
    settings.kohBlendPercent,
    settings.superfatPercent,
    settings.waterMode,
    settings.processVariant,
    options.isLiquidSoap,
  ]);

  return { insights };
}
