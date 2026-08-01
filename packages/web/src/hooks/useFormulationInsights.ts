import { useMemo } from 'react';
import {
  additiveMatches,
  analyzeFormulation,
  estimateTraceSpeed,
  
  sumFattyAcids,
  FATTY_ACID_GROUP_KEYS,
  LOW_COVERAGE_PERCENT,
  type LyeCalculationResult,
  type RecipeFattyAcidResult,
  type RecipePropertiesResult,
} from '@soap-calc/core';
import { oilById } from '../lib/oils';
import { processProfileById, isProcessVariantId, type ProcessId } from '../lib/process';
import type { ComputedAdditive, ComputedPostCookSuperfat } from '../lib/calculateAdditives';
import type { RecipeLine, RecipeSettings, SplitLiquidSettings } from '../lib/recipe';

export function totalAdditivePercentForInsights(
  additives: Array<{ catalogId?: string; grams: number }>,
  oilGrams: number,
  splitLiquidRows: Array<{ addAt: SplitLiquidSettings['addAt']; grams: number | null }>,
): number {
  const additivePercent =
    oilGrams > 0
      ? additives.reduce(
          // Glycerin is excluded: its LS dose (20–25% of oils) is a deliberate solvent
          // load, not "extras" — counting it would make the ~10% high_total_additives
          // warning permanent for every glycerin-method recipe. Same shape as the
          // excludeYogurt dedup on the sugar sum.
          (sum, item) =>
            item.catalogId === 'glycerin' ? sum : sum + (item.grams / oilGrams) * 100,
          0,
        )
      : 0;
  // Rows joining the batter (trace/oils) count toward additive load; in-lye rows are part
  // of the lye solution instead. Sized in grams by the view model, folded back to % of oils.
  const splitLiquidPercent =
    oilGrams > 0
      ? splitLiquidRows.reduce(
          (sum, row) =>
            (row.addAt === 'trace' || row.addAt === 'oils') && row.grams != null && row.grams > 0
              ? sum + (row.grams / oilGrams) * 100
              : sum,
          0,
        )
      : 0;
  return additivePercent + splitLiquidPercent;
}

/** Grams-weighted average PUFA % across the post-cook superfat oils — the blend's overall
 * polyunsaturated share, which is what the rancidity insight cares about. Oils without
 * fatty-acid data are skipped; returns undefined when none of the oils have data. */
export function postCookSuperfatPufaPercent(
  oils: ReadonlyArray<{ oilId: string; grams: number }>,
): number | undefined {
  let knownGrams = 0;
  let pufaWeighted = 0;
  for (const o of oils) {
    const fa = oilById(o.oilId)?.fattyAcids;
    if (!fa) continue;
    knownGrams += o.grams;
    pufaWeighted += sumFattyAcids(fa, FATTY_ACID_GROUP_KEYS.polyunsaturated) * o.grams;
  }
  return knownGrams > 0 ? pufaWeighted / knownGrams : undefined;
}

/** Yogurt additive line(s)' percent of oil weight (grams / totalOilGrams × 100) — mirrors
 * totalAdditivePercentForInsights' percent-of-oil math, scoped to just the yogurt line(s)
 * via additiveMatches (catalog id 'yogurt' or a custom-named line containing "yogurt"). */
export function hpYogurtPercentForInsights(
  additives: Array<{ catalogId: string; name: string; grams: number }>,
  totalOilGrams: number,
): number {
  if (totalOilGrams <= 0) return 0;
  return additives
    .filter((item) => additiveMatches([item], 'yogurt', 'yogurt'))
    .reduce((sum, item) => sum + (item.grams / totalOilGrams) * 100, 0);
}

/** Sugar-family additives' (sugar/sorbitol, honey, yogurt) combined percent of oil weight —
 * they all accelerate trace/heat retention similarly, so their doses are summed into one
 * total rather than tracked per-additive. Mirrors hpYogurtPercentForInsights' percent-of-oil
 * math; matches by catalog id or a custom-named line's keyword via additiveMatches. A line
 * is counted once even if its name matches more than one keyword (e.g. a custom line named
 * "sugar / sorbitol blend" matches both "sugar" and "sorbitol").
 *
 * `excludeYogurt` drops 'yogurt' from the keyword list — pass true for HP recipes, where
 * hp_yogurt_water already covers yogurt's water-deduction concern on its own; counting the
 * same yogurt line into this total too would double-warn on one additive line. Non-HP
 * callers (no hp_yogurt_water insight) omit the flag so yogurt still counts here.
 *
 * The result feeds the core `sugar_total_high` insight, whose ceiling is process-aware
 * (4% under CP, 5% under HP and LS) — this helper only computes the oil-relative total; the
 * threshold choice lives in @soap-calc/core/insights.ts. `additives[].grams` already reflects
 * each line's resolved dose regardless of dosing basis (oil/batch/solution — resolved
 * upstream by computeRecipeAdditives), so a solution-dosed LS sugar additive contributes its
 * true %-of-oil here, not an inflated solution-relative figure. */
