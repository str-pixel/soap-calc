// @vitest-environment jsdom
import { afterEach, describe, expect, it, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BatchSheet } from './BatchSheet';
// The dilution figure has to be identical on the screen and on the page carried to the
// bench, so the pin renders both surfaces from one fixture rather than trusting two
// same-shaped assertions in two files to stay in step.
import { DilutionPanel } from './DilutionPanel';
import { buildBatchSheetData } from '../lib/batchSheet';
import { computePostCookSuperfat } from '../lib/calculateAdditives';
import { calculateRecipe } from '../lib/calculateRecipe';
import { type RecipeSettings, createStarterLines, DEFAULT_SETTINGS } from '../lib/recipe';

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
  wholeBatchPasteGrams?: number | null;
  /** Travels with wholeBatchPasteGrams — together they identify an alternative liquid's
   * solids, and they are what the sheet's own gradual basis and paste floor read. */
  cookWaterGrams?: number;
  bottledSolutionGrams?: number | null;
  /** Overrides the fixture's own 'g' below — it is spread after it. */
  weightUnit?: 'g' | 'kg' | 'oz' | 'lb';
  /** Merged into the fixture's settings (spread after `lyeType`). The Pick is the
   * contract: only fields that do not affect calculateRecipe may travel here, or an
   * override would silently invalidate every derived expectation in the fixture. */
  settingsOverride?: Partial<
    Pick<
      RecipeSettings,
      | 'preservativeId'
      | 'preservativeCustomName'
      | 'preservativeDosePct'
      | 'preservativeSetByUser'
      | 'gradualWaterGrams'
    >
  >;
}) {
  const { targetExceedsPaste, dilutionOverride, settingsOverride, ...rest } = extra;
  const lines = createStarterLines();
  const settings = { ...DEFAULT_SETTINGS, lyeType: 'koh' as const, ...settingsOverride };
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

test('the printed caveat drops the floor framing once the figure is exact', () => {
  // With a corrected paste basis the printed water is solutionGrams − (anhydrous + lye
  // water + the liquid's whole mass): declaring the undeclared liquid's % water moves mass
  // between its water and its solids and leaves that sum alone, so the figure cannot move.
  // "(at least)" and "the least you will need" promised a lower number that can never come.
  render(<BatchSheet data={lsSheetData({ unknownLiquidGrams: 300, wholeBatchPasteGrams: 2059 })} />);
  expect(screen.queryByText(/at least/i)).toBeNull();
  expect(screen.getByText(/no declared water content/i).textContent).toMatch(
    /same whatever it turns out to be/i,
  );
  // The row itself still prints, corrected: 4,059 − 2,059.
  expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toContain('2,000 g');
});

test('no caveat rows when everything is declared', () => {
  render(<BatchSheet data={lsSheetData({})} />);
  expect(screen.queryByText(/no declared water content/i)).toBeNull();
});

test('the printed sheet explains a pour the liquid\'s solids clamped to 0 g', () => {
  // The sheet is the page carried to the bench, so DilutionPanel's pasteAlreadyPastTarget
  // alert needs a twin here. A 4,200 g pot against 4,059 g of solution makes
  // correctedDilutionWaterGrams clamp, and "Dilution water to add" then prints "0 g" — which,
  // printed bare, reads as a batch that needs nothing rather than one that cannot get there.
  render(<BatchSheet data={lsSheetData({ wholeBatchPasteGrams: 4200 })} />);
  const pour = screen.getByText('Dilution water to add').nextElementSibling!;
  expect(pour.textContent).toContain('0 g');
  const note = screen.getByText(/already more dilute than 30%/i).textContent!.replace(/\s+/g, ' ');
  // Both sides of the comparison, so the figure can be checked against the rows above it.
  expect(note).toContain('it weighs 4,200 g against the 4,059 g');
  expect(note).toContain('there is no dilution water to add');
});

test('a reading a hair over the solution pours the recipe’s own figure with no record behind it', () => {
  // THE WIDENED CEILING BELONGS TO GRADUAL ALONE. correctedPotGramsFor accepts a reading up
  // to solutionGrams stretched by the gradual write-back's own 2 dp rounding — here
  // 100 x 1,218 / (30 - 0.005) = 4,059.68 g against a 4,059 g solution — and that argument
  // only holds where a record actually WROTE the target. In concentration mode the maker
  // typed 30% themselves, so a 4,059.6 g reading is simply over the target (the app's own
  // named mistake: the crockpot weighed with the paste still in it), and every target-derived
  // figure must go on answering from the recipe's computed 1,600 g pot.
  //
  // Inside that band the printed sheet had no way to say anything at all. measuredPasteIsValidFor
  // still refused the reading, so the "uses the measured paste weight" note stayed off; the
  // already-more-dilute note keys on the COMPUTED pot, which is under the solution, so that
  // stayed off too; and gradual's record rows need a record. The page carried to the bench
  // printed "Dilution water to add — 0 g" and not one word about where the water went.
  render(
    <BatchSheet data={lsSheetData({ measuredPasteGrams: '4059.6', wholeBatchPasteGrams: 1600 })} />,
  );
  // 4,059 - 1,600, the recipe's own answer to a reading it cannot use.
  expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toContain(
    '2,459 g',
  );
  expect(screen.queryByText(/uses the measured paste weight/i)).toBeNull();
});

test('…and answers identically just past that band, so the band leaves no seam', () => {
  // The band on this fixture is (4,059, 4,060.68] — 1,218 g anhydrous at 30% gives a ceiling
  // of 100 x 1218 / 29.995 = 4,060.68 g. An earlier version of this test used 4,059.8 g and
  // called it "past the widened bound"; that reading is INSIDE the band, so the test was a
  // duplicate of its twin above and its comment asserted the reverse of the arithmetic.
  // 4,061 g is genuinely outside, which is what makes this a seam check rather than a
  // second copy of the previous one.
  render(
    <BatchSheet data={lsSheetData({ measuredPasteGrams: '4061', wholeBatchPasteGrams: 1600 })} />,
  );
  expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toContain(
    '2,459 g',
  );
});

test('a record in hand does not widen the pour’s own ceiling (Phase 3: the widening is gone)', () => {
  // A weighed pot whose reading is a hair inside where the write-back's own rounding used to
  // widen the ceiling — 4,059.6 g against a 4,059 g solution, with a 0 g record that would
  // once have licensed it. That widening is gone (spec §5): the pour row falls back to the
  // recipe's own computed pot exactly as it does with no record at all (its twin above,
  // '…and never prints that note…'), while the record's own rows ("Water actually added",
  // "That record makes") still print from the separate, target-independent resolution
  // (weighedOrComputedPotGramsFor) — the two questions this row and those rows answer were
  // never the same one, and the deletion only removes the coincidence that used to make the
  // pour's own figure agree with it.
  render(
    <BatchSheet
      data={lsSheetData({
        measuredPasteGrams: '4059.6',
        wholeBatchPasteGrams: 1600,
        settingsOverride: { gradualWaterGrams: '0' },
      })}
    />,
  );
  const pour = screen.getByText('Dilution water to add').nextElementSibling!;
  expect(pour.textContent).toContain('2,459 g');
  expect(screen.getByText(/Water actually added/).closest('div')!.textContent).toContain('0 g');
  // The weighed pot plus nothing — the record's own basis is unaffected by the pour's ceiling.
  expect(screen.getByText(/That record makes/).closest('div')!.textContent).toContain('4,060 g');
});

test('…and never prints that note beside the water-only one, which subsumes it', () => {
  // The same exclusion the panel applies, pinned separately because this is a separate copy
  // of the predicate and copies drift. targetExceedsPaste already means solutionGrams <
  // anhydrous + cook water, and the corrected pot only adds the liquid's solids on top — so
  // an ungated twin would double the notes on every over-dilute split-liquid sheet.
  render(
    <BatchSheet
      data={lsSheetData({
        wholeBatchPasteGrams: 4200,
        targetExceedsPaste: true,
        overDilutionCertain: true,
      })}
    />,
  );
  const notes = screen.getAllByText(/already more dilute/i);
  expect(notes).toHaveLength(1);
  expect(notes[0].textContent).toMatch(/adding water only lowers the concentration further/i);
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

it('prints the dilution water in one unit only', () => {
  render(<BatchSheet data={lsSheetData({})} />);
  const row = screen.getByText(/Dilution water/i).closest('div')!;
  // The negative alone would pass for almost any format change — including printing
  // nothing at all — so pin the string the row is actually expected to carry. The sheet
  // is built at weightUnit 'g' and the fixture's dilutionWaterGrams is 2,000.
  expect(row.textContent).toContain('2,000 g');
  expect(row.textContent).not.toMatch(/\(.*oz.*\/.*lb.*\)/);
  expect(row.textContent).not.toMatch(/oz|lb/);
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

test('echoes the measured paste in grams on the printed sheet, whatever the print unit', () => {
  // The field it comes from is grams-only, so quoting it back converted makes the maker
  // convert to recognise their own entry. The two on-screen echoes (DilutionPanel's "uses
  // your measured paste" hint and PortionDilutionResults' "scaled down from your N g
  // reading") were fixed for this; the printed sheet was the leftover — and it is the one
  // surface that is read away from the app, where the typed number cannot be checked.
  render(<BatchSheet data={lsSheetData({ measuredPasteGrams: '1600', weightUnit: 'lb' })} />);
  const note = screen.getByText(/measured paste weight/i);
  expect(note.textContent).toMatch(/1,600 g/);
  expect(note.textContent).not.toMatch(/3\.53 lb/);
  // The corrected water figure beside it is a bench readout and DOES print in lb — without
  // this the assertion above would also pass for a sheet that ignored weightUnit entirely.
  expect(screen.getByText('Dilution water to add').closest('div')!.textContent).toContain('5.42 lb');
});

test('prints the recipe-computed dilution water, with no measurement note, when no measurement is given', () => {
  render(<BatchSheet data={lsSheetData({})} />);
  expect(screen.getByText(/^2,000 g/)).toBeTruthy();
  expect(screen.queryByText(/measured paste/i)).toBeNull();
});

test('prints the bottled mass and finished volume — not just the chemistry-only solution — when extras make the bottled mass bigger', () => {
  // The sheet is the page taken to the bench: the dilution.solutionGrams row is
  // chemistry-only and is SMALLER than what actually gets bottled whenever there is
  // append-mode post-cook oil or split-liquid solids (see bottledSolutionGrams on the view
  // model). The printed mass is the INCLUSIVE finished product (spec §3), so it carries the
  // seeded preservative's w/w dose too: 4,515 + 4,515/99 = 4,560.6 g, and
  // 4,560.6 ÷ 1.03 g/ml = 4,428 ml, computed via the same core helper the on-screen panel
  // uses (lsFinishedVolumeMl), not recomputed here.
  render(<BatchSheet data={lsSheetData({ bottledSolutionGrams: 4515 })} />);
  expect(screen.getByText('4,561 g')).toBeTruthy();
  expect(screen.getByText('4,428 ml')).toBeTruthy();
});

test('omits the bottled-mass row when it matches the chemistry-only solution (nothing to add)', () => {
  render(<BatchSheet data={lsSheetData({ bottledSolutionGrams: 4059 })} />);
  // 4,059 g is exactly lsSheetData's own dilution.solutionGrams — no extras, so the
  // bottled row would be a bare duplicate of "Finished solution" and is skipped.
  expect(screen.queryByText('4,059 g (with extras)')).toBeNull();
});

it('prints no bottle count, but keeps the finished product and volume', () => {
  render(<BatchSheet data={lsSheetData({})} />);
  expect(screen.queryByText(/Bottles filled/i)).toBeNull();
  expect(screen.getByText(/Finished volume/i)).toBeTruthy();
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

describe('the panel and the printed sheet pour one figure (split-liquid recipe)', () => {
  // A split-liquid LS batch: 1,200 g anhydrous, 400 g lye water, and 900 g of an
  // alternative liquid declared at 50% water — 450 g of water (so 850 g of cook water)
  // and 450 g of NON-water solids, real mass sitting in the pot that the recipe's own
  // water-only arithmetic never counts. The pot therefore holds 2,500 g of paste.
  //
  // The 16% plan is what a 2:1 preset writes for that pot (2,500 x 3 = 7,500 g of solution,
  // 1,200 / 7,500 = 16.0%). Read back at 16%, calculateDilution answers 7,500 - 1,200 - 850 =
  // 5,450 g, because its own solution is anhydrous + water with no room for the solids. The
  // 450 g gap is exactly those solids, and it is the difference between the screen and the
  // page taken to the bench — 5,000 g is what the corrected pot really needs.
  //
  // REWRITTEN FROM 'the ratio block and the printed sheet pour one figure': the ratio block
  // was a second water row rendered beside the grid's, and the parity it needed proving
  // against the sheet was between THREE figures. There is one pour row now, so the claim is
  // the plain one — the screen and the bench page print the same corrected figure — and the
  // 5,000 g it must be is stated absolutely on both sides.
  const RATIO_SPLIT_DILUTION = {
    anhydrousGrams: 1200,
    solutionGrams: 7500,
    totalWaterGrams: 6300,
    dilutionWaterGrams: 5450,
    glycerinGrams: 110,
    soapConcentrationPercent: 16,
    targetExceedsPaste: false,
  };
  const WHOLE_BATCH_PASTE_GRAMS = 2500;

  function panelPourFigure(): string {
    render(
      <DilutionPanel
        dilution={RATIO_SPLIT_DILUTION}
        soapConcentrationPercent="16"
        onSoapConcentrationChange={() => {}}
        weightUnit="g"
        cookWaterGrams={850}
        wholeBatchPasteGrams={WHOLE_BATCH_PASTE_GRAMS}
      />,
    );
    const figure = screen.getByText('Dilution water to add').nextElementSibling!.textContent!;
    cleanup();
    return figure;
  }

  test('the sheet prints the same water the panel does', () => {
    const panelFigure = panelPourFigure();
    // Stated absolutely as well as relatively: an equality alone would also pass if both
    // surfaces regressed to the same wrong number.
    expect(panelFigure).toBe('5,000 g');
    render(
      <BatchSheet
        data={lsSheetData({
          dilutionOverride: RATIO_SPLIT_DILUTION,
          wholeBatchPasteGrams: WHOLE_BATCH_PASTE_GRAMS,
        })}
      />,
    );
    const sheetFigure = screen.getByText('Dilution water to add').nextElementSibling!.textContent;
    expect(sheetFigure).toBe(panelFigure);
  });

  test('the grid prints it under a record too — the plan row keeps its own figure', () => {
    render(
      <DilutionPanel
        dilution={RATIO_SPLIT_DILUTION}
        soapConcentrationPercent="16"
        onSoapConcentrationChange={() => {}}
        weightUnit="g"
        cookWaterGrams={850}
        wholeBatchPasteGrams={WHOLE_BATCH_PASTE_GRAMS}
        gradualWaterGrams="1000"
        onGradualWaterChange={() => {}}
      />,
    );
    // Labelled as plan (spec §2), and unchanged by the record beside it: the pour is what
    // the plan still asks for, and a record does not move it.
    expect(
      screen.getByText('Dilution water to add (plan)').nextElementSibling!.textContent,
    ).toBe('5,000 g');
  });

  test('a recipe with no split liquid is untouched: no corrected basis, the recipe figure stands', () => {
    // The fixture's own dilution (2,000 g) with no wholeBatchPasteGrams supplied — the
    // fallback every caller predating the corrected basis still takes.
    render(<BatchSheet data={lsSheetData({})} />);
    expect(screen.getByText('Dilution water to add').nextElementSibling!.textContent).toContain('2,000 g');
  });
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

test('prints the preservative dose against the whole batch, and names the scope', () => {
  render(<BatchSheet data={lsSheetData({
    settingsOverride: { preservativeId: 'suttocide-a', preservativeDosePct: '1', preservativeSetByUser: true },
  })} />);
  const row = screen.getByText('Preservative').closest('div')!;
  expect(row.textContent).toContain('Suttocide A');
  expect(row.textContent).toContain('1%');
  expect(row.textContent).toContain('whole batch');
  // 1% of the fixture's 4,059 g finished solution
  expect(row.textContent).toContain('41 g');
});

test('a blank custom name still prints a headed row', () => {
  render(<BatchSheet data={lsSheetData({
    settingsOverride: {
      preservativeId: '',
      preservativeCustomName: '',
      preservativeDosePct: '1',
      preservativeSetByUser: true,
    },
  })} />);
  expect(screen.getByText('Preservative').closest('div')!.textContent)
    .toContain('Custom preservative');
});

test('a typed custom name reaches the sheet, not just the blank fallback', () => {
  render(<BatchSheet data={lsSheetData({
    settingsOverride: {
      preservativeId: '',
      preservativeCustomName: 'Optiphen Plus',
      preservativeDosePct: '1',
      preservativeSetByUser: true,
    },
  })} />);
  expect(screen.getByText('Preservative').closest('div')!.textContent)
    .toContain('Optiphen Plus');
});

test('no dose, no row', () => {
  render(<BatchSheet data={lsSheetData({
    settingsOverride: { preservativeDosePct: '', preservativeSetByUser: true },
  })} />);
  expect(screen.queryByText('Preservative')).toBeNull();
});

test('an impossible dose prints no row either', () => {
  render(<BatchSheet data={lsSheetData({
    settingsOverride: { preservativeDosePct: '150', preservativeSetByUser: true },
  })} />);
  expect(screen.queryByText('Preservative')).toBeNull();
});

test('an over-ceiling dose prints its caveat; the formaldehyde note stays off the sheet', () => {
  render(<BatchSheet data={lsSheetData({
    settingsOverride: { preservativeId: 'suttocide-a', preservativeDosePct: '2', preservativeSetByUser: true },
  })} />);
  expect(screen.getByText(/above the EU legal maximum/i)).toBeTruthy();
  expect(screen.queryByText(/releases formaldehyde/i)).toBeNull();
});

test('the printed dose is the batch figure — the sheet has no portion scope to follow', () => {
  // bottledSolutionGrams overrides the finished mass; the row must track THAT, and there
  // must be no way to make it track a Custom-amount portion instead.
  render(<BatchSheet data={lsSheetData({
    bottledSolutionGrams: 2000,
    settingsOverride: { preservativeId: 'suttocide-a', preservativeDosePct: '1', preservativeSetByUser: true },
  })} />);
  expect(screen.getByText('Preservative').closest('div')!.textContent).toContain('20 g');
});

test('the row prints for the seeded default too — the sheet names what its mass includes', () => {
  // The bottled mass this sheet prints INCLUDES the seeded preservative's grams (the vm and
  // this file compute that dose from the same predicate, which does not read
  // preservativeSetByUser). Suppressing the row while folding in its weight printed a mass
  // the page could not account for; a bench sheet that carries the grams must name them.
  // The row reads as the recommendation it is — product, dose and stage all stated.
  render(<BatchSheet data={lsSheetData({
    settingsOverride: {
      preservativeId: 'suttocide-a',
      preservativeDosePct: '1',
      preservativeSetByUser: false,
    },
  })} />);
  expect(screen.getByText('Preservative')).toBeTruthy();
});

test('the row prints once the maker has chosen', () => {
  render(<BatchSheet data={lsSheetData({
    settingsOverride: {
      preservativeId: 'suttocide-a',
      preservativeDosePct: '1',
      preservativeSetByUser: true,
    },
  })} />);
  expect(screen.getByText('Preservative')).toBeTruthy();
});

test('a below-50°C stage note prints for a preservative that actually carries one', () => {
  // Every other sheet test uses suttocide-a, whose addBelowC is null, so the addBelowC
  // arm of the stage note has never rendered in this file. Liquid Germall Plus's is 50.
  render(<BatchSheet data={lsSheetData({
    settingsOverride: {
      preservativeId: 'liquid-germall-plus',
      preservativeDosePct: '0.5',
      preservativeSetByUser: true,
    },
  })} />);
  const row = screen.getByText('Preservative').closest('div')!;
  expect(row.textContent).toContain('Liquid Germall Plus');
  expect(row.textContent).toContain('add after dilution, below 50 °C');
  expect(row.textContent).not.toContain('once cooled');
});

describe('the sheet records the water actually poured', () => {
  test('prints the recorded water and the finished mass it produced', () => {
    // BOTH halves, which is what this test's name has always promised and what spec §4 asks
    // the sheet to carry: for a while only the water row existed, so the page said what went
    // in and never what came out.
    render(
      <BatchSheet
        data={lsSheetData({
          settingsOverride: { gradualWaterGrams: '2000' },
          wholeBatchPasteGrams: 1600,
          cookWaterGrams: 382,
        })}
      />,
    );
    const row = screen.getByText(/Water actually added/).closest('div')!;
    expect(row.textContent).toContain('2,000 g');
    // 1,600 g of paste plus the 2,000 g recorded — the panel's own basis and the panel's own
    // sum, through the shared helpers, so screen and sheet cannot print different masses.
    const made = screen.getByText(/That record makes/).closest('div')!;
    expect(made.textContent).toContain('3,600 g');
  });

  test('names which row is the record and which is the target, so neither stands in for the other', () => {
    // They are usually within a gram of each other, and can be hundreds apart while a
    // record sits beside a target it has not been applied to. Two labels that both read as
    // "water for this batch" are not enough on a printed page with no tooltips.
    render(
      <BatchSheet
        data={lsSheetData({
          settingsOverride: { gradualWaterGrams: '2000' },
          wholeBatchPasteGrams: 1600,
          cookWaterGrams: 382,
        })}
      />,
    );
    const made = screen.getByText(/That record makes/).closest('div')!.textContent!;
    expect(made).toMatch(/paste plus the water you recorded/i);
    expect(made).toMatch(/Dilution water to add.*saved 30% target/i);
  });

  test('takes the pot the maker weighed, when the reading describes one', () => {
    // The same basis the panel's "Finished so far (weighed)" counts from — a measurement
    // outranks the computed pot on both surfaces or they print different finished masses
    // for one record.
    render(
      <BatchSheet
        data={lsSheetData({
          settingsOverride: { gradualWaterGrams: '2000' },
          wholeBatchPasteGrams: 1600,
          cookWaterGrams: 382,
          measuredPasteGrams: '1500',
        })}
      />,
    );
    expect(screen.getByText(/That record makes/).closest('div')!.textContent).toContain('3,500 g');
  });

  test('says nothing about a finished mass when nothing was recorded', () => {
    render(<BatchSheet data={lsSheetData({ wholeBatchPasteGrams: 1600, cookWaterGrams: 382 })} />);
    expect(screen.queryByText(/That record makes/)).toBeNull();
  });

  test('says nothing about poured water when none was recorded', () => {
    render(<BatchSheet data={lsSheetData({})} />);
    expect(screen.queryByText(/Water actually added/)).toBeNull();
  });

  test('does not present the recorded figure as the computed one', () => {
    // Both print, and they answer different questions: "Dilution water to add" is what the
    // saved target implies, "Water actually added" is what went in the pot. A sheet that
    // showed one as the other would be the paper version of the confusion this whole
    // feature exists to remove.
    render(<BatchSheet data={lsSheetData({ settingsOverride: { gradualWaterGrams: '2000' } })} />);
    expect(screen.getByText('Dilution water to add')).toBeTruthy();
    expect(screen.getByText(/Water actually added/)).toBeTruthy();
  });

  test('ignores a blank or unparseable record rather than printing a bare row', () => {
    render(<BatchSheet data={lsSheetData({ settingsOverride: { gradualWaterGrams: 'abc' } })} />);
    expect(screen.queryByText(/Water actually added/)).toBeNull();
  });

  test('a 0 g record is a record, and prints as one', () => {
    // The pot before any water at all is Gradual Dilution's own starting entry (LS:1531),
    // and the panel's ask says so outright — "0 g counts, and is where the record starts".
    // While this row was gated on `> 0`, that record printed nothing on paper: the screen
    // said the maker had recorded something and the sheet said they had not.
    render(
      <BatchSheet
        data={lsSheetData({
          settingsOverride: { gradualWaterGrams: '0' },
          wholeBatchPasteGrams: 1600,
          cookWaterGrams: 382,
        })}
      />,
    );
    expect(screen.getByText(/Water actually added/).closest('div')!.textContent).toContain('0 g');
    // …and what it makes is the pot itself: 1,600 g of paste plus nothing.
    expect(screen.getByText(/That record makes/).closest('div')!.textContent).toContain('1,600 g');
  });

  test('the mass a record makes reads the same on screen and on paper', () => {
    // THE PIN ON THE SHARED RESOLUTION, and on the one thing that must not be "fixed" by
    // giving this row the pour's own ceiling. The row states what the RECORD makes, so it
    // counts from the target-independent basis (lib/measuredPaste's
    // weighedOrComputedPotGramsFor) — the same call, and now literally the same function, the
    // panel's "Finished so far" makes. The pour beside it is measured AGAINST the saved
    // target and keeps the widened ceiling, so on a crockpot-sized reading with a target the
    // record has not been applied to, the two legitimately differ; the row's own sentence is
    // what says which is which, and the panel prints "Not applied yet" for the same state.
    //
    // Put the ceiling on this row and the paper would state a mass the screen does not show
    // for the same record — and the ceiling cannot go on the panel's basis instead, because
    // gradual DERIVES its target from it (the render loop measuredPasteDescribesPotFor
    // documents).
    const gradualDilution = {
      anhydrousGrams: 1218,
      solutionGrams: 4059,
      totalWaterGrams: 2841,
      dilutionWaterGrams: 2000,
      glycerinGrams: 107,
      soapConcentrationPercent: 30,
      targetExceedsPaste: false,
    };
    render(
      <DilutionPanel
        dilution={gradualDilution}
        soapConcentrationPercent="30"
        onSoapConcentrationChange={() => {}}
        weightUnit="g"
        gradualWaterGrams="0"
        measuredPasteGrams="4500"
        cookWaterGrams={382}
        wholeBatchPasteGrams={1600}
      />,
    );
    const onScreen = screen
      .getByText('Finished so far (weighed)')
      .nextElementSibling!.textContent!.trim();
    expect(onScreen).toBe('4,500 g');
    cleanup();

    render(
      <BatchSheet
        data={lsSheetData({
          dilutionOverride: gradualDilution,
          settingsOverride: { gradualWaterGrams: '0' },
          measuredPasteGrams: '4500',
          wholeBatchPasteGrams: 1600,
          cookWaterGrams: 382,
        })}
      />,
    );
    expect(screen.getByText(/That record makes/).closest('div')!.textContent).toContain(onScreen);
    // …while the pour keeps its own ceiling and answers from the recipe's computed pot:
    // 4,059 - 1,600. One page, two questions, both named.
    expect(screen.getByText('Dilution water to add').closest('div')!.textContent).toContain(
      '2,459 g',
    );
  });

  test('a leftover record does not widen the paste ceiling for a target it never wrote', () => {
    // The batch-sheet defect this branch closed once, reachable through a field nothing
    // clears. `gradualWaterGrams` is recipe state, so "a record exists" is still true after
    // recording 2,000 g and then typing 30% into the plan by hand — and a 4,060 g reading (the
    // loaded crockpot) sits inside the widened band around this fixture's 4,059 g solution.
    // The pot became the reading, and "Dilution water to add" printed a bare "0 g" on the page
    // carried to the bench.
    //
    // 4,060 g of paste plus the 2,000 g recorded is 6,060 g, which is 20.1% soap and not the
    // 30% in force, so this record cannot have written this target: the reading is simply past
    // it, and the recipe's own computed pot answers. 4,059 - 1,600.
    render(
      <BatchSheet
        data={lsSheetData({
          settingsOverride: { gradualWaterGrams: '2000' },
          measuredPasteGrams: '4060',
          wholeBatchPasteGrams: 1600,
          cookWaterGrams: 382,
        })}
      />,
    );
    expect(screen.getByText('Dilution water to add').closest('div')!.textContent).toContain(
      '2,459 g',
    );
  });

  test('a record with a swallowed thousands separator is not a record', () => {
    // A typed 2,000 commits as '2.000' in every locale (the browser reads the comma as a
    // decimal point), so this row would have printed "Water actually added — 2 g" for a pour
    // of two kilograms, beside a finished mass 2.25x lighter than the batch on the bench.
    render(
      <BatchSheet
        data={lsSheetData({
          settingsOverride: { gradualWaterGrams: '2.000' },
          wholeBatchPasteGrams: 1600,
          cookWaterGrams: 382,
        })}
      />,
    );
    expect(screen.queryByText(/Water actually added/)).toBeNull();
    expect(screen.queryByText(/That record makes/)).toBeNull();
  });

  test('a negative record is not a pour, and still prints nothing', () => {
    render(
      <BatchSheet
        data={lsSheetData({
          settingsOverride: { gradualWaterGrams: '-100' },
          wholeBatchPasteGrams: 1600,
          cookWaterGrams: 382,
        })}
      />,
    );
    expect(screen.queryByText(/Water actually added/)).toBeNull();
    expect(screen.queryByText(/That record makes/)).toBeNull();
  });
});

describe('the printed sheet: a plan verdict needs a plan to govern (spec §4)', () => {
  // The three verdict notes lean on the write-back having aligned target ≈ record. Without
  // one they are claims about a target the maker is not aiming at any more, printed beside
  // the record rows that say what the batch actually is. They are plan-governs only now.
  const OVER = {
    dilutionOverride: {
      anhydrousGrams: 1218, solutionGrams: 1433, totalWaterGrams: 215,
      dilutionWaterGrams: 0, glycerinGrams: 107, soapConcentrationPercent: 85,
      targetExceedsPaste: true,
    },
    overDilutionCertain: true,
  };

  it('prints "already more dilute" while the plan governs', () => {
    render(<BatchSheet data={lsSheetData(OVER)} />);
    expect(screen.getByText(/already more dilute than 85%/i)).toBeTruthy();
  });

  it('prints nothing of the kind once a record governs', () => {
    render(
      <BatchSheet
        data={lsSheetData({ ...OVER, settingsOverride: { gradualWaterGrams: '0' } })}
      />,
    );
    expect(screen.queryByText(/already more dilute/i)).toBeNull();
    // The record rows are what speak instead.
    expect(screen.getByText('Water actually added')).toBeTruthy();
  });

  it('drops the corrected-pot verdict and the can\'t-tell hedge under a record too', () => {
    const PAST = {
      dilutionOverride: {
        anhydrousGrams: 1218, solutionGrams: 1900, totalWaterGrams: 682,
        dilutionWaterGrams: 282, glycerinGrams: 107, soapConcentrationPercent: 64.1,
        targetExceedsPaste: false,
      },
      cookWaterGrams: 400,
      wholeBatchPasteGrams: 2200,
    };
    render(<BatchSheet data={lsSheetData(PAST)} />);
    expect(screen.getByText(/there is no dilution water to add/i)).toBeTruthy();
    cleanup();
    render(
      <BatchSheet data={lsSheetData({ ...PAST, settingsOverride: { gradualWaterGrams: '600' } })} />,
    );
    expect(screen.queryByText(/there is no dilution water to add/i)).toBeNull();
    cleanup();
    const HEDGE = {
      dilutionOverride: {
        anhydrousGrams: 1218, solutionGrams: 1433, totalWaterGrams: 215,
        dilutionWaterGrams: 0, glycerinGrams: 107, soapConcentrationPercent: 85,
        targetExceedsPaste: true,
      },
      unknownLiquidGrams: 900,
      overDilutionCertain: false,
    };
    render(<BatchSheet data={lsSheetData(HEDGE)} />);
    expect(screen.getByText(/Can.t tell whether 85% is reachable/i)).toBeTruthy();
    cleanup();
    render(
      <BatchSheet data={lsSheetData({ ...HEDGE, settingsOverride: { gradualWaterGrams: '600' } })} />,
    );
    expect(screen.queryByText(/Can.t tell whether/i)).toBeNull();
  });
});
