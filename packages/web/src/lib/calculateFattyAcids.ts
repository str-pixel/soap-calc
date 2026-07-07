import { calculateRecipeFattyAcids } from '@soap-calc/core';
import type { RecipeLine, RecipeSettings } from './recipe';
import { PROPERTIES_LOOKUP } from './oils';
import { resolveLineWeights } from './resolveLineWeights';

export function calculateFattyAcidsForRecipe(
  lines: RecipeLine[],
  settings: RecipeSettings,
) {
  const { lines: resolved } = resolveLineWeights(lines, settings);
  const oilLines = resolved
    .map((row) => ({
      oilId: row.line.oilId,
      weightGrams: row.weightGrams,
    }))
    .filter((line) => line.weightGrams > 0);

  return calculateRecipeFattyAcids(oilLines, PROPERTIES_LOOKUP);
}
