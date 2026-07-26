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
