import { useMemo } from 'react';
import { addExtraLye, alternativeLiquidPreset, calculateDilution, calculateNeutralization, extraLyeForAcidLiquid, lyeSolutionWaterStatus, parsePercentOfOil, scaleLyeResult, SOAP_FILL_DENSITY_G_PER_CM3, suggestLyeWaterWithSplitLiquid } from '@soap-calc/core';
import type { DilutionResult, NeutralizationResult } from '@soap-calc/core';
import { buildBatchSheetData, canPrintBatchSheet, waterModeLabel } from '../lib/batchSheet';
import { resolveSplitLiquidRows, splitLiquidCalcOverride, type ResolvedSplitLiquidRow } from '../lib/splitLiquidSizing';
import {
  computeExtrasGrams,
  computePostCookSuperfat,
  computeRecipeAdditives,
  splitLiquidWaterFraction } from '../lib/calculateAdditives';
import { computeCureModel, estimateCure, labelWeightGrams } from '../lib/cureEstimate';
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
  splitLiquidRows: ResolvedSplitLiquidRow[];
  fixedBatchExtrasGrams: number;
  postCookSuperfat: ReturnType<typeof computePostCookSuperfat>;
  waterSuggestion: ReturnType<typeof suggestLyeWaterWithSplitLiquid> | null;
  lyeWaterStatus: ReturnType<typeof lyeSolutionWaterStatus> | null;
  splitAllocation: { lyeWaterGrams: number; targetLiquidGrams: number } | null;
  acidExtraLye: { naohGrams: number; kohGrams: number } | null;
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
  // Budget sizing modes allocate the liquid out of the total-liquid target, so the calc
  // itself must see the allocated lye water (concentration, steps, and sheet then agree for
  // free). Oil totals don't depend on water, so the pre-calc line total is a safe basis.
  const splitOverride = useMemo(
    () => splitLiquidCalcOverride(previewSettings, lineTotals.totalWeightGrams),
    [previewSettings, lineTotals.totalWeightGrams],
  );
  const { result: fullResult, inputErrors, displayTotals, linePercents } = useRecipeCalculation(
    previewState.lines,
    splitOverride?.settingsForCalc ?? previewSettings,
    process,
  );
  // Gate on parsePercentOfOil (caps each row at 100, matching computePostCookSuperfat) so the
  // lye reduction and the "reserved" PCSF line can never diverge at an out-of-range percent.
  // Subtract mode reserves EVERY post-cook oil from the recipe, so sum their percents — and,
  // unlike a single row, the SUM can exceed 100 (e.g. 3 rows at 50%), so clamp the total to
  // just under 100. Reserving 100%+ of saponification is nonsensical; the clamp keeps
  // cookFactor in (0,1] rather than driving the scaled lye to zero or negative.
  const pcsfSubtractPercent = Math.min(
    99,
    previewSettings.postCookSuperfatOils.reduce(
      (sum, o) => sum + (parsePercentOfOil(o.percent) ?? 0),
      0,
    ),
  );
  const cookFactor =
    process !== 'cp' &&
    previewSettings.postCookSuperfatMethod === 'subtract' &&
    pcsfSubtractPercent > 0 &&
    Number(previewSettings.superfatPercent) >= 0
      ? // pcsfSubtractPercent is clamped to (0,99], so this stays in [0.01,1) — no negative
        // or zero cook factor even when several rows sum past 100.
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
  // Deliberately reads the BASE result, not finalResult: acid-compensation alkali (vinegar,
  // lye-stage citric) is consumed into a dissolved salt (acetate/citrate) — no soap solids
  // for the concentration model, no glycerin byproduct (0.55 g/g applies to saponified KOH
  // only). Do not "fix" this to finalResult.
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
  const acidLyeRecipe = useMemo(
    () => ({
      lyeType: previewSettings.lyeType,
      kohBlendPercent: Number(previewSettings.kohBlendPercent) || 0,
      naohPurityPercent: Number(previewSettings.naohPurityPercent) || 100,
      kohPurityPercent: Number(previewSettings.kohPurityPercent) || 100,
    }),
    [previewSettings.lyeType, previewSettings.kohBlendPercent, previewSettings.naohPurityPercent, previewSettings.kohPurityPercent],
  );
  const computedAdditives = useMemo(
    () =>
      computeRecipeAdditives(
        additives,
        {
          oilGrams: totalOilGrams,
          batchGrams: baseBatchGrams,
          solutionGrams,
        },
        // Compensation is stage-aware inside computeRecipeAdditives (after_cook acid is
        // never compensated, any process) — so the recipe context flows unconditionally.
        acidLyeRecipe,
      ),
    [additives, totalOilGrams, baseBatchGrams, solutionGrams, acidLyeRecipe],
  );
  // Ratio-mode overrides only know the total-liquid target post-calc: N × lye grams.
  const overrideTargetGrams = (r: { lyeWeightGrams: number }) =>
    splitOverride
      ? splitOverride.targetLiquidGrams ?? splitOverride.targetRatio! * r.lyeWeightGrams
      : null;
  const splitAllocation =
    splitOverride && result
      ? { lyeWaterGrams: result.waterWeightGrams, targetLiquidGrams: overrideTargetGrams(result)! }
      : null;
  // Memoized: rows' identity feeds several memos below (acid, floor check, suggestion,
  // insights, batch sheet) — an unstable array would silently disable all of them.
  const resolvedSplit = useMemo(
    () =>
      previewSettings.splitLiquids.length > 0 && result
        ? resolveSplitLiquidRows(previewSettings.splitLiquids, {
            totalOilGrams,
            // Budget rows size against the pre-allocation target; additive rows against
            // the recipe's own water (its only sensible "total liquid").
            targetLiquidGrams: overrideTargetGrams(result) ?? result.waterWeightGrams,
            lyeGrams: result.lyeWeightGrams,
          })
        : null,
    [previewSettings.splitLiquids, result, splitOverride, totalOilGrams],
  );
  const splitLiquidRows: ResolvedSplitLiquidRow[] = useMemo(
    () => resolvedSplit?.rows ?? [],
    [resolvedSplit],
  );
  const splitLiquidGrams =
    resolvedSplit && resolvedSplit.totalGrams > 0 ? resolvedSplit.totalGrams : null;
  // Acid liquids (vinegar) consume lye; compensate automatically so the stated superfat
  // survives. Sized against the base (saponification) lye, then folded into the result so
  // every downstream surface — concentration, steps, sheet — quotes the adjusted figures.
  const acidExtraLye = useMemo(() => {
    let naohGrams = 0;
    let kohGrams = 0;
    for (const { row, grams } of splitLiquidRows) {
      const preset = alternativeLiquidPreset(row.presetKey);
      if (!preset?.lyeNeutralization || grams == null || grams <= 0) continue;
      const extra = extraLyeForAcidLiquid(preset, grams, acidLyeRecipe);
      naohGrams += extra.naohGrams;
      kohGrams += extra.kohGrams;
    }
    return naohGrams > 0 || kohGrams > 0 ? { naohGrams, kohGrams } : null;
  }, [acidLyeRecipe, splitLiquidRows]);
  // Acid ADDITIVES (citric) get the same compensation as acid liquids, but through their
  // own memo: acidExtraLye is SplitLiquidPanel's display prop and must stay split-only.
  // Summing the lines' own extraLye (not re-deriving from the catalog) keeps the panel's
  // per-row figures and the lye result one computation — and inherits the LS gate above.
  const additiveAcidExtraLye = useMemo(() => {
    let naohGrams = 0;
    let kohGrams = 0;
    for (const line of computedAdditives) {
      naohGrams += line.extraLye?.naohGrams ?? 0;
      kohGrams += line.extraLye?.kohGrams ?? 0;
    }
    return naohGrams > 0 || kohGrams > 0 ? { naohGrams, kohGrams } : null;
  }, [computedAdditives]);
  // Grams in the batch that do not scale with the oils: grams-sized liquid rows plus the
  // acid lye they demand. The batch-target back-solve needs these to treat the batch as
  // affine rather than proportional. (%-based rows, budget rows, and %-dosed additives all
  // scale with the oils, so they stay out of this figure.)
  const fixedBatchExtrasGrams = useMemo(() => {
    let fixed = 0;
    for (const { row, grams } of splitLiquidRows) {
      if (row.sizeMode !== 'grams' || grams == null || grams <= 0) continue;
      fixed += grams;
      const preset = alternativeLiquidPreset(row.presetKey);
      if (preset?.lyeNeutralization) {
        const extra = extraLyeForAcidLiquid(preset, grams, acidLyeRecipe);
        fixed += extra.naohGrams + extra.kohGrams;
      }
    }
    return fixed;
  }, [acidLyeRecipe, splitLiquidRows]);
  const totalAcidExtraLye = useMemo(() => {
    if (!acidExtraLye && !additiveAcidExtraLye) return null;
    return {
      naohGrams: (acidExtraLye?.naohGrams ?? 0) + (additiveAcidExtraLye?.naohGrams ?? 0),
      kohGrams: (acidExtraLye?.kohGrams ?? 0) + (additiveAcidExtraLye?.kohGrams ?? 0),
    };
  }, [acidExtraLye, additiveAcidExtraLye]);
  const finalResult = useMemo(
    () => (result && totalAcidExtraLye ? addExtraLye(result, totalAcidExtraLye) : result),
    [result, totalAcidExtraLye],
  );
  // Post-cook superfat is an HP/LS-only concept. Gate on process so a CP recipe carrying a
  // stray non-zero postCookSuperfatPercent (hand-edited or imported — CP hides the field, so
  // the user has no way to clear it) can never silently change batch weight or render a PCSF
  // line. Memoize (like computedAdditives) so this object reference is stable across unrelated
  // renders and doesn't defeat the batchSheetData memo below.
  // Serialize the oils list for a by-value memo key (an array ref alone would recompute
  // whenever previewSettings is rebuilt), so the PCSF object identity stays stable across
  // unrelated renders and doesn't defeat the batchSheetData memo below.
  const pcsfOilsKey = JSON.stringify(previewSettings.postCookSuperfatOils);
  const postCookSuperfat = useMemo(
    () => (process === 'cp' ? null : computePostCookSuperfat(previewSettings, totalOilGrams)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [process, pcsfOilsKey, totalOilGrams],
  );
  const waterSuggestion = useMemo(() => {
    // Budget rows already allocated their water in the calc; only additive rows added at
    // trace still motivate a lye-water reduction, and never under an active override
    // (that would double-count).
    const traceGrams = splitLiquidRows.reduce(
      (sum, { row, grams }) => (row.addAt === 'trace' && grams != null ? sum + grams : sum),
      0,
    );
    if (!result || traceGrams <= 0 || splitOverride !== null) {
      return null;
    }
    const r = finalResult ?? result;
    return suggestLyeWaterWithSplitLiquid({
      waterGrams: r.waterWeightGrams,
      lyeGrams: r.lyeWeightGrams,
      totalOilGrams: totalOilGrams,
      splitLiquidGrams: traceGrams,
      waterMode: previewSettings.waterMode,
    });
  }, [
    previewSettings.waterMode,
    finalResult,
    result,
    splitLiquidRows,
    splitOverride,
    totalOilGrams,
  ]);

  // Effective-water floor check: only when the alternative liquid goes into the lye
  // solution. A custom liquid (no preset) is treated as pure water — no false alarms.
  const lyeWaterStatus = useMemo(() => {
    // Effective water each in-lye row actually brings to the solution.
    const inLyeWaterGrams = splitLiquidRows.reduce(
      (sum, { row, grams }) =>
        row.addAt === 'lye' && grams != null
          ? sum + grams * splitLiquidWaterFraction(row)
          : sum,
      0,
    );
    // A 'solvent' liquid (glycerin) contributes no water anywhere else (waterFraction 0)
    // but DOES dissolve lye when hot — the glycerin-method premise — so the 1:1
    // dissolution floor counts its full grams.
    const solventGrams = splitLiquidRows.reduce((sum, { row, grams }) => {
      const preset = alternativeLiquidPreset(row.presetKey);
      return row.addAt === 'lye' && grams != null && preset?.flags.includes('solvent')
        ? sum + grams
        : sum;
    }, 0);
    const anyInLye = splitLiquidRows.some(({ row, grams }) => row.addAt === 'lye' && grams != null);
    if (
      !result ||
      splitLiquidRows.length === 0 ||
      // The lye solution is at stake for an in-lye liquid, or when a budget allocation
      // reduced the lye water (which can starve the 1:1 floor at high liquid shares).
      (!anyInLye && splitOverride === null)
    ) {
      return null;
    }
    const r = finalResult ?? result;
    return lyeSolutionWaterStatus({
      waterGrams: r.waterWeightGrams + inLyeWaterGrams + solventGrams,
      lyeGrams: r.lyeWeightGrams,
      // The in-lye rows' effective water is already folded in above.
      splitLiquidGrams: 0,
      waterFraction: 1,
    });
  }, [
    finalResult,
    result,
    splitLiquidRows,
    splitOverride,
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
    // Insights reason about the same figures the user sees — acid-adjusted when present.
    finalResult ?? result,
    {
      splitLiquidGrams,
      splitLiquidRows: splitLiquidRows.map(({ row, grams }) => ({ addAt: row.addAt, grams })),
      suggestedLyeWaterGrams: waterSuggestion?.suggestedWaterGrams ?? null,
      splitLiquidWaterReductionGrams: waterSuggestion?.reductionGrams ?? null,
      additives: computedAdditives,
      postCookSuperfat,
      isLiquidSoap: process === 'ls',
      process,
      hpVesselMultiple,
      // Glycerin as lye-solution solvent (split row) or LS additive — drives the
      // glycerin_solvent_dilution advisory (core gates it to LS).
      lsGlycerinSolvent:
        splitLiquidRows.some(
          ({ row }) => alternativeLiquidPreset(row.presetKey)?.flags.includes('solvent') ?? false,
        ) || computedAdditives.some((a) => a.catalogId === 'glycerin'),
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
  // Recipe-derived cure model (two milestones); null mid-edit or on LS, where the
  // fixed per-process window below is the fallback the panel renders.
  const cureModel = useMemo(
    () =>
      computeCureModel({
        faProfile: fattyAcids.profile,
        coveragePercent: properties.coveragePercent,
        lyeConcentrationPercent: result?.lyeConcentrationPercent ?? null,
        process,
      }),
    [fattyAcids, properties, result, process],
  );
  const cureEstimate = useMemo(
    () => (profile ? estimateCure(profile, workability, cureModel) : null),
    [profile, workability, cureModel],
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
    const r = finalResult ?? result;
    if (!r || !displayTotals || !canPrintBatchSheet(r, displayTotals, inputErrors)) {
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
      result: r,
      displayTotals,
      additives: computedAdditives,
      splitLiquidRows,
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
    splitLiquidRows,
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
    result: finalResult ?? result,
    inputErrors,
    displayTotals,
    linePercents,
    totalOilGrams,
    computedAdditives,
    splitLiquidGrams,
    postCookSuperfat,
    waterSuggestion,
    lyeWaterStatus,
    splitAllocation,
    acidExtraLye,
    splitLiquidRows,
    fixedBatchExtrasGrams,
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