export function sugarTotalPercentForInsights(
  additives: Array<{ catalogId: string; name: string; grams: number }>,
  totalOilGrams: number,
  excludeYogurt = false,
): number {
  if (totalOilGrams <= 0) return 0;
  const keywords = excludeYogurt
    ? ['sugar', 'sorbitol', 'honey']
    : ['sugar', 'sorbitol', 'honey', 'yogurt'];
  return additives
    .filter((item) => keywords.some((keyword) => additiveMatches([item], keyword, keyword)))
    .reduce((sum, item) => sum + (item.grams / totalOilGrams) * 100, 0);
}

type FormulationInsightOptions = {
  splitLiquidGrams?: number | null;
  splitLiquidRows?: Array<{ addAt: SplitLiquidSettings['addAt']; grams: number | null }>;
  suggestedLyeWaterGrams?: number | null;
  splitLiquidWaterReductionGrams?: number | null;
  additives?: ComputedAdditive[];
  postCookSuperfat?: ComputedPostCookSuperfat | null;
  /** The recipe's process — the only discriminator; threaded into analyzeFormulation so
   * HP-only insights can gate on process === 'hp' specifically. REQUIRED: analyzeFormulation's
   * own `process` is non-optional, and a silent CP fallback here would resurrect the retired
   * isLiquidSoap trap (LS recipe, CP gating, no type error). */
  process: ProcessId;
  /** Cook vessel volume ÷ batch volume (HP only), computed by the caller from an optional
   * vessel-size input. Undefined skips the hp_vessel_too_small guard entirely. */
  hpVesselMultiple?: number;
  /** Glycerin delivered as a lye-solution solvent (split row or LS additive) — drives the
   * glycerin_solvent_dilution advisory (core gates it to LS). */
  lsGlycerinSolvent?: boolean;
  /** Superfat points the split liquids' own fat adds on top of the stated superfat
   * (core gates the warning to LS, where it decides whether the soap separates). */
  lsSplitLiquidFatShiftPercent?: number;
  /** Every split liquid is glycerin — suppresses the dilute-with-plain-water advisory. */
  lsSplitLiquidIsSolventOnly?: boolean;
  /** EFFECTIVE (clamped) soaping temperature, °F. Feeds the CP overflow guard, and the
   * trace-speed temperature term for CP only — the term is calibrated against CP's
   * 120–130 °F average band, and an HP cook temperature through it would double-count
   * what the HP process already implies. */
  soapingTempF?: number;
};

