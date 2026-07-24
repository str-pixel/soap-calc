import { describe, expect, it } from 'vitest';
import { calculateRecipe } from './calculateRecipe';
import { createStarterLines, DEFAULT_SETTINGS } from './recipe';
import { resyncFromWeights, solveOilTotalForBatchTarget, syncBatchTotalEdit } from './lineWeightSync';
import { parseInputDisplayToGrams } from './weightUnits';
import type { RecipeLine, WeightUnit } from './recipe';

/**
 * Quantization contract for the Total-batch commit (the "typed 1500, got 1499" /
 * "typed 2000, got 1998" reports). Line weights store whole grams, so achievable
 * batches form a staircase whose step is the batch multiplier (batch ÷ oil, ~1.5 g
 * on the starter recipe). The commit back-solves the oil total and then refines it
 * with a quantization-aware candidate search (solveOilTotalForBatchTarget), landing
 * on the achievable recipe nearest the target: drift is bounded by HALF the staircase
 * step, so the mirrored field almost always re-displays the typed whole-gram value.
 *
 * These tests pin the contract: half-step drift bound, no compounding, honest mirror.
 */

/** Simulate the commit exactly as commitBatchWeightInput + applyOilTotal do. */
function commit(lines: RecipeLine[], targetDisplay: string, unit: WeightUnit) {
  const before = calculateRecipe(lines, DEFAULT_SETTINGS);
  const oil0 = before.displayTotals!.recipeOilWeightGrams;
  const batch0 = before.displayTotals!.batchWeightGrams;
  const targetG = Number(parseInputDisplayToGrams(targetDisplay, unit));
  const solvedOil = solveOilTotalForBatchTarget(lines, targetG, oil0, batch0);
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
    ['2000', 'g'],
    ['50', 'oz'],
    ['3', 'lb'],
    ['800', 'g'],
    ['2.2', 'lb'],
    ['1000', 'g'],
  ];

  it('achieved batch stays within half a staircase step of the target (≤0.75 g)', () => {
    for (const [t, u] of cases) {
      const r = commit(createStarterLines(), t, u);
      const err = Math.abs(r.achievedBatchG - r.targetG);
      expect(err, `${t} ${u}: |${r.achievedBatchG.toFixed(2)} − ${r.targetG}|`).toBeLessThanOrEqual(0.75);
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

  it('pins the reported case: typed 2000 g mirrors back as 2000, not 1998', () => {
    const r = commit(createStarterLines(), '2000', 'g');
    expect(Math.round(r.achievedBatchG)).toBe(2000);
  });

  it('documents the inherent limit: a target can still display ±1 g off', () => {
    // 1000 g on the starter: the nearest achievable batches are ~999.31 and ~1000.78
    // (staircase step ~1.47 g), so the honest mirror shows 999. Exact hits for every
    // target would require sub-gram line weights — if this starts displaying 1000,
    // the storage precision changed and this contract should be revisited.
    const r = commit(createStarterLines(), '1000', 'g');
    expect(Math.abs(r.achievedBatchG - 1000)).toBeLessThanOrEqual(0.75);
    expect(Math.round(r.achievedBatchG)).toBe(999);
  });
});
