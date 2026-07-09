import { describe, expect, it } from 'vitest';
import {
  calculateLye,
  lyeForOilLine,
  sapCoefficientForLye,
  shouldIncludeOilInLye,
  type OilForLyeCalc,
} from './lye.js';

const OLIVE: OilForLyeCalc = {
  id: 'olive-oil',
  sapKoh: 0.19,
  sapNaoh: 0.19 / 1.4025,
  category: 'triglyceride',
};

const BIRCH_TAR: OilForLyeCalc = {
  id: 'birch-tar',
  sapKoh: 0.06,
  sapNaoh: 0.06 / 1.4025,
  category: 'tar',
  sapRole: 'acid_neutralization',
};

describe('sapCoefficientForLye', () => {
  it('returns sapNaoh for NaOH bar soap at 100% purity', () => {
    expect(sapCoefficientForLye(OLIVE, 'naoh')).toBeCloseTo(0.13547, 4);
  });

  it('returns sapKoh adjusted for KOH purity', () => {
    expect(
      sapCoefficientForLye(OLIVE, 'koh', { kohPurityPercent: 90 }),
    ).toBeCloseTo(0.19 / 0.9, 4);
  });

  it('returns 0 when purity is zero', () => {
    expect(sapCoefficientForLye(OLIVE, 'naoh', { naohPurityPercent: 0 })).toBe(0);
    expect(sapCoefficientForLye(OLIVE, 'koh', { kohPurityPercent: 0 })).toBe(0);
  });
});

