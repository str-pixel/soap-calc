// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useRecipeViewModel } from './useRecipeViewModel';
import {
  createStarterLines,
  DEFAULT_SETTINGS,
  createEmptyAdditives,
  type AdditiveLine,
  type RecipeSettings,
} from '../lib/recipe';
import type { ProcessId } from '../lib/process';
import { processProfileById } from '../lib/processProfile';

afterEach(cleanup);

function probe(
  onVm: (vm: unknown) => void,
  settingsOverride: Partial<RecipeSettings> = {},
  process: ProcessId = 'cp',
  vesselVolumeCm3?: number | null,
  additivesOverride?: AdditiveLine[],
) {
  function Probe() {
    const vm = useRecipeViewModel({
      recipeName: 'Test',
      lines: createStarterLines(),
      settings: { ...DEFAULT_SETTINGS, ...settingsOverride },
      additives: additivesOverride ?? createEmptyAdditives(),
      drafts: {},
      weightUnit: 'g',
      process,
      vesselVolumeCm3,
    });
    onVm(vm);
    return null;
  }
  render(<Probe />);
}

test('view-model computes a lye result and printable batch sheet for the starter recipe', () => {
  let captured: any;
  probe((vm) => { captured = vm; });
  expect(captured.result).not.toBeNull();
  expect(captured.totalOilGrams).toBeGreaterThan(0);
  expect(captured.inputErrors).toEqual([]);
  expect(captured.batchSheetData).not.toBeNull();
  expect(captured.lyeLabel).toBe('NaOH');
});

test('postCookSuperfat is null when off, and its grams fold into batchWeightWithExtras when set (HP)', () => {
  let withoutPcsf: any;
  let withPcsf: any;
  probe((vm) => { withoutPcsf = vm; }, {}, 'hp');
  // Append so the grams are an EXTRA folded into the batch (subtract would reserve them).
  probe(
    (vm) => { withPcsf = vm; },
    { postCookSuperfatOils: [{ oilId: 'shea-butter', percent: '5' }], postCookSuperfatMethod: 'append' },
    'hp',
  );

  expect(withoutPcsf.postCookSuperfat).toBeNull();
  expect(withPcsf.postCookSuperfat).toEqual({
    oils: [{ oilId: 'shea-butter', percentOfOil: 5, grams: expect.any(Number) }],
    percentOfOil: 5,
    grams: expect.any(Number),
  });
  expect(withPcsf.postCookSuperfat.grams).toBeGreaterThan(0);
  expect(withPcsf.batchWeightWithExtras).toBeCloseTo(
    withoutPcsf.batchWeightWithExtras + withPcsf.postCookSuperfat.grams,
  );
  expect(withPcsf.batchSheetData.postCookSuperfat).toEqual(withPcsf.postCookSuperfat);
});

test('a stray post-cook superfat never applies under CP (no field exists to clear it)', () => {
  // The same settings that compute a PCSF under HP must be inert under CP: no PCSF object,
  // and the batch weight identical to a clean CP recipe. Guards the "CP is bit-identical"
  // invariant against hand-edited / imported drafts (coerceSettingsForProcess only coerces
  // lyeType, so a stray postCookSuperfatPercent would otherwise leak through).
  let strayCp: any;
  let cleanCp: any;
  probe(
    (vm) => { strayCp = vm; },
    { postCookSuperfatOils: [{ oilId: 'shea-butter', percent: '5' }] },
    'cp',
  );
  probe((vm) => { cleanCp = vm; }, {}, 'cp');

  expect(strayCp.postCookSuperfat).toBeNull();
  expect(strayCp.batchWeightWithExtras).toBeCloseTo(cleanCp.batchWeightWithExtras);
});

test('subtract reduces the lye by (1 − PCSF%) while oil weight stays on the full recipe', () => {
  let append: any;
  let subtract: any;
  probe((vm) => { append = vm; }, { postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '10' }], postCookSuperfatMethod: 'append' }, 'hp');
  probe((vm) => { subtract = vm; }, { postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '10' }], postCookSuperfatMethod: 'subtract' }, 'hp');

  expect(subtract.result.lyeWeightGrams).toBeCloseTo(append.result.lyeWeightGrams * 0.9);
  expect(subtract.result.waterWeightGrams).toBeCloseTo(append.result.waterWeightGrams * 0.9);
  expect(subtract.totalOilGrams).toBeCloseTo(append.totalOilGrams); // oil unchanged
  // append folds PCSF into batch (extra oil); subtract reserves it (not added)
  expect(subtract.batchWeightWithExtras).toBeLessThan(append.batchWeightWithExtras);
});

