import { alternativeLiquidPreset } from '@soap-calc/core';
import { catalogEntryById, isAdditiveOfferedFor, type AdditiveProcess } from '@soap-calc/core';
import { extraLyeForAcid } from '@soap-calc/core';
import {
  gramsFromDose,
  gramsFromPercentOfOil,
  parseDoseAmount,
  parsePercentOfOil,
  type DoseBasis,
  type DoseUnit,
} from '@soap-calc/core';
import type { AcidLyeRecipe } from '@soap-calc/core';
import type { AdditiveLine, RecipeSettings, SplitLiquidSettings } from './recipe';

export type ComputedAdditive = {
  key: string;
  catalogId: string;
  name: string;
  amount: number;
  basis: DoseBasis;
  unit: DoseUnit;
  grams: number;
  addAt: AdditiveLine['addAt'];
  /** Acid additives only (citric): compensation lye this line demands, for display.
   * Present only when computeRecipeAdditives received the acid recipe context. */
  extraLye?: { naohGrams: number; kohGrams: number };
};

export function computeRecipeAdditives(
  additives: AdditiveLine[],
  { oilGrams, batchGrams, solutionGrams }: { oilGrams: number; batchGrams: number; solutionGrams: number },
  acidLyeRecipe?: AcidLyeRecipe,
  /** The recipe's process. A line whose catalog entry is not offered here is INERT: no
   * grams, no batch weight, no dose advice. Optional so core-less callers and tests keep
   * working; when omitted, nothing is withheld. */
  process?: AdditiveProcess,
): ComputedAdditive[] {
  const result: ComputedAdditive[] = [];
  for (const line of additives) {
    // Scoping the offer must scope the behaviour. Filtering only the picker left an
    // imported or pre-gate line (glycerin under CP, say) still resolving grams and still
    // adding batch weight for an additive the app declines to offer there.
    if (process && line.catalogId) {
      const entry = catalogEntryById(line.catalogId);
      if (entry && !isAdditiveOfferedFor(entry, process)) continue;
    }
    const basisWeight =
      line.basis === 'batch' ? batchGrams : line.basis === 'solution' ? solutionGrams : oilGrams;
    if (basisWeight <= 0) continue;
    const amount = parseDoseAmount(line.amount, line.unit);
    if (amount === null || amount === 0) continue;
    const grams = gramsFromDose(basisWeight, amount, line.unit);
    if (grams === null) continue;
    // Acid compensation is a PRE-COOK concept: an acid dosed into the lye/oils/batter
    // consumes alkali that the calc must replace. An after_cook acid neutralizes the
    // finished soap's excess lye (the LS neutralization workflow) — compensating it would
    // add that lye straight back, in any process. Stage decides, not process.
    const factors =
      acidLyeRecipe && line.addAt !== 'after_cook'
        ? catalogEntryById(line.catalogId)?.lyeNeutralization
        : undefined;
    const extraLye = factors ? extraLyeForAcid(factors, grams, acidLyeRecipe!) : undefined;
    result.push({
      key: line.key,
      catalogId: line.catalogId,
      name: line.name.trim() || 'Additive',
      amount,
      basis: line.basis,
      unit: line.unit,
      grams,
      addAt: line.addAt,
      ...(extraLye ? { extraLye } : {}),
    });
  }
  return result;
}


export type ComputedPostCookSuperfatOil = {
  oilId: string;
  percentOfOil: number;
  grams: number;
};

export type ComputedPostCookSuperfat = {
  /** One entry per contributing oil row (percent > 0). */
  oils: ComputedPostCookSuperfatOil[];
  /** Sum of the rows' percent-of-oil — the total post-cook superfat %. */
  percentOfOil: number;
  /** Sum of the rows' grams — the total post-cook superfat weight. */
  grams: number;
};

/** Total off-recipe grams added to the batch: additives + trace split liquid + the
 * post-cook superfat when `pcsfIsExtra` is true (i.e. it isn't actually reserved from
 * the recipe oils). Single source of truth for the view model, ResultsPanel, and
 * BatchSheet — callers must pass the view model's `pcsfIsExtra`, not re-derive it from
 * the raw method string, since a subtract reserve under a lye excess is method:'subtract'
 * but never actually applied (see useRecipeViewModel's cookFactor guard). */
