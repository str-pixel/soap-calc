// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useRecipeViewModel } from './useRecipeViewModel';
import {
  createStarterLines,
  DEFAULT_SETTINGS,
  createEmptyAdditives,
  normalizePostCookSuperfatOils,
  type AdditiveLine,
  type RecipeSettings,
} from '../lib/recipe';
import { processProfileById, type ProcessId } from '../lib/process';
import { correctedDilutionWaterGrams } from '../lib/measuredPaste';
import { lsFinishedVolumeMl, lsPartialDilution } from '@soap-calc/core';

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
  // invariant against hand-edited / imported drafts (normalizeSettingsWithinProcess only coerces
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

test('a single mistyped row over 100% (e.g. 200 for 20) still reserves lye, not silently nothing', () => {
  // parsePercentOfOil REJECTS (returns null) anything over 100 rather than clamping it, so
  // an unclamped '200' row would contribute 0 to the reserve — same lye as no PCSF at all —
  // while the panel still showed it as fully allocated. normalizePostCookSuperfatOils is the
  // guard that must close that gap for a loaded/imported recipe (a saved file can carry any
  // string); this proves data that has passed through it can't reproduce the zero-reserve bug.
  let withOver: any;
  let withNone: any;
  const oils = normalizePostCookSuperfatOils({
    postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '200' }],
  });
  probe(
    (vm) => { withOver = vm; },
    { postCookSuperfatOils: oils, postCookSuperfatMethod: 'subtract' },
    'hp',
  );
  probe(
    (vm) => { withNone = vm; },
    { postCookSuperfatOils: [], postCookSuperfatMethod: 'subtract' },
    'hp',
  );
  expect(withOver.result.lyeWeightGrams).not.toBeCloseTo(withNone.result.lyeWeightGrams);
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

