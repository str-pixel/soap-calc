import { useMemo } from 'react';
import { suggestLyeWaterWithSplitLiquid } from '@soap-calc/core';
import { buildBatchSheetData, canPrintBatchSheet, waterModeLabel } from '../lib/batchSheet';
import { computeRecipeAdditives, computeSplitLiquidGrams } from '../lib/calculateAdditives';
import { oilBatchFraction } from '../lib/moldSizer';
import type { AdditiveLine, RecipeLine, RecipeSettings, WeightUnit } from '../lib/recipe';
import type { RecipeCalculation } from '../lib/calculateRecipe';
import {
  computeRecipeLineTotals,
  hasRecipeLineData,
  usePreviewRecipeState,
  usePreviewSettings,
} from '../lib/recipePreview';
import { useFormulationInsights } from './useFormulationInsights';
import { useRecipeCalculation } from './useRecipeCalculation';
import { useRecipeProperties } from './useRecipeProperties';

export type UseRecipeViewModelArgs = {
  recipeName: string;
  lines: RecipeLine[];
  settings: RecipeSettings;
  additives: AdditiveLine[];
  drafts: Record<string, string>;
  weightUnit: WeightUnit;
};

export type RecipeViewModel = {
  previewState: { lines: RecipeLine[]; batchOilGrams: string };
  previewSettings: RecipeSettings;
  previewLineByKey: Record<string, RecipeLine>;
  lineTotals: { totalWeightGrams: number; totalPercent: number };
  showRecipeTotals: boolean;
  percentTotalOff: boolean;
  weightTotalOff: boolean;
  result: RecipeCalculation['result'];
  inputErrors: string[];
  displayTotals: RecipeCalculation['displayTotals'];
  linePercents: Map<string, number>;
  totalOilGrams: number;
  computedAdditives: ReturnType<typeof computeRecipeAdditives>;
  splitLiquidGrams: number | null;
  waterSuggestion: ReturnType<typeof suggestLyeWaterWithSplitLiquid> | null;
  properties: ReturnType<typeof useRecipeProperties>['properties'];
  indexes: ReturnType<typeof useRecipeProperties>['indexes'];
  fattyAcids: ReturnType<typeof useFormulationInsights>['fattyAcids'];
  insights: ReturnType<typeof useFormulationInsights>['insights'];
  lyeLabel: string;
  additiveGrams: number;
  extrasGrams: number;
  batchWeightWithExtras: number;
  liveOilBatchFraction: number | null;
  batchSheetData: ReturnType<typeof buildBatchSheetData> | null;
};

