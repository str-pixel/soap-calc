import { useMemo } from 'react';
import { calculateDilution, calculateNeutralization, parsePercentOfOil, scaleLyeResult, SOAP_FILL_DENSITY_G_PER_CM3, suggestLyeWaterWithSplitLiquid } from '@soap-calc/core';
import type { DilutionResult, NeutralizationResult } from '@soap-calc/core';
import { buildBatchSheetData, canPrintBatchSheet, waterModeLabel } from '../lib/batchSheet';
import {
  computeExtrasGrams,
  computePostCookSuperfat,
  computeRecipeAdditives,
  computeSplitLiquidGrams,
} from '../lib/calculateAdditives';
import { estimateCure, labelWeightGrams } from '../lib/cureEstimate';
import type { CureEstimate } from '../lib/cureEstimate';
import { computeWorkability } from '../lib/workabilityInput';
import { PERCENT_ROUNDING_EPSILON } from '../lib/lineWeightSync';
import { oilBatchFraction } from '../lib/moldSizer';
import { isProcessVariantId, processProfileById } from '../lib/processProfile';
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
  /** Cook vessel volume (cm³), from an optional user input; HP only. Feeds hpVesselMultiple
   * (vessel volume ÷ batch volume) for the hp_vessel_too_small guard. Omitted/invalid input
   * simply skips the guard — it's an optional check, not a required one. */
  vesselVolumeCm3?: number | null;
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
  pcsfIsExtra: boolean;
  extrasGrams: number;
  batchWeightWithExtras: number;
  liveOilBatchFraction: number | null;
  batchSheetData: ReturnType<typeof buildBatchSheetData> | null;
  cureEstimate: CureEstimate | null;
  labelWeight: number | null;
  /** Cook vessel volume ÷ batch volume, when a vessel volume was supplied for an HP recipe;
   * undefined otherwise. Mirrors what was fed into analyzeFormulation's hp_vessel_too_small
   * guard, so callers can render the same ratio without recomputing it. */
  hpVesselMultiple: number | undefined;
};

