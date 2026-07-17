import { describe, expect, it } from 'vitest';
import { analyzeFormulation, type FormulationAnalysisInput } from './insights.js';

const base: FormulationAnalysisInput = {
  properties: null,
  fattyAcids: null,
  totalOilGrams: 1000,
  superfatPercent: 0,
  lyeConcentrationPercent: 33,
  waterLyeRatio: 2,
  waterGrams: 300,
  lyeGrams: 140,
};

const has = (input: FormulationAnalysisInput, code: string) =>
  analyzeFormulation(input).some((i) => i.code === code);

describe('lye-excess warning (negative superfat)', () => {
  it('fires for a negative superfat even when the recipe is not flagged as liquid soap', () => {
    // A caustic recipe from any caller must still surface the neutralization guidance,
    // not only the LS UI path.
    expect(has({ ...base, superfatPercent: -2, isLiquidSoap: false }, 'ls_lye_excess')).toBe(true);
  });

  it('fires for a negative-superfat liquid soap', () => {
    expect(has({ ...base, superfatPercent: -2, isLiquidSoap: true }, 'ls_lye_excess')).toBe(true);
  });

  it('does not fire at zero or positive superfat', () => {
    expect(has({ ...base, superfatPercent: 0 }, 'ls_lye_excess')).toBe(false);
    expect(has({ ...base, superfatPercent: 5 }, 'ls_lye_excess')).toBe(false);
  });
});

describe('bar-soap lye-concentration warnings are exempt for liquid soap', () => {
  it('warns on a high concentration for a bar recipe', () => {
    expect(has({ ...base, lyeConcentrationPercent: 45 }, 'lye_conc_high')).toBe(true);
  });

  it('does not warn on the same concentration for liquid soap', () => {
    expect(has({ ...base, lyeConcentrationPercent: 45, isLiquidSoap: true }, 'lye_conc_high')).toBe(
      false,
    );
  });
});

const CP_BAND = { lowTier: [20, 28] as [number, number], highTier: [32, 40] as [number, number], riversAbove: 38 };

function waterInput(waterGrams: number, totalOilGrams = 1000, extra = {}) {
  return {
    properties: null,
    fattyAcids: null,
    totalOilGrams,
    superfatPercent: 5,
    lyeConcentrationPercent: 0,
    waterLyeRatio: 0,
    waterGrams,
    lyeGrams: 140,
    isLiquidSoap: false,
    waterBand: CP_BAND,
    ...extra,
  };
}

describe('two-tier water coaching', () => {
  it('warns when water is above the rivers threshold', () => {
    // 42% of 1000 g oils = 420 g > 38% rivers
    const codes = analyzeFormulation(waterInput(420)).map((i) => i.code);
    expect(codes).toContain('water_band_rivers');
  });

  it('flags water sitting in the gap between the low and full-water tiers', () => {
    // 30% is between highTier[0]=32 ... no; 30 is between lowTier[1]=28 and highTier[0]=32
    const codes = analyzeFormulation(waterInput(300)).map((i) => i.code);
    expect(codes).toContain('water_band_between_tiers');
  });

  it('is quiet when water sits within the low tier (25%) or high tier (35%)', () => {
    expect(analyzeFormulation(waterInput(250)).map((i) => i.code)).not.toContain('water_band_between_tiers');
    expect(analyzeFormulation(waterInput(350)).map((i) => i.code)).not.toContain('water_band_between_tiers');
    expect(analyzeFormulation(waterInput(350)).map((i) => i.code)).not.toContain('water_band_rivers');
  });

  it('notes very low water below the low tier', () => {
    const codes = analyzeFormulation(waterInput(180)).map((i) => i.code); // 18% < 20
    expect(codes).toContain('water_band_below_low');
  });

  it('emits no water-band insight for liquid soap even if a band is supplied', () => {
    const codes = analyzeFormulation(waterInput(420, 1000, { isLiquidSoap: true })).map((i) => i.code);
    expect(codes).not.toContain('water_band_rivers');
  });
});

