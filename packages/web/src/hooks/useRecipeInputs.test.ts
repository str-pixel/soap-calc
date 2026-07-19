import { expect, test, vi } from 'vitest';
import { makeInputIds, shouldCommitDraft, useRecipeInputs, type UseRecipeInputsDeps } from './useRecipeInputs';
import { DEFAULT_SETTINGS, type RecipeLine } from '../lib/recipe';

test('input id helpers are stable and namespaced', () => {
  const ids = makeInputIds();
  expect(ids.weightInputId('abc')).toBe('weight-abc');
  expect(ids.percentInputId('abc')).toBe('percent-abc');
  expect(ids.batchInputId).toBe('batch-total');
});

test('shouldCommitDraft is false when the field was never drafted', () => {
  expect(shouldCommitDraft({ 'weight-abc': '10' }, 'weight-abc')).toBe(true);
  expect(shouldCommitDraft({}, 'weight-abc')).toBe(false);
});

// useRecipeInputs is a plain factory (no React hooks in its body), so it can be called
// directly without renderHook, mirroring how the rest of this file exercises it.
function makeDeps(overrides: Partial<UseRecipeInputsDeps> = {}): UseRecipeInputsDeps {
  const line: RecipeLine = { key: 'a', oilId: 'olive-oil', weightGrams: '500', weightPercent: '100' };
  return {
    lines: [line],
    settings: DEFAULT_SETTINGS,
    additives: [],
    weightUnit: 'g',
    drafts: {},
    setDraft: vi.fn(),
    clearDraft: vi.fn(),
    clearAllDrafts: vi.fn(),
    editor: {
      applySynced: vi.fn(),
      applyEdit: vi.fn(),
      applySyncedUpdate: vi.fn(),
      linesRef: { current: [line] },
      batchRef: { current: '500' },
      batchSetByUserRef: { current: true },
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: false,
      canRedo: false,
    },
    setLines: vi.fn(),
    setSettings: vi.fn(),
    handleExport: vi.fn(),
    handleNew: vi.fn(),
    ...overrides,
  };
}

test('removeLine refuses to drop below the minimum by reading the live ref, not the stale lines prop', () => {
  // The render-scope `lines` prop still shows 2 lines (stale — a render hasn't caught up
  // yet), but linesRef.current (the fresh source of truth every other write path reads)
  // already holds just 1. The guard must consult the ref, so removeLine must refuse here
  // even though the stale prop alone would have allowed it.
  const singleLine: RecipeLine = { key: 'only', oilId: 'olive-oil', weightGrams: '1000', weightPercent: '100' };
  const staleLines: RecipeLine[] = [
    singleLine,
    { key: 'other', oilId: 'castor-oil', weightGrams: '0', weightPercent: '0' },
  ];
  const applySyncedUpdate = vi.fn();
  const deps = makeDeps({
    lines: staleLines,
    editor: {
      ...makeDeps().editor,
      applySyncedUpdate,
      linesRef: { current: [singleLine] },
    },
  });

  const inputs = useRecipeInputs(deps);
  inputs.removeLine('only');

  expect(applySyncedUpdate).not.toHaveBeenCalled();
});

test('removeLine proceeds when the live ref has more than the minimum', () => {
  const twoLines: RecipeLine[] = [
    { key: 'a', oilId: 'olive-oil', weightGrams: '500', weightPercent: '50' },
    { key: 'b', oilId: 'castor-oil', weightGrams: '500', weightPercent: '50' },
  ];
  const applySyncedUpdate = vi.fn();
  const deps = makeDeps({
    lines: twoLines,
    editor: {
      ...makeDeps().editor,
      applySyncedUpdate,
      linesRef: { current: twoLines },
    },
  });

  const inputs = useRecipeInputs(deps);
  inputs.removeLine('a');

  expect(applySyncedUpdate).toHaveBeenCalledTimes(1);
});
