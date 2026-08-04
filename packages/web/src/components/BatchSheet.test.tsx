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

  // Cook 5% compounded with post-cook 3% (core effectiveSuperfatPercent):
  // 100×(1−0.95×0.97) = 7.85 → "7.9%". The sheet and the on-screen results share the
  // definition, so neither can print the plain-addition 8% the insights contradict.
  expect(screen.getByText('Total superfat')).toBeTruthy();
  expect(screen.getByText('7.9%')).toBeTruthy();
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

test('prints the soaping temperature in both units', () => {
  const lines = createStarterLines();
  const settings = { ...DEFAULT_SETTINGS };
  const { result, displayTotals, linePercents } = calculateRecipe(lines, settings);
  if (!result || !displayTotals) throw new Error('expected a valid calculation');
  const data = buildBatchSheetData({
    recipeName: 'Temp sheet',
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
    properties: null,
    indexes: { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] },
    batchWeightWithExtras: displayTotals.batchWeightGrams,
    waterModeLabel: '33% of oils',
    fattyAcids: { profile: null, coveragePercent: 0, missingOilIds: [], modeledOilIds: [] },
    insights: [],
    process: 'cp',
    soapingTempF: 125,
  });
  render(<BatchSheet data={data} />);
  expect(screen.getByText('Soaping temperature')).toBeTruthy();
  expect(screen.getByText('52 °C (125 °F)')).toBeTruthy();
});

// LS process (koh) with a real dilution block, so the printed sheet's caveat rows can be
// exercised without inventing a second buildBatchSheetData fixture convention — the
// required-field list below is copied verbatim from this file's first test.
function lsSheetData(extra: {
  unknownLiquidGrams?: number;
  lyeWaterUnverifiable?: boolean;
  targetExceedsPaste?: boolean;
  overDilutionCertain?: boolean;
  dilutionOverride?: import('@soap-calc/core').DilutionResult;
  neutralization?: import('@soap-calc/core').NeutralizationResult | null;
  measuredPasteGrams?: string;
  measuredPasteIsRemaining?: boolean;
}) {
  const { targetExceedsPaste, dilutionOverride, ...rest } = extra;
  const lines = createStarterLines();
  const settings = { ...DEFAULT_SETTINGS, lyeType: 'koh' as const };
  const { result, displayTotals, linePercents } = calculateRecipe(lines, settings);
  if (!result || !displayTotals) throw new Error('expected a valid calculation');

  return buildBatchSheetData({
    recipeName: 'LS dilution batch',
    batchNotes: '',
    weightUnit: 'g',
    lyeLabel: 'KOH',
    settings,
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
    dilution: dilutionOverride ?? {
      anhydrousGrams: 1218,
      solutionGrams: 4059,
      totalWaterGrams: 2841,
      dilutionWaterGrams: 2000,
      glycerinGrams: 107,
      soapConcentrationPercent: 30,
      targetExceedsPaste: targetExceedsPaste ?? false,
    },
    neutralization: null,
    properties: null,
    indexes: { iodine: null, ins: null, coveragePercent: 0, missingOilIds: [] },
    batchWeightWithExtras: displayTotals.batchWeightGrams,
    waterModeLabel: '33% of oils',
    fattyAcids: { profile: null, coveragePercent: 0, missingOilIds: [], modeledOilIds: [] },
    insights: [],
    process: 'ls',
    ...rest,
  });
}

// CP fixture: no lyeType override (plain NaOH, DEFAULT_SETTINGS), no dilution — the
// lyeWaterUnverifiable note is documented to apply to every process, not only LS.
function cpSheetData(extra: { lyeWaterUnverifiable?: boolean }) {
  const lines = createStarterLines();
  const settings = { ...DEFAULT_SETTINGS };
  const { result, displayTotals, linePercents } = calculateRecipe(lines, settings);
  if (!result || !displayTotals) throw new Error('expected a valid calculation');

  return buildBatchSheetData({
    recipeName: 'CP batch',
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
    ...extra,
  });
}

