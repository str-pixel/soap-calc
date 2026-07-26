import { describe, expect, it } from 'vitest';
import {
  ALTERNATIVE_LIQUID_GUIDE,
  alternativeLiquidPreset,
  extraLyeForAcidLiquid,
  extraLyeForAcid,
} from './alternative-liquids.js';
import { catalogEntryById } from './additives.js';

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
    expect(alternativeLiquidPreset('motor-oil')).toBeNull();
    expect(alternativeLiquidPreset('')).toBeNull();
  });
});

describe('vinegar (acid) preset and extra-lye compensation', () => {
  it('ships vinegar with the acid flag and its neutralization factors (pure basis)', () => {
    const vinegar = alternativeLiquidPreset('vinegar');
    expect(vinegar?.flags).toContain('acid');
    expect(vinegar?.waterFraction).toBeCloseTo(0.95, 2);
    // 5 g acetic acid per 100 g ÷ 60.05 g/mol × 40.00 (NaOH) / 56.11 (KOH)
    expect(vinegar?.lyeNeutralization?.naohPerGram).toBeCloseTo(0.0333, 4);
    expect(vinegar?.lyeNeutralization?.kohPerGram).toBeCloseTo(0.0467, 4);
  });

  it('computes as-weighed extra lye for NaOH at 99% purity', () => {
    const extra = extraLyeForAcidLiquid(alternativeLiquidPreset('vinegar')!, 330, {
      lyeType: 'naoh',
      kohBlendPercent: 0,
      naohPurityPercent: 99,
      kohPurityPercent: 90,
    });
    // 330 × 0.0333 = 10.99 pure → /0.99 = 11.10 as weighed
    expect(extra.naohGrams).toBeCloseTo(11.1, 1);
    expect(extra.kohGrams).toBe(0);
  });

  it('splits dual-lye compensation by the KOH blend share, each at its own purity', () => {
    const extra = extraLyeForAcidLiquid(alternativeLiquidPreset('vinegar')!, 100, {
      lyeType: 'dual',
      kohBlendPercent: 5,
      naohPurityPercent: 99,
      kohPurityPercent: 90,
    });
    // NaOH: 95 g share → 95×0.0333/0.99 ≈ 3.196; KOH: 5 g share → 5×0.0467/0.90 ≈ 0.2595
    expect(extra.naohGrams).toBeCloseTo(3.2, 1);
    expect(extra.kohGrams).toBeCloseTo(0.26, 2);
  });

  it('returns zero for non-acid presets', () => {
    const extra = extraLyeForAcidLiquid(alternativeLiquidPreset('milk')!, 330, {
      lyeType: 'naoh',
      kohBlendPercent: 0,
      naohPurityPercent: 99,
      kohPurityPercent: 90,
    });
    expect(extra.naohGrams).toBe(0);
    expect(extra.kohGrams).toBe(0);
  });
});

describe('extraLyeForAcid (shared acid math)', () => {
  const recipe = { lyeType: 'naoh' as const, kohBlendPercent: 0, naohPurityPercent: 100, kohPurityPercent: 100 };

  it('extraLyeForAcidLiquid delegates: vinegar result is identical through both paths', () => {
    const preset = alternativeLiquidPreset('vinegar')!;
    const viaPreset = extraLyeForAcidLiquid(preset, 330, recipe);
    const viaFactors = extraLyeForAcid(preset.lyeNeutralization!, 330, recipe);
    expect(viaFactors).toEqual(viaPreset);
  });

  it('splits dual lye by KOH blend share and grosses up by each purity', () => {
    const factors = catalogEntryById('citric-acid')!.lyeNeutralization!;
    const extra = extraLyeForAcid(factors, 10, {
      lyeType: 'dual',
      kohBlendPercent: 40,
      naohPurityPercent: 97,
      kohPurityPercent: 90,
    });
    expect(extra.naohGrams).toBeCloseTo((10 * 0.6 * 0.6246) / 0.97, 2);
    expect(extra.kohGrams).toBeCloseTo((10 * 0.4 * 0.8761) / 0.9, 2);
  });
});