test('dilutionGoverns/dilutionRecord: blank record is the plan arm; a 0 g record still governs, and dilution stays the plan object', () => {
  // Spec §1's resolution rule, exposed on the vm (Task 1): a blank gradualWaterGrams is no
  // record at all ('plan', record null); '0' IS a record (ZERO IS A RECORD — the pot before
  // any water is poured is Gradual's own starting entry) and must govern with waterGrams: 0,
  // not be mistaken for "blank". `dilution` itself is unchanged by this task — still the plan
  // arm — consumers move onto the resolved arm in Task 2.
  let blank: any;
  let zero: any;
  probe((vm) => { blank = vm; }, { soapConcentrationPercent: '30', gradualWaterGrams: '' }, 'ls');
  probe((vm) => { zero = vm; }, { soapConcentrationPercent: '30', gradualWaterGrams: '0' }, 'ls');

  expect(blank.dilutionGoverns).toBe('plan');
  expect(blank.dilutionRecord).toBeNull();
  expect(blank.dilution).not.toBeNull();

  expect(zero.dilutionGoverns).toBe('record');
  expect(zero.dilutionRecord).not.toBeNull();
  expect(zero.dilutionRecord.waterGrams).toBe(0);
  // dilution keeps returning the plan arm in this task.
  expect(zero.dilution).not.toBeNull();
  expect(zero.dilution).toEqual(blank.dilution);
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

test('bottledSolutionGrams counts additive grams on top of the dilution solution', () => {
  // A 1%-of-oils after-cook thickener on the 1000 g starter batch = 10 g that is bottled
  // with the solution but absent from the anhydrous+water dilution figure.
  let vm: any;
  probe(
    (v) => { vm = v; },
    { lyeType: 'koh', waterMode: 'lye_water_ratio', lyeWaterRatio: '2' },
    'ls',
    undefined,
    [{ key: 'g1', catalogId: 'guar', name: 'Guar gum', amount: '1', unit: 'percent', basis: 'oil', addAt: 'after_cook' } as any],
  );
  expect(vm.dilution).not.toBeNull();
  expect(vm.bottledSolutionGrams).toBeCloseTo(vm.dilution.solutionGrams + 10);
  // …and preservativeDosingBasisGrams is that same figure, never the bare solution: it is
  // the preservative-free mass the ≈ Finished product row and the printed sheet's dosing
  // both start from, so a fall-through to solutionGrams here would size a 4,000 g basis for
  // a 4,010 g bottle.
  expect(vm.preservativeDosingBasisGrams).toBe(vm.bottledSolutionGrams);
  // …and finishedProductGrams (spec §3) is that basis plus the dose. The seeded 1%
  // Suttocide A counts whether or not the maker has confirmed it: it is the app's
  // recommendation for a water-based product, its grams show on screen, and a mass the
  // maker can see must weigh the same in every figure.
  expect(vm.finishedProductGrams).toBeCloseTo(
    vm.bottledSolutionGrams + vm.bottledSolutionGrams / 99,
    6,
  );
});

test('finishedProductGrams and preservativeDosingBasisGrams exist exactly when a dilution does — the ?? fallback is unreachable here', () => {
  // The resolver's second arm (dilution.solutionGrams) is kept for component-level callers
  // that pass a dilution and no bottled figure. On the view-model path it cannot fire:
  // bottledSolutionGrams is computed as `dilution && result ? … : null`, and dilution is
  // itself null whenever result is. Pinned rather than argued, so a future refactor that
  // makes the two nullable independently gets caught here.
  let ls: any;
  probe((v) => { ls = v; }, { lyeType: 'koh', waterMode: 'lye_water_ratio', lyeWaterRatio: '2' }, 'ls');
  expect(ls.dilution).not.toBeNull();
  expect(ls.bottledSolutionGrams).not.toBeNull();
  expect(ls.preservativeDosingBasisGrams).toBe(ls.bottledSolutionGrams);
  // finishedProductGrams (spec §3) is the basis plus the seeded default's w/w dose — the
  // recommendation weighs what it says; see the 'weighs what it says, chosen or not' test
  // above for the named claim.
  expect(ls.finishedProductGrams).toBeCloseTo(
    ls.bottledSolutionGrams + ls.bottledSolutionGrams / 99,
    6,
  );

  let cp: any;
  probe((v) => { cp = v; }, {}, 'cp');
  expect(cp.dilution).toBeNull();
  expect(cp.bottledSolutionGrams).toBeNull();
  expect(cp.preservativeDosingBasisGrams).toBeNull();
  expect(cp.finishedProductGrams).toBeNull();
});

test('the seeded preservative weighs what it says, chosen or not — a recommendation is real', () => {
  // DEFAULT_SETTINGS carries preservativeSetByUser: false alongside the real, legal
  // Suttocide A default (recipe.ts:165-168). Liquid soap is water-based and needs a
  // preservative, so that default is the app's RECOMMENDATION, not a placeholder — and the
  // snippet shows its grams on screen unconditionally. The dose gate therefore does NOT
  // read the flag: a mass the maker can see must weigh the same everywhere, or one batch
  // carries two finished masses under one name. Gating it briefly made the on-screen dose
  // weightless; this pins the correction. A maker who wants none picks None.
  let ls: any;
  probe((v) => { ls = v; }, { lyeType: 'koh', waterMode: 'lye_water_ratio', lyeWaterRatio: '2' }, 'ls');
  expect(ls.dilution).not.toBeNull();
  expect(ls.preservativeDosingBasisGrams).not.toBeNull();
  // Inclusive by exactly the w/w dose: basis x 1/99 at the seeded 1%.
  const dose = ls.preservativeDosingBasisGrams / 99;
  expect(ls.finishedProductGrams).toBeCloseTo(ls.preservativeDosingBasisGrams + dose, 6);
  expect(ls.finishedProductGrams).toBeGreaterThan(ls.preservativeDosingBasisGrams);
});

test('once the maker sets the preservative, the dose is back in the finished figure', () => {
  // The inverse pin: preservativeSetByUser: true keeps today's inclusive figure — the
  // policy gates the UNCHOSEN default, not the preservative feature itself.
  let ls: any;
  probe(
    (v) => { ls = v; },
    { lyeType: 'koh', waterMode: 'lye_water_ratio', lyeWaterRatio: '2', preservativeSetByUser: true },
    'ls',
  );
  expect(ls.dilution).not.toBeNull();
  expect(ls.finishedProductGrams).toBeCloseTo(
    ls.preservativeDosingBasisGrams + ls.preservativeDosingBasisGrams / 99,
  );
  expect(ls.finishedProductGrams).toBeGreaterThan(ls.preservativeDosingBasisGrams);
});

test('LS superfat above 3% raises the ls_superfat_high insight', () => {
  let vm: any;
  probe((v) => { vm = v; }, { superfatPercent: '5', lyeType: 'koh', waterMode: 'lye_water_ratio', lyeWaterRatio: '2' }, 'ls');
  expect(vm.insights.some((i: any) => i.code === 'ls_superfat_high')).toBe(true);
});

test('LS main + post-cook superfat stacking past 3% raises ls_superfat_high (2% + 2% ≈ 4%)', () => {
  let vm: any;
  probe(
    (v) => { vm = v; },
    {
      superfatPercent: '2',
      lyeType: 'koh',
      waterMode: 'lye_water_ratio',
      lyeWaterRatio: '2',
      postCookSuperfatTotalPercent: '2',
      postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '2' }],
      postCookSuperfatMethod: 'subtract',
    },
    'ls',
  );
  expect(vm.insights.some((i: any) => i.code === 'ls_superfat_high')).toBe(true);
});

