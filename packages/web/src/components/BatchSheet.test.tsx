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
    // Deliberately not an oil already in createStarterLines() (which includes shea
    // butter) — avoids an ambiguous match against the oils table below.
    postCookSuperfatOils: [{ oilId: 'castor-oil', percent: '5' }],
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
    splitLiquidRows: [],
    splitLiquidGrams: null,
    postCookSuperfat,
    pcsfIsExtra: true,
    extrasGrams: postCookSuperfat.grams,
    dilution: null,
    neutralization: null,
    properties: null,
    indexes: { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] },
    batchWeightWithExtras: displayTotals.batchWeightGrams + postCookSuperfat.grams,
    waterModeLabel: '33% of oils',
    fattyAcids: { profile: null, coveragePercent: 0, missingOilIds: [], modeledOilIds: [] },
    insights: [],
    process: 'hp',
  });

  render(<BatchSheet data={data} />);

  expect(screen.getByText(/Castor Oil/)).toBeTruthy();
  expect(screen.getByText(/5% post-cook superfat/)).toBeTruthy();
});

test('prints a "Modeled profile" note naming derived-profile oils', () => {
  const lines = createStarterLines();
  const settings = { ...DEFAULT_SETTINGS };
  const { result, displayTotals, linePercents } = calculateRecipe(lines, settings);
  if (!result || !displayTotals) throw new Error('expected a valid calculation');

  const data = buildBatchSheetData({
    recipeName: 'Modeled batch',
    batchNotes: '',
    weightUnit: 'g',
    lyeLabel: 'NaOH',
    settings,
    lines,
    linePercents,
    result,
    displayTotals,
    additives: [],
    splitLiquidRows: [],
    splitLiquidGrams: null,
    postCookSuperfat: null,
    pcsfIsExtra: false,
    extrasGrams: 0,
    dilution: null,
    neutralization: null,
    properties: {
      properties: { hardness: 50, cleansing: 15, condition: 40, creamy: 20, bubbly: 15, longevity: 40 },
      coveragePercent: 100,
      missingOilIds: [],
    },
    indexes: { iodine: 60, ins: 150, coveragePercent: 100, missingOilIds: [] },
    batchWeightWithExtras: displayTotals.batchWeightGrams,
    waterModeLabel: '33% of oils',
    fattyAcids: {
      profile: null,
      coveragePercent: 100,
      missingOilIds: [],
      modeledOilIds: ['soybean-27-5-hydrogenated'],
    },
    insights: [],
    process: 'cp',
  });

  render(<BatchSheet data={data} />);
  expect(screen.getByText(/Modeled profile/)).toBeTruthy();
  // Names the oil (resolved via oilById), not the raw id.
  expect(screen.getByText(/Soybean, 27\.5% hydrogenated/)).toBeTruthy();
});

test('prints a total superfat (cook + post-cook) row', () => {
  const lines = createStarterLines();
  const settings = {
    ...DEFAULT_SETTINGS,
    superfatPercent: '5',
    postCookSuperfatOils: [{ oilId: 'castor-oil', percent: '3' }],
  };
  const { result, displayTotals, linePercents } = calculateRecipe(lines, settings);
  if (!result || !displayTotals) throw new Error('expected a valid calculation');
  const postCookSuperfat = computePostCookSuperfat(settings, displayTotals.recipeOilWeightGrams);
  if (!postCookSuperfat) throw new Error('expected a computed post-cook superfat');

  const data = buildBatchSheetData({
    recipeName: 'PCSF total',
    batchNotes: '',
    weightUnit: 'g',
    lyeLabel: 'NaOH',
    settings,
    lines,
    linePercents,
    result,
    displayTotals,
    additives: [],
    splitLiquidRows: [],
    splitLiquidGrams: null,
    postCookSuperfat,
    pcsfIsExtra: true,
    extrasGrams: postCookSuperfat.grams,
    dilution: null,
    neutralization: null,
    properties: null,
    indexes: { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] },
    batchWeightWithExtras: displayTotals.batchWeightGrams + postCookSuperfat.grams,
    waterModeLabel: '33% of oils',
    fattyAcids: { profile: null, coveragePercent: 0, missingOilIds: [], modeledOilIds: [] },
    insights: [],
    process: 'hp',
  });

  render(<BatchSheet data={data} />);

  // Cook 5% + post-cook 3% = 8% — the printed sheet must show the combined total the
  // on-screen results emphasize, not just the cook superfat.
  expect(screen.getByText('Total superfat')).toBeTruthy();
  expect(screen.getByText('8%')).toBeTruthy();
});

