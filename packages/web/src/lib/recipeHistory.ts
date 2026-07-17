import type { SyncedRecipe } from './lineWeightSync';

/**
 * Undo/redo for the recipe-oils state. History stores whole {@link SyncedRecipe}
 * snapshots — the atomic `{lines, batchOilGrams, batchSetByUser}` unit PR #5
 * established — so a restore is exact (no lossy replay of the redistribution math)
 * and grams can never separate from their provenance flag.
 *
 * `gen` stamps the workspace the history belongs to. The editor gates reads on the
 * current workspace generation, so a New/Import/process-switch (which bumps the
 * generation) makes stale history unreachable without a separate reset call.
 */
export type HistoryState = {
  gen: number;
  past: SyncedRecipe[];
  future: SyncedRecipe[];
};

/** Depth cap: bounded memory, far beyond any realistic edit run. */
export const HISTORY_DEPTH = 50;

export function emptyHistory(gen: number): HistoryState {
  return { gen, past: [], future: [] };
}

function sameLines(a: SyncedRecipe['lines'], b: SyncedRecipe['lines']): boolean {
  if (a.length !== b.length) return false;
  return a.every((line, i) => {
    const other = b[i];
    return (
      line.key === other.key &&
      line.oilId === other.oilId &&
      line.weightGrams === other.weightGrams &&
      line.weightPercent === other.weightPercent &&
      line.tarLyeTreatment === other.tarLyeTreatment
    );
  });
}

/** Structural equality of the whole oils snapshot — used to skip no-op commits. */
export function sameSyncedRecipe(a: SyncedRecipe, b: SyncedRecipe): boolean {
  return (
    a.batchOilGrams === b.batchOilGrams &&
    a.batchSetByUser === b.batchSetByUser &&
    sameLines(a.lines, b.lines)
  );
}

/** Record `current` as the state to return to; a new edit invalidates the redo stack. */
export function pushHistory(state: HistoryState, current: SyncedRecipe): HistoryState {
  const past = [...state.past, current];
  // Evict oldest beyond the cap.
  const trimmed = past.length > HISTORY_DEPTH ? past.slice(past.length - HISTORY_DEPTH) : past;
  return { gen: state.gen, past: trimmed, future: [] };
}

export function undoHistory(
  state: HistoryState,
  current: SyncedRecipe,
): { next: HistoryState; restored: SyncedRecipe } | null {
  if (state.past.length === 0) return null;
  const restored = state.past[state.past.length - 1];
  return {
    restored,
    next: {
      gen: state.gen,
      past: state.past.slice(0, -1),
      future: [...state.future, current],
    },
  };
}

export function redoHistory(
  state: HistoryState,
  current: SyncedRecipe,
): { next: HistoryState; restored: SyncedRecipe } | null {
  if (state.future.length === 0) return null;
  const restored = state.future[state.future.length - 1];
  return {
    restored,
    next: {
      gen: state.gen,
      past: [...state.past, current],
      future: state.future.slice(0, -1),
    },
  };
}