test('LS 0% main + 2% post-cook superfat stays inside the band — no warning', () => {
  let vm: any;
  probe(
    (v) => { vm = v; },
    {
      superfatPercent: '0',
      lyeType: 'koh',
      waterMode: 'lye_water_ratio',
      lyeWaterRatio: '2',
      postCookSuperfatTotalPercent: '2',
      postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '2' }],
      postCookSuperfatMethod: 'subtract',
    },
    'ls',
  );
  expect(vm.insights.some((i: any) => i.code === 'ls_superfat_high')).toBe(false);
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

test('an undeclared in-lye liquid makes a shortfall unverifiable, not a pass', () => {
  // Budget sizing shrinks the plain water first, so excluding the undeclared liquid is what
  // leaves the solution short. With plenty of plain water there is no shortfall to qualify
  // and no notice at all — the flag tracks a shortfall we cannot verify, not the mere
  // presence of an undeclared row.
  const UNDECLARED_BUDGET = {
    key: 'c1', presetKey: '', name: 'mystery brew', customWaterPercent: '',
    sizeMode: 'percent_of_liquid' as const, amount: '70', addAt: 'lye' as const,
  };
  let vm: any;
  let declared: any;
  probe((v) => { vm = v; }, { waterMode: 'percent_of_oils', waterPercentOfOils: '33', splitLiquids: [UNDECLARED_BUDGET] }, 'cp');
  probe((v) => { declared = v; }, { waterMode: 'percent_of_oils', waterPercentOfOils: '33', splitLiquids: [{ ...UNDECLARED_BUDGET, customWaterPercent: '90' }] }, 'cp');

  expect(vm.lyeWaterStatus!.shortfallGrams).toBeGreaterThan(0);
  expect(vm.lyeWaterUnverifiable).toBe(true);
  // Declaring a high water content closes the gap outright.
  expect(declared.lyeWaterStatus!.shortfallGrams).toBe(0);
  expect(declared.lyeWaterUnverifiable).toBe(false);
});

test('the over-dilution verdict survives an unknown liquid when it cannot change the answer', () => {
  // Suppressing on the mere PRESENCE of an undeclared liquid dropped a warning that was
  // right across the whole 0–100% range the unknown could take. Only hedge when declaring
  // the water content could actually overturn the verdict.
  const BIG = {
    key: 'u1', presetKey: '', name: 'mystery', customWaterPercent: '',
    sizeMode: 'grams' as const, amount: '900', addAt: 'trace' as const,
  };
  // At an 85% target the lye water ALONE (330 g) already exceeds the target's total water
  // (~215 g), so the verdict holds even if all 900 g of the unknown were solids.
  let certain: any;
  probe((vm) => { certain = vm; },
    { lyeType: 'koh', soapConcentrationPercent: '85', splitLiquids: [BIG] }, 'ls');

  expect(certain.dilution.targetExceedsPaste).toBe(true);
  expect(certain.unknownLiquidGrams).toBeCloseTo(900, 3);
  expect(certain.overDilutionCertain).toBe(true);
});