test('subtract clamps a summed PCSF total past 100% so the lye never zeroes out', () => {
  let append: any;
  let subtract: any;
  const threeOils = [
    { oilId: 'olive-oil', percent: '50' },
    { oilId: 'shea-butter', percent: '50' },
    { oilId: 'coconut-oil-76', percent: '50' },
  ];
  probe((vm) => { append = vm; }, { postCookSuperfatOils: threeOils, postCookSuperfatMethod: 'append' }, 'hp');
  probe((vm) => { subtract = vm; }, { postCookSuperfatOils: threeOils, postCookSuperfatMethod: 'subtract' }, 'hp');

  // 150% total is clamped to 99% reserve → cookFactor 0.01, NOT ≤ 0. Lye stays positive
  // (append × 0.01) rather than collapsing to zero.
  expect(subtract.result.lyeWeightGrams).toBeGreaterThan(0);
  expect(subtract.result.lyeWeightGrams).toBeCloseTo(append.result.lyeWeightGrams * 0.01, 4);
});

test('dilution: computed for LS, null for CP, null (no crash) for an empty LS recipe', () => {
  let ls: any;
  let cp: any;
  probe((vm) => { ls = vm; }, { soapConcentrationPercent: '30' }, 'ls');
  probe((vm) => { cp = vm; }, { soapConcentrationPercent: '30' }, 'cp');
  expect(ls.dilution).not.toBeNull();
  expect(ls.dilution.solutionGrams).toBeGreaterThan(ls.dilution.anhydrousGrams);
  expect(cp.dilution).toBeNull();

  let empty: any;
  function Probe() {
    empty = useRecipeViewModel({
      recipeName: 'Empty', lines: [], settings: { ...DEFAULT_SETTINGS, soapConcentrationPercent: '30' },
      additives: createEmptyAdditives(), drafts: {}, weightUnit: 'g', process: 'ls',
    });
    return null;
  }
  render(<Probe />);
  expect(empty.dilution).toBeNull();
});

test('LS lye excess computes neutralization and disables PCSF-subtract', () => {
  let withSubtract: any;
  let withAppend: any;
  const ls = {
    superfatPercent: '-2',
    lyeType: 'koh' as const,
    waterMode: 'lye_water_ratio' as const,
    lyeWaterRatio: '2',
    postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '5' }],
  };
  probe((vm) => { withSubtract = vm; }, { ...ls, postCookSuperfatMethod: 'subtract' }, 'ls');
  probe((vm) => { withAppend = vm; }, { ...ls, postCookSuperfatMethod: 'append' }, 'ls');

  expect(withSubtract.neutralization).not.toBeNull();
  expect(withSubtract.neutralization.citricAcidGrams).toBeGreaterThan(0);
  // Mutual exclusivity: subtract is ignored under a lye excess, so lye matches the append case.
  expect(withSubtract.result.lyeWeightGrams).toBeCloseTo(withAppend.result.lyeWeightGrams);

  // Regression (#1): the cookFactor guard makes "subtract" lye-inert under a lye excess, so
  // the PCSF oil is never actually reserved from the recipe — it's an extra either way, and
  // batchWeightWithExtras must agree between subtract and append instead of undercounting by
  // the PCSF grams (empirically: 1695.3 g vs 1745.3 g, off by exactly the 50 g PCSF reserve).
  let withoutPcsf: any;
  probe((vm) => { withoutPcsf = vm; }, { ...ls, postCookSuperfatOils: [], postCookSuperfatMethod: 'subtract' }, 'ls');

  expect(withSubtract.postCookSuperfat.grams).toBeGreaterThan(0);
  expect(withSubtract.batchWeightWithExtras).toBeCloseTo(withAppend.batchWeightWithExtras);
  expect(withSubtract.batchWeightWithExtras).toBeGreaterThan(
    withoutPcsf.batchWeightWithExtras,
  );
  expect(withAppend.batchWeightWithExtras).toBeGreaterThan(
    withoutPcsf.batchWeightWithExtras,
  );
});

