import { describe, expect, it } from 'vitest';
import { budgetSizingAvailable, resolveSplitLiquidRows, splitLiquidCalcOverride } from './splitLiquidSizing';
import type { SplitLiquidRow } from './recipe';
import { DEFAULT_SETTINGS } from './recipe';

let n = 0;
const ROW = (over: Partial<SplitLiquidRow>): SplitLiquidRow => ({
  key: `row-${n++}`,
  presetKey: '',
  name: 'liquid',
  customWaterPercent: '',
  sizeMode: 'percent_of_oils',
  amount: '20',
  addAt: 'trace',
  ...over,
});

const CTX = { totalOilGrams: 1000, targetLiquidGrams: 330, lyeGrams: 138, budgetSizingAvailable: true };

describe('resolveSplitLiquidRows', () => {
  it('resolves each sizing mode and totals the rows', () => {
    const rows = [
      ROW({ sizeMode: 'percent_of_oils', amount: '20' }), // 200
      ROW({ sizeMode: 'grams', amount: '50' }), // 50
      ROW({ sizeMode: 'percent_of_liquid', amount: '25' }), // 82.5
    ];
    const resolved = resolveSplitLiquidRows(rows, CTX);
    expect(resolved.rows.map((r) => r.grams)).toEqual([200, 50, 82.5]);
    expect(resolved.totalGrams).toBeCloseTo(332.5, 3);
  });

  it('gives the rest row the budget remainder after other budget rows', () => {
    const rows = [
      ROW({ sizeMode: 'percent_of_liquid', amount: '25' }), // 82.5 from the budget
      ROW({ sizeMode: 'rest', amount: '' }), // 330 − 138 − 82.5 = 109.5
      ROW({ sizeMode: 'grams', amount: '40' }), // additive, not from the budget
    ];
    const resolved = resolveSplitLiquidRows(rows, CTX);
    expect(resolved.rows[1].grams).toBeCloseTo(109.5, 3);
  });

  it('rest never goes negative when the budget is exhausted', () => {
    const rows = [
      ROW({ sizeMode: 'percent_of_liquid', amount: '90' }), // 297
      ROW({ sizeMode: 'rest', amount: '' }),
    ];
    const resolved = resolveSplitLiquidRows(rows, CTX);
    expect(resolved.rows[1].grams).toBe(0);
  });

  it('resolves blank/invalid amounts to null grams and excludes them from the total', () => {
    const rows = [ROW({ sizeMode: 'grams', amount: '' }), ROW({ sizeMode: 'grams', amount: '50' })];
    const resolved = resolveSplitLiquidRows(rows, CTX);
    expect(resolved.rows[0].grams).toBeNull();
    expect(resolved.totalGrams).toBe(50);
  });
});

describe('splitLiquidCalcOverride', () => {
  const settingsWith = (rows: SplitLiquidRow[]) => ({
    ...DEFAULT_SETTINGS,
    waterPercentOfOils: '33',
    splitLiquids: rows,
  });

  it('pins lye water at 1:1 when any rest row exists', () => {
    const o = splitLiquidCalcOverride(settingsWith([ROW({ sizeMode: 'rest', amount: '' })]), 1000);
    expect(o!.settingsForCalc.waterMode).toBe('lye_water_ratio');
    expect(o!.settingsForCalc.lyeWaterRatio).toBe('1');
    expect(o!.targetLiquidGrams).toBe(330);
  });

  it('reduces the water by the sum of percent_of_liquid rows', () => {
    const o = splitLiquidCalcOverride(
      settingsWith([
        ROW({ sizeMode: 'percent_of_liquid', amount: '25' }), // 82.5
        ROW({ sizeMode: 'percent_of_liquid', amount: '25' }), // 82.5
        ROW({ sizeMode: 'grams', amount: '40' }), // additive — not allocated
      ]),
      1000,
    );
    // 330 − 165 = 165 → 16.5% of oils
    expect(Number(o!.settingsForCalc.waterPercentOfOils)).toBeCloseTo(16.5, 1);
  });

  it('returns null with only additive rows or under explicit-strength water modes', () => {
    expect(splitLiquidCalcOverride(settingsWith([ROW({})]), 1000)).toBeNull();
    expect(
      splitLiquidCalcOverride(
        { ...settingsWith([ROW({ sizeMode: 'rest', amount: '' })]), waterMode: 'lye_concentration' },
        1000,
      ),
    ).toBeNull();
    expect(splitLiquidCalcOverride(settingsWith([]), 1000)).toBeNull();
  });
});