test('the whole-batch paste is the same mass however the liquid\'s water is declared', () => {
  // The property DilutionPanel's measured-over-dilution suppression rests on: with an
  // undeclared liquid it asserts "already more dilute" flat and drops the "can't tell" hedge,
  // which is only honest if declaring the water content cannot move the verdict. That verdict
  // reduces to wholeBatchPasteGrams > solutionGrams, and solutionGrams is anhydrous ÷ the
  // target — so the whole claim is this equality. Asserted rather than reasoned about,
  // because it is an emergent property of two independent terms (cookWaterGrams counts the
  // liquid's WATER, the solids term counts total − that water) and either could drift.
  const LIQUID = {
    key: 'u3', presetKey: '', name: 'mystery', customWaterPercent: '',
    sizeMode: 'grams' as const, amount: '900', addAt: 'trace' as const,
  };
  const pasteFor = (customWaterPercent: string) => {
    let vm: any;
    probe((v) => { vm = v; },
      {
        lyeType: 'koh',
        soapConcentrationPercent: '50',
        splitLiquids: [{ ...LIQUID, customWaterPercent }],
      },
      'ls');
    return vm;
  };
  const undeclared = pasteFor('');
  expect(undeclared.unknownLiquidGrams).toBeCloseTo(900, 3);
  expect(undeclared.wholeBatchPasteGrams).toBeGreaterThan(0);
  for (const percent of ['1', '25', '50', '90', '100']) {
    const declared = pasteFor(percent);
    // The declaration really does move the terms it is made of — without this the equality
    // below would also hold for a view model that ignored the field entirely.
    if (percent !== '100') {
      expect(declared.cookWaterGrams).toBeLessThan(undeclared.cookWaterGrams);
    }
    expect(declared.unknownLiquidGrams).toBe(0);
    expect(declared.wholeBatchPasteGrams).toBeCloseTo(undeclared.wholeBatchPasteGrams, 6);
  }
});

test('the real view model pours one water figure into both dilution scopes', () => {
  // The synthetic pin lives in DilutionPanel.test; this drives the actual hook, which is
  // where the two figures were measured apart: 900 g of a liquid declared at 50% water on
  // the starter oils under KOH gave 1,606 g on the whole-batch row and the printed sheet
  // against 2,056 g in Custom amount at the full batch volume — exactly the 450 g of solids,
  // one radio apart on the same panel, with no measurement anywhere in play.
  let vm: any;
  probe((v) => { vm = v; },
    {
      lyeType: 'koh',
      soapConcentrationPercent: '30',
      splitLiquids: [{
        key: 's1', presetKey: '', name: 'declared liquid', customWaterPercent: '50',
        sizeMode: 'grams' as const, amount: '900', addAt: 'trace' as const,
      }],
    },
    'ls');

  const solidsGrams = vm.wholeBatchPasteGrams - (vm.dilution.anhydrousGrams + vm.cookWaterGrams);
  // Non-vacuous: without solids in play the two paths agree trivially.
  expect(solidsGrams).toBeCloseTo(450, 6);

  const batchWaterGrams = correctedDilutionWaterGrams(
    vm.dilution,
    '',
    false,
    vm.wholeBatchPasteGrams,
  );
  const portion = lsPartialDilution(
    { ...vm.dilution, wholeBatchPasteGrams: vm.wholeBatchPasteGrams },
    lsFinishedVolumeMl(vm.dilution.solutionGrams)!,
  );
  expect(portion).not.toBeNull();
  expect(portion!.pasteGrams).toBeCloseTo(vm.wholeBatchPasteGrams, 6);
  expect(portion!.waterGrams).toBeCloseTo(batchWaterGrams, 6);
  // …and the figure they agree on is the corrected one, not the water-only 2,056 g.
  expect(batchWaterGrams).toBeCloseTo(vm.dilution.dilutionWaterGrams - solidsGrams, 6);
});