test('subtract + negative main superfat: prints no "reserved" note and no Total superfat row (cookFactor guard leaves lye untouched, so both would be false)', () => {
  const lines = createStarterLines();
  const settings = {
    ...DEFAULT_SETTINGS,
    superfatPercent: '-2',
    postCookSuperfatOils: [{ oilId: 'castor-oil', percent: '5' }],
  };
  // process 'ls' is required here: calculateRecipe only allows a negative superfat
  // (a lye excess) when allowNegativeSuperfat is set, which it derives from process === 'ls'.
  const { result, displayTotals, linePercents } = calculateRecipe(lines, settings, 'ls');
  if (!result || !displayTotals) throw new Error('expected a valid calculation');
  const postCookSuperfat = computePostCookSuperfat(settings, displayTotals.recipeOilWeightGrams);
  if (!postCookSuperfat) throw new Error('expected a computed post-cook superfat');

  const data = buildBatchSheetData({
    recipeName: 'PCSF lye-excess batch',
    batchNotes: '',
    weightUnit: 'g',
    lyeLabel: 'NaOH',
    settings,
    lines,
    linePercents,
    result,
    displayTotals,
    additives: [],
    splitLiquidRows: [],
    splitLiquidGrams: null,
    postCookSuperfat,
    // cookFactor guard: a lye excess (superfat -2%) forces cookFactor back to 1, so the
    // subtract reserve is never actually applied — the PCSF oil is an extra either way.
    pcsfIsExtra: true,
    extrasGrams: postCookSuperfat.grams,
    dilution: null,
    neutralization: null,
    properties: null,
    indexes: { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] },
    batchWeightWithExtras: displayTotals.batchWeightGrams + postCookSuperfat.grams,
    waterModeLabel: '33% of oils',
    fattyAcids: { profile: null, coveragePercent: 0, missingOilIds: [], modeledOilIds: [] },
    insights: [],
    process: 'ls',
  });

  render(<BatchSheet data={data} />);

  expect(screen.queryByText(/reserved/i)).toBeNull();
  expect(screen.queryByText('Total superfat')).toBeNull();
});

test('subtract + non-negative main superfat: prints "reserved" note and Total superfat row', () => {
  const lines = createStarterLines();
  const settings = {
    ...DEFAULT_SETTINGS,
    superfatPercent: '2',
    postCookSuperfatOils: [{ oilId: 'castor-oil', percent: '5' }],
  };
  const { result, displayTotals, linePercents } = calculateRecipe(lines, settings, 'ls');
  if (!result || !displayTotals) throw new Error('expected a valid calculation');
  const postCookSuperfat = computePostCookSuperfat(settings, displayTotals.recipeOilWeightGrams);
  if (!postCookSuperfat) throw new Error('expected a computed post-cook superfat');

  const data = buildBatchSheetData({
    recipeName: 'PCSF subtract batch',
    batchNotes: '',
    weightUnit: 'g',
    lyeLabel: 'NaOH',
    settings,
    lines,
    linePercents,
    result,
    displayTotals,
    additives: [],
    splitLiquidRows: [],
    splitLiquidGrams: null,
    postCookSuperfat,
    // Non-negative superfat: the subtract reserve is actually applied, so the PCSF oil is
    // reserved from the recipe oils, not an extra.
    pcsfIsExtra: false,
    extrasGrams: 0,
    dilution: null,
    neutralization: null,
    properties: null,
    indexes: { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] },
    batchWeightWithExtras: displayTotals.batchWeightGrams + postCookSuperfat.grams,
    waterModeLabel: '33% of oils',
    fattyAcids: { profile: null, coveragePercent: 0, missingOilIds: [], modeledOilIds: [] },
    insights: [],
    process: 'ls',
  });

  render(<BatchSheet data={data} />);

  expect(screen.getByText(/reserved/i)).toBeTruthy();
  expect(screen.getByText('Total superfat')).toBeTruthy();
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
    splitLiquidRows: [],
    splitLiquidGrams: null,
    postCookSuperfat: null,
    pcsfIsExtra: true,
    extrasGrams: 0,
    dilution: null,
    neutralization: null,
    properties: null,
    indexes: { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] },
    batchWeightWithExtras: displayTotals.batchWeightGrams,
    waterModeLabel: '33% of oils',
    fattyAcids: { profile: null, coveragePercent: 0, missingOilIds: [], modeledOilIds: [] },
    insights: [],
    process: 'cp',
  });

  render(<BatchSheet data={data} />);

  expect(screen.queryByText(/post-cook superfat/)).toBeNull();
});

