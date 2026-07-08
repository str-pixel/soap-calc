import { describe, expect, it } from 'vitest';
import {
  lyeConcentrationPercent,
  suggestLyeWaterWithSplitLiquid,
} from './split-liquid.js';

describe('lyeConcentrationPercent', () => {
  it('computes lye share of the lye solution', () => {
    expect(lyeConcentrationPercent(135, 135)).toBeCloseTo(50, 1);
    expect(lyeConcentrationPercent(135, 330)).toBeCloseTo(29, 0);
  });
});

describe('suggestLyeWaterWithSplitLiquid', () => {
  it('suggests reduced lye water capped at 1:1 water:lye minimum', () => {
    const suggestion = suggestLyeWaterWithSplitLiquid({
      waterGrams: 330,
      lyeGrams: 135,
      totalOilGrams: 1000,
      splitLiquidGrams: 200,
      waterMode: 'percent_of_oils',
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion!.reductionGrams).toBe(195);
    expect(suggestion!.suggestedWaterGrams).toBe(135);
    expect(suggestion!.suggestedWaterPercentOfOils).toBeCloseTo(13.5, 1);
  });

  it('returns null when split liquid is zero', () => {
    expect(
      suggestLyeWaterWithSplitLiquid({
        waterGrams: 330,
        lyeGrams: 135,
        totalOilGrams: 1000,
        splitLiquidGrams: 0,
        waterMode: 'percent_of_oils',
      }),
    ).toBeNull();
  });

  it('omits percent suggestion for non-percent water modes', () => {
    const suggestion = suggestLyeWaterWithSplitLiquid({
      waterGrams: 270,
      lyeGrams: 135,
      totalOilGrams: 1000,
      splitLiquidGrams: 50,
      waterMode: 'lye_water_ratio',
    });

    expect(suggestion!.suggestedWaterGrams).toBe(220);
    expect(suggestion!.suggestedWaterPercentOfOils).toBeNull();
  });
});