describe('calculateLye', () => {
  it('calculates olive oil NaOH with 5% superfat', () => {
    const result = calculateLye({
      oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
      oilLookup: { 'olive-oil': OLIVE },
      superfatPercent: 5,
      lyeType: 'naoh',
      waterMode: 'percent_of_oils',
      waterPercentOfOils: 38,
    });

    expect(result.lyeWeightGrams).toBeCloseTo(128.7, 0);
    expect(result.naohWeightGrams).toBeCloseTo(128.7, 0);
    expect(result.kohWeightGrams).toBe(0);
    expect(result.waterWeightGrams).toBeCloseTo(380, 0);
    expect(result.totalOilWeightGrams).toBe(1000);
    expect(result.lines[0].includedInLye).toBe(true);
  });

  it('includes birch tar in lye by default', () => {
    const result = calculateLye({
      oils: [
        { oilId: 'olive-oil', weightGrams: 900 },
        { oilId: 'birch-tar', weightGrams: 100 },
      ],
      oilLookup: { 'olive-oil': OLIVE, 'birch-tar': BIRCH_TAR },
      superfatPercent: 5,
      lyeType: 'naoh',
    });

    const oliveOnly = 900 * (0.19 / 1.4025) * 0.95;
    const tarPart = 100 * (0.06 / 1.4025) * 0.95;
    expect(result.lyeWeightGrams).toBeCloseTo(oliveOnly + tarPart, 1);
    expect(result.lines.find((l) => l.oilId === 'birch-tar')?.includedInLye).toBe(true);
    expect(result.warnings.some((w) => w.includes('birch-tar'))).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports error for unknown oil id but still calculates valid lines', () => {
    const result = calculateLye({
      oils: [
        { oilId: 'missing-oil', weightGrams: 500 },
        { oilId: 'olive-oil', weightGrams: 500 },
      ],
      oilLookup: { 'olive-oil': OLIVE },
      superfatPercent: 5,
      lyeType: 'naoh',
    });

    expect(result.errors).toContain('Unknown oil id: missing-oil');
    expect(result.totalOilWeightGrams).toBe(500);
    expect(result.lyeWeightGrams).toBeCloseTo(500 * (0.19 / 1.4025) * 0.95, 0);
  });

  it('reports error for invalid superfat', () => {
    const result = calculateLye({
      oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
      oilLookup: { 'olive-oil': OLIVE },
      superfatPercent: 120,
      lyeType: 'naoh',
    });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.lyeWeightGrams).toBe(0);
  });

  it('deduplicates tar warnings for the same oil', () => {
    const result = calculateLye({
      oils: [
        { oilId: 'birch-tar', weightGrams: 50 },
        { oilId: 'birch-tar', weightGrams: 50 },
      ],
      oilLookup: { 'birch-tar': BIRCH_TAR },
      superfatPercent: 5,
      lyeType: 'naoh',
    });

    const tarWarnings = result.warnings.filter((w) => w.includes('birch-tar'));
    expect(tarWarnings).toHaveLength(1);
  });

  it('excludes birch tar from lye when tarLyeTreatment is additive', () => {
    const result = calculateLye({
      oils: [
        { oilId: 'olive-oil', weightGrams: 900 },
        { oilId: 'birch-tar', weightGrams: 100, tarLyeTreatment: 'additive' },
      ],
      oilLookup: { 'olive-oil': OLIVE, 'birch-tar': BIRCH_TAR },
      superfatPercent: 5,
      lyeType: 'naoh',
    });

    const oliveOnly = 900 * (0.19 / 1.4025) * 0.95;
    expect(result.lyeWeightGrams).toBeCloseTo(oliveOnly, 1);
    expect(lyeForOilLine(BIRCH_TAR, { oilId: 'birch-tar', weightGrams: 100, tarLyeTreatment: 'additive' }, 'naoh', 5, {}).lyeGrams).toBe(0);
    expect(shouldIncludeOilInLye(BIRCH_TAR, { oilId: 'birch-tar', weightGrams: 100, tarLyeTreatment: 'additive' })).toBe(false);
  });

  it('computes water from lye concentration', () => {
    const result = calculateLye({
      oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
      oilLookup: { 'olive-oil': OLIVE },
      superfatPercent: 5,
      lyeType: 'naoh',
      waterMode: 'lye_concentration',
      lyeConcentrationPercent: 33.33,
    });

    expect(result.waterWeightGrams).toBeCloseTo(result.lyeWeightGrams * 2, 0);
    expect(result.lyeConcentrationPercent).toBeCloseTo(33.33, 0);
  });

  it('rejects zero NaOH purity', () => {
    const result = calculateLye({
      oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
      oilLookup: { 'olive-oil': OLIVE },
      superfatPercent: 5,
      lyeType: 'naoh',
      naohPurityPercent: 0,
    });

    expect(result.errors.some((e) => e.includes('naohPurityPercent'))).toBe(true);
    expect(result.lyeWeightGrams).toBe(0);
  });

  it('warns for wax oils in lye calc', () => {
    const beeswax: OilForLyeCalc = {
      id: 'beeswax',
      sapKoh: 0.094,
      sapNaoh: 0.094 / 1.4025,
      category: 'wax',
    };
    const result = calculateLye({
      oils: [{ oilId: 'beeswax', weightGrams: 100 }],
      oilLookup: { beeswax },
      superfatPercent: 5,
      lyeType: 'naoh',
    });

    expect(result.warnings.some((w) => w.includes('beeswax') && w.includes('wax'))).toBe(true);
  });

  it('rejects non-finite superfat', () => {
    const result = calculateLye({
      oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
      oilLookup: { 'olive-oil': OLIVE },
      superfatPercent: Number.NaN,
      lyeType: 'naoh',
    });

    expect(result.errors.some((e) => e.includes('superfatPercent'))).toBe(true);
    expect(result.lyeWeightGrams).toBe(0);
  });

  it('rejects negative water percent of oils', () => {
    const result = calculateLye({
      oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
      oilLookup: { 'olive-oil': OLIVE },
      superfatPercent: 5,
      lyeType: 'naoh',
      waterPercentOfOils: -10,
    });

    expect(result.errors.some((e) => e.includes('waterPercentOfOils'))).toBe(true);
    expect(result.waterWeightGrams).toBe(0);
  });

  it('rejects non-finite lye concentration', () => {
    const result = calculateLye({
      oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
      oilLookup: { 'olive-oil': OLIVE },
      superfatPercent: 5,
      lyeType: 'naoh',
      waterMode: 'lye_concentration',
      lyeConcentrationPercent: Number.NaN,
    });

    expect(result.errors.some((e) => e.includes('lyeConcentrationPercent'))).toBe(true);
    expect(result.waterWeightGrams).toBe(0);
  });

  it('rejects invalid lye : water ratio', () => {
    const result = calculateLye({
      oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
      oilLookup: { 'olive-oil': OLIVE },
      superfatPercent: 5,
      lyeType: 'naoh',
      waterMode: 'lye_water_ratio',
      lyeWaterRatio: 0,
    });

    expect(result.errors.some((e) => e.includes('lyeWaterRatio'))).toBe(true);
    expect(result.waterWeightGrams).toBe(0);
  });

  it('rejects non-finite line weights', () => {
    const result = calculateLye({
      oils: [{ oilId: 'olive-oil', weightGrams: Number.NaN }],
      oilLookup: { 'olive-oil': OLIVE },
      superfatPercent: 5,
      lyeType: 'naoh',
    });

    expect(result.errors.some((e) => e.includes('Invalid weight'))).toBe(true);
    expect(result.totalOilWeightGrams).toBe(0);
  });

  it('dual NaOH + KOH blend conserves saponification moles and holds the mass split', () => {
    const NAOH_MM = 40;
    const KOH_MM = 56.1;
    const base = {
      oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
      oilLookup: { 'olive-oil': OLIVE },
      superfatPercent: 5,
      naohPurityPercent: 100,
      kohPurityPercent: 90,
    };
    const molesNeeded = calculateLye({ ...base, lyeType: 'naoh' }).lyeWeightGrams / NAOH_MM;
    const result = calculateLye({ ...base, lyeType: 'dual', kohBlendPercent: 5 });
    // Pure-alkali moles delivered (crude grams x purity / molar mass) must saponify the oil.
    const molesProvided =
      (result.naohWeightGrams * 1.0) / NAOH_MM + (result.kohWeightGrams * 0.9) / KOH_MM;
    expect(molesProvided).toBeCloseTo(molesNeeded, 4);
    expect((result.kohWeightGrams / result.lyeWeightGrams) * 100).toBeCloseTo(5, 1);
    expect(result.lines[0].naohGrams).toBe(result.naohWeightGrams);
    expect(result.lines[0].kohGrams).toBe(result.kohWeightGrams);
  });

  it('dual lye conserves saponification moles across the NaOH+KOH split', () => {
    const NAOH_MM = 40;
    const KOH_MM = 56.1;
    const base = {
      oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
      oilLookup: { 'olive-oil': OLIVE },
      superfatPercent: 5,
      naohPurityPercent: 100,
      kohPurityPercent: 100,
    };
    const molesNeeded = calculateLye({ ...base, lyeType: 'naoh' }).lyeWeightGrams / NAOH_MM;
    for (const kohBlendPercent of [0, 5, 25, 50]) {
      const r = calculateLye({ ...base, lyeType: 'dual', kohBlendPercent });
      const molesProvided = r.naohWeightGrams / NAOH_MM + r.kohWeightGrams / KOH_MM;
      expect(molesProvided).toBeCloseTo(molesNeeded, 6);
      expect((r.kohWeightGrams / r.lyeWeightGrams) * 100).toBeCloseTo(kohBlendPercent, 4);
    }
  });

  it('dual lye at 0% KOH equals the NaOH-only result', () => {
    const base = {
      oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
      oilLookup: { 'olive-oil': OLIVE },
      superfatPercent: 5,
      naohPurityPercent: 100,
      kohPurityPercent: 100,
    };
    const naohOnly = calculateLye({ ...base, lyeType: 'naoh' });
    const dual0 = calculateLye({ ...base, lyeType: 'dual', kohBlendPercent: 0 });
    expect(dual0.naohWeightGrams).toBeCloseTo(naohOnly.lyeWeightGrams, 6);
    expect(dual0.kohWeightGrams).toBeCloseTo(0, 6);
  });

  it('rejects invalid koh blend percent for dual lye', () => {
    const result = calculateLye({
      oils: [{ oilId: 'olive-oil', weightGrams: 1000 }],
      oilLookup: { 'olive-oil': OLIVE },
      superfatPercent: 5,
      lyeType: 'dual',
      kohBlendPercent: 60,
    });

    expect(result.errors.some((e) => e.includes('kohBlendPercent'))).toBe(true);
  });

  it('calculates dual lye for a multi-oil recipe', () => {
    const COCONUT: OilForLyeCalc = {
      id: 'coconut-oil-76',
      sapKoh: 0.257,
      sapNaoh: 0.257 / 1.4025,
      category: 'triglyceride',
    };
    const result = calculateLye({
      oils: [
        { oilId: 'olive-oil', weightGrams: 700 },
        { oilId: 'coconut-oil-76', weightGrams: 300 },
      ],
      oilLookup: { 'olive-oil': OLIVE, 'coconut-oil-76': COCONUT },
      superfatPercent: 5,
      lyeType: 'dual',
      kohBlendPercent: 10,
      naohPurityPercent: 100,
      kohPurityPercent: 90,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.totalOilWeightGrams).toBe(1000);
    expect(result.lines).toHaveLength(2);

    const oliveLine = result.lines.find((line) => line.oilId === 'olive-oil')!;
    const coconutLine = result.lines.find((line) => line.oilId === 'coconut-oil-76')!;
    expect(oliveLine.naohGrams + coconutLine.naohGrams).toBeCloseTo(
      result.naohWeightGrams,
      4,
    );
    expect(oliveLine.kohGrams + coconutLine.kohGrams).toBeCloseTo(result.kohWeightGrams, 4);
    expect((result.kohWeightGrams / result.lyeWeightGrams) * 100).toBeCloseTo(10, 1);
  });
});
