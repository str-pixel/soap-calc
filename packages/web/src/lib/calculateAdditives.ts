import {
  gramsFromDose,
  gramsFromPercentOfOil,
  parseDoseAmount,
  parsePercentOfOil,
  type DoseBasis,
  type DoseUnit,
} from '@soap-calc/core';
import type { AdditiveLine, RecipeSettings } from './recipe';

export type ComputedAdditive = {
  key: string;
  catalogId: string;
  name: string;
  amount: number;
  basis: DoseBasis;
  unit: DoseUnit;
  grams: number;
  addAt: AdditiveLine['addAt'];
};

export function computeRecipeAdditives(
  additives: AdditiveLine[],
  { oilGrams, batchGrams }: { oilGrams: number; batchGrams: number },
): ComputedAdditive[] {
  const result: ComputedAdditive[] = [];
  for (const line of additives) {
    const basisWeight = line.basis === 'batch' ? batchGrams : oilGrams;
    if (basisWeight <= 0) continue;
    const amount = parseDoseAmount(line.amount, line.unit);
    if (amount === null || amount === 0) continue;
    const grams = gramsFromDose(basisWeight, amount, line.unit);
    if (grams === null) continue;
    result.push({
      key: line.key,
      catalogId: line.catalogId,
      name: line.name.trim() || 'Additive',
      amount,
      basis: line.basis,
      unit: line.unit,
      grams,
      addAt: line.addAt,
    });
  }
  return result;
}

export function computeSplitLiquidGrams(
  percentOfOil: string,
  totalOilGrams: number,
): number | null {
  if (totalOilGrams <= 0) return null;
  const percent = parsePercentOfOil(percentOfOil);
  if (percent === null || percent === 0) return null;
  return gramsFromPercentOfOil(totalOilGrams, percent);
}

export type ComputedPostCookSuperfat = {
  oilId: string;
  percentOfOil: number;
  grams: number;
};

/** The post-cook superfat: an oil added after cook/dilution with no lye effect.
 * Same % of recipe oil weight basis as additives/split-liquid; `null` when the % is
 * empty/zero/invalid or there's no recipe oil weight yet. */
export function computePostCookSuperfat(
  settings: Pick<RecipeSettings, 'postCookSuperfatPercent' | 'postCookSuperfatOilId'>,
  totalOilGrams: number,
): ComputedPostCookSuperfat | null {
  if (totalOilGrams <= 0) return null;
  const percent = parsePercentOfOil(settings.postCookSuperfatPercent);
  if (percent === null || percent === 0) return null;
  const grams = gramsFromPercentOfOil(totalOilGrams, percent);
  if (grams === null) return null;
  return { oilId: settings.postCookSuperfatOilId, percentOfOil: percent, grams };
}
