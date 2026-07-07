import { describe, expect, it } from 'vitest';
import { calculateRecipeFattyAcids, sumFattyAcids } from './fatty-acids.js';
import { analyzeFormulation } from './insights.js';
import { formatPropertyRangePercent, formatSoapPropertyPercent } from './property-display.js';

const COCONUT_FA = {
  lauric: 48,
  myristic: 19,
  palmitic: 9,
  stearic: 2,
  oleic: 6,
  linoleic: 2,
};

const OLIVE_FA = {
  oleic: 71,
  palmitic: 13,
  stearic: 3,
  linoleic: 10,
  linolenic: 1,
};

describe('property-display', () => {
  it('formats soap property values as percent', () => {
    expect(formatSoapPropertyPercent(42.37)).toBe('42.4%');
    expect(formatPropertyRangePercent(29, 54)).toBe('29–54%');
  });
});

describe('calculateRecipeFattyAcids', () => {
  const lookup = {
    'coconut-oil-76': {
      id: 'coconut-oil-76',
      propertiesAvailable: true,
      fattyAcids: COCONUT_FA,
    },
    'olive-oil': {
      id: 'olive-oil',
      propertiesAvailable: true,
      fattyAcids: OLIVE_FA,
    },
  };

  it('returns weighted fatty acid profile', () => {
    const result = calculateRecipeFattyAcids(
      [
        { oilId: 'coconut-oil-76', weightGrams: 250 },
        { oilId: 'olive-oil', weightGrams: 750 },
      ],
      lookup,
    );
    expect(result.coveragePercent).toBe(100);
    expect(result.profile).not.toBeNull();
    expect(result.profile!.oleic).toBeCloseTo(54.75, 1);
  });
});

describe('analyzeFormulation', () => {
  it('warns when water is below lye', () => {
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: null,
      totalOilGrams: 1000,
      superfatPercent: 5,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 0.8,
      waterGrams: 80,
      lyeGrams: 100,
    });
    expect(insights.some((i) => i.code === 'water_below_lye')).toBe(true);
  });

  it('notes large test batches', () => {
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: null,
      totalOilGrams: 600,
      superfatPercent: 5,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 2,
      waterGrams: 200,
      lyeGrams: 100,
    });
    expect(insights.some((i) => i.code === 'large_test_batch')).toBe(true);
  });

  it('flags high polyunsaturated with high superfat', () => {
    const profile = { linoleic: 20, linolenic: 10, oleic: 50 };
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: profile,
      totalOilGrams: 500,
      superfatPercent: 10,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 2,
      waterGrams: 200,
      lyeGrams: 100,
    });
    expect(insights.some((i) => i.code === 'high_poly_high_superfat')).toBe(true);
    expect(sumFattyAcids(profile, ['linoleic', 'linolenic'])).toBe(30);
  });
});
