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
