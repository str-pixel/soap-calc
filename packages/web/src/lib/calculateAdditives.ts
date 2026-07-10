import { gramsFromPercentOfOil, parsePercentOfOil } from '@soap-calc/core';
import type { AdditiveLine, RecipeSettings } from './recipe';

export type ComputedAdditive = {
  key: string;
  catalogId: string;
  name: string;
  percentOfOil: number;
  grams: number;
  addAt: AdditiveLine['addAt'];
};

export function computeRecipeAdditives(
  additives: AdditiveLine[],
  totalOilGrams: number,
): ComputedAdditive[] {
  if (totalOilGrams <= 0) return [];

  const result: ComputedAdditive[] = [];
  for (const line of additives) {
    const percent = parsePercentOfOil(line.percentOfOil);
    if (percent === null || percent === 0) continue;
    const grams = gramsFromPercentOfOil(totalOilGrams, percent);
    if (grams === null) continue;
    result.push({
      key: line.key,
      catalogId: line.catalogId,
      name: line.name.trim() || 'Additive',
      percentOfOil: percent,
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
