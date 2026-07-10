// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BatchSheet } from './BatchSheet';
import { buildBatchSheetData } from '../lib/batchSheet';
import { computePostCookSuperfat } from '../lib/calculateAdditives';
import { calculateRecipe } from '../lib/calculateRecipe';
import { createStarterLines, DEFAULT_SETTINGS } from '../lib/recipe';

afterEach(cleanup);

test('prints an after-cook post-cook-superfat line with oil, grams, and percent', () => {
  const lines = createStarterLines();
  const settings = {
    ...DEFAULT_SETTINGS,
    postCookSuperfatPercent: '5',
    // Deliberately not an oil already in createStarterLines() (which includes shea
    // butter) — avoids an ambiguous match against the oils table below.
    postCookSuperfatOilId: 'castor-oil',
  };
  const { result, displayTotals, linePercents } = calculateRecipe(lines, settings);
  if (!result || !displayTotals) throw new Error('expected a valid calculation');
  const postCookSuperfat = computePostCookSuperfat(settings, displayTotals.recipeOilWeightGrams);
  if (!postCookSuperfat) throw new Error('expected a computed post-cook superfat');

  const data = buildBatchSheetData({
    recipeName: 'PCSF batch',
    batchNotes: '',
    weightUnit: 'g',
    lyeLabel: 'NaOH',
    settings,
    lines,
    linePercents,
    result,
    displayTotals,
    additives: [],
    splitLiquid: undefined,
    splitLiquidGrams: null,
    postCookSuperfat,
    properties: null,
    indexes: { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] },
    batchWeightWithExtras: displayTotals.batchWeightGrams + postCookSuperfat.grams,
    waterModeLabel: '33% of oils',
    fattyAcids: { profile: null, coveragePercent: 0, missingOilIds: [] },
    insights: [],
    process: 'hp',
  });

  render(<BatchSheet data={data} />);

  expect(screen.getByText(/Castor Oil/)).toBeTruthy();
  expect(screen.getByText(/5% post-cook superfat/)).toBeTruthy();
});

test('prints no post-cook-superfat line when absent', () => {
  const lines = createStarterLines();
  const { result, displayTotals, linePercents } = calculateRecipe(lines, DEFAULT_SETTINGS);
  if (!result || !displayTotals) throw new Error('expected a valid calculation');

  const data = buildBatchSheetData({
    recipeName: 'No PCSF batch',
    batchNotes: '',
    weightUnit: 'g',
    lyeLabel: 'NaOH',
    settings: DEFAULT_SETTINGS,
    lines,
    linePercents,
    result,
    displayTotals,
    additives: [],
    splitLiquid: undefined,
    splitLiquidGrams: null,
    postCookSuperfat: null,
    properties: null,
    indexes: { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] },
    batchWeightWithExtras: displayTotals.batchWeightGrams,
    waterModeLabel: '33% of oils',
    fattyAcids: { profile: null, coveragePercent: 0, missingOilIds: [] },
    insights: [],
    process: 'cp',
  });

  render(<BatchSheet data={data} />);

  expect(screen.queryByText(/post-cook superfat/)).toBeNull();
});
