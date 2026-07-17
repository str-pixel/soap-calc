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
  // historyRef mirrors `history` (setHist is its only writer), so handlers read the
  // freshest value even when several fire before a re-render — no stale-closure double-step.
  const historyRef = useRef(history);
  const setHist = useCallback((next: HistoryState) => {
    historyRef.current = next;
    setHistory(next);
  }, []);
  // Gate reads on the current workspace: if the generation moved (New / Import /
  // process switch), stale history is empty — undo/redo can't reach a different
  // recipe's snapshots, with no separate reset call to forget.
  const gate = useCallback(
    (h: HistoryState): HistoryState =>
      h.gen === workspaceGeneration ? h : emptyHistory(workspaceGeneration),
    [workspaceGeneration],
  );
  const live = gate(history);

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
        setHist(pushHistory(gate(historyRef.current), current));
      }
      applySynced(next);
    },
    [applySynced, currentSnapshot, gate, setHist],
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
    const res = undoHistory(gate(historyRef.current), currentSnapshot());
    if (!res) return;
    applySynced(res.restored);
    setHist(res.next);
  }, [gate, applySynced, currentSnapshot, setHist]);

  const redo = useCallback(() => {
    const res = redoHistory(gate(historyRef.current), currentSnapshot());
    if (!res) return;
    applySynced(res.restored);
    setHist(res.next);
  }, [gate, applySynced, currentSnapshot, setHist]);

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