test('neutralization is null for a normal LS recipe (superfat >= 0)', () => {
  let vm: any;
  probe((v) => { vm = v; }, { superfatPercent: '2', lyeType: 'koh', waterMode: 'lye_water_ratio', lyeWaterRatio: '2' }, 'ls');
  expect(vm.neutralization).toBeNull();
});

test('batch sheet carries the neutralization step for a lye-excess LS recipe', () => {
  let vm: any;
  probe((v) => { vm = v; }, { superfatPercent: '-2', lyeType: 'koh', waterMode: 'lye_water_ratio', lyeWaterRatio: '2' }, 'ls');
  expect(vm.batchSheetData).not.toBeNull();
  expect(vm.batchSheetData.neutralization).toEqual(vm.neutralization);
  expect(vm.batchSheetData.neutralization).not.toBeNull();
});

test('label weight loses water only from the water-bearing base batch, not after-cook extras (#6)', () => {
  // HP append-mode PCSF adds real after-cook extra grams (shea butter added post-cook,
  // never evaporates) on top of the water-bearing base batter.
  let withPcsf: any;
  probe(
    (vm) => { withPcsf = vm; },
    {
      processVariant: 'hp-lthp',
      postCookSuperfatOils: [{ oilId: 'shea-butter', percent: '5' }],
      postCookSuperfatMethod: 'append',
    },
    'hp',
  );
  expect(withPcsf.extrasGrams).toBeGreaterThan(0);

  const profile = processProfileById('hp-lthp'); // hp's default variant
  const baseBatchGrams = withPcsf.batchWeightWithExtras - withPcsf.extrasGrams;
  const correctFormula = withPcsf.batchWeightWithExtras - baseBatchGrams * profile.waterLossPercent;
  // The old (wrong) formula applied the loss fraction to the whole batch, including the
  // non-evaporating PCSF extra — it always estimates a lower (over-lossy) label weight
  // whenever extras > 0.
  const oldWrongFormula = withPcsf.batchWeightWithExtras * (1 - profile.waterLossPercent);

  expect(withPcsf.labelWeight).toBeCloseTo(correctFormula);
  expect(withPcsf.labelWeight).toBeGreaterThan(oldWrongFormula);
});

test('LS superfat above 3% raises the ls_superfat_high insight', () => {
  let vm: any;
  probe((v) => { vm = v; }, { superfatPercent: '5', lyeType: 'koh', waterMode: 'lye_water_ratio', lyeWaterRatio: '2' }, 'ls');
  expect(vm.insights.some((i: any) => i.code === 'ls_superfat_high')).toBe(true);
});

test('hpVesselMultiple is undefined without a vessel volume, even for HP', () => {
  let vm: any;
  probe((v) => { vm = v; }, {}, 'hp', null);
  expect(vm.hpVesselMultiple).toBeUndefined();
  expect(vm.insights.some((i: any) => i.code === 'hp_vessel_too_small')).toBe(false);
});

test('hpVesselMultiple is undefined for CP even with a vessel volume supplied', () => {
  let vm: any;
  probe((v) => { vm = v; }, {}, 'cp', 500);
  expect(vm.hpVesselMultiple).toBeUndefined();
});

test('a too-small HP vessel raises hp_vessel_too_small; a roomy one does not', () => {
  let tooSmall: any;
  let roomy: any;
  probe((v) => { tooSmall = v; }, {}, 'hp', 1);
  probe((v) => { roomy = v; }, {}, 'hp', 1_000_000);

  expect(tooSmall.hpVesselMultiple).toBeGreaterThan(0);
  expect(tooSmall.insights.some((i: any) => i.code === 'hp_vessel_too_small')).toBe(true);
  expect(roomy.insights.some((i: any) => i.code === 'hp_vessel_too_small')).toBe(false);
});

const CITRIC_LINE: AdditiveLine = {
  key: 'citric-1', catalogId: 'citric-acid', name: 'Citric acid (anhydrous)',
  amount: '2', basis: 'oil', unit: 'percent', addAt: 'lye',
};

