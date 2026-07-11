import { describe, expect, it } from 'vitest';
import {
  computePostCookSuperfat,
  computeRecipeAdditives,
  computeSplitLiquidGrams,
} from './calculateAdditives';
import type { AdditiveLine } from './recipe';

function line(over: Partial<AdditiveLine>): AdditiveLine {
  return { key: 'k', catalogId: '', name: 'X', amount: '', basis: 'oil', unit: 'percent', addAt: 'trace', ...over };
}

describe('calculateAdditives', () => {
  const additives: AdditiveLine[] = [
    {
      key: 'a',
      catalogId: 'honey',
      name: 'Honey',
      amount: '1',
      basis: 'oil',
      unit: 'percent',
      addAt: 'trace',
    },
  ];

  it('computes grams from percent of oil', () => {
    expect(computeRecipeAdditives(additives, { oilGrams: 1000, batchGrams: 1500 })).toEqual([
      {
        key: 'a',
        catalogId: 'honey',
        name: 'Honey',
        amount: 1,
        unit: 'percent',
        basis: 'oil',
        percentOfOil: 1,
        grams: 10,
        addAt: 'trace',
      },
    ]);
  });

  it('computes split liquid grams', () => {
    expect(computeSplitLiquidGrams('20', 1000)).toBe(200);
  });

  it('returns empty when oil weight is zero', () => {
    expect(computeRecipeAdditives(additives, { oilGrams: 0, batchGrams: 1500 })).toEqual([]);
    expect(computeSplitLiquidGrams('20', 0)).toBeNull();
  });

  it('skips invalid or zero percent lines', () => {
    const lines: AdditiveLine[] = [
      { key: 'a', catalogId: '', name: '', amount: 'abc', basis: 'oil', unit: 'percent', addAt: 'trace' },
      { key: 'b', catalogId: '', name: 'Clay', amount: '0', basis: 'oil', unit: 'percent', addAt: 'oils' },
      { key: 'c', catalogId: '', name: '', amount: '2', basis: 'oil', unit: 'percent', addAt: 'trace' },
    ];
    expect(computeRecipeAdditives(lines, { oilGrams: 1000, batchGrams: 1500 })).toEqual([
      {
        key: 'c',
        catalogId: '',
        name: 'Additive',
        amount: 2,
        unit: 'percent',
        basis: 'oil',
        percentOfOil: 2,
        grams: 20,
        addAt: 'trace',
      },
    ]);
  });
});

describe('computeRecipeAdditives dose basis/unit', () => {
  it('percent of oil uses oil weight', () => {
    const [row] = computeRecipeAdditives([line({ amount: '5' })], { oilGrams: 1000, batchGrams: 1500 });
    expect(row.grams).toBe(50);
    expect(row.percentOfOil).toBe(5); // oil-equivalent bridge
  });
  it('percent of batch uses the wet-batch weight', () => {
    const [row] = computeRecipeAdditives([line({ amount: '1', basis: 'batch' })], { oilGrams: 1000, batchGrams: 1500 });
    expect(row.grams).toBe(15);
    expect(row.percentOfOil).toBeCloseTo(1.5); // 15g / 1000g oil
  });
  it('ppt of oil divides by 1000', () => {
    const [row] = computeRecipeAdditives([line({ amount: '3', unit: 'ppt' })], { oilGrams: 1000, batchGrams: 1500 });
    expect(row.grams).toBe(3);
  });
  it('skips a batch-basis line when batch weight is unavailable', () => {
    expect(computeRecipeAdditives([line({ amount: '1', basis: 'batch' })], { oilGrams: 1000, batchGrams: 0 })).toEqual([]);
  });
});

describe('computePostCookSuperfat', () => {
  it('computes grams from percent of oil and returns the given oil id', () => {
    expect(
      computePostCookSuperfat(
        { postCookSuperfatPercent: '5', postCookSuperfatOilId: 'shea-butter' },
        1000,
      ),
    ).toEqual({ oilId: 'shea-butter', percentOfOil: 5, grams: 50 });
  });

  it('returns null for an empty percent', () => {
    expect(
      computePostCookSuperfat(
        { postCookSuperfatPercent: '', postCookSuperfatOilId: 'olive-oil' },
        1000,
      ),
    ).toBeNull();
  });

  it('returns null for a zero percent', () => {
    expect(
      computePostCookSuperfat(
        { postCookSuperfatPercent: '0', postCookSuperfatOilId: 'olive-oil' },
        1000,
      ),
    ).toBeNull();
  });

  it('returns null for an invalid percent', () => {
    expect(
      computePostCookSuperfat(
        { postCookSuperfatPercent: 'abc', postCookSuperfatOilId: 'olive-oil' },
        1000,
      ),
    ).toBeNull();
  });

  it('returns null when total oil weight is not positive', () => {
    expect(
      computePostCookSuperfat(
        { postCookSuperfatPercent: '5', postCookSuperfatOilId: 'olive-oil' },
        0,
      ),
    ).toBeNull();
  });
});