export function useRecipeViewModel({
  recipeName,
  lines,
  settings,
  additives,
  drafts,
  weightUnit,
  process,
  vesselVolumeCm3 = null,
}: UseRecipeViewModelArgs): RecipeViewModel {
  const previewState = usePreviewRecipeState(
    lines,
    settings.batchOilGrams,
    drafts,
    weightUnit,
    settings.batchSetByUser,
  );
  const previewLineByKey = useMemo(
    () => Object.fromEntries(previewState.lines.map((line) => [line.key, line])),
    [previewState.lines],
  );
  const previewSettings = usePreviewSettings(
    settings,
    previewState.batchOilGrams,
    previewState.batchSetByUser,
  );
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
  // Each line's grams is rounded to a whole gram (round(percent × total)), so a recipe that
  // sums to 100% can still miss the batch by up to ~0.5 g per line. Absorb that — otherwise
  // this warning fires while percentTotalOff (which tolerates the same rounding) stays clean.
  const weightRoundingTolerance = Math.max(1, percentLineCount * 0.5 + 0.5);
  const weightTotalOff =
    Number.isFinite(batchGramsTarget) &&
    batchGramsTarget > 0 &&
    lineTotals.totalWeightGrams > 0 &&
    Math.abs(lineTotals.totalWeightGrams - batchGramsTarget) > weightRoundingTolerance;
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
      ? // parsePercentOfOil caps the percent to [0,100] and this branch requires > 0, so the
        // value is already in (0,1) — no further clamping needed.
        1 - pcsfSubtractPercent / 100
      : 1;
  const result = useMemo(
    () => (cookFactor < 1 && fullResult ? scaleLyeResult(fullResult, cookFactor) : fullResult),
    [cookFactor, fullResult],
  );
  const totalOilGrams = displayTotals?.recipeOilWeightGrams ?? fullResult?.totalOilWeightGrams ?? 0;
  // The PCSF oil is an added extra whenever the subtract reserve is not actually applied:
  // append mode, or subtract mode under a lye excess where the cookFactor guard above forces
  // cookFactor back to 1. cookFactor === 1 is the single source of truth for "was the reserve
  // actually applied" — deriving this from the raw method string instead would let subtract's
  // PCSF line item disagree with the batch weight it's excluded from (#1).
  const pcsfIsExtra = cookFactor === 1;
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
            kohPurityPercent: Number(previewSettings.kohPurityPercent),
            naohPurityPercent: Number(previewSettings.naohPurityPercent),
            superfatPercent: Number(previewSettings.superfatPercent),
          })
        : null,
    [
      process,
      result,
      previewSettings.soapConcentrationPercent,
      previewSettings.kohPurityPercent,
      previewSettings.naohPurityPercent,
      previewSettings.superfatPercent,
    ],
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
  // Vessel-size guard multiple (HP only): vessel volume ÷ the water-bearing base batter
  // volume — additives fold in off-heat after the cook, so they aren't part of what the
  // vessel needs to hold while it expands. Optional: an unset/invalid vessel volume simply
  // omits hpVesselMultiple, which skips the guard entirely (see analyzeFormulation).
  //
  // SOAP_FILL_DENSITY_G_PER_CM3 (0.92) is the cured-bar fill-density proxy, not a
  // raw-batter density — the water-bearing cook batter this divides is closer to ~1.0
  // g/ml before water loss. Dividing by the lower cured density over-estimates
  // batchVolumeCm3, which under-estimates the resulting multiple: the guard fires
  // slightly more readily than the true (denser) batter would require. That's the safe
  // direction (conservative under-estimate), so it's left as-is rather than introducing
  // a separate raw-batter density constant.
  const hpVesselMultiple = useMemo(() => {
    if (process !== 'hp') return undefined;
    if (!Number.isFinite(vesselVolumeCm3) || (vesselVolumeCm3 ?? 0) <= 0) return undefined;
    if (baseBatchGrams <= 0) return undefined;
    const batchVolumeCm3 = baseBatchGrams / SOAP_FILL_DENSITY_G_PER_CM3;
    if (batchVolumeCm3 <= 0) return undefined;
    return (vesselVolumeCm3 as number) / batchVolumeCm3;
  }, [process, vesselVolumeCm3, baseBatchGrams]);
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
      splitLiquidGrams,
      suggestedLyeWaterGrams: waterSuggestion?.suggestedWaterGrams ?? null,
      splitLiquidWaterReductionGrams: waterSuggestion?.reductionGrams ?? null,
      additives: computedAdditives,
      postCookSuperfat,
      isLiquidSoap: process === 'ls',
      process,
      hpVesselMultiple,
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
    pcsfIsExtra,
  );
  const batchWeightWithExtras = baseBatchGrams + extrasGrams;
  // Guard against a carried-forward-but-stale processVariant (Wave A defensive pattern —
  // see coerceSettingsForProcess) before resolving the profile.
  const profile = isProcessVariantId(settings.processVariant)
    ? processProfileById(settings.processVariant)
    : null;
  // processProfileById returns a stable module-level object per variant, so `profile` is
  // referentially stable across renders — memoizing on it (rather than recomputing inline
  // every render) keeps these two objects/values stable too, which matters because
  // ResultsPanel is React.memo'd and a fresh object each render would defeat that memo (#1).
  const workability = useMemo(
    () =>
      computeWorkability({
        hardness: properties.properties?.hardness ?? null,
        coveragePercent: properties.coveragePercent,
        lyeConcentrationPercent: result?.lyeConcentrationPercent ?? null,
        superfatPercent: previewSettings.superfatPercent,
        process,
        gelMode: previewSettings.gelMode,
        additives: computedAdditives,
        totalOilGrams,
      }),
    [
      properties,
      result,
      previewSettings.superfatPercent,
      previewSettings.gelMode,
      computedAdditives,
      totalOilGrams,
      process,
    ],
  );
  const cureEstimate = useMemo(
    () => (profile ? { ...estimateCure(profile), workability } : null),
    [profile, workability],
  );
  // Only the water-bearing base batter evaporates over cure — after-cook extras (fragrance,
  // PCSF oil, additives) don't lose water, so the loss is computed off baseBatchGrams and
  // subtracted from the full batch weight (#6).
  const labelWeight = useMemo(
    () =>
      profile
        ? labelWeightGrams(batchWeightWithExtras, baseBatchGrams, profile.waterLossPercent)
        : null,
    [profile, batchWeightWithExtras, baseBatchGrams],
  );
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
      pcsfIsExtra,
      extrasGrams,
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
    extrasGrams,
    indexes,
    inputErrors,
    linePercents,
    lyeLabel,
    fattyAcids,
    insights,
    neutralization,
    pcsfIsExtra,
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
    pcsfIsExtra,
    extrasGrams,
    batchWeightWithExtras,
    liveOilBatchFraction,
    batchSheetData,
    cureEstimate,
    labelWeight,
    hpVesselMultiple,
  };
}