test('a citric additive raises the lye result but not the split-liquid acid figure', () => {
  let without: any;
  let withCitric: any;
  probe((vm) => { without = vm; });
  probe((vm) => { withCitric = vm; }, {}, 'cp', undefined, [CITRIC_LINE]);
  const oilGrams = withCitric.totalOilGrams;
  // DEFAULT_SETTINGS.naohPurityPercent is '99' (recipe.ts:122) — the compensation is
  // grossed up by purity like every other lye figure.
  const expectedExtra = (oilGrams * 0.02 * 0.6246) / 0.99;
  expect(withCitric.result.naohWeightGrams - without.result.naohWeightGrams).toBeCloseTo(expectedExtra, 1);
  // acidExtraLye is SplitLiquidPanel's display prop — additive acid must not leak into it.
  expect(withCitric.acidExtraLye).toBeNull();
  const line = withCitric.computedAdditives.find((a: any) => a.catalogId === 'citric-acid');
  expect(line.extraLye.naohGrams).toBeCloseTo(expectedExtra, 1);
});

test('vinegar split liquid and citric additive stack; the split acid figure stays vinegar-only', () => {
  // The two-memo design exists to prevent exactly this misattribution — pin it.
  const VINEGAR_ROW = {
    key: 'v1',
    presetKey: 'vinegar',
    name: 'Vinegar (5%)',
    customWaterPercent: '',
    sizeMode: 'grams' as const,
    amount: '100',
    addAt: 'lye' as const,
  };
  let vinegarOnly: any;
  let both: any;
  probe((vm) => { vinegarOnly = vm; }, { splitLiquids: [VINEGAR_ROW] });
  probe((vm) => { both = vm; }, { splitLiquids: [VINEGAR_ROW] }, 'cp', undefined, [CITRIC_LINE]);
  const vinegarExtra = (100 * 0.0333) / 0.99;
  const citricExtra = (both.totalOilGrams * 0.02 * 0.6246) / 0.99;
  // The split-liquid display figure is identical with and without the citric line.
  expect(both.acidExtraLye.naohGrams).toBeCloseTo(vinegarOnly.acidExtraLye.naohGrams, 3);
  expect(both.acidExtraLye.naohGrams).toBeCloseTo(vinegarExtra, 1);
  // The lye result carries BOTH compensations.
  expect(both.result.naohWeightGrams - vinegarOnly.result.naohWeightGrams).toBeCloseTo(citricExtra, 1);
});

test('LS citric: the lye-stage chelator route compensates; the after-cook neutralization route never does', () => {
  // The stage decides, not the process: lye-stage citric consumes alkali the calc must
  // replace (potassium citrate chelator route); after-cook citric neutralizes a finished
  // batch's lye excess and compensating it would add that lye straight back.
  let without: any;
  let lyeStage: any;
  let afterCook: any;
  probe((vm) => { without = vm; }, { lyeType: 'koh' }, 'ls');
  probe((vm) => { lyeStage = vm; }, { lyeType: 'koh' }, 'ls', undefined, [CITRIC_LINE]);
  probe((vm) => { afterCook = vm; }, { lyeType: 'koh' }, 'ls', undefined, [{ ...CITRIC_LINE, addAt: 'after_cook' as const }]);
  // Lye-stage: compensation lands in the KOH figure.
  const line = lyeStage.computedAdditives.find((a: any) => a.catalogId === 'citric-acid');
  expect(line.extraLye.kohGrams).toBeGreaterThan(0);
  expect(line.extraLye.naohGrams).toBe(0);
  expect(lyeStage.result.kohWeightGrams).toBeCloseTo(
    without.result.kohWeightGrams + line.extraLye.kohGrams, 3);
  // After-cook: inert — the #128 protection, now stage-scoped.
  const acLine = afterCook.computedAdditives.find((a: any) => a.catalogId === 'citric-acid');
  expect(acLine.grams).toBeGreaterThan(0);
  expect(acLine.extraLye).toBeUndefined();
  expect(afterCook.result.kohWeightGrams).toBeCloseTo(without.result.kohWeightGrams, 6);
});

test('two citric lines each carry their share and the lye result sums both (per-line pin)', () => {
  // Pins that the result-level compensation is the sum of the lines' own extraLye figures —
  // one computation, panel and lye result provably agree.
  let vm: any;
  probe((v) => { vm = v; }, {}, 'cp', undefined, [
    CITRIC_LINE,
    { ...CITRIC_LINE, key: 'citric-2', amount: '1' },
  ]);
  let without: any;
  probe((v) => { without = v; });
  const oilGrams = vm.totalOilGrams;
  const expectedTotal = (oilGrams * 0.03 * 0.6246) / 0.99;
  expect(vm.result.naohWeightGrams - without.result.naohWeightGrams).toBeCloseTo(expectedTotal, 1);
  const lineSum = vm.computedAdditives.reduce((s: number, a: any) => s + (a.extraLye?.naohGrams ?? 0), 0);
  expect(lineSum).toBeCloseTo(expectedTotal, 1);
});