export function useRecipeViewModel({
  recipeName,
  lines,
  settings,
  additives,
  drafts,
  weightUnit,
}: UseRecipeViewModelArgs): RecipeViewModel {
  const previewState = usePreviewRecipeState(
    lines,
    settings.batchOilGrams,
    drafts,
    weightUnit,
  );
  const previewLineByKey = useMemo(
    () => Object.fromEntries(previewState.lines.map((line) => [line.key, line])),
    [previewState.lines],
  );
  const previewSettings = usePreviewSettings(settings, previewState.batchOilGrams);
  const lineTotals = useMemo(
    () => computeRecipeLineTotals(previewState.lines),
    [previewState.lines],
  );
  const showRecipeTotals = hasRecipeLineData(previewState.lines);
  const batchGramsTarget = Number(previewState.batchOilGrams);
  const percentTotalOff =
    lineTotals.totalPercent > 0 && Math.abs(lineTotals.totalPercent - 100) > 0.05;
  const weightTotalOff =
    Number.isFinite(batchGramsTarget) &&
    batchGramsTarget > 0 &&
    lineTotals.totalWeightGrams > 0 &&
    Math.abs(lineTotals.totalWeightGrams - batchGramsTarget) > 1;
  const { result, inputErrors, displayTotals, linePercents } = useRecipeCalculation(
    previewState.lines,
    previewSettings,
  );
  const totalOilGrams = displayTotals?.recipeOilWeightGrams ?? result?.totalOilWeightGrams ?? 0;
  const computedAdditives = useMemo(
    () => computeRecipeAdditives(additives, totalOilGrams),
    [additives, totalOilGrams],
  );
  const splitLiquidGrams =
    previewSettings.splitLiquid.enabled
      ? computeSplitLiquidGrams(previewSettings.splitLiquid.percentOfOil, totalOilGrams)
      : null;
  const waterSuggestion = useMemo(() => {
    if (
      !result ||
      !splitLiquidGrams ||
      !previewSettings.splitLiquid.enabled ||
      previewSettings.splitLiquid.addAt !== 'trace'
    ) {
      return null;
    }
    return suggestLyeWaterWithSplitLiquid({
      waterGrams: result.waterWeightGrams,
      lyeGrams: result.lyeWeightGrams,
      totalOilGrams: totalOilGrams,
      splitLiquidGrams,
      waterMode: previewSettings.waterMode,
    });
  }, [
    previewSettings.splitLiquid.addAt,
    previewSettings.splitLiquid.enabled,
    previewSettings.waterMode,
    result,
    splitLiquidGrams,
    totalOilGrams,
  ]);
  const { properties, indexes } = useRecipeProperties(previewState.lines, previewSettings);
  const { fattyAcids, insights } = useFormulationInsights(
    previewState.lines,
    previewSettings,
    properties,
    result,
    {
      excludedOilWeightGrams: displayTotals?.excludedFromLyeOilWeightGrams ?? 0,
      splitLiquidGrams,
      suggestedLyeWaterGrams: waterSuggestion?.suggestedWaterGrams ?? null,
      splitLiquidWaterReductionGrams: waterSuggestion?.reductionGrams ?? null,
      additives: computedAdditives,
    },
  );
  const lyeLabel =
    settings.lyeType === 'dual'
      ? 'Total alkali'
      : settings.lyeType === 'naoh'
        ? 'NaOH'
        : 'KOH';
  const additiveGrams = computedAdditives.reduce((sum, item) => sum + item.grams, 0);
  const extrasGrams = additiveGrams + (splitLiquidGrams ?? 0);
  const batchWeightWithExtras =
    (displayTotals?.batchWeightGrams ?? result?.totalBatchWeightGrams ?? 0) + extrasGrams;
  const liveOilBatchFraction = useMemo(() => {
    if (!displayTotals || batchWeightWithExtras <= 0) return null;
    return oilBatchFraction(displayTotals.recipeOilWeightGrams, batchWeightWithExtras);
  }, [batchWeightWithExtras, displayTotals]);
  const batchSheetData = useMemo(() => {
    if (!result || !displayTotals || !canPrintBatchSheet(result, displayTotals, inputErrors)) {
      return null;
    }
    return buildBatchSheetData({
      recipeName,
      batchNotes: settings.batchNotes,
      weightUnit,
      lyeLabel,
      settings: previewSettings,
      lines: previewState.lines,
      linePercents,
      result,
      displayTotals,
      additives: computedAdditives,
      splitLiquid: previewSettings.splitLiquid,
      splitLiquidGrams,
      properties,
      indexes,
      batchWeightWithExtras,
      waterModeLabel: waterModeLabel(previewSettings),
      fattyAcids,
      insights,
    });
  }, [
    batchWeightWithExtras,
    computedAdditives,
    displayTotals,
    indexes,
    inputErrors.length,
    linePercents,
    lyeLabel,
    fattyAcids,
    insights,
    previewSettings,
    previewState.lines,
    properties,
    recipeName,
    result,
    settings.batchNotes,
    splitLiquidGrams,
    weightUnit,
  ]);

  return {
    previewState,
    previewSettings,
    previewLineByKey,
    lineTotals,
    showRecipeTotals,
    percentTotalOff,
    weightTotalOff,
    result,
    inputErrors,
    displayTotals,
    linePercents,
    totalOilGrams,
    computedAdditives,
    splitLiquidGrams,
    waterSuggestion,
    properties,
    indexes,
    fattyAcids,
    insights,
    lyeLabel,
    additiveGrams,
    extrasGrams,
    batchWeightWithExtras,
    liveOilBatchFraction,
    batchSheetData,
  };
}
