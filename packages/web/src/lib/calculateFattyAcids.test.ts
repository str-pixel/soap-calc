import { describe, expect, it } from 'vitest';
import { calculateFattyAcidsForRecipe } from './calculateFattyAcids';
import { DEFAULT_SETTINGS } from './recipe';

describe('calculateFattyAcidsForRecipe modeledOilIds', () => {
  it('flags a weight-bearing derived-profile oil, not measured ones', () => {
    const result = calculateFattyAcidsForRecipe(
      [
        { key: 'a', oilId: 'soybean-27-5-hydrogenated', weightGrams: '500', weightPercent: '50' },
        { key: 'b', oilId: 'olive-oil', weightGrams: '500', weightPercent: '50' },
      ],
      DEFAULT_SETTINGS,
    );
    expect(result.modeledOilIds).toEqual(['soybean-27-5-hydrogenated']);
  });

  it('omits a derived oil that carries no weight', () => {
    const result = calculateFattyAcidsForRecipe(
      [
        { key: 'a', oilId: 'soybean-27-5-hydrogenated', weightGrams: '0', weightPercent: '0' },
        { key: 'b', oilId: 'olive-oil', weightGrams: '1000', weightPercent: '100' },
      ],
      DEFAULT_SETTINGS,
    );
    expect(result.modeledOilIds).toEqual([]);
  });

  it('returns an empty list for a measured-only recipe', () => {
    const result = calculateFattyAcidsForRecipe(
      [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000', weightPercent: '100' }],
      DEFAULT_SETTINGS,
    );
    expect(result.modeledOilIds).toEqual([]);
  });
});
