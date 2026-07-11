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
    expect(r.glycerinGrams).toBeCloseTo(110);       // 0.55 * 200
    expect(r.targetExceedsPaste).toBe(false);
  });
  it('clamps dilution water to 0 and flags when the target exceeds the paste concentration', () => {
    const r = calculateDilution({ anhydrousGrams: 1200, cookWaterGrams: 400, kohGrams: 200, naohGrams: 0, soapConcentrationPercent: 90 });
    expect(r?.dilutionWaterGrams).toBe(0);
    expect(r?.targetExceedsPaste).toBe(true);
  });
  it('sums glycerin from both alkalis', () => {
    const r = calculateDilution({ anhydrousGrams: 1000, cookWaterGrams: 300, kohGrams: 100, naohGrams: 100, soapConcentrationPercent: 30 });
    expect(r?.glycerinGrams).toBeCloseTo(132); // 0.55*100 + 0.77*100
  });
  it('returns null for anhydrous <= 0 or soap% outside (0,100)', () => {
    expect(calculateDilution({ anhydrousGrams: 0, cookWaterGrams: 0, kohGrams: 0, naohGrams: 0, soapConcentrationPercent: 30 })).toBeNull();
    expect(calculateDilution({ anhydrousGrams: 1000, cookWaterGrams: 300, kohGrams: 100, naohGrams: 0, soapConcentrationPercent: 0 })).toBeNull();
    expect(calculateDilution({ anhydrousGrams: 1000, cookWaterGrams: 300, kohGrams: 100, naohGrams: 0, soapConcentrationPercent: 100 })).toBeNull();
  });
});
