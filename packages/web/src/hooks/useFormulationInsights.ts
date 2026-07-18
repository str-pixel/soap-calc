import { useMemo } from 'react';
import {
  additiveMatches,
  analyzeFormulation,
  estimateTraceSpeed,
  parsePercentOfOil,
  sumFattyAcids,
  FATTY_ACID_GROUP_KEYS,
  LOW_COVERAGE_PERCENT,
  type LyeCalculationResult,
  type RecipeFattyAcidResult,
  type RecipePropertiesResult,
} from '@soap-calc/core';
import { oilById } from '../lib/oils';
import { processProfileById, isProcessVariantId } from '../lib/processProfile';
import type { ProcessId } from '../lib/process';
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
 * is counted once even if its name matches more than one keyword (e.g. "Sugar / sorbitol"
 * matches both "sugar" and "sorbitol").
 *
 * `excludeYogurt` drops 'yogurt' from the keyword list — pass true for HP recipes, where
 * hp_yogurt_water already covers yogurt's water-deduction concern on its own; counting the
 * same yogurt line into this total too would double-warn on one additive line. Non-HP
 * callers (no hp_yogurt_water insight) omit the flag so yogurt still counts here.
 *
 * The result feeds the core `sugar_total_high` insight's 4% ceiling, which is oil-relative
 * (a CP-derived constant) and intentionally applied across every process — see that
 * insight's doc in @soap-calc/core/insights.ts for why. `additives[].grams` already reflects
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
  excludedOilWeightGrams?: number;
  splitLiquidGrams?: number | null;
  suggestedLyeWaterGrams?: number | null;
  splitLiquidWaterReductionGrams?: number | null;
  additives?: ComputedAdditive[];
  postCookSuperfat?: ComputedPostCookSuperfat | null;
  isLiquidSoap?: boolean;
  /** The recipe's process; threaded into analyzeFormulation so HP-only insights can gate on
   * process === 'hp' rather than !isLiquidSoap (which is also true for CP). */
  process?: ProcessId;
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
    const additiveEntries = (options.additives ?? []).map((item) => ({
      catalogId: item.catalogId,
      name: item.name,
    }));
    // Trace speed is a CP/HP soaping concern gated behind the same low-coverage check the
    // label itself is withheld on below — computing it (and the additive-keyword scan that
    // feeds it) for liquid soap or under low fatty-acid coverage is pure waste, since the
    // result is always discarded in that case (#5).
    const traceSpeedApplicable =
      !options.isLiquidSoap && fattyAcids.coveragePercent >= LOW_COVERAGE_PERCENT;
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
      excludedOilWeightGrams: options.excludedOilWeightGrams ?? 0,
      splitLiquidEnabled: settings.splitLiquid.enabled,
      splitLiquidGrams: options.splitLiquidGrams ?? null,
      splitLiquidAddAt: settings.splitLiquid.enabled ? settings.splitLiquid.addAt : undefined,
      suggestedLyeWaterGrams: options.suggestedLyeWaterGrams ?? null,
      splitLiquidWaterReductionGrams: options.splitLiquidWaterReductionGrams ?? null,
      totalAdditivePercent,
      additiveEntries,
      oilEntries,
      lyeType: settings.lyeType,
      kohBlendPercent: Number(settings.kohBlendPercent) || 0,
      postCookSuperfatPufaPercent: options.postCookSuperfat
        ? postCookSuperfatPufaPercent(options.postCookSuperfat.oilId)
        : undefined,
      isLiquidSoap: options.isLiquidSoap ?? false,
      process: options.process,
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
    options.process,
  ]);

  return { insights };
}