export function computeExtrasGrams(
  additives: Array<{ grams: number }>,
  splitLiquidGrams: number | null,
  postCookSuperfat: ComputedPostCookSuperfat | null,
  pcsfIsExtra: boolean,
): number {
  const additiveGrams = additives.reduce((sum, item) => sum + item.grams, 0);
  const pcsfGrams = pcsfIsExtra ? (postCookSuperfat?.grams ?? 0) : 0;
  return additiveGrams + (splitLiquidGrams ?? 0) + pcsfGrams;
}

/** The post-cook superfat: one or more oils added after cook/dilution with no lye effect.
 * Each row is a % of recipe oil weight (same basis as additives/split-liquid); the aggregate
 * `percentOfOil`/`grams` sum the contributing rows. `null` when no row has a valid, non-zero
 * percent or there's no recipe oil weight yet. */
export function computePostCookSuperfat(
  settings: Pick<RecipeSettings, 'postCookSuperfatOils'>,
  totalOilGrams: number,
): ComputedPostCookSuperfat | null {
  if (totalOilGrams <= 0) return null;
  const oils: ComputedPostCookSuperfatOil[] = [];
  for (const row of settings.postCookSuperfatOils) {
    const percent = parsePercentOfOil(row.percent);
    if (percent === null || percent === 0) continue;
    const grams = gramsFromPercentOfOil(totalOilGrams, percent);
    if (grams === null) continue;
    oils.push({ oilId: row.oilId, percentOfOil: percent, grams });
  }
  if (oils.length === 0) return null;
  return {
    oils,
    percentOfOil: oils.reduce((sum, o) => sum + o.percentOfOil, 0),
    grams: oils.reduce((sum, o) => sum + o.grams, 0),
  };
}

/** Resolve the fraction of a split liquid that is actually water. Presets carry their own
 * value; custom liquids use the optional % water input, and fall back to pure water when
 * it is blank or out of range — the assumption is disclosed in the panel. */
/** How a split-liquid row's water content is known. Distinguishing 'unknown' from
 * 'invalid' lets the panel say "declare it" vs "that value is being ignored". */
export type SplitLiquidWaterInputState = 'preset' | 'declared' | 'unknown' | 'invalid';

export function splitLiquidWaterInputState(
  splitLiquid: Pick<SplitLiquidSettings, 'presetKey' | 'customWaterPercent'>,
): SplitLiquidWaterInputState {
  if (alternativeLiquidPreset(splitLiquid.presetKey)) return 'preset';
  if (splitLiquid.customWaterPercent.trim() === '') return 'unknown';
  const percent = Number(splitLiquid.customWaterPercent);
  return Number.isFinite(percent) && percent > 0 && percent <= 100 ? 'declared' : 'invalid';
}

/**
 * The fraction of a split liquid that is water, or NULL when it is genuinely unknown.
 *
 * Null rather than a silent 1. The old default was safe for the 1:1 lye-dissolution floor
 * (assuming plenty of water avoids false shortfall alarms) and unsafe for the dilution
 * deduction added later (assuming plenty of water deducts the maximum, under-diluting the
 * soap) — the same fallback with opposite risk polarity per consumer. Making the unknown
 * explicit forces each consumer to pick its own safe direction, and forces the next one to
 * think about it. Consumers must handle null; there is no correct shared default.
 */
export function splitLiquidWaterFraction(
  splitLiquid: Pick<SplitLiquidSettings, 'presetKey' | 'customWaterPercent'>,
): number | null {
  const preset = alternativeLiquidPreset(splitLiquid.presetKey);
  if (preset) return preset.waterFraction;
  const percent = Number(splitLiquid.customWaterPercent);
  if (
    splitLiquid.customWaterPercent.trim() !== '' &&
    Number.isFinite(percent) &&
    percent > 0 &&
    percent <= 100
  ) {
    return percent / 100;
  }
  return null;
}
