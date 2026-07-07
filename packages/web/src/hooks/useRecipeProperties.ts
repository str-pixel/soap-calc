import { useMemo } from 'react';
import { calculatePropertiesForRecipe } from '../lib/calculateProperties';
import type { RecipeLine, RecipeSettings } from '../lib/recipe';

export function useRecipeProperties(lines: RecipeLine[], settings: RecipeSettings) {
  return useMemo(
    () => calculatePropertiesForRecipe(lines, settings),
    [lines, settings],
  );
}
