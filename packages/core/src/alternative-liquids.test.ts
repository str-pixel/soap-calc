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

  it('flags sugar-bearing liquids and the alcohol advisory for beer and wine', () => {
    expect(alternativeLiquidPreset('milk')?.flags).toContain('sugars');
    for (const key of ['beer', 'wine']) {
      const preset = alternativeLiquidPreset(key);
      expect(preset?.flags).toContain('alcohol');
      expect(preset?.note).toMatch(/alcohol/i);
    }
    expect(alternativeLiquidPreset('beer')?.waterFraction).toBeCloseTo(0.92, 2);
    expect(alternativeLiquidPreset('wine')?.waterFraction).toBeCloseTo(0.87, 2);
  });

  it('covers the common dairy and juice liquids from CP practice', () => {
    // USDA-derived: buttermilk ~90%, fruit juice ~88%, coconut water ~95%.
    expect(alternativeLiquidPreset('buttermilk')?.waterFraction).toBeCloseTo(0.9, 2);
    expect(alternativeLiquidPreset('fruit-juice')?.waterFraction).toBeCloseTo(0.88, 2);
    expect(alternativeLiquidPreset('coconut-water')?.waterFraction).toBeCloseTo(0.95, 2);
  });

  it('carries heavy cream as the deepest fat outlier', () => {
    // USDA heavy whipping cream: 58% water — even lower than canned coconut milk.
    const cream = alternativeLiquidPreset('heavy-cream');
    expect(cream?.waterFraction).toBeCloseTo(0.58, 2);
    expect(cream?.flags).toContain('sugars');
    expect(cream?.note).toMatch(/fat/i);
  });

  it('returns null for unknown keys', () => {
    expect(alternativeLiquidPreset('vinegar')).toBeNull();
    expect(alternativeLiquidPreset('')).toBeNull();
  });
});
