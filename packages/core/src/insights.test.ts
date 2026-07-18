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

  it('suppresses the low-cleansing note when fatty-acid coverage is low, even with adequate property coverage', () => {
    // propertyCoveragePercent is fine (100), but fattyAcidCoveragePercent is below the
    // LOW_COVERAGE_PERCENT gate — the renormalized oleic reading is unrepresentative.
    const codes = analyzeFormulation({
      ...base, superfatPercent: 5, fattyAcidCoveragePercent: 50,
      properties: props({ cleansing: 2 }),
      fattyAcids: { oleic: 72 },
    }).map((i) => i.code);
    expect(codes).not.toContain('low_cleansing_expected');
  });
});

describe('trace-speed insight', () => {
  it('carries the label and a matching tip in the message', () => {
    const results = analyzeFormulation({ ...base, traceSpeedLabel: 'fast' });
    const insight = results.find((i) => i.code === 'trace_speed');
    expect(insight?.level).toBe('info');
    expect(insight?.message).toContain('fast');
    expect(insight?.message).toContain('quick trace');
  });

  it('emits a slow-trace tip for the slow label', () => {
    const results = analyzeFormulation({ ...base, traceSpeedLabel: 'slow' });
    const insight = results.find((i) => i.code === 'trace_speed');
    expect(insight?.message).toContain('slow trace');
  });

  it('emits a moderate-trace tip for the moderate label', () => {
    const results = analyzeFormulation({ ...base, traceSpeedLabel: 'moderate' });
    const insight = results.find((i) => i.code === 'trace_speed');
    expect(insight?.message).toContain('moderate trace');
  });

  it('is absent when no label is provided', () => {
    const codes = analyzeFormulation({ ...base }).map((i) => i.code);
    expect(codes).not.toContain('trace_speed');
  });

  it('is suppressed for liquid soap even when a label is supplied', () => {
    const codes = analyzeFormulation({
      ...base,
      isLiquidSoap: true,
      traceSpeedLabel: 'fast',
    }).map((i) => i.code);
    expect(codes).not.toContain('trace_speed');
  });

  it('appends the drivers when supplied alongside the label', () => {
    const results = analyzeFormulation({
      ...base,
      traceSpeedLabel: 'fast',
      traceSpeedDrivers: ['high saturated fats', 'sugar additive'],
    });
    const insight = results.find((i) => i.code === 'trace_speed');
    expect(insight?.message).toContain('Driven by: high saturated fats, sugar additive.');
  });

  it('omits the drivers clause when the drivers list is empty or absent', () => {
    const withEmpty = analyzeFormulation({
      ...base,
      traceSpeedLabel: 'moderate',
      traceSpeedDrivers: [],
    }).find((i) => i.code === 'trace_speed');
    const withUndefined = analyzeFormulation({
      ...base,
      traceSpeedLabel: 'moderate',
    }).find((i) => i.code === 'trace_speed');
    expect(withEmpty?.message).not.toContain('Driven by');
    expect(withUndefined?.message).not.toContain('Driven by');
  });
});