test('the printed batch sheet carries the acid-adjusted lye, not the base result', () => {
  // The sheet is what someone weighs from at the bench, so it must never disagree with the
  // on-screen lye figure. buildBatchSheetData is a pass-through, so batchSheetData.result IS
  // whatever the memo fed it — pin that it is the compensated result.
  let vm: any;
  let without: any;
  probe((v) => { vm = v; }, {}, 'cp', undefined, [CITRIC_LINE]);
  probe((v) => { without = v; });
  expect(vm.batchSheetData).not.toBeNull();
  expect(vm.batchSheetData.result.naohWeightGrams).toBe(vm.result.naohWeightGrams);
  // …and that this is strictly more than the uncompensated figure, so the assertion above
  // cannot be satisfied by both paths collapsing to the same number.
  expect(vm.batchSheetData.result.naohWeightGrams).toBeGreaterThan(without.result.naohWeightGrams);
});

test('batch-basis citric resolves against the pre-compensation batch weight (one-pass pin)', () => {
  let vm: any;
  probe((v) => { vm = v; }, {}, 'cp', undefined, [{ ...CITRIC_LINE, basis: 'batch' }]);
  const line = vm.computedAdditives.find((a: any) => a.catalogId === 'citric-acid');
  // The dose basis must be the batch weight BEFORE addExtraLye (which added exactly
  // line.extraLye.naohGrams to totalBatchWeightGrams; kohGrams is 0 under NaOH). If a
  // refactor ever feeds the compensated result back into dose resolution, grams inflate
  // and this fails.
  expect(line.grams).toBeCloseTo(0.02 * (vm.result.totalBatchWeightGrams - line.extraLye.naohGrams), 1);
});

test('an LS glycerin split row (2 of 3 parts) passes the lye floor and yields the dilution advisory', () => {
  const GLYCERIN_ROW = {
    key: 'g1', presetKey: 'glycerin', name: 'Glycerin', customWaterPercent: '',
    sizeMode: 'percent_of_liquid' as const, amount: '66.7', addAt: 'lye' as const,
  };
  let vm: any;
  probe((v) => { vm = v; }, { lyeType: 'koh', waterMode: 'lye_water_ratio', lyeWaterRatio: '3', splitLiquids: [GLYCERIN_ROW] }, 'ls');
  // Water dropped to ~1 part per part of lye…
  expect(vm.result.waterWeightGrams).toBeCloseTo(vm.result.lyeWeightGrams * 3 * (1 - 0.667), 0);
  // …the glycerin grams resolved post-calc against targetRatio × lye…
  const row = vm.splitLiquidRows.find((r: any) => r.row.presetKey === 'glycerin');
  expect(row.grams).toBeCloseTo(vm.result.lyeWeightGrams * 3 * 0.667, 0);
  // …the floor counts the solvent grams (glycerin dissolves lye hot), so no shortfall…
  expect(vm.lyeWaterStatus?.shortfallGrams ?? 0).toBe(0);
  // …and the advisory insight is present.
  expect(vm.insights.some((i: any) => i.code === 'glycerin_solvent_dilution')).toBe(true);
});

test('soaping temp: CP at 165 °F raises the overflow warning; the default 125 does not', () => {
    let hot: any;
    let normal: any;
    probe((v) => { hot = v; }, { soapingTempF: '165' });
    probe((v) => { normal = v; });
  expect(hot.insights.some((i: any) => i.code === 'soaping_temp_high')).toBe(true);
  expect(normal.insights.some((i: any) => i.code === 'soaping_temp_high')).toBe(false);
});

test('soaping temp: HP at its cook temperature never warns', () => {
    let vm: any;
    probe((v) => { vm = v; }, { processVariant: 'hp-hthp', soapingTempF: '215' }, 'hp');
  expect(vm.insights.some((i: any) => i.code === 'soaping_temp_high')).toBe(false);
});

