import { useMemo } from 'react';
import { oilPropertiesFromFattyAcids, type RecipePropertiesResult } from '@soap-calc/core';
import { calculateFattyAcidsForRecipe } from '../lib/calculateFattyAcids';
import { calculateRecipeIndexes } from '../lib/calculateRecipeIndexes';
import type { RecipeLine, RecipeSettings } from '../lib/recipe';

export function useRecipeProperties(lines: RecipeLine[], settings: RecipeSettings) {
  // All calcs read only `lines` (resolveLineWeights ignores settings by contract),
  // so typing in superfat/water/notes fields must not recompute oil-profile math.
  // The fatty-acid aggregation runs once here; properties are a linear sum of the
  // profile, so deriving them costs nothing extra.
  const fattyAcids = useMemo(() => calculateFattyAcidsForRecipe(lines, settings), [lines]);
  const properties = useMemo<RecipePropertiesResult>(
    () => ({
      properties: fattyAcids.profile ? oilPropertiesFromFattyAcids(fattyAcids.profile) : null,
      coveragePercent: fattyAcids.coveragePercent,
      missingOilIds: fattyAcids.missingOilIds,
    }),
    [fattyAcids],
  );
  const indexes = useMemo(() => calculateRecipeIndexes(lines, settings), [lines]);
  return { properties, indexes, fattyAcids };
}