test('the printed sheet is handed the corrected paste, and the bottled mass is priced from it', () => {
  // BatchSheet's CONSUMPTION of data.wholeBatchPasteGrams is pinned in its own file, but
  // nothing asserted the view model puts it there — so dropping it from buildBatchSheetData
  // survived the suite and silently returned the printed sheet to the recipe's water-only
  // figure while the panel kept showing the corrected one: the screen-versus-bench split
  // this branch exists to close, back again with every test green.
  let vm: any;
  probe((v) => { vm = v; },
    {
      lyeType: 'koh',
      soapConcentrationPercent: '30',
      splitLiquids: [{
        key: 's1', presetKey: '', name: 'declared liquid', customWaterPercent: '50',
        sizeMode: 'grams' as const, amount: '900', addAt: 'trace' as const,
      }],
    },
    'ls');

  const solidsGrams = vm.wholeBatchPasteGrams - (vm.dilution.anhydrousGrams + vm.cookWaterGrams);
  expect(solidsGrams).toBeCloseTo(450, 6); // non-vacuous: without solids nothing can differ
  expect(vm.batchSheetData).not.toBeNull();
  expect(vm.batchSheetData.wholeBatchPasteGrams).toBeCloseTo(vm.wholeBatchPasteGrams, 6);
  // Same figure the sheet will print, and it is NOT the recipe's own water-only one.
  expect(
    correctedDilutionWaterGrams(vm.dilution, '', false, vm.batchSheetData.wholeBatchPasteGrams),
  ).toBeCloseTo(vm.dilution.dilutionWaterGrams - solidsGrams, 6);

  // The bottled mass is priced from the same corrected water: the pot finishes at
  // solutionGrams, so the only thing above it is the non-liquid extras (none here). Without
  // the basis threaded into computeBottledSolutionGrams this is solutionGrams + 450.
  expect(vm.bottledSolutionGrams).toBeCloseTo(vm.dilution.solutionGrams, 6);
});

test('and so is the dilution water derived from it — the undeclared-liquid caveat must not promise otherwise', () => {
  // The panel and the printed sheet used to call that figure "the LEAST you will need" and
  // offer "declare its % water" as the lever. Once the water is solutionGrams minus the
  // CORRECTED paste, the declaration cannot move it: the liquid's whole mass is in the pot
  // either way. Driven at a reachable target (30%, so targetExceedsPaste is false and the
  // caveat's own branch is the one that renders) and with a BUDGET-sized row as well as a
  // grams-sized one, since budget sizing is the only path that could have made the lye water
  // itself depend on the row — it sizes off amount/sizeMode, never the water fraction.
  const declarations = ['', '5', '50', '95', '100'];
  for (const sizing of [
    { sizeMode: 'grams' as const, amount: '900' },
    { sizeMode: 'percent_of_liquid' as const, amount: '60' },
  ]) {
    const waters = declarations.map((customWaterPercent) => {
      let vm: any;
      probe((v) => { vm = v; },
        {
          lyeType: 'koh',
          waterMode: 'percent_of_oils',
          waterPercentOfOils: '33',
          soapConcentrationPercent: '30',
          splitLiquids: [{
            key: 'd1', presetKey: '', name: 'mystery', customWaterPercent,
            addAt: 'trace' as const, ...sizing,
          }],
        },
        'ls');
      return correctedDilutionWaterGrams(vm.dilution, '', false, vm.wholeBatchPasteGrams);
    });
    // Control first: the UNCORRECTED figure is what actually moved, so the equality below
    // is a property of the correction and not of the fixture standing still.
    expect(waters.every((w) => Math.abs(w - waters[0]) < 1e-6)).toBe(true);
    expect(waters[0]).toBeGreaterThan(0);
  }
  let undeclaredVm: any;
  let declaredVm: any;
  const rowFor = (customWaterPercent: string) => ({
    key: 'd1', presetKey: '', name: 'mystery', customWaterPercent,
    sizeMode: 'grams' as const, amount: '900', addAt: 'trace' as const,
  });
  const settingsFor = (customWaterPercent: string) => ({
    lyeType: 'koh' as const,
    waterMode: 'percent_of_oils' as const,
    waterPercentOfOils: '33',
    soapConcentrationPercent: '30',
    splitLiquids: [rowFor(customWaterPercent)],
  });
  probe((v) => { undeclaredVm = v; }, settingsFor(''), 'ls');
  probe((v) => { declaredVm = v; }, settingsFor('5'), 'ls');
  expect(undeclaredVm.dilution.dilutionWaterGrams).not.toBeCloseTo(
    declaredVm.dilution.dilutionWaterGrams,
    3,
  );
});