test('soaping temp: exposes the effective figure and carries it onto the batch sheet', () => {
    let vm: any;
    probe((v) => { vm = v; }, { soapingTempF: '150' });
  expect(vm.soapingTempF).toBe(150);
  expect(vm.batchSheetData.soapingTempF).toBe(150);
});

test('soaping temp: clamps a stale value into the variant range for everything downstream', () => {
    let vm: any;
    // 140 (an LTHP figure) viewed under HTHP: effective 205, no CP warning machinery.
    probe((v) => { vm = v; }, { processVariant: 'hp-hthp', soapingTempF: '140' }, 'hp');
  expect(vm.soapingTempF).toBe(205);
});

test("LS dilution counts the alternative liquid's water as water already in the paste", () => {
  // 200 g of canned coconut milk at trace is 136 g of water (68%) plus 42 g of fat. Every
  // split-liquid stage is pre-cook, so that water is in the pot before dilution starts —
  // prescribing the full water-only dilution figure on top of it would land the finished
  // soap below its target concentration.
  const MILK_ROW = {
    key: 'm1', presetKey: 'coconut-milk-canned', name: 'Coconut milk (canned)',
    customWaterPercent: '', sizeMode: 'grams' as const, amount: '200', addAt: 'trace' as const,
  };
  let plain: any;
  let withMilk: any;
  probe((vm) => { plain = vm; }, { lyeType: 'koh', soapConcentrationPercent: '30' }, 'ls');
  probe(
    (vm) => { withMilk = vm; },
    { lyeType: 'koh', soapConcentrationPercent: '30', splitLiquids: [MILK_ROW] },
    'ls',
  );

  // The target solution is unchanged (the milk is not soap solids)…
  expect(withMilk.dilution.solutionGrams).toBeCloseTo(plain.dilution.solutionGrams, 3);
  // …so the prescribed dilution water drops by exactly the milk's own water.
  expect(plain.dilution.dilutionWaterGrams - withMilk.dilution.dilutionWaterGrams).toBeCloseTo(
    200 * 0.68,
    3,
  );
});

test('LS split liquid raises the fat/superfat warning and the dilute-with-plain-water advisory', () => {
  const MILK_ROW = {
    key: 'm1', presetKey: 'coconut-milk-canned', name: 'Coconut milk (canned)',
    customWaterPercent: '', sizeMode: 'grams' as const, amount: '200', addAt: 'trace' as const,
  };
  let ls: any;
  let cp: any;
  probe((vm) => { ls = vm; }, { lyeType: 'koh', superfatPercent: '2', splitLiquids: [MILK_ROW] }, 'ls');
  probe((vm) => { cp = vm; }, { superfatPercent: '2', splitLiquids: [MILK_ROW] }, 'cp');

  const codes = (vm: any) => vm.insights.map((i: any) => i.code);
  expect(codes(ls)).toContain('ls_split_liquid_fat_superfat');
  expect(codes(ls)).toContain('ls_split_liquid_not_dilution');
  // A bar carries the same 42 g of milk fat without complaint.
  expect(codes(cp)).not.toContain('ls_split_liquid_fat_superfat');
  expect(codes(cp)).not.toContain('ls_split_liquid_not_dilution');
});

test('a vinegar row is inert under LS: offered in CP/HP, no compensation in LS', () => {
  // Scoping the offer must scope the BEHAVIOUR too. #138 filtered the picker, which left a
  // CP-saved recipe switched to LS still resolving vinegar and still adding compensating
  // KOH for a liquid the app no longer offers there.
  const VINEGAR = {
    key: 'v1', presetKey: 'vinegar', name: 'Vinegar (5%)', customWaterPercent: '',
    sizeMode: 'grams' as const, amount: '200', addAt: 'lye' as const,
  };
  let cp: any;
  let ls: any;
  probe((vm) => { cp = vm; }, { splitLiquids: [VINEGAR] }, 'cp');
  probe((vm) => { ls = vm; }, { lyeType: 'koh', splitLiquids: [VINEGAR] }, 'ls');

  expect(cp.acidExtraLye.naohGrams).toBeGreaterThan(0);
  expect(ls.acidExtraLye).toBeNull();

  // The batch back-solve reads the same guard, or the batch weight and the lye result
  // would quote different amounts of alkali for the same recipe.
  expect(ls.fixedBatchExtrasGrams).toBeCloseTo(200, 3);
  expect(cp.fixedBatchExtrasGrams).toBeGreaterThan(200);

  // The liquid itself is NOT dropped — its water still counts toward the paste.
  expect(ls.splitLiquidRows[0].grams).toBeCloseTo(200, 3);
});

