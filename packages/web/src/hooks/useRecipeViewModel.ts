import { useMemo } from 'react';
import { calculateDilution, calculateNeutralization, parsePercentOfOil, scaleLyeResult, suggestLyeWaterWithSplitLiquid } from '@soap-calc/core';
import type { DilutionResult, NeutralizationResult } from '@soap-calc/core';
import { buildBatchSheetData, canPrintBatchSheet, waterModeLabel } from '../lib/batchSheet';
import {
  computeExtrasGrams,
  computePostCookSuperfat,
  computeRecipeAdditives,
  computeSplitLiquidGrams,
} from '../lib/calculateAdditives';
import { PERCENT_ROUNDING_EPSILON } from '../lib/lineWeightSync';
import { oilBatchFraction } from '../lib/moldSizer';
import type { AdditiveLine, RecipeLine, RecipeSettings, WeightUnit } from '../lib/recipe';
import type { ProcessId } from '../lib/process';
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
  process: ProcessId;
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
  postCookSuperfat: ReturnType<typeof computePostCookSuperfat>;
  waterSuggestion: ReturnType<typeof suggestLyeWaterWithSplitLiquid> | null;
  properties: ReturnType<typeof useRecipeProperties>['properties'];
  indexes: ReturnType<typeof useRecipeProperties>['indexes'];
  fattyAcids: ReturnType<typeof useRecipeProperties>['fattyAcids'];
  insights: ReturnType<typeof useFormulationInsights>['insights'];
  lyeLabel: string;
  dilution: DilutionResult | null;
  neutralization: NeutralizationResult | null;
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
  process,
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
  // Percents are stored display-rounded to 0.1, so a perfectly balanced recipe can sum
  // to 100 ± 0.05 per contributing line (e.g. three equal lines resync to 33.3×3 = 99.9).
  // Only warn beyond what rounding alone can explain — and only count lines that
  // actually contribute a percent, so blank "+ Add oil" rows don't widen the tolerance.
  const percentLineCount = previewState.lines.filter(
    (line) => Number(line.weightPercent) > 0,
  ).length;
  const percentRoundingTolerance = PERCENT_ROUNDING_EPSILON * Math.max(1, percentLineCount);
  const percentTotalOff =
    lineTotals.totalPercent > 0 &&
    Math.abs(lineTotals.totalPercent - 100) > percentRoundingTolerance;
  const weightTotalOff =
    Number.isFinite(batchGramsTarget) &&
    batchGramsTarget > 0 &&
    lineTotals.totalWeightGrams > 0 &&
    Math.abs(lineTotals.totalWeightGrams - batchGramsTarget) > 1;
  const { result: fullResult, inputErrors, displayTotals, linePercents } = useRecipeCalculation(
    previewState.lines,
    previewSettings,
    process,
  );
  // Gate on parsePercentOfOil (caps at 100, matching computePostCookSuperfat) so the lye
  // reduction and the "reserved" PCSF line can never diverge at an out-of-range percent.
  const pcsfSubtractPercent = parsePercentOfOil(previewSettings.postCookSuperfatPercent) ?? 0;
  const cookFactor =
    process !== 'cp' &&
    previewSettings.postCookSuperfatMethod === 'subtract' &&
    pcsfSubtractPercent > 0 &&
    Number(previewSettings.superfatPercent) >= 0
      ? Math.min(1, Math.max(0, 1 - pcsfSubtractPercent / 100))
      : 1;
  const result = useMemo(
    () => (cookFactor < 1 && fullResult ? scaleLyeResult(fullResult, cookFactor) : fullResult),
    [cookFactor, fullResult],
  );
  const totalOilGrams = displayTotals?.recipeOilWeightGrams ?? fullResult?.totalOilWeightGrams ?? 0;
  const pcsfIsExtra = previewSettings.postCookSuperfatMethod !== 'subtract';
  // In subtract mode the real batch carries cook-factor-scaled lye/water, so batch-basis
  // additive doses and the displayed/printed batch weight must share the same base.
  const baseBatchGrams = pcsfIsExtra
    ? displayTotals?.batchWeightGrams ?? fullResult?.totalBatchWeightGrams ?? 0
    : (displayTotals?.recipeOilWeightGrams ?? 0) +
      (result?.lyeWeightGrams ?? 0) +
      (result?.waterWeightGrams ?? 0);
  const dilution = useMemo(
    () =>
      process === 'ls' && result
        ? calculateDilution({
            anhydrousGrams: result.totalOilWeightGrams + result.lyeWeightGrams,
            cookWaterGrams: result.waterWeightGrams,
            kohGrams: result.kohWeightGrams,
            naohGrams: result.naohWeightGrams,
            soapConcentrationPercent: Number(previewSettings.soapConcentrationPercent),
          })
        : null,
    [process, result, previewSettings.soapConcentrationPercent],
  );
  const neutralization = useMemo(
    () =>
      process === 'ls' && result
        ? calculateNeutralization({
            kohGrams: result.kohWeightGrams,
            naohGrams: result.naohWeightGrams,
            superfatPercent: Number(previewSettings.superfatPercent),
            kohPurityPercent: Number(previewSettings.kohPurityPercent),
            naohPurityPercent: Number(previewSettings.naohPurityPercent),
          })
        : null,
    [
      process,
      result,
      previewSettings.superfatPercent,
      previewSettings.kohPurityPercent,
      previewSettings.naohPurityPercent,
    ],
  );
  const solutionGrams = dilution?.solutionGrams ?? 0;
  const computedAdditives = useMemo(
    () =>
      computeRecipeAdditives(additives, {
        oilGrams: totalOilGrams,
        batchGrams: baseBatchGrams,
        solutionGrams,
      }),
    [additives, totalOilGrams, baseBatchGrams, solutionGrams],
  );
  const splitLiquidGrams =
    previewSettings.splitLiquid.enabled
      ? computeSplitLiquidGrams(previewSettings.splitLiquid.percentOfOil, totalOilGrams)
      : null;
  // Post-cook superfat is an HP/LS-only concept. Gate on process so a CP recipe carrying a
  // stray non-zero postCookSuperfatPercent (hand-edited or imported — CP hides the field, so
  // the user has no way to clear it) can never silently change batch weight or render a PCSF
  // line. Memoize (like computedAdditives) so this object reference is stable across unrelated
  // renders and doesn't defeat the batchSheetData memo below.
  const postCookSuperfat = useMemo(
    () => (process === 'cp' ? null : computePostCookSuperfat(previewSettings, totalOilGrams)),
    [process, previewSettings.postCookSuperfatPercent, previewSettings.postCookSuperfatOilId, totalOilGrams],
  );
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
  const { properties, indexes, fattyAcids } = useRecipeProperties(
    previewState.lines,
    previewSettings,
  );
  const { insights } = useFormulationInsights(
    previewState.lines,
    previewSettings,
    properties,
    fattyAcids,
    result,
    {
      excludedOilWeightGrams: displayTotals?.excludedFromLyeOilWeightGrams ?? 0,
      splitLiquidGrams,
      suggestedLyeWaterGrams: waterSuggestion?.suggestedWaterGrams ?? null,
      splitLiquidWaterReductionGrams: waterSuggestion?.reductionGrams ?? null,
      additives: computedAdditives,
      postCookSuperfat,
      isLiquidSoap: process === 'ls',
    },
  );
  const lyeLabel =
    settings.lyeType === 'dual'
      ? 'Total alkali'
      : settings.lyeType === 'naoh'
        ? 'NaOH'
        : 'KOH';
  const extrasGrams = computeExtrasGrams(
    computedAdditives,
    splitLiquidGrams,
    postCookSuperfat,
    previewSettings.postCookSuperfatMethod,
  );
  const batchWeightWithExtras = baseBatchGrams + extrasGrams;
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
      process,
      lyeLabel,
      settings: previewSettings,
      lines: previewState.lines,
      linePercents,
      result,
      displayTotals,
      additives: computedAdditives,
      splitLiquid: previewSettings.splitLiquid,
      splitLiquidGrams,
      postCookSuperfat,
      postCookSuperfatMethod: previewSettings.postCookSuperfatMethod,
      dilution,
      neutralization,
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
    dilution,
    displayTotals,
    indexes,
    inputErrors,
    linePercents,
    lyeLabel,
    fattyAcids,
    insights,
    neutralization,
    postCookSuperfat,
    previewSettings,
    previewState.lines,
    process,
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
    postCookSuperfat,
    waterSuggestion,
    properties,
    indexes,
    fattyAcids,
    insights,
    lyeLabel,
    dilution,
    neutralization,
    batchWeightWithExtras,
    liveOilBatchFraction,
    batchSheetData,
  };
}
