// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RecipeOilsPanel } from './RecipeOilsPanel';
import { createStarterLines } from '../lib/recipe';
import { oilById } from '../lib/oils';

afterEach(cleanup);

function makeInputs(over: Partial<any> = {}) {
  return {
    weightInputId: (k: string) => `weight-${k}`,
    percentInputId: (k: string) => `percent-${k}`,
    batchInputId: 'batch-total',
    updateLine: vi.fn(), addLine: vi.fn(), removeLine: vi.fn(),
    commitWeightInput: vi.fn(), commitPercentInput: vi.fn(), commitBatchInput: vi.fn(),
    handleWeightChange: vi.fn(), handleBatchChange: vi.fn(),
    flushCommittedDrafts: vi.fn(), discardDrafts: vi.fn(), handleExportCommitted: vi.fn(),
    handleNewRecipe: vi.fn(), handleApplySuggestedOilGrams: vi.fn(), setWeightUnit: vi.fn(),
    undo: vi.fn(), redo: vi.fn(), canUndo: false, canRedo: false,
    ...over,
  };
}

function renderPanel(inputs: ReturnType<typeof makeInputs>) {
  const lines = createStarterLines();
  return render(
    <RecipeOilsPanel
      lines={lines} weightUnit="g"
      previewState={{ lines, batchOilGrams: '1000' }}
      previewLineByKey={Object.fromEntries(lines.map((l) => [l.key, l]))}
      lineTotals={{ totalWeightGrams: 1000, totalPercent: 100 }}
      showRecipeTotals percentTotalOff={false} weightTotalOff={false}
      getDraft={(_, c) => c} setDraft={vi.fn()}
      inputs={inputs as any}
    />,
  );
}

test('Undo/Redo buttons are disabled when there is no history', () => {
  renderPanel(makeInputs({ canUndo: false, canRedo: false }));
  expect((screen.getByRole('button', { name: /Undo/ }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: /Redo/ }) as HTMLButtonElement).disabled).toBe(true);
});

test('Undo button calls inputs.undo when enabled', () => {
  const inputs = makeInputs({ canUndo: true });
  renderPanel(inputs);
  const undo = screen.getByRole('button', { name: /Undo/ }) as HTMLButtonElement;
  expect(undo.disabled).toBe(false);
  fireEvent.click(undo);
  expect(inputs.undo).toHaveBeenCalledTimes(1);
});

test('Redo button calls inputs.redo when enabled', () => {
  const inputs = makeInputs({ canRedo: true });
  renderPanel(inputs);
  fireEvent.click(screen.getByRole('button', { name: /Redo/ }));
  expect(inputs.redo).toHaveBeenCalledTimes(1);
});

test('Add oil button calls inputs.addLine', () => {
  const inputs = makeInputs();
  const lines = createStarterLines();
  render(
    <RecipeOilsPanel
      lines={lines} weightUnit="g"
      previewState={{ lines, batchOilGrams: '1000' }}
      previewLineByKey={Object.fromEntries(lines.map((l) => [l.key, l]))}
      lineTotals={{ totalWeightGrams: 1000, totalPercent: 100 }}
      showRecipeTotals percentTotalOff={false} weightTotalOff={false}
      getDraft={(_, c) => c} setDraft={vi.fn()}
      inputs={inputs as any}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: '+ Add oil' }));
  expect(inputs.addLine).toHaveBeenCalledTimes(1);
});

test('Weight, Percent, and Remove controls are disambiguated by oil name', () => {
  const inputs = makeInputs();
  renderPanel(inputs);
  const oliveName = oilById('olive-oil')!.displayName;
  const coconutName = oilById('coconut-oil-76')!.displayName;

  // Distinct accessible names per row, not the generic "Weight in g" / "Oil percent" / "Remove oil".
  expect(screen.getByRole('spinbutton', { name: `Weight in g for ${oliveName}` })).toBeTruthy();
  expect(screen.getByRole('spinbutton', { name: `Weight in g for ${coconutName}` })).toBeTruthy();
  expect(screen.getByRole('spinbutton', { name: `Percent for ${oliveName}` })).toBeTruthy();
  expect(screen.getByRole('spinbutton', { name: `Percent for ${coconutName}` })).toBeTruthy();
  expect(screen.getByRole('button', { name: `Remove ${oliveName}` })).toBeTruthy();
  expect(screen.getByRole('button', { name: `Remove ${coconutName}` })).toBeTruthy();
});

test('totals-off cue is textual, not color-only, and absent when totals reconcile', () => {
  const inputs = makeInputs();
  const lines = createStarterLines();
  const { rerender } = render(
    <RecipeOilsPanel
      lines={lines} weightUnit="g"
      previewState={{ lines, batchOilGrams: '1000' }}
      previewLineByKey={Object.fromEntries(lines.map((l) => [l.key, l]))}
      lineTotals={{ totalWeightGrams: 900, totalPercent: 90 }}
      showRecipeTotals percentTotalOff={true} weightTotalOff={true}
      getDraft={(_, c) => c} setDraft={vi.fn()}
      inputs={inputs as any}
    />,
  );
  expect(screen.getByText(/totals don.t match/i)).toBeTruthy();

  rerender(
    <RecipeOilsPanel
      lines={lines} weightUnit="g"
      previewState={{ lines, batchOilGrams: '1000' }}
      previewLineByKey={Object.fromEntries(lines.map((l) => [l.key, l]))}
      lineTotals={{ totalWeightGrams: 1000, totalPercent: 100 }}
      showRecipeTotals percentTotalOff={false} weightTotalOff={false}
      getDraft={(_, c) => c} setDraft={vi.fn()}
      inputs={inputs as any}
    />,
  );
  expect(screen.queryByText(/totals don.t match/i)).toBeNull();
});
