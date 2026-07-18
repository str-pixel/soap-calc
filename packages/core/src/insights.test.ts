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

describe('no-superfat-margin caustic guard (NaOH bar soap)', () => {
  it('warns a 0% superfat bar (no unsaponified-oil buffer)', () => {
    expect(has({ ...base, superfatPercent: 0, isLiquidSoap: false }, 'no_superfat_margin')).toBe(true);
  });

  it('does not fire once the bar carries any positive superfat', () => {
    expect(has({ ...base, superfatPercent: 5, isLiquidSoap: false }, 'no_superfat_margin')).toBe(false);
    expect(has({ ...base, superfatPercent: 1, isLiquidSoap: false }, 'no_superfat_margin')).toBe(false);
  });

  it('exempts liquid soap (KOH runs at/below 0% and is neutralized after cook)', () => {
    expect(has({ ...base, superfatPercent: 0, isLiquidSoap: true }, 'no_superfat_margin')).toBe(false);
  });

  it('does not fire without an active recipe (no lye)', () => {
    expect(has({ ...base, superfatPercent: 0, lyeGrams: 0, isLiquidSoap: false }, 'no_superfat_margin')).toBe(false);
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
