import { describe, expect, it } from 'vitest';
import { estimateWorkability, WORKABILITY_TUNING, type WorkabilityInput } from './workability';

const base: WorkabilityInput = {
  hardnessScore: 47,
  faCoverage: 100,
  lyeConcentrationPercent: 33,
  superfatPercent: 5,
  process: 'cp',
  gelMode: 'natural',
  additives: [],
};
const est = (o: Partial<WorkabilityInput> = {}) => estimateWorkability({ ...base, ...o });

describe('estimateWorkability', () => {
  it('baseline hard bar sits in the 12–36h band at natural gel', () => {
    const e = est()!;
    expect(e.unmold.minHours).toBeCloseTo(12, 5);
    expect(e.unmold.maxHours).toBeCloseTo(36, 5);
    expect(e.confidence).toBe('moderate');
    expect(e.stamp).not.toBeNull();
  });

  it('fast case (forced gel + discount + sodium lactate) lands ~5–14h, above the 4h floor', () => {
    const e = est({ gelMode: 'forced', lyeConcentrationPercent: 38, superfatPercent: 3, additives: [{ id: 'sodium-lactate', dosePercent: 3 }] })!;
    expect(e.unmold.minHours).toBeGreaterThanOrEqual(4);
    expect(e.unmold.minHours).toBeLessThan(8);
    expect(e.unmold.maxHours).toBeGreaterThan(10);
    expect(e.unmold.maxHours).toBeLessThan(16);
  });

  it('slow castile stays finite, wide, and hits the 2-week ceiling caveat', () => {
    const e = est({ hardnessScore: 14, gelMode: 'none', lyeConcentrationPercent: 28, superfatPercent: 8 })!;
    expect(e.unmold.maxHours).toBeGreaterThanOrEqual(WORKABILITY_TUNING.ceilingHours);
    expect(e.unmold.maxHours / e.unmold.minHours).toBeGreaterThanOrEqual(1.5);
    expect(e.caveats.some((c) => /castile/i.test(c))).toBe(true);
  });

  it('all-unsaturated (score 0, coverage high) is a real ~2-week bar, NOT null', () => {
    expect(est({ hardnessScore: 0, faCoverage: 95 })).not.toBeNull();
  });

  it('baseline composite is exactly 1.0 (band unchanged)', () => {
    const e = est()!;
    expect(e.unmold.minHours).toBe(12);
    expect(e.unmold.maxHours).toBe(36);
  });

  it('gel monotonic: forced < natural < none on every edge', () => {
    const f = est({ gelMode: 'forced' })!, n = est({ gelMode: 'natural' })!, o = est({ gelMode: 'none' })!;
    expect(f.unmold.minHours).toBeLessThan(n.unmold.minHours);
    expect(n.unmold.minHours).toBeLessThan(o.unmold.minHours);
  });

  it('ordering + min-width hold across a fuzz of 25k inputs', () => {
    for (let h = 0; h <= 60; h += 3)
      for (const lye of [22, 28, 33, 38, 44])
        for (const sf of [1, 3, 5, 8, 12])
          for (const g of ['none', 'natural', 'forced'] as const)
            for (const sl of [0, 1.5, 3, 50])
              for (const salt of [0, 0.5, 1, 5]) {
                const e = estimateWorkability({ ...base, hardnessScore: h, lyeConcentrationPercent: lye, superfatPercent: sf, gelMode: g, additives: [{ id: 'sodium-lactate', dosePercent: sl }, { id: 'salt', dosePercent: salt }] })!;
                expect(e.unmold.maxHours).toBeGreaterThanOrEqual(e.unmold.minHours * 1.5 - 1e-6);
                expect(e.unmold.minHours).toBeGreaterThanOrEqual(4 - 1e-9);
                expect(e.cut.minHours).toBeGreaterThanOrEqual(e.unmold.minHours);
                expect(e.stamp!.opensMinHours).toBeGreaterThanOrEqual(e.cut.maxHours - 1e-9);
              }
  });

  it('gates: ls→null, non-finite→null, cp coverage 0→null', () => {
    expect(est({ process: 'ls' })).toBeNull();
    expect(est({ lyeConcentrationPercent: NaN })).toBeNull();
    expect(est({ faCoverage: 0 })).toBeNull();
  });

  it('coverage 79.9→low, 80→moderate', () => {
    expect(est({ faCoverage: 79.9 })!.confidence).toBe('low');
    expect(est({ faCoverage: 80 })!.confidence).toBe('moderate');
  });

  it('HP: fixed 6–18h band, stamp null, never gated by coverage', () => {
    const e = est({ process: 'hp', faCoverage: 5 })!;
    expect(e.unmold).toEqual({ minHours: 6, maxHours: 18 });
    expect(e.stamp).toBeNull();
    expect(e.confidence).toBe('moderate');
  });

  it('displayed score is consistent with the band it lands in (no 44.6→"45" seam)', () => {
    // 44.6 sits in the <45 band, so the factor line must NOT show "45" (which would imply
    // the ≥45 band and a 3× faster range). floor() aligns the shown integer with the
    // half-open band lookup.
    const e = est({ hardnessScore: 44.6 })!;
    expect(e.factors).toContain('Hard-oil score 44');
    expect(e.factors).not.toContain('Hard-oil score 45');
    // and it really is the <45 band (36–72h base), not the ≥45 band (12–36h)
    expect(e.unmold.minHours).toBeCloseTo(36, 5);
    // whereas an exact 45 shows "45" and uses the ≥45 band
    const top = est({ hardnessScore: 45 })!;
    expect(top.factors).toContain('Hard-oil score 45');
    expect(top.unmold.minHours).toBeCloseTo(12, 5);
  });

  it('guards: unknown gelMode→natural; SL dose clamps; hardness clamps', () => {
    // @ts-expect-error deliberately invalid
    expect(est({ gelMode: 'bogus' })!.unmold).toEqual(est({ gelMode: 'natural' })!.unmold);
    // Prototype-chain hole: 'toString' passes an `in` check ('toString' in {}) === true,
    // turning the gel multiplier into a Function → NaN hours. Must fall back to natural.
    // @ts-expect-error deliberately invalid
    expect(est({ gelMode: 'toString' })!.unmold).toEqual(est({ gelMode: 'natural' })!.unmold);
    const clamped = est({ additives: [{ id: 'sodium-lactate', dosePercent: 50 }] })!;
    const atMax = est({ additives: [{ id: 'sodium-lactate', dosePercent: 3 }] })!;
    expect(clamped.unmold.minHours).toBeCloseTo(atMax.unmold.minHours, 5);
    expect(est({ hardnessScore: 200 })!.unmold.maxHours).toBe(36);
    expect(est({ hardnessScore: -5 })!.unmold.maxHours).toBe(336);
  });
});
