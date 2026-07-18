// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useRecipeViewModel } from './useRecipeViewModel';
import {
  createStarterLines,
  DEFAULT_SETTINGS,
  createEmptyAdditives,
  type RecipeSettings,
} from '../lib/recipe';
import type { ProcessId } from '../lib/process';
import { processProfileById } from '../lib/processProfile';

afterEach(cleanup);

function probe(
  onVm: (vm: unknown) => void,
  settingsOverride: Partial<RecipeSettings> = {},
  process: ProcessId = 'cp',
) {
  function Probe() {
    const vm = useRecipeViewModel({
      recipeName: 'Test',
      lines: createStarterLines(),
      settings: { ...DEFAULT_SETTINGS, ...settingsOverride },
      additives: createEmptyAdditives(),
      drafts: {},
      weightUnit: 'g',
      process,
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
  probe(
    (vm) => { withPcsf = vm; },
    { postCookSuperfatPercent: '5', postCookSuperfatOilId: 'shea-butter' },
    'hp',
  );

  expect(withoutPcsf.postCookSuperfat).toBeNull();
  expect(withPcsf.postCookSuperfat).toEqual({
    oilId: 'shea-butter',
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
    { postCookSuperfatPercent: '5', postCookSuperfatOilId: 'shea-butter' },
    'cp',
  );
  probe((vm) => { cleanCp = vm; }, {}, 'cp');

  expect(strayCp.postCookSuperfat).toBeNull();
  expect(strayCp.batchWeightWithExtras).toBeCloseTo(cleanCp.batchWeightWithExtras);
});

test('subtract reduces the lye by (1 − PCSF%) while oil weight stays on the full recipe', () => {
  let append: any;
  let subtract: any;
  probe((vm) => { append = vm; }, { postCookSuperfatPercent: '10', postCookSuperfatMethod: 'append' }, 'hp');
  probe((vm) => { subtract = vm; }, { postCookSuperfatPercent: '10', postCookSuperfatMethod: 'subtract' }, 'hp');

  expect(subtract.result.lyeWeightGrams).toBeCloseTo(append.result.lyeWeightGrams * 0.9);
  expect(subtract.result.waterWeightGrams).toBeCloseTo(append.result.waterWeightGrams * 0.9);
  expect(subtract.totalOilGrams).toBeCloseTo(append.totalOilGrams); // oil unchanged
  // append folds PCSF into batch (extra oil); subtract reserves it (not added)
  expect(subtract.batchWeightWithExtras).toBeLessThan(append.batchWeightWithExtras);
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
    postCookSuperfatPercent: '5',
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
  probe((vm) => { withoutPcsf = vm; }, { ...ls, postCookSuperfatPercent: '', postCookSuperfatMethod: 'subtract' }, 'ls');

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
      postCookSuperfatPercent: '5',
      postCookSuperfatOilId: 'shea-butter',
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