describe('superfat + PUFA cap bands (CP)', () => {
  const base = {
    properties: null, totalOilGrams: 1000, lyeConcentrationPercent: 0,
    waterLyeRatio: 0, waterGrams: 330, lyeGrams: 140, isLiquidSoap: false,
    fattyAcidCoveragePercent: 100,
  };
  it('warns when PUFA is above the cap and superfat exceeds 5%', () => {
    const codes = analyzeFormulation({
      ...base, superfatPercent: 8,
      fattyAcids: { linoleic: 20, linolenic: 2, oleic: 40 },
    }).map((i) => i.code);
    expect(codes).toContain('pufa_cap_superfat');
  });
  it('does not fire the PUFA cap at a modest superfat even with high PUFA', () => {
    const codes = analyzeFormulation({
      ...base, superfatPercent: 4,
      fattyAcids: { linoleic: 20, linolenic: 2, oleic: 40 },
    }).map((i) => i.code);
    expect(codes).not.toContain('pufa_cap_superfat');
  });
  it('flags superfat outside the 3–30% usable band', () => {
    const low = analyzeFormulation({ ...base, superfatPercent: 1, fattyAcids: { oleic: 60 } }).map((i) => i.code);
    const high = analyzeFormulation({ ...base, superfatPercent: 35, fattyAcids: { oleic: 60 } }).map((i) => i.code);
    expect(low).toContain('superfat_out_of_band');
    expect(high).toContain('superfat_out_of_band');
  });
  it('is quiet on a normal 5% superfat within band', () => {
    const codes = analyzeFormulation({ ...base, superfatPercent: 5, fattyAcids: { oleic: 60 } }).map((i) => i.code);
    expect(codes).not.toContain('superfat_out_of_band');
  });
  it('does not fire either CP superfat band for liquid soap', () => {
    const codes = analyzeFormulation({
      ...base, isLiquidSoap: true, superfatPercent: 35, fattyAcids: { linoleic: 25, oleic: 40 },
    }).map((i) => i.code);
    expect(codes).not.toContain('superfat_out_of_band');
    expect(codes).not.toContain('pufa_cap_superfat');
  });

  it('fires only pufa_cap_superfat (not high_poly_high_superfat) on a moderate PUFA/superfat case', () => {
    // PUFA 20 < 28 and superfat 6 < 8, so the existing shelf-life insight stays quiet
    // while the new superfat-ceiling coaching fires (PUFA 20 > 18, superfat 6 > 5).
    const codes = analyzeFormulation({
      ...base, superfatPercent: 6,
      fattyAcids: { linoleic: 18, linolenic: 2, oleic: 40 },
    }).map((i) => i.code);
    expect(codes).toContain('pufa_cap_superfat');
    expect(codes).not.toContain('high_poly_high_superfat');
  });

  it('allows both pufa_cap_superfat and high_poly_high_superfat to co-fire on an extreme recipe', () => {
    // PUFA 35 > 28 and superfat 10 >= 8 trips the shelf-life note; PUFA 35 > 18 and
    // superfat 10 > 5 also trips the superfat-ceiling coaching. Both are legitimate here.
    const codes = analyzeFormulation({
      ...base, superfatPercent: 10,
      fattyAcids: { linoleic: 30, linolenic: 5, oleic: 20 },
    }).map((i) => i.code);
    expect(codes).toContain('pufa_cap_superfat');
    expect(codes).toContain('high_poly_high_superfat');
  });
});

describe('property-score exceptions', () => {
  const base = {
    fattyAcids: null, totalOilGrams: 1000, lyeConcentrationPercent: 0,
    waterLyeRatio: 0, waterGrams: 330, lyeGrams: 140, isLiquidSoap: false,
    propertyCoveragePercent: 100, fattyAcidCoveragePercent: 100,
  };
  const props = (over: Partial<Record<string, number>>) => ({
    bubbly: 10, cleansing: 0, condition: 65, hardness: 30, longevity: 30, creamy: 30, ...over,
  });

  it('notes that near-zero cleansing is expected for an olive-dominant bar', () => {
    const codes = analyzeFormulation({
      ...base, superfatPercent: 5,
      properties: props({ cleansing: 2 }),
      fattyAcids: { oleic: 72 },
    }).map((i) => i.code);
    expect(codes).toContain('low_cleansing_expected');
  });

  it('does not flag a high-coconut bar as stripping when superfat is generous', () => {
    const codes = analyzeFormulation({
      ...base, superfatPercent: 8,
      properties: props({ cleansing: 30 }),
      fattyAcids: { lauric: 40, myristic: 15 },
    }).map((i) => i.code);
    expect(codes).not.toContain('high_cleansing_low_superfat');
  });

  it('suppresses the low-cleansing note for liquid soap (cleansing means solubility there)', () => {
    const codes = analyzeFormulation({
      ...base, isLiquidSoap: true, superfatPercent: 2,
      properties: props({ cleansing: 1 }),
      fattyAcids: { oleic: 72 },
    }).map((i) => i.code);
    expect(codes).not.toContain('low_cleansing_expected');
  });
});
