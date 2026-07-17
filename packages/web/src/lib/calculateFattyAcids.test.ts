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

  it('names a derived oil once when it appears on several lines', () => {
    // Nothing stops the same oil being picked on two lines: the picker only marks the
    // current line's own selection, and addRecipeLine has no duplicate guard. Without the
    // dedup, ModeledOilsNote would name the oil twice ("Soybean…, Soybean…") and — since
    // it plurals on oilIds.length — describe one oil as "These oils".
    const result = calculateFattyAcidsForRecipe(
      [
        { key: 'a', oilId: 'soybean-27-5-hydrogenated', weightGrams: '250', weightPercent: '25' },
        { key: 'b', oilId: 'soybean-27-5-hydrogenated', weightGrams: '250', weightPercent: '25' },
        { key: 'c', oilId: 'olive-oil', weightGrams: '500', weightPercent: '50' },
      ],
      DEFAULT_SETTINGS,
    );
    expect(result.modeledOilIds).toEqual(['soybean-27-5-hydrogenated']);
  });
});