export function useFormulationInsights(
  lines: RecipeLine[],
  settings: RecipeSettings,
  properties: RecipePropertiesResult,
  // Computed once by useRecipeProperties and shared, so the FA aggregation doesn't
  // run twice per lines change.
  fattyAcids: RecipeFattyAcidResult,
  lyeResult: LyeCalculationResult | null,
  options: FormulationInsightOptions,
) {
  const insights = useMemo(() => {
    // Split-liquid rows that actually resolved to grams (undefined when the caller passes
    // none, so the raw-settings fallback above still applies).
    const sizedSplitRows = options.splitLiquidRows
      ? options.splitLiquidRows.filter((r) => r.grams != null && r.grams > 0)
      : undefined;
    if (!lyeResult) return [];
    const totalAdditivePercent = totalAdditivePercentForInsights(
      options.additives ?? [],
      lyeResult.totalOilWeightGrams,
      options.splitLiquidRows ?? [],
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
    // Null where no sourced band exists (all LS variants) — the declaration now carries
    // what two process literals used to encode here.
    const waterBand = profile?.waterBand ?? undefined;
    const additiveEntries = (options.additives ?? []).map((item) => ({
      catalogId: item.catalogId,
      name: item.name,
    }));
    // Trace speed is a CP/HP soaping concern gated behind the same low-coverage check the
    // label itself is withheld on below — computing it (and the additive-keyword scan that
    // feeds it) for liquid soap or under low fatty-acid coverage is pure waste, since the
    // result is always discarded in that case (#5).
    const traceSpeedApplicable =
      options.process !== 'ls' && fattyAcids.coveragePercent >= LOW_COVERAGE_PERCENT;
    // Sugar-family accelerators speed up trace; keyword-match (not just today's catalog
    // ids) so a later wave adding sorbitol/yogurt as their own catalog entries is caught
    // without touching this hook again.
    const hasAcceleratingAdditive =
      traceSpeedApplicable &&
      (additiveMatches(additiveEntries, 'sugar', 'sugar') ||
        additiveMatches(additiveEntries, 'sorbitol', 'sorbitol') ||
        additiveMatches(additiveEntries, 'honey', 'honey') ||
        additiveMatches(additiveEntries, 'yogurt', 'yogurt'));
    const traceSpeed = traceSpeedApplicable
      ? estimateTraceSpeed({
          fattyAcids: fattyAcids.profile,
          hasAcceleratingAdditive,
          // CP-only calibration — see the soapingTempF option doc above.
          soapingTempF: options.process === 'cp' ? options.soapingTempF : undefined,
        })
      : null;
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
      // Derived from RESOLVED rows, not raw settings. The load-bearing half is
      // splitLiquidAddAt: a zero-gram in-lye row (the default state of a freshly added one)
      // used to flip the placement to 'lye' and silence split_liquid_water_not_adjusted and
      // split_liquid_high_trace_liquid with no liquid in the batch at all. splitLiquidEnabled
      // is belt-and-braces — every core consumer additionally requires splitLiquidGrams > 0,
      // which is already equivalent to sizedSplitRows.length > 0. Falls back to raw settings
      // only for callers that pass no resolved rows (tests).
      splitLiquidEnabled: sizedSplitRows
        ? sizedSplitRows.length > 0
        : settings.splitLiquids.length > 0,
      splitLiquidGrams: options.splitLiquidGrams ?? null,
      // Any in-lye row is the risk-relevant placement; otherwise the first row speaks.
      splitLiquidAddAt: (sizedSplitRows ?? settings.splitLiquids).some((r) => r.addAt === 'lye')
        ? ('lye' as const)
        : (sizedSplitRows ?? settings.splitLiquids)[0]?.addAt,
      suggestedLyeWaterGrams: options.suggestedLyeWaterGrams ?? null,
      splitLiquidWaterReductionGrams: options.splitLiquidWaterReductionGrams ?? null,
      totalAdditivePercent,
      additiveEntries,
      oilEntries,
      lyeType: settings.lyeType,
      kohBlendPercent: Number(settings.kohBlendPercent) || 0,
      postCookSuperfatPufaPercent: options.postCookSuperfat
        ? postCookSuperfatPufaPercent(options.postCookSuperfat.oils)
        : undefined,
      // Total post-cook superfat % of oils — core compounds it with the main superfat for
      // the LS cloud-threshold insights (a 2% + 2% recipe is ~4% effective, not 2%).
      postCookSuperfatPercent: options.postCookSuperfat?.percentOfOil,
      process: options.process,
      lsGlycerinSolvent: options.lsGlycerinSolvent,
      lsSplitLiquidFatShiftPercent: options.lsSplitLiquidFatShiftPercent,
      lsSplitLiquidIsSolventOnly: options.lsSplitLiquidIsSolventOnly,
      soapingTempF: options.soapingTempF,
      hpYogurtPercent:
        options.process === 'hp'
          ? hpYogurtPercentForInsights(options.additives ?? [], lyeResult.totalOilWeightGrams)
          : undefined,
      sugarTotalPercent: sugarTotalPercentForInsights(
        options.additives ?? [],
        lyeResult.totalOilWeightGrams,
        options.process === 'hp',
      ),
      waterBand,
      // At partial fatty-acid coverage the renormalized profile (and thus the predicted
      // trace speed derived from it) is unrepresentative — withhold the label rather than
      // let analyzeFormulation surface it as a confident reading. traceSpeed is already
      // null when not applicable (see traceSpeedApplicable above), so both fields are
      // naturally undefined together in that case.
      traceSpeedLabel: traceSpeed?.label,
      traceSpeedDrivers: traceSpeed?.drivers,
      hpVesselMultiple: options.hpVesselMultiple,
    });
  }, [
    fattyAcids.profile,
    fattyAcids.coveragePercent,
    properties.coveragePercent,
    lines,
    lyeResult,
    options.additives,
    options.splitLiquidGrams,
    options.suggestedLyeWaterGrams,
    options.splitLiquidWaterReductionGrams,
    options.postCookSuperfat,
    properties.properties,
    settings.splitLiquids,
    options.splitLiquidRows,
    settings.lyeType,
    settings.kohBlendPercent,
    settings.superfatPercent,
    settings.waterMode,
    settings.processVariant,
    options.process,
    options.hpVesselMultiple,
    // Transitively covered today (every settings edit rebuilds lyeResult, a listed dep),
    // but that coverage is an unstated 2-hop argument and nothing lints exhaustive-deps
    // here — list the direct inputs like every other options.* field above.
    options.soapingTempF,
    options.lsGlycerinSolvent,
    options.lsSplitLiquidFatShiftPercent,
    options.lsSplitLiquidIsSolventOnly,
  ]);

  return { insights };
}