describe('HP-gated insights (process discriminator)', () => {
  it('hp_thick_phase_suppressant fires for HP + salt additive', () => {
    const codes = analyzeFormulation({
      ...base,
      process: 'hp',
      additiveEntries: [{ catalogId: 'salt', name: 'Table salt (NaCl)' }],
    }).map((i) => i.code);
    expect(codes).toContain('hp_thick_phase_suppressant');
  });

  it('hp_thick_phase_suppressant fires for HP + sodium-lactate additive', () => {
    const codes = analyzeFormulation({
      ...base,
      process: 'hp',
      additiveEntries: [{ catalogId: 'sodium-lactate', name: 'Sodium lactate' }],
    }).map((i) => i.code);
    expect(codes).toContain('hp_thick_phase_suppressant');
  });

  it('does NOT fire hp_thick_phase_suppressant for a CP recipe carrying salt (gating regression)', () => {
    // This is the exact gap the process discriminator exists to close: !isLiquidSoap
    // would wrongly include CP here. CP recipes never pass isLiquidSoap, so a check
    // gated only on !isLiquidSoap would fire for CP too — process:'cp' must suppress it.
    const codes = analyzeFormulation({
      ...base,
      process: 'cp',
      isLiquidSoap: false,
      additiveEntries: [{ catalogId: 'salt', name: 'Table salt (NaCl)' }],
    }).map((i) => i.code);
    expect(codes).not.toContain('hp_thick_phase_suppressant');
  });

  it('does not fire hp_thick_phase_suppressant for HP without salt/sodium-lactate', () => {
    const codes = analyzeFormulation({
      ...base,
      process: 'hp',
      additiveEntries: [{ catalogId: 'honey', name: 'Honey' }],
    }).map((i) => i.code);
    expect(codes).not.toContain('hp_thick_phase_suppressant');
  });

  it('hp_yogurt_water warns above 5% (boundary: 6 fires, 4 does not)', () => {
    const above = analyzeFormulation({ ...base, process: 'hp', hpYogurtPercent: 6 }).map(
      (i) => i.code,
    );
    const below = analyzeFormulation({ ...base, process: 'hp', hpYogurtPercent: 4 }).map(
      (i) => i.code,
    );
    expect(above).toContain('hp_yogurt_water');
    expect(below).not.toContain('hp_yogurt_water');
  });

  it('does not fire hp_yogurt_water for CP even above 5%', () => {
    const codes = analyzeFormulation({ ...base, process: 'cp', hpYogurtPercent: 6 }).map(
      (i) => i.code,
    );
    expect(codes).not.toContain('hp_yogurt_water');
  });

  it('hp_relaxed_caps fires for HP + elevated castor (ricinoleic proxy >= 10%)', () => {
    const codes = analyzeFormulation({
      ...base,
      process: 'hp',
      fattyAcids: { ricinoleic: 12 },
      fattyAcidCoveragePercent: 90,
    }).map((i) => i.code);
    expect(codes).toContain('hp_relaxed_caps');
  });

  it('hp_relaxed_caps fires for HP + shea present, even with low castor', () => {
    const codes = analyzeFormulation({
      ...base,
      process: 'hp',
      fattyAcids: { ricinoleic: 0 },
      fattyAcidCoveragePercent: 90,
      oilEntries: [{ oilId: 'shea-butter', name: 'Shea butter' }],
    }).map((i) => i.code);
    expect(codes).toContain('hp_relaxed_caps');
  });

  it('does not fire hp_relaxed_caps below the low fatty-acid coverage gate', () => {
    const codes = analyzeFormulation({
      ...base,
      process: 'hp',
      fattyAcids: { ricinoleic: 12 },
      fattyAcidCoveragePercent: 50,
    }).map((i) => i.code);
    expect(codes).not.toContain('hp_relaxed_caps');
  });

  it('does not fire any HP insight for CP or LS even with the same triggers present', () => {
    const cpCodes = analyzeFormulation({
      ...base,
      process: 'cp',
      hpYogurtPercent: 8,
      fattyAcids: { ricinoleic: 15 },
      fattyAcidCoveragePercent: 90,
      additiveEntries: [{ catalogId: 'salt', name: 'Table salt (NaCl)' }],
    }).map((i) => i.code);
    const lsCodes = analyzeFormulation({
      ...base,
      process: 'ls',
      isLiquidSoap: true,
      hpYogurtPercent: 8,
      fattyAcids: { ricinoleic: 15 },
      fattyAcidCoveragePercent: 90,
      additiveEntries: [{ catalogId: 'salt', name: 'Table salt (NaCl)' }],
    }).map((i) => i.code);
    for (const codes of [cpCodes, lsCodes]) {
      expect(codes).not.toContain('hp_thick_phase_suppressant');
      expect(codes).not.toContain('hp_yogurt_water');
      expect(codes).not.toContain('hp_relaxed_caps');
    }
  });
});