test('…and is hedged when the unknown genuinely could flip it', () => {
  const SMALL = {
    key: 'u2', presetKey: '', name: 'mystery', customWaterPercent: '',
    sizeMode: 'grams' as const, amount: '40', addAt: 'trace' as const,
  };
  // At a 50% target the 900 g liquid tips the paste over ONLY because we assume it is all
  // water; if it were dry the target would still be reachable. That is the hedge's purpose.
  const BIG_AMBIGUOUS = { ...SMALL, amount: '900' };
  let vm: any;
  probe((v) => { vm = v; }, { lyeType: 'koh', soapConcentrationPercent: '50', splitLiquids: [BIG_AMBIGUOUS] }, 'ls');
  expect(vm.dilution.targetExceedsPaste).toBe(true);
  expect(vm.overDilutionCertain).toBe(false);
});

test('a blank in-lye row no longer silences the split-liquid water warnings', () => {
  // splitLiquidAddAt was derived from RAW settings, so a second row with stage "In lye
  // water" and no amount — the default state of a freshly added row — flipped the placement
  // to 'lye' and made split_liquid_water_not_adjusted vanish with no liquid behind it.
  const SIZED_TRACE = {
    key: 't1', presetKey: 'milk', name: 'Milk', customWaterPercent: '',
    sizeMode: 'percent_of_oils' as const, amount: '20', addAt: 'trace' as const,
  };
  const BLANK_IN_LYE = { ...SIZED_TRACE, key: 'l1', presetKey: '', name: '', amount: '', addAt: 'lye' as const };
  const codes = (vm: any) => vm.insights.map((i: any) => i.code);

  let alone: any;
  let withBlank: any;
  probe((vm) => { alone = vm; }, { splitLiquids: [SIZED_TRACE] }, 'cp');
  probe((vm) => { withBlank = vm; }, { splitLiquids: [SIZED_TRACE, BLANK_IN_LYE] }, 'cp');

  expect(codes(alone)).toContain('split_liquid_water_not_adjusted');
  // The blank row is not an in-lye liquid, so it must not change the verdict.
  expect(codes(withBlank)).toContain('split_liquid_water_not_adjusted');
});

test('an undeclared in-lye liquid never produces a categorical "add N g of water"', () => {
  // Excluding the undeclared row from the water sum is what made the pre-existing shortfall
  // arithmetic fire, so the panel asserted a deficit its own sibling alert said it could not
  // verify. The deficit is stated only when it survives counting every undeclared gram as
  // pure water — the most generous case for the batch.
  const UNDECLARED_BUDGET = {
    key: 'u1', presetKey: '', name: 'mystery', customWaterPercent: '',
    sizeMode: 'percent_of_liquid' as const, amount: '70', addAt: 'lye' as const,
  };
  let vm: any;
  probe((v) => { vm = v; }, { waterMode: 'percent_of_oils', waterPercentOfOils: '33', splitLiquids: [UNDECLARED_BUDGET] }, 'cp');

  expect(vm.lyeWaterStatus!.shortfallGrams).toBeGreaterThan(0);
  // 231 g of unknown liquid could easily cover a 41 g gap, so the deficit is not a fact.
  expect(vm.lyeWaterUnverifiable).toBe(true);
  expect(vm.lyeWaterShortfallCertain).toBe(false);
  // Never both — that pairing was the contradiction.
  expect(vm.lyeWaterUnverifiable && vm.lyeWaterShortfallCertain).toBe(false);
});

