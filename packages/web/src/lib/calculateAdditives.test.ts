import { describe, expect, it } from 'vitest';
import { computeRecipeAdditives, computeSplitLiquidGrams } from './calculateAdditives';
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
