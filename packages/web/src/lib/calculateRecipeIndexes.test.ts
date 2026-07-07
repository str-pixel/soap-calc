import { describe, expect, it } from 'vitest';
import { calculateRecipeIndexes } from './calculateRecipeIndexes';
import { createStarterLines, DEFAULT_SETTINGS } from './recipe';

describe('calculateRecipeIndexes', () => {
  it('returns weighted iodine and INS for starter recipe', () => {
    const result = calculateRecipeIndexes(createStarterLines(), DEFAULT_SETTINGS);
    expect(result.iodine).not.toBeNull();
    expect(result.ins).not.toBeNull();
    expect(result.iodine!).toBeGreaterThan(0);
    expect(result.ins!).toBeGreaterThan(0);
    expect(result.coveragePercent).toBe(100);
    expect(result.missingOilIds).toHaveLength(0);
  });

  it('returns null indexes when no oil weights entered', () => {
    const result = calculateRecipeIndexes(
      [{ key: 'a', oilId: 'olive-oil', weightGrams: '' }],
      DEFAULT_SETTINGS,
    );
    expect(result.iodine).toBeNull();
    expect(result.ins).toBeNull();
  });
});
