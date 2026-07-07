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
});
