// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RecipeOilsPanel } from './RecipeOilsPanel';
import { createStarterLines } from '../lib/recipe';

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
    ...over,
  };
}

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
      debouncer={{ flush: (_, fn) => fn(), cancel: vi.fn(), cancelAll: vi.fn() }}
      inputs={inputs as any}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: '+ Add oil' }));
  expect(inputs.addLine).toHaveBeenCalledTimes(1);
});
