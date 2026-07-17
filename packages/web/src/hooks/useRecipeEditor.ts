import { useCallback, useRef, useState } from 'react';
import type { RecipeLine, RecipeSettings } from '../lib/recipe';
import type { SyncedRecipe } from '../lib/lineWeightSync';
import {
  emptyHistory,
  pushHistory,
  redoHistory,
  sameSyncedRecipe,
  undoHistory,
  type HistoryState,
} from '../lib/recipeHistory';

type SetLines = React.Dispatch<React.SetStateAction<RecipeLine[]>>;
type SetSettings = React.Dispatch<React.SetStateAction<RecipeSettings>>;

export function useRecipeEditor(
  lines: RecipeLine[],
  batchOilGrams: string,
  batchSetByUser: boolean,
  setLines: SetLines,
  setSettings: SetSettings,
  workspaceGeneration: number,
) {
  const linesRef = useRef(lines);
  const batchRef = useRef(batchOilGrams);
  const batchSetByUserRef = useRef(batchSetByUser);
  linesRef.current = lines;
  batchRef.current = batchOilGrams;
  batchSetByUserRef.current = batchSetByUser;

  const [history, setHistory] = useState<HistoryState>(() => emptyHistory(workspaceGeneration));
  // Gate reads on the current workspace: if the generation moved (New / Import /
  // process switch), stale history is empty THIS render — undo/redo can't reach
  // a different recipe's snapshots, with no separate reset call to forget.
  const live = history.gen === workspaceGeneration ? history : emptyHistory(workspaceGeneration);

  const currentSnapshot = useCallback(
    (): SyncedRecipe => ({
      lines: linesRef.current,
      batchOilGrams: batchRef.current,
      batchSetByUser: batchSetByUserRef.current,
    }),
    [],
  );

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

  // Edit path: record the pre-edit snapshot (unless it's a no-op) and apply the new state.
  const applyEdit = useCallback(
    (next: SyncedRecipe) => {
      const current = currentSnapshot();
      if (!sameSyncedRecipe(current, next)) {
        setHistory((h) =>
          pushHistory(h.gen === workspaceGeneration ? h : emptyHistory(workspaceGeneration), current),
        );
      }
      applySynced(next);
    },
    [applySynced, currentSnapshot, workspaceGeneration],
  );

  const applySyncedUpdate = useCallback(
    (
      updater: (
        currentLines: RecipeLine[],
        currentBatch: string,
        currentBatchSetByUser: boolean,
      ) => SyncedRecipe,
    ) => {
      applyEdit(updater(linesRef.current, batchRef.current, batchSetByUserRef.current));
    },
    [applyEdit],
  );

  const undo = useCallback(() => {
    const res = undoHistory(live, currentSnapshot());
    if (!res) return;
    applySynced(res.restored);
    setHistory(res.next);
  }, [live, applySynced, currentSnapshot]);

  const redo = useCallback(() => {
    const res = redoHistory(live, currentSnapshot());
    if (!res) return;
    applySynced(res.restored);
    setHistory(res.next);
  }, [live, applySynced, currentSnapshot]);

  return {
    applySynced,
    applyEdit,
    applySyncedUpdate,
    linesRef,
    batchRef,
    batchSetByUserRef,
    undo,
    redo,
    canUndo: live.past.length > 0,
    canRedo: live.future.length > 0,
  };
}
