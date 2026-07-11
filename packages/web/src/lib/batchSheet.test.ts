import { describe, expect, it } from 'vitest';
import type { DilutionResult, LyeCalculationResult } from '@soap-calc/core';
import { additiveStageLabel, buildBatchSheetData, canPrintBatchSheet } from './batchSheet';
import type { ComputedAdditive } from './calculateAdditives';
import { calculateRecipe, type RecipeDisplayTotals } from './calculateRecipe';
import { createStarterLines, DEFAULT_SETTINGS } from './recipe';

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

function makeAfterCookAdditive(): ComputedAdditive {
  return {
    key: 'a1',
    catalogId: '',
    name: 'Heat-sensitive fragrance',
    amount: 2,
    unit: 'percent',
    basis: 'oil',
    grams: 20,
    addAt: 'after_cook',
  };
}

function makeBatchSheetInput(
  overrides: Partial<Parameters<typeof buildBatchSheetData>[0]> = {},
): Parameters<typeof buildBatchSheetData>[0] {
  return {
    recipeName: 'Test',
    batchNotes: '',
    weightUnit: 'g',
    lyeLabel: 'NaOH',
    settings: DEFAULT_SETTINGS,
    lines: [],
    linePercents: new Map(),
    result: makeResult(),
    displayTotals,
    additives: [makeAfterCookAdditive()],
    splitLiquid: undefined,
    splitLiquidGrams: null,
    properties: null,
    indexes: { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] },
    batchWeightWithExtras: 1465,
    waterModeLabel: '33% of oils',
    fattyAcids: { profile: null, coveragePercent: 0, missingOilIds: [] },
    insights: [],
    process: 'hp',
    postCookSuperfat: null,
    postCookSuperfatMethod: 'append',
    dilution: null,
    ...overrides,
  };
}

describe('additiveStageLabel (re-exported for the batch sheet)', () => {
  it('labels after_cook as "After cook" with no process / under hp', () => {
    expect(additiveStageLabel('after_cook')).toBe('After cook');
    expect(additiveStageLabel('after_cook', 'hp')).toBe('After cook');
  });

  it('labels after_cook as "After dilution" under ls', () => {
    expect(additiveStageLabel('after_cook', 'ls')).toBe('After dilution');
  });
});

describe('buildBatchSheetData post-cook superfat threading', () => {
  it('threads a post-cook superfat through to the batch sheet data', () => {
    const pcsf = { oilId: 'shea-butter', percentOfOil: 5, grams: 50 };
    const data = buildBatchSheetData(makeBatchSheetInput({ postCookSuperfat: pcsf }));
    expect(data.postCookSuperfat).toEqual(pcsf);
  });

  it('defaults to null when no post-cook superfat is set', () => {
    const data = buildBatchSheetData(makeBatchSheetInput());
    expect(data.postCookSuperfat).toBeNull();
  });
});

describe('buildBatchSheetData process threading', () => {
  it('threads process through so an after_cook additive prints "After cook" for hp', () => {
    const data = buildBatchSheetData(makeBatchSheetInput({ process: 'hp' }));
    expect(data.process).toBe('hp');
    expect(additiveStageLabel(data.additives[0].addAt, data.process)).toBe('After cook');
  });

  it('threads process through so an after_cook additive prints "After dilution" for ls', () => {
    const data = buildBatchSheetData(makeBatchSheetInput({ process: 'ls' }));
    expect(data.process).toBe('ls');
    expect(additiveStageLabel(data.additives[0].addAt, data.process)).toBe('After dilution');
  });
});

describe('buildBatchSheetData dilution threading', () => {
  it('prints an LS dilution section when dilution is present', () => {
    const lines = createStarterLines();
    const { result, displayTotals, linePercents } = calculateRecipe(lines, DEFAULT_SETTINGS);
    if (!result || !displayTotals) throw new Error('expected a valid calculation');
    const dilution: DilutionResult = {
      anhydrousGrams: 1200, solutionGrams: 4000, totalWaterGrams: 2800,
      dilutionWaterGrams: 2400, glycerinGrams: 110, soapConcentrationPercent: 30, targetExceedsPaste: false,
    };
    const data = buildBatchSheetData({
      recipeName: 'LS', batchNotes: '', weightUnit: 'g', lyeLabel: 'KOH', settings: DEFAULT_SETTINGS,
      lines, linePercents, result, displayTotals, additives: [], splitLiquid: undefined, splitLiquidGrams: null,
      postCookSuperfat: null, postCookSuperfatMethod: 'append', dilution, properties: null,
      indexes: { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] },
      batchWeightWithExtras: displayTotals.batchWeightGrams, waterModeLabel: '2:1',
      fattyAcids: { profile: null, coveragePercent: 0, missingOilIds: [] }, insights: [], process: 'ls',
    });
    expect(data.dilution).toEqual(dilution);
  });
});
