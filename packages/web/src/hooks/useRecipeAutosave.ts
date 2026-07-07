import { useEffect } from 'react';
import type { AdditiveLine, RecipeLine, RecipeSettings } from '../lib/recipe';
import { saveDraft } from '../lib/recipeStorage';

const AUTOSAVE_MS = 500;

export function useRecipeAutosave(
  recipeName: string,
  lines: RecipeLine[],
  settings: RecipeSettings,
  additives: AdditiveLine[],
) {
  useEffect(() => {
    const timer = setTimeout(() => {
      saveDraft(recipeName, lines, settings, additives);
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [recipeName, lines, settings, additives]);
}