describe('sugar_total_high warning (total sugar-family additives, verified ceiling 4%)', () => {
  it('fires above 4% total sugar-family additive dose', () => {
    expect(has({ ...base, sugarTotalPercent: 5 }, 'sugar_total_high')).toBe(true);
  });

  it('does not fire at exactly 4% (boundary)', () => {
    expect(has({ ...base, sugarTotalPercent: 4 }, 'sugar_total_high')).toBe(false);
  });

  it('does not fire at 3%', () => {
    expect(has({ ...base, sugarTotalPercent: 3 }, 'sugar_total_high')).toBe(false);
  });

  it('does not fire when sugarTotalPercent is not provided', () => {
    expect(has({ ...base }, 'sugar_total_high')).toBe(false);
  });

  it('emits a single message on the total, not one per additive', () => {
    const matches = analyzeFormulation({ ...base, sugarTotalPercent: 6 }).filter(
      (i) => i.code === 'sugar_total_high',
    );
    expect(matches).toHaveLength(1);
  });
});

describe('ls_salt_thickening advisory (qualitative, LS-only)', () => {
  const lsBase: FormulationAnalysisInput = {
    ...base,
    process: 'ls',
    isLiquidSoap: true,
    fattyAcidCoveragePercent: 100,
    additiveEntries: [{ catalogId: 'salt', name: 'Table salt (NaCl)' }],
  };

  it('fires for LS + salt additive', () => {
    const normal = analyzeFormulation({ ...lsBase, fattyAcids: { oleic: 60 } }).find(
      (i) => i.code === 'ls_salt_thickening',
    );
    expect(normal).toBeTruthy();
    expect(normal?.level).toBe('info');
  });

  it('does not carry a coconut caveat for a non-coconut-heavy profile', () => {
    const normal = analyzeFormulation({ ...lsBase, fattyAcids: { oleic: 60 } }).find(
      (i) => i.code === 'ls_salt_thickening',
    );
    expect(normal?.message).not.toMatch(/coconut/i);
  });

  it('appends a coconut caveat when coconut-heavy (lauric+myristic proxy >= 55%)', () => {
    const coconut = analyzeFormulation({
      ...lsBase,
      fattyAcids: { lauric: 45, myristic: 12 },
    }).find((i) => i.code === 'ls_salt_thickening');
    expect(coconut?.message).toMatch(/coconut|barely|little/i);
  });

  it('does not append the coconut caveat below the fatty-acid coverage gate', () => {
    const belowCoverage = analyzeFormulation({
      ...lsBase,
      fattyAcidCoveragePercent: 50,
      fattyAcids: { lauric: 45, myristic: 12 },
    }).find((i) => i.code === 'ls_salt_thickening');
    expect(belowCoverage?.message).not.toMatch(/coconut/i);
  });

  it('does not fire for a non-salt LS additive', () => {
    const codes = analyzeFormulation({
      ...lsBase,
      additiveEntries: [{ catalogId: 'honey', name: 'Honey' }],
      fattyAcids: { oleic: 60 },
    }).map((i) => i.code);
    expect(codes).not.toContain('ls_salt_thickening');
  });

  it('does not fire for CP even with salt (LS-only gate)', () => {
    expect(
      analyzeFormulation({
        ...lsBase,
        process: 'cp',
        isLiquidSoap: false,
        fattyAcids: { oleic: 60 },
      }).some((i) => i.code === 'ls_salt_thickening'),
    ).toBe(false);
  });

  it('ships the salt advisory with no numeric viscosity/peak claims', () => {
    const insight = analyzeFormulation({
      ...lsBase,
      fattyAcids: { lauric: 45, myristic: 12 },
    }).find((i) => i.code === 'ls_salt_thickening');
    expect(insight?.message).not.toMatch(/\d/);
  });
});
