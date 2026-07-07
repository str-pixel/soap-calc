import { describe, expect, it } from 'vitest';
import { calculatePropertiesForRecipe } from './calculateProperties';
import { createStarterLines, DEFAULT_SETTINGS } from './recipe';

describe('calculatePropertiesForRecipe', () => {
  it('returns properties for starter-style recipe', () => {
    const result = calculatePropertiesForRecipe(createStarterLines(), DEFAULT_SETTINGS);
    expect(result.properties).not.toBeNull();
    expect(result.coveragePercent).toBe(100);
    expect(result.properties!.hardness).toBeGreaterThan(0);
  });

  it('works with gram weights', () => {
    const result = calculatePropertiesForRecipe(
      [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000', weightPercent: '100' }],
      DEFAULT_SETTINGS,
    );
    expect(result.properties).not.toBeNull();
    expect(result.properties!.condition).toBeGreaterThan(50);
  });
});
