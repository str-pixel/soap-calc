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

  it('suppresses fatty-acid threshold insights below the low-coverage estimate threshold', () => {
    const profile = { linoleic: 20, linolenic: 10, oleic: 50 }; // poly = 30 > 28
    const base = {
      properties: null,
      fattyAcids: profile,
      totalOilGrams: 500,
      superfatPercent: 10,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 2,
      waterGrams: 200,
      lyeGrams: 100,
    };
    const covered = analyzeFormulation({ ...base, fattyAcidCoveragePercent: 100 });
    const lowCoverage = analyzeFormulation({ ...base, fattyAcidCoveragePercent: 10 });
    expect(covered.some((i) => i.code === 'high_poly_high_superfat')).toBe(true);
    // The panels show these as ~estimates below the threshold; the insight must not assert them.
    expect(lowCoverage.some((i) => i.code === 'high_poly_high_superfat')).toBe(false);
  });

  it('warns when split liquid at trace and water is not reduced', () => {
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: null,
      totalOilGrams: 1000,
      superfatPercent: 5,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 2,
      waterGrams: 330,
      lyeGrams: 100,
      splitLiquidEnabled: true,
      splitLiquidGrams: 200,
      splitLiquidAddAt: 'trace',
      suggestedLyeWaterGrams: 135,
    });
    expect(insights.some((i) => i.code === 'split_liquid_water_not_adjusted')).toBe(true);
  });

  it('does not warn when split liquid water is already reduced', () => {
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: null,
      totalOilGrams: 1000,
      superfatPercent: 5,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 1.35,
      waterGrams: 135,
      lyeGrams: 100,
      splitLiquidEnabled: true,
      splitLiquidGrams: 200,
      splitLiquidAddAt: 'trace',
      suggestedLyeWaterGrams: 135,
    });
    expect(insights.some((i) => i.code === 'split_liquid_water_not_adjusted')).toBe(false);
  });

  it('does not warn when split liquid is added in lye water', () => {
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: null,
      totalOilGrams: 1000,
      superfatPercent: 5,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 2,
      waterGrams: 330,
      lyeGrams: 100,
      splitLiquidEnabled: true,
      splitLiquidGrams: 200,
      splitLiquidAddAt: 'lye',
      suggestedLyeWaterGrams: 135,
    });
    expect(insights.some((i) => i.code === 'split_liquid_water_not_adjusted')).toBe(false);
  });

  it('warns when total additives and split liquid exceed 10%', () => {
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: null,
      totalOilGrams: 1000,
      superfatPercent: 5,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 2,
      waterGrams: 200,
      lyeGrams: 100,
      totalAdditivePercent: 12,
    });
    expect(insights.some((i) => i.code === 'high_total_additives')).toBe(true);
  });

  it('does not count split liquid in lye toward high total additives', () => {
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: null,
      totalOilGrams: 1000,
      superfatPercent: 5,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 2,
      waterGrams: 330,
      lyeGrams: 100,
      totalAdditivePercent: 5,
    });
    expect(insights.some((i) => i.code === 'high_total_additives')).toBe(false);
  });

  it('warns when trace split liquid adds significant liquid at minimum water', () => {
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: null,
      totalOilGrams: 1000,
      superfatPercent: 5,
      lyeConcentrationPercent: 50,
      waterLyeRatio: 1,
      waterGrams: 100,
      lyeGrams: 100,
      splitLiquidEnabled: true,
      splitLiquidGrams: 250,
      splitLiquidAddAt: 'trace',
      suggestedLyeWaterGrams: 100,
      splitLiquidWaterReductionGrams: 0,
    });
    expect(insights.some((i) => i.code === 'split_liquid_high_trace_liquid')).toBe(true);
    expect(insights.some((i) => i.code === 'split_liquid_water_not_adjusted')).toBe(false);
  });

  it('notes dual lye as advanced', () => {
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: null,
      totalOilGrams: 1000,
      superfatPercent: 5,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 2,
      waterGrams: 200,
      lyeGrams: 100,
      lyeType: 'dual',
      kohBlendPercent: 5,
    });
    expect(insights.some((i) => i.code === 'dual_lye_advanced')).toBe(true);
  });

  it('does not note dual lye when KOH blend is zero', () => {
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: null,
      totalOilGrams: 1000,
      superfatPercent: 5,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 2,
      waterGrams: 200,
      lyeGrams: 100,
      lyeType: 'dual',
      kohBlendPercent: 0,
    });
    expect(insights.some((i) => i.code === 'dual_lye_advanced')).toBe(false);
  });

  it('does not note dual lye for single-alkali recipes', () => {
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: null,
      totalOilGrams: 1000,
      superfatPercent: 5,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 2,
      waterGrams: 200,
      lyeGrams: 100,
      lyeType: 'naoh',
    });
    expect(insights.some((i) => i.code === 'dual_lye_advanced')).toBe(false);
  });

  it('detects jojoba additive by catalog id', () => {
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: null,
      totalOilGrams: 1000,
      superfatPercent: 5,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 2,
      waterGrams: 200,
      lyeGrams: 100,
      additiveEntries: [{ catalogId: 'jojoba', name: 'Wax ester' }],
    });
    expect(insights.some((i) => i.code === 'jojoba_superfat_note')).toBe(true);
  });

  it('detects jojoba additive by free-typed name', () => {
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: null,
      totalOilGrams: 1000,
      superfatPercent: 5,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 2,
      waterGrams: 200,
      lyeGrams: 100,
      additiveEntries: [{ catalogId: '', name: 'Golden jojoba oil' }],
    });
    expect(insights.some((i) => i.code === 'jojoba_superfat_note')).toBe(true);
  });

  it('detects oatmeal additive by free-typed name', () => {
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: null,
      totalOilGrams: 1000,
      superfatPercent: 5,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 2,
      waterGrams: 200,
      lyeGrams: 100,
      additiveEntries: [{ catalogId: '', name: 'Colloidal oatmeal' }],
    });
    expect(insights.some((i) => i.code === 'oatmeal_false_trace')).toBe(true);
  });

  it('detects jojoba in the recipe oil list', () => {
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: null,
      totalOilGrams: 1000,
      superfatPercent: 5,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 2,
      waterGrams: 200,
      lyeGrams: 100,
      oilEntries: [{ oilId: 'jojoba-oil', name: 'Jojoba Oil' }],
    });
    expect(insights.some((i) => i.code === 'jojoba_superfat_note')).toBe(true);
  });

  it('does not flag oatmeal from a fragrance additive name', () => {
    const insights = analyzeFormulation({
      properties: null,
      fattyAcids: null,
      totalOilGrams: 1000,
      superfatPercent: 5,
      lyeConcentrationPercent: 33,
      waterLyeRatio: 2,
      waterGrams: 200,
      lyeGrams: 100,
      additiveEntries: [{ catalogId: '', name: 'Oatmeal stout fragrance' }],
    });
    expect(insights.some((i) => i.code === 'oatmeal_false_trace')).toBe(false);
  });
});
