import { useCallback, useRef } from 'react';
import type { RecipeLine, RecipeSettings } from '../lib/recipe';
import type { SyncedRecipe } from '../lib/lineWeightSync';

type SetLines = React.Dispatch<React.SetStateAction<RecipeLine[]>>;
type SetSettings = React.Dispatch<React.SetStateAction<RecipeSettings>>;

export function useRecipeEditor(
  lines: RecipeLine[],
  batchOilGrams: string,
  batchSetByUser: boolean,
  setLines: SetLines,
  setSettings: SetSettings,
) {
  const linesRef = useRef(lines);
  const batchRef = useRef(batchOilGrams);
  const batchSetByUserRef = useRef(batchSetByUser);
  linesRef.current = lines;
  batchRef.current = batchOilGrams;
  batchSetByUserRef.current = batchSetByUser;

  const applySynced = useCallback(
    (synced: SyncedRecipe) => {
      linesRef.current = synced.lines;
      batchRef.current = synced.batchOilGrams;
      batchSetByUserRef.current = synced.batchSetByUser;
      setLines(synced.lines);
      // Persist batch grams and its provenance together so the flag can never drift from
      // the total it describes (a stale flag reintroduces the steal-from-lines bug).
      setSettings((settings) =>
        settings.batchOilGrams === synced.batchOilGrams &&
        settings.batchSetByUser === synced.batchSetByUser
          ? settings
          : {
              ...settings,
              batchOilGrams: synced.batchOilGrams,
              batchSetByUser: synced.batchSetByUser,
            },
      );
    },
    [setLines, setSettings],
  );

  const applySyncedUpdate = useCallback(
    (
      updater: (
        currentLines: RecipeLine[],
        currentBatch: string,
        currentBatchSetByUser: boolean,
      ) => SyncedRecipe,
    ) => {
      const synced = updater(linesRef.current, batchRef.current, batchSetByUserRef.current);
      applySynced(synced);
    },
    [applySynced],
  );

  return { applySynced, applySyncedUpdate, linesRef, batchRef, batchSetByUserRef };
}
