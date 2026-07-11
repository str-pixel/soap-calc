import { describe, expect, it } from 'vitest';
import { DEFAULT_SPLIT_LIQUID } from '../lib/recipe';
import { postCookSuperfatPufaPercent, totalAdditivePercentForInsights } from './useFormulationInsights';

describe('totalAdditivePercentForInsights', () => {
  it('excludes split liquid added in lye water', () => {
    expect(
      totalAdditivePercentForInsights([{ grams: 50 }], 1000, {
        ...DEFAULT_SPLIT_LIQUID, enabled: true, percentOfOil: '25', addAt: 'lye',
      }),
    ).toBe(5);
  });
  it('includes split liquid added at trace', () => {
    expect(
      totalAdditivePercentForInsights([{ grams: 50 }], 1000, {
        ...DEFAULT_SPLIT_LIQUID, enabled: true, percentOfOil: '8', addAt: 'trace',
      }),
    ).toBe(13);
  });
  it('sums additive grams as oil-equivalent percent regardless of dose basis/unit', () => {
    // a batch/ppt line contributes grams/oil*100, not its raw amount
    expect(
      totalAdditivePercentForInsights([{ grams: 30 }, { grams: 3 }], 1000, { ...DEFAULT_SPLIT_LIQUID }),
    ).toBeCloseTo(3.3); // (30+3)/1000*100
  });
});

describe('postCookSuperfatPufaPercent', () => {
  it('returns the oil linoleic+linolenic total, undefined for unknown oil', () => {
    const coconut = postCookSuperfatPufaPercent('coconut-oil-76');
    expect(coconut).toBeDefined();
    expect(coconut!).toBeLessThan(30); // coconut is low-PUFA
    expect(postCookSuperfatPufaPercent('not-an-oil')).toBeUndefined();
  });
});
