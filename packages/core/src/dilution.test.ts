import { describe, expect, it, test } from 'vitest';
import { calculateDilution, gradualDilutionFrom } from './dilution.js';

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

describe('gradualDilutionFrom', () => {
  // A 1,041 g-anhydrous batch whose paste weighs 1,423 g (382 g cook water).
  const base = { pasteGrams: 1423, anhydrousGrams: 1041 };

  test('finished mass is exactly paste + water, and the concentration follows', () => {
    const r = gradualDilutionFrom({ ...base, waterAddedGrams: 2000 })!;
    expect(r.finishedGrams).toBe(3423);
    expect(r.concentrationPercent).toBeCloseTo(30.4119, 4);
  });

  test('the written concentration is rounded to 2 dp — 1 dp drifts ~8 g, which is visible', () => {
    const r = gradualDilutionFrom({ ...base, waterAddedGrams: 2000 })!;
    expect(r.writeBackPercent).toBe(30.41);
    expect(r.clamped).toBe(false);
  });

  test('round trip: calculateDilution on the written value recovers what was poured, under a gram', () => {
    const r = gradualDilutionFrom({ ...base, waterAddedGrams: 2000 })!;
    const d = calculateDilution({
      anhydrousGrams: 1041, cookWaterGrams: 382, kohGrams: 191, naohGrams: 0,
      soapConcentrationPercent: r.writeBackPercent,
    })!;
    expect(Math.abs(d.solutionGrams - r.finishedGrams)).toBeLessThan(1);
  });

  test('an extreme record clamps what is WRITTEN and says so, keeping the readout honest', () => {
    // Almost no water: the true concentration exceeds 99%.
    const r = gradualDilutionFrom({ pasteGrams: 1050, anhydrousGrams: 1041, waterAddedGrams: 0 })!;
    expect(r.concentrationPercent).toBeGreaterThan(99); // readout tells the truth
    expect(r.writeBackPercent).toBe(99);                // written value is clamped
    expect(r.clamped).toBe(true);
  });

  test('junk and blanks yield null rather than a bogus concentration', () => {
    expect(gradualDilutionFrom({ ...base, waterAddedGrams: NaN })).toBeNull();
    expect(gradualDilutionFrom({ ...base, waterAddedGrams: -1 })).toBeNull();
    expect(gradualDilutionFrom({ pasteGrams: 0, anhydrousGrams: 1041, waterAddedGrams: 100 })).toBeNull();
    expect(gradualDilutionFrom({ pasteGrams: 1423, anhydrousGrams: 0, waterAddedGrams: 100 })).toBeNull();
  });

  test('zero water is a legitimate record — the pot before any dilution', () => {
    const r = gradualDilutionFrom({ ...base, waterAddedGrams: 0 })!;
    expect(r.finishedGrams).toBe(1423);
  });
});