test('prints bar-property scores without a percent sign', () => {
  const lines = createStarterLines();
  const { result, displayTotals, linePercents } = calculateRecipe(lines, DEFAULT_SETTINGS);
  if (!result || !displayTotals) throw new Error('expected a valid calculation');

  const data = buildBatchSheetData({
    recipeName: 'Scores batch',
    batchNotes: '',
    weightUnit: 'g',
    lyeLabel: 'NaOH',
    settings: DEFAULT_SETTINGS,
    lines,
    linePercents,
    result,
    displayTotals,
    additives: [],
    splitLiquidRows: [],
    splitLiquidGrams: null,
    postCookSuperfat: null,
    pcsfIsExtra: true,
    extrasGrams: 0,
    dilution: null,
    neutralization: null,
    properties: {
      properties: { hardness: 41, cleansing: 17, condition: 56, creamy: 24, bubbly: 17, longevity: 24 },
      coveragePercent: 100,
      missingOilIds: [],
    },
    indexes: { iodine: 58, ins: 147, coveragePercent: 100, missingOilIds: [] },
    batchWeightWithExtras: displayTotals.batchWeightGrams,
    waterModeLabel: '33% of oils',
    fattyAcids: { profile: null, coveragePercent: 0, missingOilIds: [], modeledOilIds: [] },
    insights: [],
    process: 'cp',
  });

  render(<BatchSheet data={data} />);
  // The hardness score renders as a bare number.
  const hardnessTerm = screen.getByText('Hardness');
  const hardnessValue = hardnessTerm.parentElement?.querySelector('dd');
  expect(hardnessValue?.textContent).toBe('41');
});

test('prints the split-liquid advisory note and an explicit liquid step', () => {
  const lines = createStarterLines();
  const milkRow = {
    key: 'row-milk',
    presetKey: 'milk',
    name: 'Milk (dairy or plant)',
    customWaterPercent: '',
    sizeMode: 'percent_of_oils' as const,
    amount: '20',
    addAt: 'trace' as const,
  };
  const settings = { ...DEFAULT_SETTINGS, splitLiquids: [milkRow] };
  const { result, displayTotals, linePercents } = calculateRecipe(lines, settings);
  if (!result || !displayTotals) throw new Error('expected a valid calculation');
  const splitLiquidGrams = displayTotals.recipeOilWeightGrams * 0.2;

  const data = buildBatchSheetData({
    recipeName: 'Milk batch',
    batchNotes: '',
    weightUnit: 'g',
    lyeLabel: 'NaOH',
    settings,
    lines,
    linePercents,
    result,
    displayTotals,
    additives: [],
    splitLiquidRows: [{ row: milkRow, grams: splitLiquidGrams }],
    splitLiquidGrams,
    postCookSuperfat: null,
    pcsfIsExtra: true,
    extrasGrams: splitLiquidGrams,
    dilution: null,
    neutralization: null,
    properties: null,
    indexes: { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] },
    batchWeightWithExtras: displayTotals.batchWeightGrams + splitLiquidGrams,
    waterModeLabel: '33% of oils',
    fattyAcids: { profile: null, coveragePercent: 0, missingOilIds: [], modeledOilIds: [] },
    insights: [],
    process: 'cp',
  });

  render(<BatchSheet data={data} />);

  // Advisory persists onto the printed artifact…
  expect(screen.getByText(/sugars can accelerate trace/i)).toBeTruthy();
  // …and the procedure names the liquid at its stage.
  expect(screen.getByText(/blend in .*milk \(dairy or plant\) at light trace/i)).toBeTruthy();
});
