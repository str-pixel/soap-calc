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
