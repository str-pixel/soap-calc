import type { RecipeLine, RecipeSettings } from './recipe';
import { oilById } from './oils';
import { resolveLineWeights } from './resolveLineWeights';

export type RecipeIndexResult = {
  iodine: number | null;
  ins: number | null;
  coveragePercent: number;
  missingOilIds: string[];
};

export function calculateRecipeIndexes(
  lines: RecipeLine[],
  settings: RecipeSettings,
): RecipeIndexResult {
  const { lines: resolved } = resolveLineWeights(lines, settings);
  const weighted = resolved.filter((row) => row.weightGrams > 0);
  const totalWeight = weighted.reduce((sum, row) => sum + row.weightGrams, 0);

  if (totalWeight <= 0) {
    return { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] };
  }

  let iodineSum = 0;
  let insSum = 0;
  let coveredWeight = 0;
  const missingOilIds = new Set<string>();

  for (const row of weighted) {
    const oil = oilById(row.line.oilId);
    if (!oil || oil.iodine === undefined || oil.ins === undefined) {
      missingOilIds.add(row.line.oilId);
      continue;
    }

    const ratio = row.weightGrams / totalWeight;
    coveredWeight += row.weightGrams;
    iodineSum += oil.iodine * ratio;
    insSum += oil.ins * ratio;
  }

  if (coveredWeight <= 0) {
    return { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] };
  }

  return {
    iodine: iodineSum,
    ins: insSum,
    coveragePercent: (coveredWeight / totalWeight) * 100,
    missingOilIds: [...missingOilIds],
  };
}
