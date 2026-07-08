import { gramsFromPercentOfOil, parsePercentOfOil } from '@soap-calc/core';
import type { AdditiveLine } from './recipe';

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