test('printed dilution carries the unknown-liquid caveat when water content is undeclared', () => {
  render(<BatchSheet data={lsSheetData({ unknownLiquidGrams: 300 })} />);
  expect(screen.getByText(/at least/i)).toBeTruthy();
  expect(screen.getByText(/no declared water content/i)).toBeTruthy();
});

test('no caveat rows when everything is declared', () => {
  render(<BatchSheet data={lsSheetData({})} />);
  expect(screen.queryByText(/no declared water content/i)).toBeNull();
});

test('printed dilution shows the can\'t-tell wording (not a false floor) when the target already exceeds an undeclared paste', () => {
  render(<BatchSheet data={lsSheetData({ unknownLiquidGrams: 300, targetExceedsPaste: true })} />);
  // No vacuous floor claim: the "(at least)" suffix and "least you will need" caveat are
  // both suppressed, matching the on-screen panel's post-#142 behavior.
  expect(screen.queryByText(/at least/i)).toBeNull();
  expect(screen.queryByText(/least you will need/i)).toBeNull();
  expect(screen.getByText(/Can't tell whether 30% is reachable/i)).toBeTruthy();
});

test('printed dilution target keeps the fractional value the water was computed for', () => {
  // The water grams beside it are computed from the unrounded target; printing "23%" next
  // to water for 22.5% makes the sheet disagree with the on-screen panel and with itself.
  render(
    <BatchSheet
      data={lsSheetData({
        dilutionOverride: {
          anhydrousGrams: 1218, solutionGrams: 5413, totalWaterGrams: 4195,
          dilutionWaterGrams: 3354, glycerinGrams: 107, soapConcentrationPercent: 22.5,
          targetExceedsPaste: false,
        },
      })}
    />,
  );
  expect(screen.getByText(/22\.5%/)).toBeTruthy();
  expect(screen.queryByText(/^23%$/)).toBeNull();
});

test("the can't-tell hedge prints the same fractional target as the dilution row", () => {
  // The THIRD print site: this branch still ran formatGrams(x, 0), reproducing the
  // 22.5-vs-23 self-disagreement inside one sheet (code-review 2026-08-01). All three
  // sites now share formatConcentrationPercent.
  render(
    <BatchSheet
      data={lsSheetData({
        unknownLiquidGrams: 900,
        dilutionOverride: {
          anhydrousGrams: 1215, solutionGrams: 2431, totalWaterGrams: 1215,
          dilutionWaterGrams: 0, glycerinGrams: 100, soapConcentrationPercent: 47.5,
          targetExceedsPaste: true,
        },
      })}
    />,
  );
  expect(screen.getByText(/can.t tell whether 47\.5%/i)).toBeTruthy();
  expect(screen.queryByText(/whether 48%/i)).toBeNull();
});

test('lye-dissolution caveat prints for a CP recipe (no dilution block) when the flag is set', () => {
  render(<BatchSheet data={cpSheetData({ lyeWaterUnverifiable: true })} />);
  expect(screen.getByText(/1:1 lye-dissolution check could not run/i)).toBeTruthy();
});

test('lye-dissolution caveat is absent from a CP sheet when the flag is unset', () => {
  render(<BatchSheet data={cpSheetData({})} />);
  expect(screen.queryByText(/1:1 lye-dissolution check could not run/i)).toBeNull();
});

test('when over-dilution is certain despite an unknown liquid, the sheet states it as fact', () => {
  // The panel asserts the verdict when it holds across the unknown's whole 0-100% range;
  // the sheet used to keep hedging ("can't tell") in that same state — conservative but
  // imprecise, and a cross-surface disagreement for the same recipe.
  render(
    <BatchSheet
      data={lsSheetData({
        unknownLiquidGrams: 300,
        overDilutionCertain: true,
        dilutionOverride: {
          anhydrousGrams: 1218, solutionGrams: 1433, totalWaterGrams: 215,
          dilutionWaterGrams: 0, glycerinGrams: 107, soapConcentrationPercent: 85,
          targetExceedsPaste: true,
        },
      })}
    />,
  );
  expect(screen.getByText(/already more dilute than 85%/i)).toBeTruthy();
  expect(screen.queryByText(/can.t tell whether/i)).toBeNull();
});

test('without certainty the sheet still hedges', () => {
  render(
    <BatchSheet
      data={lsSheetData({
        unknownLiquidGrams: 900,
        dilutionOverride: {
          anhydrousGrams: 1215, solutionGrams: 2431, totalWaterGrams: 1215,
          dilutionWaterGrams: 0, glycerinGrams: 100, soapConcentrationPercent: 50,
          targetExceedsPaste: true,
        },
      })}
    />,
  );
  expect(screen.getByText(/can.t tell whether 50%/i)).toBeTruthy();
  expect(screen.queryByText(/already more dilute/i)).toBeNull();
});

test('printed dilution water reflects a measured paste, matching the on-screen figure', () => {
  // The screen (DilutionPanel) already corrects its "Dilution water to add" row from a
  // valid measured paste; the printed sheet used to keep showing the recipe's own
  // computed dilutionWaterGrams instead, so a maker who weighed their paste saw two
  // different numbers. solutionGrams 4,059 - measured 1,600 = 2,459 g, not 2,000 g.
  render(<BatchSheet data={lsSheetData({ measuredPasteGrams: '1600' })} />);
  expect(screen.getByText(/^2,459 g/)).toBeTruthy();
  expect(screen.queryByText(/^2,000 g/)).toBeNull();
  expect(screen.getByText(/measured paste/i)).toBeTruthy();
});

test('prints the recipe-computed dilution water, with no measurement note, when no measurement is given', () => {
  render(<BatchSheet data={lsSheetData({})} />);
  expect(screen.getByText(/^2,000 g/)).toBeTruthy();
  expect(screen.queryByText(/measured paste/i)).toBeNull();
});

test('a measurement declared as what is left after earlier dilutions does not correct the printed batch water — it is not the batch', () => {
  // Same 1,600 g reading as the "matching the on-screen figure" test above, but declared
  // remaining: the printed sheet must keep the recipe's own 2,000 g, since a partial-pot
  // reading does not describe the whole batch this row is about.
  render(<BatchSheet data={lsSheetData({ measuredPasteGrams: '1600', measuredPasteIsRemaining: true })} />);
  expect(screen.getByText(/^2,000 g/)).toBeTruthy();
  expect(screen.queryByText(/^2,459 g/)).toBeNull();
  expect(screen.queryByText(/measured paste/i)).toBeNull();
});

test('a measured paste that outranks targetExceedsPaste also suppresses the printed "already more dilute" alert', () => {
  // Mirrors DilutionPanel: targetExceedsPaste was derived from the recipe's ASSUMED cook
  // water. Measured paste 1,300 g is valid (between the 1,218 g anhydrous floor and the
  // 1,433 g solution ceiling) and implies 1,433 - 1,300 = 133 g of water is still needed —
  // the opposite of "already more dilute". Printing both would contradict the corrected
  // water figure right above it.
  render(
    <BatchSheet
      data={lsSheetData({
        overDilutionCertain: true,
        measuredPasteGrams: '1300',
        dilutionOverride: {
          anhydrousGrams: 1218, solutionGrams: 1433, totalWaterGrams: 215,
          dilutionWaterGrams: 0, glycerinGrams: 107, soapConcentrationPercent: 85,
          targetExceedsPaste: true,
        },
      })}
    />,
  );
  expect(screen.getByText(/^133 g/)).toBeTruthy();
  expect(screen.queryByText(/already more dilute/i)).toBeNull();
});

test('printed Neutralize section shows the stearic-acid alternative and its cannot-overdose note', () => {
  render(
    <BatchSheet
      data={lsSheetData({
        neutralization: {
          lyeExcessPercent: 2,
          excessKohGrams: 4,
          excessNaohGrams: 0,
          citricAcidGrams: 5,
          stearicAcidGrams: 22,
          dilutionWaterGrams: 20,
          targetPhLow: 9,
          targetPhHigh: 10.5,
        },
      })}
    />,
  );
  expect(screen.getByText('Or stearic acid')).toBeTruthy();
  expect(screen.getByText('22 g')).toBeTruthy();
  expect(screen.getByText(/cannot be overdosed/i)).toBeTruthy();
});
