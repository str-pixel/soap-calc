import { describe, expect, it } from 'vitest';
import {
  computePostCookSuperfat,
  computeRecipeAdditives,
  computeSplitLiquidGrams,
} from './calculateAdditives';
import type { AdditiveLine } from './recipe';

describe('calculateAdditives', () => {
  const additives: AdditiveLine[] = [
    {
      key: 'a',
      catalogId: 'honey',
      name: 'Honey',
      percentOfOil: '1',
      addAt: 'trace',
    },
  ];

  it('computes grams from percent of oil', () => {
    expect(computeRecipeAdditives(additives, 1000)).toEqual([
      {
        key: 'a',
        catalogId: 'honey',
        name: 'Honey',
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
    expect(computeRecipeAdditives(additives, 0)).toEqual([]);
    expect(computeSplitLiquidGrams('20', 0)).toBeNull();
  });

  it('skips invalid or zero percent lines', () => {
    const lines: AdditiveLine[] = [
      { key: 'a', catalogId: '', name: '', percentOfOil: 'abc', addAt: 'trace' },
      { key: 'b', catalogId: '', name: 'Clay', percentOfOil: '0', addAt: 'oils' },
      { key: 'c', catalogId: '', name: '', percentOfOil: '2', addAt: 'trace' },
    ];
    expect(computeRecipeAdditives(lines, 1000)).toEqual([
      {
        key: 'c',
        catalogId: '',
        name: 'Additive',
        percentOfOil: 2,
        grams: 20,
        addAt: 'trace',
      },
    ]);
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
