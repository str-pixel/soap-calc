import { describe, expect, it } from 'vitest';
import type { LyeCalculationResult } from '@soap-calc/core';
import { canPrintBatchSheet } from './batchSheet';
import type { RecipeDisplayTotals } from './calculateRecipe';

function makeResult(
  overrides: Partial<LyeCalculationResult> = {},
): LyeCalculationResult {
  return {
    totalOilWeightGrams: 1000,
    lyeWeightGrams: 135,
    naohWeightGrams: 135,
    kohWeightGrams: 0,
    waterWeightGrams: 330,
    totalBatchWeightGrams: 1465,
    lyeConcentrationPercent: 29,
    waterLyeRatio: 2.44,
    lines: [],
    warnings: [],
    errors: [],
    ...overrides,
  };
}

const displayTotals: RecipeDisplayTotals = {
  recipeOilWeightGrams: 1000,
  excludedFromLyeOilWeightGrams: 0,
  batchWeightGrams: 1465,
};

describe('canPrintBatchSheet', () => {
  it('allows print for a valid recipe', () => {
    expect(canPrintBatchSheet(makeResult(), displayTotals, [])).toBe(true);
  });

  it('blocks print when input errors exist', () => {
    expect(canPrintBatchSheet(makeResult(), displayTotals, ['Invalid superfat %'])).toBe(false);
  });

  it('blocks print when line errors exist', () => {
    expect(
      canPrintBatchSheet(makeResult({ errors: ['Unknown oil id: bad'] }), displayTotals, []),
    ).toBe(false);
  });

  it('blocks print when oil weight is zero', () => {
    expect(
      canPrintBatchSheet(
        makeResult({ totalOilWeightGrams: 0, lyeWeightGrams: 0 }),
        { ...displayTotals, recipeOilWeightGrams: 0 },
        [],
      ),
    ).toBe(false);
  });

  it('blocks print when lye is zero', () => {
    expect(canPrintBatchSheet(makeResult({ lyeWeightGrams: 0 }), displayTotals, [])).toBe(false);
  });
});
