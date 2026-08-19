import { useMemo } from 'react';
import { addExtraLye, alternativeLiquidFatGrams, alternativeLiquidPreset, isAlternativeLiquidOfferedFor, calculateDilution, calculateNeutralization, extraLyeForAcidLiquid, lsMethodForTemp, lyeSolutionWaterStatus, parsePercentOfOil, scaleLyeResult, SOAP_FILL_DENSITY_G_PER_CM3, splitLiquidPasteWaterGrams, suggestLyeWaterWithSplitLiquid, superfatShiftFromLiquidFat } from '@soap-calc/core';
import type { DilutionResult, LsMethodInfo, NeutralizationResult } from '@soap-calc/core';
import { buildBatchSheetData, canPrintBatchSheet, waterModeLabel } from '../lib/batchSheet';
import { budgetSizingAvailable, resolveSplitLiquidRows, splitLiquidCalcOverride, type ResolvedSplitLiquidRow } from '../lib/splitLiquidSizing';
import {
  computeBottledSolutionGrams,
  computeExtrasGrams,
  computePostCookSuperfat,
  computeRecipeAdditives,
  preservativeDosingBasisGramsFor,
  splitLiquidWaterFraction } from '../lib/calculateAdditives';
import { computeCureModel, estimateCure, labelWeightGrams } from '../lib/cureEstimate';
import type { CureEstimate } from '../lib/cureEstimate';
import { ls30MinPackagePresent } from '../lib/ls30Min';
import { computeWorkability } from '../lib/workabilityInput';
import { PERCENT_ROUNDING_EPSILON } from '../lib/lineWeightSync';
import { oilBatchFraction } from '../lib/moldSizer';
import type { AdditiveLine, RecipeLine, RecipeSettings, WeightUnit } from '../lib/recipe';
import {
  defaultVariantFor,
  effectiveSoapingTempF,
  isProcessVariantId,
  processOffers,
  processProfileById,
  type ProcessId,
} from '../lib/process';
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
  /** The maker's scale reading for the whole batch's paste, in grams — the same App state
   * DilutionPanel and PortionDilutionResults read. Threaded into batchSheetData so a valid
   * measurement corrects the printed dilution water the same way it corrects the screen
   * (lib/measuredPaste's correctedDilutionWaterGrams, shared by both). */
  measuredPasteGrams?: string;
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
  /** Water the alternative liquids carry into the paste. Already deducted from the LS
   * dilution figure; surfaced so the Dilution panel can explain the deduction. */
  splitLiquidPasteWater: number;
  /** Grams of split liquid with undeclared water content. Non-zero means the dilution
   * figures are a lower bound, not a measurement — the UI must say so. */
  unknownLiquidGrams: number;
  /** The paste's true water (lye water + split-liquid water), independent of the
   * targetExceedsPaste clamp on dilutionWaterGrams. Feeds the Dilution panel's ratio-input
   * mode: pasteGrams = anhydrousGrams + cookWaterGrams. */
  cookWaterGrams: number;
  /** True when an in-lye liquid's water content is undeclared, so the 1:1 dissolution
   * floor cannot be checked either way. */
  lyeWaterUnverifiable: boolean;
  /** The 1:1 shortfall holds even counting every undeclared in-lye gram as pure water, so
   * the deficit is a fact rather than an artefact of excluding it. */
  lyeWaterShortfallCertain: boolean;
  /** True when the paste is over the target concentration regardless of what the undeclared
   * liquid turns out to contain — the verdict is a fact, not an assumption. */
  overDilutionCertain: boolean;
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
  /** The mass the LS batch actually bottles: solution base (real paste when the target
   * exceeds it) plus additives, append-mode PCSF oil, and split-liquid solids. Null
   * outside LS / before a dilution exists. See computeBottledSolutionGrams. */
  bottledSolutionGrams: number | null;
  /** The finished, ready-for-use mass of the WHOLE batch: `bottledSolutionGrams` when there
   * is one, else the dilution's own solution. The one figure the ≈ Finished product row,
   * the printed sheet and the Preservative snippet's batch-scope dose base all quote — see
   * finishedProductGramsFor. Null outside LS / before a dilution exists. */
  finishedProductGrams: number | null;
  /** The best-known WHOLE-BATCH paste mass — anhydrousGrams + cookWaterGrams, corrected
   * for an alternative liquid's non-water solids. Feeds PortionDilutionResults' remaining-mode
   * ceiling/composition basis. Null before a dilution exists. */
  wholeBatchPasteGrams: number | null;
  batchWeightWithExtras: number;
  liveOilBatchFraction: number | null;
  batchSheetData: ReturnType<typeof buildBatchSheetData> | null;
  /** Effective (clamped) soaping temperature, °F — see effectiveSoapingTempF. */
  soapingTempF: number;
  /** LS's temperature-derived method (cold/lowtemp/hightemp), with its label, gap status,
   * and sourced sequester window — see lsMethodForTemp. Null outside LS. */
  lsMethod: LsMethodInfo | null;
  /** True when the recipe carries the 30-minute no-paste package (glycerin + salt-or-
   * sodium-lactate) under the derived high-temp method — see ls30MinPackagePresent. */
  ls30Min: boolean;
  cureEstimate: CureEstimate | null;
  labelWeight: number | null;
  cureWaterLossPercent: number;
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
  measuredPasteGrams,
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
  // parsePercentOfOil REJECTS (returns null, NOT a clamped value) anything over 100 — so an
  // out-of-range single row must never reach this reduce, or "?? 0" would read it as an
  // unset row and silently reserve nothing while the panel still shows it as allocated. The
  // HIGH side is closed upstream, not here: SuperfatWaterPanel's updatePcsfOil caps a typed
  // row at its headroom, which is itself capped at 100, and normalizePostCookSuperfatOils
  // (lib/recipe.ts) clamps a loaded/imported row into [0, 100] (a saved file can carry any
  // string). The low side is NOT symmetrical: nothing clamps a NEGATIVE typed into a row, so
  // '-50' does reach this reduce and parsePercentOfOil returns null for it too. Here that is
  // the right answer — a negative reserve is meaningless, and 0 is what no row at all would
  // give — but it is a fallback doing the work, not an invariant: the panel goes on showing
  // that -50 in its field while its allocation note counts nothing for it. Blank and
  // non-numeric percents land on the same 0 for the same reason.
  // Subtract mode reserves EVERY post-cook oil from the recipe, so sum their percents — and,
  // unlike a single row, the SUM can still exceed 100 (e.g. 3 rows at 50%, each individually
  // in range), so clamp the total to just under 100. Reserving 100%+ of saponification is
  // nonsensical; the clamp keeps cookFactor in (0,1] rather than driving the scaled lye to
  // zero or negative.
  const pcsfSubtractPercent = Math.min(
    99,
    previewSettings.postCookSuperfatOils.reduce(
      (sum, o) => sum + (parsePercentOfOil(o.percent) ?? 0),
      0,
    ),
  );
  const cookFactor =
    processOffers(process, 'postCook') &&
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
            // No `?? result.waterWeightGrams` fallback: only budget rows read this, and
            // sizing a carve-out against the recipe's FULL water stacked the liquid on top
            // of the water instead of out of it. Additive rows (percent_of_oils, grams)
            // never read it — they size off `amount` and `totalOilGrams`.
            targetLiquidGrams: overrideTargetGrams(result),
            lyeGrams: result.lyeWeightGrams,
            budgetSizingAvailable: budgetSizingAvailable(previewSettings.waterMode),
          })
        : null,
    [previewSettings.splitLiquids, previewSettings.waterMode, result, splitOverride, totalOilGrams],
  );
  const splitLiquidRows: ResolvedSplitLiquidRow[] = useMemo(
    () => resolvedSplit?.rows ?? [],
    [resolvedSplit],
  );
  // Water the alternative liquids put in the paste before the cook. Deducted from the LS
  // dilution figure below, and reported so the Dilution panel can explain the deduction.
  const splitLiquidPasteWater = useMemo(
    () =>
      splitLiquidPasteWaterGrams(
        splitLiquidRows.map(({ row, grams }) => ({
          grams,
          // Unknown water content counts as ALL water here. That maximises the deduction,
          // which makes the printed dilution figure a LOWER BOUND — the least water the
          // batch can need — rather than a guess that could send the user over target.
          // unknownLiquidGrams below is what lets the UI label it as a bound.
          waterFraction: splitLiquidWaterFraction(row) ?? 1,
        })),
      ),
    [splitLiquidRows],
  );
  // Rows that actually made it into the batch. Aggregate predicates must read THIS, not the
  // raw rows: an unsized placeholder is not a liquid, and letting it vote flipped advisories
  // on and off with no ingredient behind them.
  const sizedSplitRows = useMemo(
    () => splitLiquidRows.filter(({ grams }) => grams != null && grams > 0),
    [splitLiquidRows],
  );
  // Grams of split liquid whose water content is undeclared. Non-zero means every
  // water-derived dilution figure is an assumption, not a measurement.
  const unknownLiquidGrams = useMemo(
    () =>
      splitLiquidRows.reduce(
        (sum, { row, grams }) =>
          grams != null && grams > 0 && splitLiquidWaterFraction(row) === null
            ? sum + grams
            : sum,
        0,
      ),
    [splitLiquidRows],
  );
  // The paste's true water: the lye water plus whatever the alternative liquids carried
  // in (every split-liquid stage is pre-cook, so that water is already in the pot when
  // dilution starts). Deliberately NOT derived as totalWaterGrams - dilutionWaterGrams:
  // calculateDilution clamps dilutionWaterGrams to 0 when targetExceedsPaste, which would
  // erase this. Exposed on the return object — the Dilution panel's ratio-input mode needs
  // it (pasteGrams = anhydrousGrams + cookWaterGrams) and cannot reconstruct it from
  // finalResult, since this deliberately reads the base result (see dilution below).
  const cookWaterGrams = useMemo(
    () => (result ? result.waterWeightGrams + splitLiquidPasteWater : 0),
    [result, splitLiquidPasteWater],
  );
  // Deliberately reads the BASE result, not finalResult: acid-compensation alkali (vinegar,
  // lye-stage citric) is consumed into a dissolved salt (acetate/citrate) — no soap solids
  // for the concentration model, no glycerin byproduct (0.55 g/g applies to saponified KOH
  // only). Do not "fix" this to finalResult.
  const dilution = useMemo(
    () =>
      processOffers(process, 'dilution') && result
        ? calculateDilution({
            anhydrousGrams: result.totalOilWeightGrams + result.lyeWeightGrams,
            // The paste's water is the lye water PLUS whatever water the alternative
            // liquids carried in — every split-liquid stage is pre-cook, so that water is
            // already in the pot when dilution starts. Counting only the lye water would
            // prescribe dilution water that is largely there already and land the finished
            // soap below its target concentration.
            cookWaterGrams,
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
      cookWaterGrams,
      previewSettings.soapConcentrationPercent,
      previewSettings.kohPurityPercent,
      previewSettings.naohPurityPercent,
      previewSettings.superfatPercent,
    ],
  );
  // Is the "already more dilute than the target" verdict CERTAIN, or could declaring the
  // unknown liquid's water content overturn it? Certain when the paste's water exceeds the
  // target even if every undeclared gram brought NO water at all — the most favourable case
  // for reaching the target. Suppressing the verdict on the mere presence of an unknown
  // dropped a warning that was provably right across the whole 0-100% range.
  const overDilutionCertain = useMemo(() => {
    if (!dilution || !result || !dilution.targetExceedsPaste) return false;
    const declaredCookWater =
      result.waterWeightGrams + (splitLiquidPasteWater - unknownLiquidGrams);
    return dilution.totalWaterGrams < declaredCookWater;
  }, [dilution, result, splitLiquidPasteWater, unknownLiquidGrams]);
  const neutralization = useMemo(
    () =>
      processOffers(process, 'neutralize') && result
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
  // Effective soaping temperature: the stored setting clamped into the ACTIVE variant's
  // slider range (clamp-at-read — the setting itself is never rewritten; see
  // effectiveSoapingTempF). Everything downstream (insights, trace speed, batch sheet,
  // panel readout) consumes this figure.
  const soapingVariant = isProcessVariantId(previewSettings.processVariant)
    ? previewSettings.processVariant
    : defaultVariantFor(process);
  const soapingTempF = effectiveSoapingTempF(previewSettings, soapingVariant);
  // LS's method (and its sourced sequester window) is derived from the hold temperature —
  // it is the method selector, not a display-only readout. Null for CP/HP, which keep
  // their own fixed finish.
  const lsMethod = useMemo(
    () => (process === 'ls' ? lsMethodForTemp(soapingTempF) : null),
    [process, soapingTempF],
  );
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
        // …but process scoping IS withheld: a line the process doesn't offer is inert.
        process,
      ),
    [additives, totalOilGrams, baseBatchGrams, solutionGrams, acidLyeRecipe, process],
  );
  const splitLiquidGrams =
    resolvedSplit && resolvedSplit.totalGrams > 0 ? resolvedSplit.totalGrams : null;
  // The best-known WHOLE-BATCH paste mass — corrects the recipe's own water-only figure
  // (anhydrousGrams + cookWaterGrams, the same expression DilutionPanel's ratio mode
  // already uses) for an alternative liquid's non-water solids: real mass sitting in the
  // pot that a water-only figure structurally misses (splitLiquidPasteWater is only the
  // liquid's WATER fraction; splitLiquidGrams is its total mass, so the difference is its
  // solids). Feeds PortionDilutionResults' remaining-mode ceiling/composition basis (see
  // lsPartialDilution's wholeBatchPasteGrams param) — without this, a legitimate remaining
  // reading above the water-only figure was falsely rejected on any split-liquid recipe,
  // and the composition it derived understated the pot's true paste mass. Null before a
  // dilution exists; equals the water-only figure exactly (no correction) when there is no
  // split liquid, so a no-split-liquid recipe's behaviour is unchanged.
  const wholeBatchPasteGrams = useMemo(() => {
    if (!dilution) return null;
    const splitLiquidSolidsGrams = Math.max(0, (splitLiquidGrams ?? 0) - splitLiquidPasteWater);
    return dilution.anhydrousGrams + cookWaterGrams + splitLiquidSolidsGrams;
  }, [dilution, cookWaterGrams, splitLiquidGrams, splitLiquidPasteWater]);
  // Acid liquids (vinegar) consume lye; compensate automatically so the stated superfat
  // survives. Sized against the base (saponification) lye, then folded into the result so
  // every downstream surface — concentration, steps, sheet — quotes the adjusted figures.
  const acidExtraLye = useMemo(() => {
    let naohGrams = 0;
    let kohGrams = 0;
    for (const { row, grams } of splitLiquidRows) {
      const preset = alternativeLiquidPreset(row.presetKey);
      if (!preset?.lyeNeutralization || grams == null || grams <= 0) continue;
      // Scoping the offer must scope the behaviour. A liquid this process doesn't offer
      // (vinegar under LS, from a recipe saved under CP) is inert: it keeps its grams and
      // its water, but earns no compensating alkali. Filtering only the picker left the
      // calculation path compensating for a liquid the app no longer offers here.
      if (!isAlternativeLiquidOfferedFor(preset, process)) continue;
      const extra = extraLyeForAcidLiquid(preset, grams, acidLyeRecipe);
      naohGrams += extra.naohGrams;
      kohGrams += extra.kohGrams;
    }
    return naohGrams > 0 || kohGrams > 0 ? { naohGrams, kohGrams } : null;
  }, [acidLyeRecipe, process, splitLiquidRows]);
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
      // Same guard as acidExtraLye — the batch back-solve and the lye result must agree on
      // how much alkali a stray liquid earns (none).
      if (preset?.lyeNeutralization && isAlternativeLiquidOfferedFor(preset, process)) {
        const extra = extraLyeForAcidLiquid(preset, grams, acidLyeRecipe);
        fixed += extra.naohGrams + extra.kohGrams;
      }
    }
    return fixed;
  }, [acidLyeRecipe, process, splitLiquidRows]);
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
  // line. Memoize on a serialized oils key rather than previewSettings (an array ref alone
  // would recompute whenever previewSettings is rebuilt) so this object reference stays
  // stable across unrelated renders and doesn't defeat the batchSheetData memo below. The
  // narrowed deps are safe by type: computePostCookSuperfat takes
  // Pick<RecipeSettings, 'postCookSuperfatOils'>, which pcsfOilsKey captures by value.
  const pcsfOilsKey = JSON.stringify(previewSettings.postCookSuperfatOils);
  const postCookSuperfat = useMemo(
    () =>
      processOffers(process, 'postCook')
        ? computePostCookSuperfat(previewSettings, totalOilGrams)
        : null,
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
  // solution. An undeclared liquid is EXCLUDED rather than assumed to be water — this
  // consumer needs a lower bound on real water, the opposite of the dilution deduction
  // above. It is not assumed to be zero water either (tea 99%, beer 92%, goat milk 88%
  // would all start false-alarming); the check reports itself unverifiable instead.
  // Grams of in-lye liquid whose water content nobody declared. Used as the UPPER bound on
  // water it could be carrying, so the shortfall check can tell "certainly short" from
  // "can't tell" instead of asserting a deficit built on an exclusion.
  const undeclaredInLyeGrams = splitLiquidRows.reduce(
    (sum, { row, grams }) =>
      row.addAt === 'lye' && grams != null && grams > 0 && splitLiquidWaterFraction(row) === null
        ? sum + grams
        : sum,
    0,
  );
  const lyeWaterStatus = useMemo(() => {
    // Effective water each in-lye row actually brings to the solution.
    const inLyeWaterGrams = splitLiquidRows.reduce(
      (sum, { row, grams }) => {
        const fraction = row.addAt === 'lye' && grams != null ? splitLiquidWaterFraction(row) : null;
        return fraction === null ? sum : sum + grams! * fraction;
      },
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
  // Excluding an undeclared liquid is what makes the shortfall arithmetic fire, so the
  // verdict must be qualified by the same exclusion. Certain only when the solution is
  // still short with every undeclared gram counted as pure water — the most generous case.
  // Otherwise the deficit is an artefact of the exclusion, not a fact about the batch.
  const lyeWaterShortfallCertain =
    lyeWaterStatus !== null &&
    lyeWaterStatus.shortfallGrams > 0 &&
    lyeWaterStatus.effectiveWaterGrams + undeclaredInLyeGrams < lyeWaterStatus.floorGrams;
  const lyeWaterUnverifiable =
    lyeWaterStatus !== null &&
    lyeWaterStatus.shortfallGrams > 0 &&
    undeclaredInLyeGrams > 0 &&
    !lyeWaterShortfallCertain;

  // Vessel-size guard multiple (HP only): vessel volume ÷ the water-bearing base batter
  // volume — additives fold in off-heat after the cook, so they aren't part of what the
  // vessel needs to hold while it expands. Optional: an unset/invalid vessel volume simply
  // omits hpVesselMultiple, which skips the guard entirely (see analyzeFormulation).
  //
  // SOAP_FILL_DENSITY_G_PER_CM3 (0.92) is the poured-soap mold-fill proxy (see
  // mold-sizer.ts for its verified provenance), not a
  // raw-batter density — the water-bearing cook batter this divides is closer to ~1.0
  // g/ml before water loss. Dividing by the lower cured density over-estimates
  // batchVolumeCm3, which under-estimates the resulting multiple: the guard fires
  // slightly more readily than the true (denser) batter would require. That's the safe
  // direction (conservative under-estimate), so it's left as-is rather than introducing
  // a separate raw-batter density constant.
  const hpVesselMultiple = useMemo(() => {
    if (!processOffers(process, 'hpVessel')) return undefined;
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
  // Glycerin as lye-solution solvent (split row) or LS additive — drives both the
  // glycerin_solvent_dilution advisory below and the 30-min-package predicate (LS only).
  // Only rows that actually resolve to grams get a vote. An unsized row is the DEFAULT
  // state of a freshly added one, so counting it fired the solvent advisory the moment
  // someone clicked "+ Add liquid". `grams > 0` is load-bearing beyond the null check:
  // a 'rest' row against an exhausted budget resolves to 0, not null.
  const lsGlycerinPresent =
    sizedSplitRows.some(({ row }) => {
      const preset = alternativeLiquidPreset(row.presetKey);
      return (
        (preset?.flags.includes('solvent') ?? false) &&
        isAlternativeLiquidOfferedFor(preset!, process)
      );
    }) || computedAdditives.some((a) => a.catalogId === 'glycerin');
  // Glycerin grams for the 30-min solvent-scale gate (sourced floor: >= 1x lye weight) —
  // sized split-liquid glycerin rows plus the glycerin additive line, summed rather than
  // unioned to a boolean since the source doses it by weight, not by presence.
  const lsGlycerinGrams =
    sizedSplitRows.reduce(
      (sum, { row, grams }) => (row.presetKey === 'glycerin' ? sum + (grams ?? 0) : sum),
      0,
    ) +
    computedAdditives.reduce(
      (sum, a) => (a.catalogId === 'glycerin' ? sum + a.grams : sum),
      0,
    );
  // 30-min no-paste package: the IN-ZONE high-temp method only (never the gap — the
  // usable-once-cooled clause is sourced only for the full 215 °F workflow) + the
  // solvent-scale glycerin / sodium-salt package — see ls30MinPackagePresent.
  const ls30Min =
    lsMethod?.method === 'hightemp' &&
    !lsMethod.inGap &&
    ls30MinPackagePresent({
      glycerinGrams: lsGlycerinGrams,
      lyeGrams: result?.lyeWeightGrams ?? 0,
      additives: computedAdditives,
    });
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
      cookWaterGrams,
      suggestedLyeWaterGrams: waterSuggestion?.suggestedWaterGrams ?? null,
      splitLiquidWaterReductionGrams: waterSuggestion?.reductionGrams ?? null,
      additives: computedAdditives,
      postCookSuperfat,
      process,
      hpVesselMultiple,
      lsGlycerinSolvent: lsGlycerinPresent,
      // Fat the alternative liquids bring in, as superfat points on top of the stated
      // figure. LS-gated in core: only liquid soap separates over the fat a milk adds.
      lsSplitLiquidFatShiftPercent: superfatShiftFromLiquidFat(
        alternativeLiquidFatGrams(
          splitLiquidRows.map(({ row, grams }) => ({ presetKey: row.presetKey, grams })),
        ),
        totalOilGrams,
      ),
      // Glycerin is the one alternative liquid that may go in the dilution water, so a
      // glycerin-only recipe skips the dilute-with-plain-water advisory.
      lsSplitLiquidIsSolventOnly:
        sizedSplitRows.length > 0 &&
        sizedSplitRows.every(
          ({ row }) => alternativeLiquidPreset(row.presetKey)?.flags.includes('solvent') ?? false,
        ),
      soapingTempF,
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
  // The mass the LS batch actually bottles — solution base plus the extras that ride
  // through (see computeBottledSolutionGrams for the full accounting, including why a
  // target that exceeds the paste switches the base to anhydrous + cook water).
  const bottledSolutionGrams =
    dilution && result
      ? computeBottledSolutionGrams({
          dilution,
          cookWaterGrams,
          extrasGrams,
          splitLiquidPasteWaterGrams: splitLiquidPasteWater,
          measuredPasteGrams,
          // Same corrected paste the panel's and the sheet's water figures are derived
          // from, so what this prices is what the maker is actually told to pour.
          wholeBatchPasteGrams,
          // And the same gradual record they read, which is what decides whether the paste
          // ceiling was widened — so this prices the pot those two surfaces pour against
          // rather than one chosen by a different rule.
          gradualWaterGrams: settings.gradualWaterGrams,
        })
      : null;
  // The same mass under one name for every surface that quotes it — see
  // finishedProductGramsFor for the rule and for why its fallback arm, dead on this path,
  // is still owed to the component-level callers.
  const finishedProductGrams = preservativeDosingBasisGramsFor(bottledSolutionGrams, dilution);
  // Guard against a carried-forward-but-stale processVariant (Wave A defensive pattern —
  // see normalizeSettingsWithinProcess) before resolving the profile.
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
  const cureEstimate = useMemo(() => {
    const base = profile
      ? estimateCure(profile, workability, cureModel, lsMethod?.sequester ?? null)
      : null;
    return base && ls30Min
      ? {
          ...base,
          note: 'Sequester is recommended, not required for the 30-minute no-paste method — the soap is usable as soon as it cools.',
        }
      : base;
  }, [profile, workability, cureModel, lsMethod, ls30Min]);
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
      measuredPasteGrams,
      wholeBatchPasteGrams,
      // Paired with wholeBatchPasteGrams: together they identify an alternative liquid's
      // non-water solids, which the floor under a measured paste counts. The sheet must
      // judge a reading by the same floor the panel does — see BatchSheetData.cookWaterGrams.
      cookWaterGrams,
      bottledSolutionGrams,
      unknownLiquidGrams,
      lyeWaterUnverifiable,
      overDilutionCertain,
      neutralization,
      properties,
      indexes,
      batchWeightWithExtras,
      waterModeLabel: waterModeLabel(previewSettings),
      soapingTempF,
      fattyAcids,
      insights,
    });
  }, [
    batchWeightWithExtras,
    computedAdditives,
    dilution,
    measuredPasteGrams,
    wholeBatchPasteGrams,
    cookWaterGrams,
    bottledSolutionGrams,
    displayTotals,
    extrasGrams,
    indexes,
    inputErrors,
    linePercents,
    lyeLabel,
    lyeWaterUnverifiable,
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
    // finalResult is what the sheet actually prints; result stays listed because the memo
    // falls back to it. Every finalResult input is already covered transitively (its own
    // deps are result + totalAcidExtraLye, which reduce to previewSettings, splitLiquidRows
    // and computedAdditives above), so this is convention-consistency with waterSuggestion /
    // lyeWaterStatus rather than a live fix — but the project has no exhaustive-deps lint to
    // catch it if that coverage ever regresses.
    finalResult,
    result,
    settings.batchNotes,
    soapingTempF,
    splitLiquidGrams,
    splitLiquidRows,
    unknownLiquidGrams,
    weightUnit,
    overDilutionCertain,
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
    splitLiquidPasteWater,
    unknownLiquidGrams,
    cookWaterGrams,
    lyeWaterUnverifiable,
    lyeWaterShortfallCertain,
    overDilutionCertain,
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
    bottledSolutionGrams,
    finishedProductGrams,
    wholeBatchPasteGrams,
    batchWeightWithExtras,
    liveOilBatchFraction,
    batchSheetData,
    soapingTempF,
    lsMethod,
    ls30Min,
    cureEstimate,
    labelWeight,
    /** Cure water loss for the active variant. The mold sizer's bars mode needs it to size
     * a WET batch that cures to the requested bar weight. */
    cureWaterLossPercent: profile?.waterLossPercent ?? 0,
    hpVesselMultiple,
  };
}
