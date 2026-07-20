import { describe, expect, it } from 'vitest';
import { calculateDilution } from './dilution.js';

describe('calculateDilution', () => {
  it('computes solution, water, dilution water, and glycerin', () => {
    const r = calculateDilution({ anhydrousGrams: 1200, cookWaterGrams: 400, kohGrams: 200, naohGrams: 0, soapConcentrationPercent: 30 });
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.solutionGrams).toBeCloseTo(4000);      // 1200 / 0.30
    expect(r.totalWaterGrams).toBeCloseTo(2800);    // 4000 - 1200
    expect(r.dilutionWaterGrams).toBeCloseTo(2400); // 2800 - 400
    // 200 g as-weighed KOH at the 90% default purity → 180 g active × 92.094/(3×56.1056)
    expect(r.glycerinGrams).toBeCloseTo(180 * (92.094 / (3 * 56.1056)), 1);
    expect(r.targetExceedsPaste).toBe(false);
  });
  it('clamps dilution water to 0 and flags when the target exceeds the paste concentration', () => {
    const r = calculateDilution({ anhydrousGrams: 1200, cookWaterGrams: 400, kohGrams: 200, naohGrams: 0, soapConcentrationPercent: 90 });
    expect(r?.dilutionWaterGrams).toBe(0);
    expect(r?.targetExceedsPaste).toBe(true);
  });
  it('sums glycerin from both alkalis', () => {
    const r = calculateDilution({ anhydrousGrams: 1000, cookWaterGrams: 300, kohGrams: 100, naohGrams: 100, soapConcentrationPercent: 30 });
    // KOH at 90% default purity, NaOH at 100%: active grams × stoichiometric ratios
    expect(r?.glycerinGrams).toBeCloseTo(90 * (92.094 / (3 * 56.1056)) + 100 * (92.094 / (3 * 39.997)), 1);
  });
  it('returns null for anhydrous <= 0 or soap% outside (0,100)', () => {
    expect(calculateDilution({ anhydrousGrams: 0, cookWaterGrams: 0, kohGrams: 0, naohGrams: 0, soapConcentrationPercent: 30 })).toBeNull();
    expect(calculateDilution({ anhydrousGrams: 1000, cookWaterGrams: 300, kohGrams: 100, naohGrams: 0, soapConcentrationPercent: 0 })).toBeNull();
    expect(calculateDilution({ anhydrousGrams: 1000, cookWaterGrams: 300, kohGrams: 100, naohGrams: 0, soapConcentrationPercent: 100 })).toBeNull();
  });
});

describe('glycerin purity & lye-excess awareness (deep-review)', () => {
  it('applies the default KOH purity to as-weighed grams (stoichiometry needs active alkali)', () => {
    const r = calculateDilution({
      anhydrousGrams: 1000, cookWaterGrams: 300, kohGrams: 200, naohGrams: 0,
      soapConcentrationPercent: 25,
    });
    // 200 g as-weighed at default 90% purity → 180 g active × 92.094/(3×56.1056)
    expect(r?.glycerinGrams).toBeCloseTo(180 * (92.094 / (3 * 56.1056)), 1);
  });

  it('honors an explicit purity override', () => {
    const r = calculateDilution({
      anhydrousGrams: 1000, cookWaterGrams: 300, kohGrams: 200, naohGrams: 0,
      soapConcentrationPercent: 25, kohPurityPercent: 100,
    });
    expect(r?.glycerinGrams).toBeCloseTo(200 * (92.094 / (3 * 56.1056)), 1);
  });

  it('excludes the non-saponifying excess of a lye-excess (negative superfat) batch', () => {
    const r = calculateDilution({
      anhydrousGrams: 1000, cookWaterGrams: 300, kohGrams: 206, naohGrams: 0,
      soapConcentrationPercent: 25, kohPurityPercent: 100, superfatPercent: -3,
    });
    // only 100/103 of the alkali saponifies
    expect(r?.glycerinGrams).toBeCloseTo(206 * (100 / 103) * (92.094 / (3 * 56.1056)), 1);
  });
});
