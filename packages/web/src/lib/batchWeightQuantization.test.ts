import { describe, expect, it } from 'vitest';
import { calculateRecipe } from './calculateRecipe';
import { createStarterLines, DEFAULT_SETTINGS } from './recipe';
import { resyncFromWeights, syncBatchTotalEdit } from './lineWeightSync';
import { parseInputDisplayToGrams } from './weightUnits';
import type { RecipeLine, WeightUnit } from './recipe';

/**
 * Quantization contract for the Total-batch commit (the "typed 1500, got 1499" /
 * "typed 3 lb, shows 3.01" report). The back-solve is exact and linear, but the
 * achieved batch is QUANTIZED: line weights store whole grams and percents store
 * 0.1%, so achievable batches form a staircase with ~1.5–4.5 g steps. Some targets
 * (e.g. 1500 g on the starter recipe) sit between steps and are unreachable by ANY
 * whole-gram oil total — the commit lands on the nearest achievable recipe and the
 * field honestly mirrors that real weight (same figure Results prints).
 *
 * These tests pin the contract: bounded drift, no compounding, honest mirror.
 */

/** Simulate the commit exactly as commitBatchWeightInput + applyOilTotal do. */
function commit(lines: RecipeLine[], targetDisplay: string, unit: WeightUnit) {
  const before = calculateRecipe(lines, DEFAULT_SETTINGS);
  const oil0 = before.displayTotals!.recipeOilWeightGrams;
  const batch0 = before.displayTotals!.batchWeightGrams;
  const targetG = Number(parseInputDisplayToGrams(targetDisplay, unit));
  const solvedOil = Math.round(oil0 * (targetG / batch0));
  const newLines = syncBatchTotalEdit(resyncFromWeights(lines).lines, String(solvedOil));
  const after = calculateRecipe(newLines, { ...DEFAULT_SETTINGS, batchOilGrams: String(solvedOil) });
  return {
    targetG,
    newLines,
    achievedBatchG: after.displayTotals!.batchWeightGrams,
    realizedOilG: after.displayTotals!.recipeOilWeightGrams,
  };
}

describe('batch-weight commit quantization', () => {
  const cases: Array<[string, WeightUnit]> = [
    ['1500', 'g'],
    ['50', 'oz'],
    ['3', 'lb'],
    ['800', 'g'],
    ['2.2', 'lb'],
  ];

  it('achieved batch stays within the staircase bound of the target (≤5 g and ≤0.4%)', () => {
    for (const [t, u] of cases) {
      const r = commit(createStarterLines(), t, u);
      const err = Math.abs(r.achievedBatchG - r.targetG);
      expect(err, `${t} ${u}: |${r.achievedBatchG.toFixed(2)} − ${r.targetG}|`).toBeLessThanOrEqual(5);
      expect(err / r.targetG).toBeLessThanOrEqual(0.004);
    }
  });

  it('drift never compounds: re-committing the achieved weight is a fixed point', () => {
    for (const [t, u] of cases) {
      const first = commit(createStarterLines(), t, u);
      // user "corrects" the field to what it now shows (in grams for exactness)
      const second = commit(first.newLines, String(Math.round(first.achievedBatchG)), 'g');
      // one more round must land on the very same recipe (staircase fixed point ±1 step)
      expect(Math.abs(second.achievedBatchG - first.achievedBatchG)).toBeLessThanOrEqual(1.5);
    }
  });

  it('documents the inherent case: 1500 g on the starter is between staircase steps', () => {
    const r = commit(createStarterLines(), '1500', 'g');
    // The nearest achievable recipes weigh ~1498.97 and ~1503.39 — 1500 exactly is not
    // reachable with whole-gram line weights. The commit picks the closer side.
    expect(r.achievedBatchG).toBeGreaterThan(1495);
    expect(r.achievedBatchG).toBeLessThan(1501);
    expect(Math.round(r.achievedBatchG)).not.toBe(1500); // if this starts passing at 1500,
    // the storage precision changed — revisit this contract and the field's hint copy.
  });
});
