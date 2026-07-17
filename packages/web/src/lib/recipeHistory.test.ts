import { describe, expect, it } from 'vitest';
import {
  emptyHistory,
  HISTORY_DEPTH,
  pushHistory,
  redoHistory,
  sameSyncedRecipe,
  undoHistory,
} from './recipeHistory';
import type { SyncedRecipe } from './lineWeightSync';

function snap(batchOilGrams: string, weightGrams = '100'): SyncedRecipe {
  return {
    lines: [{ key: 'a', oilId: 'olive-oil', weightGrams, weightPercent: '100' }],
    batchOilGrams,
    batchSetByUser: false,
  };
}

describe('sameSyncedRecipe', () => {
  it('is true for structurally equal snapshots', () => {
    expect(sameSyncedRecipe(snap('100'), snap('100'))).toBe(true);
  });

  it('is false when a line weight differs', () => {
    expect(sameSyncedRecipe(snap('100', '100'), snap('100', '200'))).toBe(false);
  });

  it('is false when batchSetByUser differs', () => {
    const a = snap('100');
    expect(sameSyncedRecipe(a, { ...a, batchSetByUser: true })).toBe(false);
  });

  it('is false when the line set changes length', () => {
    const a = snap('100');
    const b: SyncedRecipe = {
      ...a,
      lines: [...a.lines, { key: 'b', oilId: 'coconut-oil-76', weightGrams: '50', weightPercent: '' }],
    };
    expect(sameSyncedRecipe(a, b)).toBe(false);
  });
});

describe('pushHistory', () => {
  it('pushes the current snapshot onto past and clears future', () => {
    const h0 = { ...emptyHistory(1), future: [snap('999')] };
    const h1 = pushHistory(h0, snap('100'));
    expect(h1.past).toHaveLength(1);
    expect(h1.past[0].batchOilGrams).toBe('100');
    expect(h1.future).toHaveLength(0);
  });

  it('preserves the generation of the state it extends', () => {
    const h1 = pushHistory(emptyHistory(7), snap('100'));
    expect(h1.gen).toBe(7);
  });

  it('evicts the oldest snapshot beyond HISTORY_DEPTH', () => {
    let h = emptyHistory(1);
    for (let i = 0; i < HISTORY_DEPTH + 5; i++) h = pushHistory(h, snap(String(i)));
    expect(h.past).toHaveLength(HISTORY_DEPTH);
    // oldest (0..4) evicted; the earliest retained is index 5
    expect(h.past[0].batchOilGrams).toBe('5');
  });
});

describe('undoHistory / redoHistory', () => {
  it('undo returns the prior snapshot and moves current onto future', () => {
    const h1 = pushHistory(emptyHistory(1), snap('100'));
    const res = undoHistory(h1, snap('200'));
    expect(res).not.toBeNull();
    expect(res!.restored.batchOilGrams).toBe('100');
    expect(res!.next.past).toHaveLength(0);
    expect(res!.next.future).toHaveLength(1);
    expect(res!.next.future[0].batchOilGrams).toBe('200');
  });

  it('undo returns null when past is empty', () => {
    expect(undoHistory(emptyHistory(1), snap('200'))).toBeNull();
  });

  it('redo re-applies the forward snapshot', () => {
    const h1 = pushHistory(emptyHistory(1), snap('100'));
    const undone = undoHistory(h1, snap('200'))!;
    const redone = redoHistory(undone.next, undone.restored);
    expect(redone).not.toBeNull();
    expect(redone!.restored.batchOilGrams).toBe('200');
    expect(redone!.next.future).toHaveLength(0);
    expect(redone!.next.past).toHaveLength(1);
  });

  it('redo returns null when future is empty', () => {
    const h1 = pushHistory(emptyHistory(1), snap('100'));
    expect(redoHistory(h1, snap('200'))).toBeNull();
  });

  it('a new commit after an undo clears the redo future', () => {
    const h1 = pushHistory(emptyHistory(1), snap('100'));
    const undone = undoHistory(h1, snap('200'))!;
    expect(undone.next.future).toHaveLength(1);
    const afterEdit = pushHistory(undone.next, snap('300'));
    expect(afterEdit.future).toHaveLength(0);
  });
});
