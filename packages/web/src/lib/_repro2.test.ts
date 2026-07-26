import { test } from 'vitest';
import { createStarterLines, DEFAULT_SETTINGS, type SplitLiquidRow } from './recipe';
import { calculateRecipe } from './calculateRecipe';
import { resolveSplitLiquidRows } from './splitLiquidSizing';
import { solveOilTotalForBatchTarget, syncBatchTotalEdit, resyncFromWeights } from './lineWeightSync';
import { gramsStringToInputDisplay } from './weightUnits';

const ROW = (over: Partial<SplitLiquidRow>): SplitLiquidRow => ({
  key: 'r', presetKey: '', name: 'milk', customWaterPercent: '',
  sizeMode: 'percent_of_oils', amount: '20', addAt: 'trace', ...over,
});

function batchWithExtras(lines: ReturnType<typeof createStarterLines>, settings: typeof DEFAULT_SETTINGS) {
  const { result, displayTotals } = calculateRecipe(lines, settings);
  const resolved = settings.splitLiquids.length && result
    ? resolveSplitLiquidRows(settings.splitLiquids, {
        totalOilGrams: displayTotals!.recipeOilWeightGrams,
        targetLiquidGrams: result.waterWeightGrams,
        lyeGrams: result.lyeWeightGrams,
      })
    : null;
  return displayTotals!.batchWeightGrams + (resolved?.totalGrams ?? 0);
}

for (const [label, rows] of [
  ['20% of oils milk', [ROW({})]],
  ['200 g milk (grams mode)', [ROW({ sizeMode: 'grams', amount: '200' })]],
] as const) {
  test(`repro with ${label}`, () => {
    const lines = createStarterLines();
    const settings = { ...DEFAULT_SETTINGS, splitLiquids: [...rows] };
    const oil0 = 1000;
    const batch0 = batchWithExtras(lines, settings);
    const solved = solveOilTotalForBatchTarget(lines, 2000, oil0, batch0);
    const scaledLines = syncBatchTotalEdit(resyncFromWeights(lines).lines, String(solved));
    const after = { ...settings, batchOilGrams: String(solved), batchSetByUser: true };
    const batch1 = batchWithExtras(scaledLines, after);
    console.log(label, '| batch0', batch0.toFixed(2), '| solved oil', solved, '| realized', batch1.toFixed(3), '→ displays', gramsStringToInputDisplay(String(batch1), 'g'));
  });
}
