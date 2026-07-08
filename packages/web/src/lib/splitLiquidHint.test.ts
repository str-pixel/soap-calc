import { describe, expect, it } from 'vitest';
import { splitLiquidManualWaterHint } from './splitLiquidHint';

const suggestion = {
  suggestedWaterGrams: 135,
  reductionGrams: 195,
  suggestedWaterPercentOfOils: 13.5,
};

describe('splitLiquidManualWaterHint', () => {
  it('returns null for percent of oils mode', () => {
    expect(
      splitLiquidManualWaterHint({
        waterMode: 'percent_of_oils',
        waterSuggestion: suggestion,
        lyeGrams: 135,
        totalOilGrams: 1000,
        weightUnit: 'g',
      }),
    ).toBeNull();
  });

  it('suggests a target lye concentration', () => {
    const hint = splitLiquidManualWaterHint({
      waterMode: 'lye_concentration',
      waterSuggestion: suggestion,
      lyeGrams: 135,
      totalOilGrams: 1000,
      weightUnit: 'g',
    });
    expect(hint).toContain('50%');
    expect(hint).toContain('135');
  });

  it('suggests a water : lye ratio', () => {
    const hint = splitLiquidManualWaterHint({
      waterMode: 'lye_water_ratio',
      waterSuggestion: suggestion,
      lyeGrams: 135,
      totalOilGrams: 1000,
      weightUnit: 'g',
    });
    expect(hint).toContain('1 : 1');
    expect(hint).toContain('135');
  });
});