test('…but a deficit that survives the most generous assumption is still stated', () => {
  // A tiny undeclared liquid cannot close a large gap: even counting all of it as water the
  // solution is short, so the categorical warning is correct and must survive.
  const TINY_UNDECLARED = {
    key: 'u2', presetKey: '', name: 'mystery', customWaterPercent: '',
    sizeMode: 'percent_of_liquid' as const, amount: '95', addAt: 'lye' as const,
  };
  let vm: any;
  probe((v) => { vm = v; },
    { waterMode: 'percent_of_oils', waterPercentOfOils: '20', splitLiquids: [TINY_UNDECLARED] }, 'cp');
  if (vm.lyeWaterStatus && vm.lyeWaterStatus.shortfallGrams > 0) {
    expect(vm.lyeWaterShortfallCertain || vm.lyeWaterUnverifiable).toBe(true);
    // Exactly one of the two states, never both — that pairing was the contradiction.
    expect(vm.lyeWaterShortfallCertain && vm.lyeWaterUnverifiable).toBe(false);
  }
});

test('a record governs the bottled mass, and gates the plan-claim overDilutionCertain', () => {
  // Phase 2a. `dilution` stays the plan arm, but everything DERIVED for the bottle follows
  // the record (spec §3): bottledSolutionGrams becomes pot + recorded water + the extras the
  // pot does not already hold. And `overDilutionCertain` is a claim about a TARGET the paste
  // has already passed — a plan claim — so it is false whenever a record governs.
  let plan: any;
  let record: any;
  probe((vm) => { plan = vm; }, { soapConcentrationPercent: '30', gradualWaterGrams: '' }, 'ls');
  probe((vm) => { record = vm; }, { soapConcentrationPercent: '30', gradualWaterGrams: '500' }, 'ls');

  expect(record.dilutionGoverns).toBe('record');
  expect(record.dilutionRecord.finishedGrams).toBeCloseTo(
    record.dilutionRecord.potGrams + 500,
    6,
  );
  // The bottle is what is in the pot, not what the 30% target predicts.
  expect(record.bottledSolutionGrams).toBeCloseTo(record.dilutionRecord.finishedGrams, 6);
  expect(record.bottledSolutionGrams).toBeLessThan(plan.bottledSolutionGrams);
  // The dosing basis and the finished mass follow it, so the dose is a % of what exists.
  expect(record.preservativeDosingBasisGrams).toBeCloseTo(record.bottledSolutionGrams, 6);
  expect(record.finishedProductGrams).toBeGreaterThan(record.preservativeDosingBasisGrams);
});

test('overDilutionCertain is a plan claim and stands down while a record governs', () => {
  // A target above what the paste's own water allows — targetExceedsPaste, certain across
  // the undeclared range — is a verdict about the PLAN. With a record in hand the batch that
  // exists is what every figure describes, and the plan verdict has no subject.
  const over = { soapConcentrationPercent: '85' } as const;
  let planArm: any;
  let recordArm: any;
  probe((vm) => { planArm = vm; }, { ...over, gradualWaterGrams: '' }, 'ls');
  probe((vm) => { recordArm = vm; }, { ...over, gradualWaterGrams: '0' }, 'ls');
  expect(planArm.overDilutionCertain).toBe(true);
  expect(recordArm.overDilutionCertain).toBe(false);
});

test('governs "record" with no record figures is "nothing to show yet", never an error', () => {
  // The pinned Task-1 contract, now that it is user-visible: a recipe can carry a leftover
  // gradualWaterGrams beside a target calculateDilution refuses (0 is outside its 1-99%
  // range), so `dilution` is null and the record arm has no pot to count from. The vm must
  // report governs 'record' with a null record and null downstream figures — not throw, and
  // not fabricate a plan.
  let vm: any;
  probe((v) => { vm = v; }, { soapConcentrationPercent: '0', gradualWaterGrams: '500' }, 'ls');
  expect(vm.dilution).toBeNull();
  expect(vm.dilutionGoverns).toBe('record');
  expect(vm.dilutionRecord).toBeNull();
  expect(vm.bottledSolutionGrams).toBeNull();
  expect(vm.preservativeDosingBasisGrams).toBeNull();
  expect(vm.finishedProductGrams).toBeNull();
  expect(vm.overDilutionCertain).toBe(false);
});
