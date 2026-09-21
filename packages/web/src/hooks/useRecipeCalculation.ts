import { useMemo } from 'react';
import { calculateRecipe, recipeCalcKey } from '../lib/calculateRecipe';
import type { RecipeLine, RecipeSettings } from '../lib/recipe';
import type { ProcessId } from '../lib/process';

export function useRecipeCalculation(
  lines: RecipeLine[],
  settings: RecipeSettings,
  process: ProcessId,
) {
  // Keyed on the fields the calc reads (recipeCalcKey), not on the settings object: the
  // preview settings are rebuilt on every settings change, so a notes or temperature
  // keystroke used to recompute the lye result and, through its identity, the insights,
  // cure model and batch sheet (measured 2026-09-19). Same serialized-key discipline as
  // useRecipeViewModel's pcsfOilsKey.
  const calcKey = recipeCalcKey(settings);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content, see above
  return useMemo(() => calculateRecipe(lines, settings, process), [lines, calcKey, process]);
}
