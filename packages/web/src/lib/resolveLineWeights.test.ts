import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './recipe';

describe('resolveLineWeights', () => {
  it('resolves gram weights and the recipe oil total', async () => {
    const { resolveLineWeights } = await import('./resolveLineWeights');
    const result = resolveLineWeights(
      [
        { key: 'a', oilId: 'olive-oil', weightGrams: '600', weightPercent: '60' },
        { key: 'b', oilId: 'coconut-oil-76', weightGrams: '400', weightPercent: '40' },
      ],
      DEFAULT_SETTINGS,
    );
    expect(result.lines[0].weightGrams).toBe(600);
    expect(result.recipeOilWeightGrams).toBe(1000);
  });
});
