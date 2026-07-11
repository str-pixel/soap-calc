import { useMemo } from 'react';
import { calculateRecipe } from '../lib/calculateRecipe';
import type { RecipeLine, RecipeSettings } from '../lib/recipe';
import type { ProcessId } from '../lib/process';

export function useRecipeCalculation(
  lines: RecipeLine[],
  settings: RecipeSettings,
  process: ProcessId,
) {
  return useMemo(() => calculateRecipe(lines, settings, process), [lines, settings, process]);
}
