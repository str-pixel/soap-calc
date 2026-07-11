import { describe, expect, it } from 'vitest';
import { calculateNeutralization } from './neutralization.js';

// 105 g as-weighed KOH at superfat -5 corresponds to 100 g at 0% → 5 g excess.
const BASE = {
  kohGrams: 105,
  naohGrams: 0,
  superfatPercent: -5,
  kohPurityPercent: 100,
  naohPurityPercent: 100,
};

describe('calculateNeutralization', () => {
  it('estimates citric acid from a KOH lye excess', () => {
    const r = calculateNeutralization(BASE)!;
    expect(r).not.toBeNull();
    expect(r.lyeExcessPercent).toBe(5);
    expect(r.excessKohGrams).toBeCloseTo(5, 3);
    // 5 g KOH active × 192.124 / (3 × 56.1056) = 5.708 g citric
    expect(r.citricAcidGrams).toBeCloseTo(5.708, 2);
    expect(r.dilutionWaterGrams).toBeCloseTo(r.citricAcidGrams * 4, 6);
    expect(r.targetPhLow).toBe(9);
    expect(r.targetPhHigh).toBe(10.5);
  });

  it('lowers the citric estimate for impure (90%) KOH', () => {
    const pure = calculateNeutralization(BASE)!;
    const impure = calculateNeutralization({ ...BASE, kohPurityPercent: 90 })!;
    expect(impure.citricAcidGrams).toBeCloseTo(pure.citricAcidGrams * 0.9, 3);
  });

  it('adds the NaOH contribution for dual lye', () => {
    const kohOnly = calculateNeutralization(BASE)!;
    const dual = calculateNeutralization({ ...BASE, naohGrams: 21 })!;
    expect(dual.excessNaohGrams).toBeCloseTo(1, 3); // 21 × 5/105
    expect(dual.citricAcidGrams).toBeGreaterThan(kohOnly.citricAcidGrams);
  });

  it('returns null when superfat is >= 0 or there is no alkali', () => {
    expect(calculateNeutralization({ ...BASE, superfatPercent: 0 })).toBeNull();
    expect(calculateNeutralization({ ...BASE, superfatPercent: 3 })).toBeNull();
    expect(calculateNeutralization({ ...BASE, kohGrams: 0, naohGrams: 0 })).toBeNull();
    expect(calculateNeutralization({ ...BASE, superfatPercent: Number.NaN })).toBeNull();
  });
});
