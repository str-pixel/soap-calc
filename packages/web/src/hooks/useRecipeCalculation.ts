import { useMemo } from 'react';
import { calculateRecipe } from '../lib/calculateRecipe';
import type { RecipeLine, RecipeSettings } from '../lib/recipe';

export function useRecipeCalculation(lines: RecipeLine[], settings: RecipeSettings) {
  return useMemo(() => calculateRecipe(lines, settings), [lines, settings]);
}
