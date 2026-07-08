import { describe, expect, it } from 'vitest';
import { DEFAULT_SPLIT_LIQUID } from '../lib/recipe';
import { totalAdditivePercentForInsights } from './useFormulationInsights';

describe('totalAdditivePercentForInsights', () => {
  it('excludes split liquid added in lye water', () => {
    expect(
      totalAdditivePercentForInsights([5], {
        ...DEFAULT_SPLIT_LIQUID,
        enabled: true,
        percentOfOil: '25',
        addAt: 'lye',
      }),
    ).toBe(5);
  });

  it('includes split liquid added at trace', () => {
    expect(
      totalAdditivePercentForInsights([5], {
        ...DEFAULT_SPLIT_LIQUID,
        enabled: true,
        percentOfOil: '8',
        addAt: 'trace',
      }),
    ).toBe(13);
  });
});
