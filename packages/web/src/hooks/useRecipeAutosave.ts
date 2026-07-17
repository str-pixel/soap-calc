import { useEffect, useRef } from 'react';
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
  onSaveError?: () => void,
) {
  // Keep the latest callback in a ref so autosave binds to the timer without the
  // effect re-running (and re-scheduling the debounce) on every render.
  const onSaveErrorRef = useRef(onSaveError);
  onSaveErrorRef.current = onSaveError;

  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = saveDraft(process, recipeName, lines, settings, additives);
      if (!saved) onSaveErrorRef.current?.();
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [process, recipeName, lines, settings, additives]);
}
