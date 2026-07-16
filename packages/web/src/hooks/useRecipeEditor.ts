import { useCallback, useRef } from 'react';
import type { RecipeLine, RecipeSettings } from '../lib/recipe';
import type { SyncedRecipe } from '../lib/lineWeightSync';

type SetLines = React.Dispatch<React.SetStateAction<RecipeLine[]>>;
type SetSettings = React.Dispatch<React.SetStateAction<RecipeSettings>>;

export function useRecipeEditor(
  lines: RecipeLine[],
  batchOilGrams: string,
  setLines: SetLines,
  setSettings: SetSettings,
) {
  const linesRef = useRef(lines);
  const batchRef = useRef(batchOilGrams);
  linesRef.current = lines;
  batchRef.current = batchOilGrams;

  const applySynced = useCallback(
    (synced: SyncedRecipe) => {
      linesRef.current = synced.lines;
      batchRef.current = synced.batchOilGrams;
      setLines(synced.lines);
      setSettings((settings) => ({ ...settings, batchOilGrams: synced.batchOilGrams }));
    },
    [setLines, setSettings],
  );

  const applySyncedUpdate = useCallback(
    (updater: (currentLines: RecipeLine[], currentBatch: string) => SyncedRecipe) => {
      const synced = updater(linesRef.current, batchRef.current);
      applySynced(synced);
    },
    [applySynced],
  );

  return { applySynced, applySyncedUpdate, linesRef, batchRef };
}