describe('lye_water_ratio budget allocation (LS audit 2026-07-27)', () => {
  const ratioSettings = (rows: SplitLiquidRow[]) =>
    ({ ...DEFAULT_SETTINGS, waterMode: 'lye_water_ratio' as const, lyeWaterRatio: '3', splitLiquids: rows });

  it('a 66.7% glycerin share reduces the effective ratio to 3×(1−0.667)≈1 and reports targetRatio 3', () => {
    const rows = [ROW({ presetKey: 'glycerin', name: 'Glycerin', sizeMode: 'percent_of_liquid', amount: '66.7', addAt: 'lye' })];
    const o = splitLiquidCalcOverride(ratioSettings(rows), 1000);
    expect(o).not.toBeNull();
    expect(Number(o!.settingsForCalc.lyeWaterRatio)).toBeCloseTo(3 * (1 - 0.667), 3);
    expect(o!.targetRatio).toBe(3);
    expect(o!.targetLiquidGrams).toBeNull();
  });

  it('a rest row under ratio mode pins the water at the 1:1 floor', () => {
    const rows = [ROW({ sizeMode: 'rest', amount: '', addAt: 'trace' })];
    const o = splitLiquidCalcOverride(ratioSettings(rows), 1000);
    expect(o!.settingsForCalc.waterMode).toBe('lye_water_ratio');
    expect(o!.settingsForCalc.lyeWaterRatio).toBe('1');
    expect(o!.targetRatio).toBe(3);
  });

  it('percent_of_oils behavior is unchanged (regression)', () => {
    const rows = [ROW({ presetKey: 'milk', name: 'Milk', sizeMode: 'percent_of_liquid', amount: '50', addAt: 'lye' })];
    const o = splitLiquidCalcOverride(
      { ...DEFAULT_SETTINGS, waterMode: 'percent_of_oils' as const, waterPercentOfOils: '38', splitLiquids: rows },
      1000,
    );
    expect(o!.targetLiquidGrams).toBe(380);
    expect(o!.targetRatio).toBeUndefined();
  });
});

describe('budget sizing with no budget', () => {
  it('resolves rest and % of total liquid to null when the water mode has no total', () => {
    // lye_concentration fixes the SOLUTION strength; there is no total-liquid figure to
    // carve out of, so a budget row must go inert rather than size against a stand-in.
    const noBudget = { ...CTX, targetLiquidGrams: null, budgetSizingAvailable: false };
    const rows = [
      ROW({ sizeMode: 'rest', amount: '' }),
      ROW({ sizeMode: 'percent_of_liquid', amount: '25' }),
    ];
    const resolved = resolveSplitLiquidRows(rows, noBudget);
    expect(resolved.rows.map((r) => r.grams)).toEqual([null, null]);
    expect(resolved.totalGrams).toBe(0);
  });

  it('leaves additive rows untouched without a budget — they never read the target', () => {
    const noBudget = { ...CTX, targetLiquidGrams: null, budgetSizingAvailable: false };
    const rows = [
      ROW({ sizeMode: 'percent_of_oils', amount: '20' }),
      ROW({ sizeMode: 'grams', amount: '50' }),
    ];
    expect(resolveSplitLiquidRows(rows, noBudget).rows.map((r) => r.grams)).toEqual([200, 50]);
  });

  it('budgetSizingAvailable answers for each water mode', () => {
    expect(budgetSizingAvailable('percent_of_oils')).toBe(true);
    expect(budgetSizingAvailable('lye_water_ratio')).toBe(true);
    expect(budgetSizingAvailable('lye_concentration')).toBe(false);
  });
});

describe('a blank water field means the default, not "no budget"', () => {
  const restRow = [ROW({ sizeMode: 'rest', amount: '' })];

  it('blank % of oils gives the same override as the default 33', () => {
    const base = { ...DEFAULT_SETTINGS, waterMode: 'percent_of_oils' as const, splitLiquids: restRow };
    const blank = splitLiquidCalcOverride({ ...base, waterPercentOfOils: '' }, 1000);
    const explicit = splitLiquidCalcOverride({ ...base, waterPercentOfOils: '33' }, 1000);
    expect(blank).not.toBeNull();
    expect(blank!.targetLiquidGrams).toBe(explicit!.targetLiquidGrams);
  });

  it('blank water:lye ratio gives the same override as the default 2', () => {
    const base = { ...DEFAULT_SETTINGS, waterMode: 'lye_water_ratio' as const, splitLiquids: restRow };
    const blank = splitLiquidCalcOverride({ ...base, lyeWaterRatio: '' }, 1000);
    const explicit = splitLiquidCalcOverride({ ...base, lyeWaterRatio: '2' }, 1000);
    expect(blank).not.toBeNull();
    expect(blank!.targetRatio).toBe(explicit!.targetRatio);
  });
});
