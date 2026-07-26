import { describe, expect, it } from 'vitest';
import { resolveSplitLiquidRows, splitLiquidCalcOverride } from './splitLiquidSizing';
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

const CTX = { totalOilGrams: 1000, targetLiquidGrams: 330, lyeGrams: 138 };

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
