import { useEffect } from 'react';
import type { AdditiveLine, RecipeLine, RecipeSettings } from '../lib/recipe';
import type { ProcessId } from '../lib/process';
import { saveDraft } from '../lib/recipeStorage';

const AUTOSAVE_MS = 500;

export function useRecipeAutosave(
  process: ProcessId,
  recipeName: string,
  lines: RecipeLine[],
  settings: RecipeSettings,
  additives: AdditiveLine[],
) {
  useEffect(() => {
    const timer = setTimeout(() => {
      saveDraft(process, recipeName, lines, settings, additives);
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [process, recipeName, lines, settings, additives]);
}
