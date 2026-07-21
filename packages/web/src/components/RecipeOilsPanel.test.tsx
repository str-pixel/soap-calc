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

test('Weight, Percent, Remove, and the oil picker are disambiguated by oil name', () => {
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
  // The per-row OilPicker combobox must also carry a disambiguated accessible name,
  // not the generic default 'Oil' it falls back to when no ariaLabel is passed.
  expect(screen.getByRole('combobox', { name: `Oil for ${oliveName}` })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: `Oil for ${coconutName}` })).toBeTruthy();
});

test('the oil picker falls back to the stable row label when the row has no resolved oil name', () => {
  const inputs = makeInputs();
  const lines = [
    { key: 'row-a', oilId: 'not-a-real-oil-id', weightGrams: '100', weightPercent: '100' },
  ];
  render(
    <RecipeOilsPanel
      lines={lines as any} weightUnit="g"
      previewState={{ lines, batchOilGrams: '100' }}
      previewLineByKey={Object.fromEntries(lines.map((l) => [l.key, l]))}
      lineTotals={{ totalWeightGrams: 100, totalPercent: 100 }}
      showRecipeTotals percentTotalOff={false} weightTotalOff={false}
      getDraft={(_, c) => c} setDraft={vi.fn()}
      inputs={inputs as any}
    />,
  );

  // Matches the same "row N" fallback the Weight/Percent/Remove controls use.
  expect(screen.getByRole('combobox', { name: 'Oil for row 1' })).toBeTruthy();
  expect(screen.getByRole('spinbutton', { name: 'Weight in g for row 1' })).toBeTruthy();
  expect(screen.getByRole('spinbutton', { name: 'Percent for row 1' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Remove row 1' })).toBeTruthy();
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
  // The off-total cue names the gap (and is real text, not color-only): "Oils total 90% — aim for 100%".
  expect(screen.getByText(/oils total 90% — aim for 100%/i)).toBeTruthy();

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
  expect(screen.queryByText(/aim for 100%/i)).toBeNull();
});
