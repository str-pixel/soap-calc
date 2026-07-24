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

test('batchWeightInputId is stable and distinct from the oil total id', () => {
  const ids = makeInputIds();
  expect(ids.batchWeightInputId).toBe('batch-weight-total');
  expect(ids.batchWeightInputId).not.toBe(ids.batchInputId);
});

test('commitBatchWeightInput ratio-scales the recipe through the shared apply path', () => {
  const applySyncedUpdate = vi.fn();
  const lines = [
    { key: 'a', oilId: 'olive-oil', weightGrams: '450', weightPercent: '45' },
    { key: 'b', oilId: 'coconut-oil-76', weightGrams: '250', weightPercent: '25' },
    { key: 'c', oilId: 'shea-butter', weightGrams: '300', weightPercent: '30' },
  ];
  const deps = makeDeps({
    drafts: { 'batch-weight-total': '1500' },
    editor: { ...makeDeps().editor, applySyncedUpdate, linesRef: { current: lines } },
  });
  const inputs = useRecipeInputs(deps);
  inputs.commitBatchWeightInput('1500', { currentBatchGrams: 1469.58, currentOilTotalGrams: 1000 });

  expect(applySyncedUpdate).toHaveBeenCalledTimes(1);
  // 1000 × 1500 / 1469.58 = 1020.7 → 1021
  const synced = applySyncedUpdate.mock.calls[0][0](lines, '1000', true);
  expect(synced.batchOilGrams).toBe('1021');
  expect(synced.batchSetByUser).toBe(true);
  const sum = synced.lines.reduce((s: number, l: { weightGrams: string }) => s + Number(l.weightGrams), 0);
  expect(Math.abs(sum - 1021)).toBeLessThan(2);
});

test('commitBatchWeightInput without a draft never rescales (blur is not an edit)', () => {
  const applySyncedUpdate = vi.fn();
  const clearDraft = vi.fn();
  const deps = makeDeps({
    drafts: {},
    clearDraft,
    editor: { ...makeDeps().editor, applySyncedUpdate },
  });
  useRecipeInputs(deps).commitBatchWeightInput('1500', { currentBatchGrams: 1469.58, currentOilTotalGrams: 1000 });
  expect(clearDraft).toHaveBeenCalledWith('batch-weight-total');
  expect(applySyncedUpdate).not.toHaveBeenCalled();
});

test('commitBatchWeightInput no-ops on invalid targets and a zero batch', () => {
  for (const [displayValue, context] of [
    ['', { currentBatchGrams: 1469.58, currentOilTotalGrams: 1000 }],
    ['abc', { currentBatchGrams: 1469.58, currentOilTotalGrams: 1000 }],
    ['0', { currentBatchGrams: 1469.58, currentOilTotalGrams: 1000 }],
    ['-5', { currentBatchGrams: 1469.58, currentOilTotalGrams: 1000 }],
    ['1500', { currentBatchGrams: 0, currentOilTotalGrams: 1000 }],
    ['1500', { currentBatchGrams: 1469.58, currentOilTotalGrams: 0 }],
  ] as const) {
    const applySyncedUpdate = vi.fn();
    const deps = makeDeps({
      drafts: { 'batch-weight-total': String(displayValue) },
      editor: { ...makeDeps().editor, applySyncedUpdate },
    });
    useRecipeInputs(deps).commitBatchWeightInput(displayValue as string, context);
    expect(applySyncedUpdate, `target=${displayValue} batch=${context.currentBatchGrams}`).not.toHaveBeenCalled();
  }
});

test('commitBatchWeightInput lands from an off-100% mid-edit shape (stale percents)', () => {
  const applySyncedUpdate = vi.fn();
  const lines = [
    { key: 'a', oilId: 'olive-oil', weightGrams: '540', weightPercent: '45' },
    { key: 'b', oilId: 'coconut-oil-76', weightGrams: '300', weightPercent: '25' },
    { key: 'c', oilId: 'shea-butter', weightGrams: '360', weightPercent: '30' },
  ]; // weights sum 1200; stored percents are stale
  const deps = makeDeps({
    drafts: { 'batch-weight-total': '1500' },
    editor: { ...makeDeps().editor, applySyncedUpdate, linesRef: { current: lines } },
  });
  useRecipeInputs(deps).commitBatchWeightInput('1500', {
    currentBatchGrams: 1763.5, // 1200 g oil basis
    currentOilTotalGrams: 1200,
  });
  const synced = applySyncedUpdate.mock.calls[0][0](lines, '1200', true);
  // 1200 × 1500/1763.5 = 1020.7 → 1021; resyncFromWeights re-derives percents to 100 first
  expect(synced.batchOilGrams).toBe('1021');
  const sum = synced.lines.reduce((s: number, l: { weightGrams: string }) => s + Number(l.weightGrams), 0);
  expect(Math.abs(sum - 1021)).toBeLessThan(2);
});

test('handleApplySuggestedOilGrams still applies a rounded oil total (mold-sizer regression)', () => {
  const applySyncedUpdate = vi.fn();
  const deps = makeDeps({ editor: { ...makeDeps().editor, applySyncedUpdate } });
  useRecipeInputs(deps).handleApplySuggestedOilGrams(850.4);
  expect(applySyncedUpdate).toHaveBeenCalledTimes(1);
  const synced = applySyncedUpdate.mock.calls[0][0](deps.lines, '500', true);
  expect(synced.batchOilGrams).toBe('850');
  expect(synced.batchSetByUser).toBe(true);
});
