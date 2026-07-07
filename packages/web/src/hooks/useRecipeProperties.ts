import { useMemo } from 'react';
import { calculatePropertiesForRecipe } from '../lib/calculateProperties';
import { calculateRecipeIndexes } from '../lib/calculateRecipeIndexes';
import type { RecipeLine, RecipeSettings } from '../lib/recipe';

export function useRecipeProperties(lines: RecipeLine[], settings: RecipeSettings) {
  const properties = useMemo(
    () => calculatePropertiesForRecipe(lines, settings),
    [lines, settings],
  );
  const indexes = useMemo(
    () => calculateRecipeIndexes(lines, settings),
    [lines, settings],
  );
  return { properties, indexes };
}
