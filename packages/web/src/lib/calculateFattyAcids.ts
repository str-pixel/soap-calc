import { calculateRecipeFattyAcids } from '@soap-calc/core';
import type { RecipeLine, RecipeSettings } from './recipe';
import { oilById, PROPERTIES_LOOKUP } from './oils';
import { resolveLineWeights } from './resolveLineWeights';

/**
 * Core's fatty-acid aggregate plus the web-only provenance of the oils that fed it. Callers that
 * pass this around (the batch sheet, the panels) should use THIS type, not core's
 * RecipeFattyAcidResult — typing it as the narrower core shape hides `modeledOilIds` and forces
 * consumers to thread a second, duplicate copy of it alongside.
 */
export type RecipeFattyAcids = ReturnType<typeof calculateFattyAcidsForRecipe>;

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