test('a rest row goes inert under lye-concentration water instead of inflating total liquid', () => {
  // Budget sizing carves a liquid OUT of a total-liquid figure. lye_concentration sets the
  // lye solution's strength and implies no total, so the row used to size against a
  // fallback (the recipe's full water) and stack on top of it — measured at +50.8% total
  // liquid on a 1,000 g CP recipe.
  const REST = {
    key: 'r1', presetKey: '', name: 'goat milk', customWaterPercent: '',
    sizeMode: 'rest' as const, amount: '', addAt: 'trace' as const,
  };
  let budgeted: any;
  let noBudget: any;
  probe((vm) => { budgeted = vm; }, { waterMode: 'percent_of_oils', waterPercentOfOils: '33', splitLiquids: [REST] }, 'cp');
  probe((vm) => { noBudget = vm; }, { waterMode: 'lye_concentration', lyeConcentrationPercent: '33', splitLiquids: [REST] }, 'cp');

  // With a real budget the row carves out the remainder above the 1:1 lye floor…
  expect(budgeted.splitLiquidGrams).toBeGreaterThan(0);
  // …with no budget it is inert, and total liquid is just the lye water.
  expect(noBudget.splitLiquidGrams).toBeNull();
  expect(noBudget.splitLiquidRows[0].grams).toBeNull();
});

test('unsized split-liquid rows get no vote in the advisories', () => {
  // A freshly added row is unsized by default, so counting it meant clicking "+ Add liquid"
  // changed the advice with no ingredient behind it.
  const GLYCERIN = {
    key: 'g1', presetKey: 'glycerin', name: 'Glycerin', customWaterPercent: '',
    sizeMode: 'grams' as const, amount: '200', addAt: 'lye' as const,
  };
  const BLANK = { ...GLYCERIN, key: 'b1', presetKey: '', name: '', amount: '' };
  const codes = (vm: any) => vm.insights.map((i: any) => i.code);

  let blankOnly: any;
  let glycerinPlusBlank: any;
  probe((vm) => { blankOnly = vm; }, { lyeType: 'koh', splitLiquids: [{ ...BLANK, presetKey: 'glycerin', name: 'Glycerin' }] }, 'ls');
  probe((vm) => { glycerinPlusBlank = vm; }, { lyeType: 'koh', splitLiquids: [GLYCERIN, BLANK] }, 'ls');

  // An unsized glycerin row is not a solvent in the batch.
  expect(codes(blankOnly)).not.toContain('glycerin_solvent_dilution');
  // A sized glycerin row keeps the solvent-only exemption even beside an unsized placeholder.
  expect(codes(glycerinPlusBlank)).toContain('glycerin_solvent_dilution');
  expect(codes(glycerinPlusBlank)).not.toContain('ls_split_liquid_not_dilution');
});

test('an undeclared in-lye liquid makes the dissolution floor unverifiable, not a pass', () => {
  // Assuming an unknown liquid is pure water let the 1:1 check pass a solution that was
  // genuinely short. It is not assumed dry either — tea, beer and milk would false-alarm.
  const CUSTOM_IN_LYE = {
    key: 'c1', presetKey: '', name: 'mystery brew', customWaterPercent: '',
    sizeMode: 'grams' as const, amount: '150', addAt: 'lye' as const,
  };
  let vm: any;
  let declared: any;
  probe((v) => { vm = v; }, { lyeType: 'koh', splitLiquids: [CUSTOM_IN_LYE] }, 'ls');
  probe((v) => { declared = v; }, { lyeType: 'koh', splitLiquids: [{ ...CUSTOM_IN_LYE, customWaterPercent: '90' }] }, 'ls');

  expect(vm.lyeWaterUnverifiable).toBe(true);
  expect(vm.unknownLiquidGrams).toBeCloseTo(150, 3);
  // Declaring the water content restores a real check and clears the unknown.
  expect(declared.lyeWaterUnverifiable).toBe(false);
  expect(declared.unknownLiquidGrams).toBe(0);
});
