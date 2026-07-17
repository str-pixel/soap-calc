import { calculateRecipeFattyAcids } from '@soap-calc/core';
import type { RecipeLine, RecipeSettings } from './recipe';
import { oilById, PROPERTIES_LOOKUP } from './oils';
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

  // Contributing oils whose profile is a modeled reconstruction (sourceType 'derived') — the
  // properties panel, batch sheet, and picker note these so the bars read as estimates.
  // Deduped; only weight-bearing oils.
  const modeledOilIds = [
    ...new Set(
      oilLines
        .filter((line) => oilById(line.oilId)?.sourceType === 'derived')
        .map((line) => line.oilId),
    ),
  ];

  return { ...calculateRecipeFattyAcids(oilLines, PROPERTIES_LOOKUP), modeledOilIds };
}
