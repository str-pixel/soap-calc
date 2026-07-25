import { describe, expect, it } from 'vitest';
import {
  ALTERNATIVE_LIQUID_GUIDE,
  alternativeLiquidPreset,
} from './alternative-liquids.js';

describe('ALTERNATIVE_LIQUID_GUIDE', () => {
  it('has unique keys and water fractions in (0, 1]', () => {
    const keys = ALTERNATIVE_LIQUID_GUIDE.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const preset of ALTERNATIVE_LIQUID_GUIDE) {
      expect(preset.waterFraction).toBeGreaterThan(0);
      expect(preset.waterFraction).toBeLessThanOrEqual(1);
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  it('distinguishes regular yogurt from greek yogurt by water fraction', () => {
    // USDA-derived: plain whole-milk yogurt ~88% water; greek strains whey out (~81%).
    expect(alternativeLiquidPreset('yogurt')?.waterFraction).toBeCloseTo(0.88, 2);
    expect(alternativeLiquidPreset('yogurt-greek')?.waterFraction).toBeCloseTo(0.81, 2);
  });

  it('carries the low-water outlier for canned coconut milk', () => {
    // USDA by-difference (~21% fat): the preset most likely to starve a 1:1 lye solution.
    expect(alternativeLiquidPreset('coconut-milk-canned')?.waterFraction).toBeCloseTo(0.68, 2);
  });

  it('flags sugar-bearing liquids and the alcohol advisory for beer/wine', () => {
    expect(alternativeLiquidPreset('milk')?.flags).toContain('sugars');
    const beerWine = alternativeLiquidPreset('beer-wine');
    expect(beerWine?.flags).toContain('alcohol');
    expect(beerWine?.note).toMatch(/alcohol/i);
  });

  it('returns null for unknown keys', () => {
    expect(alternativeLiquidPreset('vinegar')).toBeNull();
    expect(alternativeLiquidPreset('')).toBeNull();
  });
});
