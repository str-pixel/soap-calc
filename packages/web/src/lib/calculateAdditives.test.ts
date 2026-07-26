import { describe, expect, it } from 'vitest';
import {
  computePostCookSuperfat,
  computeRecipeAdditives,
  computeSplitLiquidGrams,
  splitLiquidWaterFraction,
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
    expect(computeRecipeAdditives(additives, { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 })).toEqual([
      {
        key: 'a',
        catalogId: 'honey',
        name: 'Honey',
        amount: 1,
        unit: 'percent',
        basis: 'oil',
        grams: 10,
        addAt: 'trace',
      },
    ]);
  });

  it('computes split liquid grams', () => {
    expect(computeSplitLiquidGrams('20', 1000)).toBe(200);
  });

  it('returns empty when oil weight is zero', () => {
    expect(computeRecipeAdditives(additives, { oilGrams: 0, batchGrams: 1500, solutionGrams: 0 })).toEqual([]);
    expect(computeSplitLiquidGrams('20', 0)).toBeNull();
  });

  it('skips invalid or zero percent lines', () => {
    const lines: AdditiveLine[] = [
      { key: 'a', catalogId: '', name: '', amount: 'abc', basis: 'oil', unit: 'percent', addAt: 'trace' },
      { key: 'b', catalogId: '', name: 'Clay', amount: '0', basis: 'oil', unit: 'percent', addAt: 'oils' },
      { key: 'c', catalogId: '', name: '', amount: '2', basis: 'oil', unit: 'percent', addAt: 'trace' },
    ];
    expect(computeRecipeAdditives(lines, { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 })).toEqual([
      {
        key: 'c',
        catalogId: '',
        name: 'Additive',
        amount: 2,
        unit: 'percent',
        basis: 'oil',
        grams: 20,
        addAt: 'trace',
      },
    ]);
  });
});

describe('computeRecipeAdditives dose basis/unit', () => {
  it('percent of oil uses oil weight', () => {
    const [row] = computeRecipeAdditives([line({ amount: '5' })], { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 });
    expect(row.grams).toBe(50);
  });
  it('percent of batch uses the wet-batch weight', () => {
    const [row] = computeRecipeAdditives([line({ amount: '1', basis: 'batch' })], { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 });
    expect(row.grams).toBe(15);
  });
  it('ppt of oil divides by 1000', () => {
    const [row] = computeRecipeAdditives([line({ amount: '3', unit: 'ppt' })], { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 });
    expect(row.grams).toBe(3);
  });
  it('skips a batch-basis line when batch weight is unavailable', () => {
    expect(computeRecipeAdditives([line({ amount: '1', basis: 'batch' })], { oilGrams: 1000, batchGrams: 0, solutionGrams: 0 })).toEqual([]);
  });
  it('a solution-basis line uses solutionGrams', () => {
    const [row] = computeRecipeAdditives([line({ amount: '2', basis: 'solution' })], { oilGrams: 1000, batchGrams: 1500, solutionGrams: 4000 });
    expect(row.grams).toBe(80); // 2% of 4000
  });
  it('skips a solution-basis line when solutionGrams is 0 (non-LS)', () => {
    expect(computeRecipeAdditives([line({ amount: '2', basis: 'solution' })], { oilGrams: 1000, batchGrams: 1500, solutionGrams: 0 })).toEqual([]);
  });
});

describe('computePostCookSuperfat', () => {
  it('computes grams from percent of oil for a single oil row', () => {
    expect(
      computePostCookSuperfat({ postCookSuperfatOils: [{ oilId: 'shea-butter', percent: '5' }] }, 1000),
    ).toEqual({
      oils: [{ oilId: 'shea-butter', percentOfOil: 5, grams: 50 }],
      percentOfOil: 5,
      grams: 50,
    });
  });

  it('sums multiple oil rows into the aggregate percent and grams', () => {
    expect(
      computePostCookSuperfat(
        {
          postCookSuperfatOils: [
            { oilId: 'shea-butter', percent: '3' },
            { oilId: 'jojoba-oil', percent: '2' },
          ],
        },
        1000,
      ),
    ).toEqual({
      oils: [
        { oilId: 'shea-butter', percentOfOil: 3, grams: 30 },
        { oilId: 'jojoba-oil', percentOfOil: 2, grams: 20 },
      ],
      percentOfOil: 5,
      grams: 50,
    });
  });

  it('skips empty/zero/invalid rows and returns null when none contribute', () => {
    expect(
      computePostCookSuperfat(
        {
          postCookSuperfatOils: [
            { oilId: 'olive-oil', percent: '' },
            { oilId: 'olive-oil', percent: '0' },
            { oilId: 'olive-oil', percent: 'abc' },
          ],
        },
        1000,
      ),
    ).toBeNull();
  });

  it('drops a zero-percent row but keeps a valid sibling', () => {
    expect(
      computePostCookSuperfat(
        {
          postCookSuperfatOils: [
            { oilId: 'olive-oil', percent: '0' },
            { oilId: 'shea-butter', percent: '4' },
          ],
        },
        1000,
      ),
    ).toEqual({
      oils: [{ oilId: 'shea-butter', percentOfOil: 4, grams: 40 }],
      percentOfOil: 4,
      grams: 40,
    });
  });

  it('returns null for an empty list', () => {
    expect(computePostCookSuperfat({ postCookSuperfatOils: [] }, 1000)).toBeNull();
  });

  it('returns null when total oil weight is not positive', () => {
    expect(
      computePostCookSuperfat({ postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '5' }] }, 0),
    ).toBeNull();
  });
});

describe('splitLiquidWaterFraction', () => {
  it('uses the preset fraction when a preset is selected', () => {
    expect(
      splitLiquidWaterFraction({ presetKey: 'coconut-milk-canned', customWaterPercent: '' }),
    ).toBeCloseTo(0.68, 2);
  });

  it('uses the custom % water for custom liquids', () => {
    expect(
      splitLiquidWaterFraction({ presetKey: '', customWaterPercent: '55' }),
    ).toBeCloseTo(0.55, 2);
  });

  it('treats blank or invalid custom percents as pure water', () => {
    for (const customWaterPercent of ['', '0', '-5', '250', 'abc']) {
      expect(
        splitLiquidWaterFraction({ presetKey: '', customWaterPercent }),
      ).toBe(1);
    }
  });
});
