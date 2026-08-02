import { describe, expect, it } from 'vitest';
import {
  analyzeFormulation,
  INSIGHT_RULES,
  type FormulationAnalysisInput,
} from './insights.js';

const base: FormulationAnalysisInput = {
  properties: null,
  fattyAcids: null,
  totalOilGrams: 1000,
  superfatPercent: 0,
  lyeConcentrationPercent: 33,
  waterLyeRatio: 2,
  waterGrams: 300,
  lyeGrams: 140,
  process: 'cp',
};

const has = (input: FormulationAnalysisInput, code: string) =>
  analyzeFormulation(input).some((i) => i.code === code);

describe('lye-excess warning (negative superfat)', () => {
  it('fires for a negative superfat even under CP, not just LS', () => {
    // A caustic recipe from any caller must still surface the neutralization guidance,
    // not only the LS UI path.
    expect(has({ ...base, superfatPercent: -2, process: 'cp' }, 'ls_lye_excess')).toBe(true);
  });

  it('fires for a negative-superfat liquid soap', () => {
    expect(has({ ...base, superfatPercent: -2, process: 'ls' }, 'ls_lye_excess')).toBe(true);
  });

  it('does not fire at zero or positive superfat', () => {
    expect(has({ ...base, superfatPercent: 0 }, 'ls_lye_excess')).toBe(false);
    expect(has({ ...base, superfatPercent: 5 }, 'ls_lye_excess')).toBe(false);
  });
});

describe('no-superfat-margin caustic guard (NaOH bar soap)', () => {
  it('warns a 0% superfat bar (no unsaponified-oil buffer)', () => {
    expect(has({ ...base, superfatPercent: 0, process: 'cp' }, 'no_superfat_margin')).toBe(true);
  });

  it('does not fire once the bar carries any positive superfat', () => {
    expect(has({ ...base, superfatPercent: 5, process: 'cp' }, 'no_superfat_margin')).toBe(false);
    expect(has({ ...base, superfatPercent: 1, process: 'cp' }, 'no_superfat_margin')).toBe(false);
  });

  it('exempts liquid soap (KOH runs at/below 0% and is neutralized after cook)', () => {
    expect(has({ ...base, superfatPercent: 0, process: 'ls' }, 'no_superfat_margin')).toBe(false);
  });

  it('does not fire without an active recipe (no lye)', () => {
    expect(has({ ...base, superfatPercent: 0, lyeGrams: 0, process: 'cp' }, 'no_superfat_margin')).toBe(false);
  });
});

describe('lye-concentration band warnings were removed as unsourced', () => {
  it('does not warn on a high or low concentration for any process', () => {
    // Removed deliberately: no source states either threshold, and the high one fired across
    // part of the CP source's own recommended water-discount band and on low-water formulas a
    // science source tested and cleared up to 50%. Reinstating either needs a source first.
    for (const process of ['cp', 'ls'] as const) {
      expect(has({ ...base, lyeConcentrationPercent: 45, process }, 'lye_conc_high')).toBe(false);
      expect(has({ ...base, lyeConcentrationPercent: 15, process }, 'lye_conc_low')).toBe(false);
    }
  });

  it('still warns at the one boundary the sources DO state — water below lye', () => {
    // 50% concentration (1:1) is the stated floor; below that water the alkali cannot
    // dissolve. water_below_lye carries that with the correct reason.
    expect(has({ ...base, waterGrams: 100, lyeGrams: 140 }, 'water_below_lye')).toBe(true);
    expect(has({ ...base, waterGrams: 300, lyeGrams: 140 }, 'water_below_lye')).toBe(false);
  });
});

const CP_BAND = { lowTier: [20, 28] as [number, number], highTier: [32, 40] as [number, number], riversAbove: 38 };

function waterInput(
  waterGrams: number,
  totalOilGrams = 1000,
  extra: Partial<FormulationAnalysisInput> = {},
): FormulationAnalysisInput {
  return {
    properties: null,
    fattyAcids: null,
    totalOilGrams,
    superfatPercent: 5,
    lyeConcentrationPercent: 0,
    waterLyeRatio: 0,
    waterGrams,
    lyeGrams: 140,
    process: 'cp',
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
    const codes = analyzeFormulation(waterInput(420, 1000, { process: 'ls' })).map((i) => i.code);
    expect(codes).not.toContain('water_band_rivers');
  });
});

describe('superfat + PUFA cap bands (CP)', () => {
  const base = {
    properties: null, totalOilGrams: 1000, lyeConcentrationPercent: 0,
    waterLyeRatio: 0, waterGrams: 330, lyeGrams: 140, process: 'cp' as const,
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
      ...base, process: 'ls', superfatPercent: 35, fattyAcids: { linoleic: 25, oleic: 40 },
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
    waterLyeRatio: 0, waterGrams: 330, lyeGrams: 140, process: 'cp' as const,
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
      ...base, process: 'ls', superfatPercent: 2,
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
      process: 'ls',
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
    // This is the exact gap the process discriminator exists to close: gating on
    // `process !== 'ls'` would still wrongly include CP here, since CP is also not LS —
    // only the explicit `process === 'hp'` check correctly excludes it.
    const codes = analyzeFormulation({
      ...base,
      process: 'cp',
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

describe('hp_vessel_too_small vessel-size guard', () => {
  it('fires for HP with a vessel only 1.5x the batch (below the 2x default minimum)', () => {
    const codes = analyzeFormulation({
      ...base,
      process: 'hp',
      hpVesselMultiple: 1.5,
    }).map((i) => i.code);
    expect(codes).toContain('hp_vessel_too_small');
  });

  it('non-coconut-heavy message states the 2x minimum and hints at 3x for coconut-heavy, without repeating "~3×"', () => {
    const insight = analyzeFormulation({
      ...base,
      process: 'hp',
      hpVesselMultiple: 1.5,
    }).find((i) => i.code === 'hp_vessel_too_small');
    expect(insight?.message).toBe(
      "Use a cook vessel at least ~2× the batch volume (~3× for coconut-heavy) so the expanding cook doesn't overflow."
    );
  });

  it('coconut-heavy message states only the 3x requirement, without a redundant "~3× for coconut-heavy" parenthetical', () => {
    const insight = analyzeFormulation({
      ...base,
      process: 'hp',
      hpVesselMultiple: 2.5,
      fattyAcids: { lauric: 45, myristic: 15 },
      fattyAcidCoveragePercent: 90,
    }).find((i) => i.code === 'hp_vessel_too_small');
    expect(insight?.message).toBe(
      "Use a cook vessel at least ~3× the batch volume so the expanding cook doesn't overflow."
    );
  });

  it('does not fire for HP with a 2.5x vessel on a non-coconut-heavy recipe', () => {
    const codes = analyzeFormulation({
      ...base,
      process: 'hp',
      hpVesselMultiple: 2.5,
      fattyAcids: { lauric: 5, myristic: 2 },
      fattyAcidCoveragePercent: 90,
    }).map((i) => i.code);
    expect(codes).not.toContain('hp_vessel_too_small');
  });

  it('does not fire for CP even with a too-small multiple', () => {
    const codes = analyzeFormulation({
      ...base,
      process: 'cp',
      hpVesselMultiple: 1.5,
    }).map((i) => i.code);
    expect(codes).not.toContain('hp_vessel_too_small');
  });

  it('requires 3x for coconut-heavy HP (lauric+myristic >= 55%) — 2.5x still fires', () => {
    const codes = analyzeFormulation({
      ...base,
      process: 'hp',
      hpVesselMultiple: 2.5,
      fattyAcids: { lauric: 45, myristic: 15 },
      fattyAcidCoveragePercent: 90,
    }).map((i) => i.code);
    expect(codes).toContain('hp_vessel_too_small');
  });

  it('3x clears the coconut-heavy requirement', () => {
    const codes = analyzeFormulation({
      ...base,
      process: 'hp',
      hpVesselMultiple: 3,
      fattyAcids: { lauric: 45, myristic: 15 },
      fattyAcidCoveragePercent: 90,
    }).map((i) => i.code);
    expect(codes).not.toContain('hp_vessel_too_small');
  });

  it('ignores low-coverage fatty-acid data for the coconut-heavy read (falls back to the 2x requirement)', () => {
    const codes = analyzeFormulation({
      ...base,
      process: 'hp',
      hpVesselMultiple: 2.5,
      fattyAcids: { lauric: 45, myristic: 15 },
      fattyAcidCoveragePercent: 30,
    }).map((i) => i.code);
    expect(codes).not.toContain('hp_vessel_too_small');
  });

  it('does not fire when hpVesselMultiple is undefined', () => {
    const codes = analyzeFormulation({ ...base, process: 'hp' }).map((i) => i.code);
    expect(codes).not.toContain('hp_vessel_too_small');
  });

  it('2x exactly clears the non-coconut requirement', () => {
    const codes = analyzeFormulation({
      ...base,
      process: 'hp',
      hpVesselMultiple: 2,
    }).map((i) => i.code);
    expect(codes).not.toContain('hp_vessel_too_small');
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

  it('is process-aware: 4.5% warns under CP only; HP and LS tolerate up to 5%', () => {
    for (const [process, fires] of [['cp', true], ['ls', false], ['hp', false]] as const) {
      expect(has({ ...base, process, sugarTotalPercent: 4.5 }, 'sugar_total_high')).toBe(fires);
    }
    for (const process of ['ls', 'hp'] as const) {
      expect(has({ ...base, process, sugarTotalPercent: 5.5 }, 'sugar_total_high')).toBe(true);
    }
  });

  it('advises on dilution when an LS recipe runs glycerin as solvent', () => {
    expect(has({ ...base, process: 'ls', lsGlycerinSolvent: true }, 'glycerin_solvent_dilution')).toBe(true);
    expect(has({ ...base, process: 'ls' }, 'glycerin_solvent_dilution')).toBe(false);
    expect(has({ ...base, process: 'cp', lsGlycerinSolvent: true }, 'glycerin_solvent_dilution')).toBe(false);
  });

  it('LS copy carries the ~5% figure and still names yogurt (only HP excludes it upstream)', () => {
    const hit = analyzeFormulation({ ...base, process: 'ls', sugarTotalPercent: 5.5 }).find(
      (i) => i.code === 'sugar_total_high',
    );
    expect(hit!.message).toContain('~5%');
    expect(hit!.message.toLowerCase()).toContain('yogurt');
  });

  it('5.5% warns under HP too, and the HP copy does not name yogurt (excluded from the HP sum)', () => {
    const hit = analyzeFormulation({ ...base, process: 'hp', sugarTotalPercent: 5.5 }).find(
      (i) => i.code === 'sugar_total_high',
    );
    expect(hit).toBeDefined();
    expect(hit!.message).toContain('~5%');
    expect(hit!.message.toLowerCase()).not.toContain('yogurt');
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

describe('ls_coconut_hot_cook', () => {
  const coco = {
    ...base,
    process: 'ls' as const,
    fattyAcids: { lauric: 45, myristic: 12 },
    fattyAcidCoveragePercent: 100,
  };
  it('warns a coconut-heavy LS recipe holding ≥160 °F (the high-temp-owned region), regardless of zone', () => {
    const insight = analyzeFormulation({ ...coco, soapingTempF: 215 }).find(
      (i) => i.code === 'ls_coconut_hot_cook',
    );
    expect(insight?.level).toBe('warning');
    expect(insight?.message).toMatch(/150–175 °F/);
    expect(insight?.message).toMatch(/3× the total recipe volume/);
    expect(insight?.message).toMatch(/180 °F/);
    // Fires across the zone boundary so complying (215 → 165) can't silence it.
    expect(has({ ...coco, soapingTempF: 165 }, 'ls_coconut_hot_cook')).toBe(true);
    expect(has({ ...coco, soapingTempF: 160 }, 'ls_coconut_hot_cook')).toBe(true);
  });
  it('stays quiet below 160 °F (including the 150 °F default), for non-coconut recipes, at low FA coverage, NaN, and outside LS', () => {
    expect(has({ ...coco, soapingTempF: 159 }, 'ls_coconut_hot_cook')).toBe(false);
    expect(has({ ...coco, soapingTempF: 150 }, 'ls_coconut_hot_cook')).toBe(false);
    expect(has({ ...coco, soapingTempF: undefined }, 'ls_coconut_hot_cook')).toBe(false);
    expect(has({ ...coco, soapingTempF: Number.NaN }, 'ls_coconut_hot_cook')).toBe(false);
    expect(
      has({ ...coco, fattyAcids: { oleic: 70 }, soapingTempF: 215 }, 'ls_coconut_hot_cook'),
    ).toBe(false);
    expect(
      has({ ...coco, fattyAcidCoveragePercent: 40, soapingTempF: 215 }, 'ls_coconut_hot_cook'),
    ).toBe(false);
    expect(has({ ...coco, process: 'hp', soapingTempF: 215 }, 'ls_coconut_hot_cook')).toBe(false);
  });
});

describe('ls_pcsf_emulsifier (post-cook superfat needs polysorbate 80)', () => {
  const pcsf = { ...base, process: 'ls' as const, postCookSuperfatPercent: 2 };

  it('fires for an LS recipe with a post-cook superfat and no emulsifier line', () => {
    const insight = analyzeFormulation(pcsf).find((i) => i.code === 'ls_pcsf_emulsifier');
    expect(insight?.level).toBe('info');
    expect(insight?.message).toMatch(/polysorbate/i);
  });

  it('stays quiet below the 0.5% post-cook-superfat floor', () => {
    expect(has({ ...pcsf, postCookSuperfatPercent: 0.4 }, 'ls_pcsf_emulsifier')).toBe(false);
    expect(has({ ...pcsf, postCookSuperfatPercent: 0 }, 'ls_pcsf_emulsifier')).toBe(false);
    expect(has({ ...base, process: 'ls' }, 'ls_pcsf_emulsifier')).toBe(false);
  });

  it('stays quiet when a polysorbate-80 catalog line is present', () => {
    expect(
      has(
        { ...pcsf, additiveEntries: [{ catalogId: 'polysorbate-80', name: 'Polysorbate 80' }] },
        'ls_pcsf_emulsifier',
      ),
    ).toBe(false);
  });

  it('stays quiet when a custom-named "poly 80 blend" line is present (keyword match)', () => {
    expect(
      has(
        { ...pcsf, additiveEntries: [{ catalogId: '', name: 'poly 80 blend' }] },
        'ls_pcsf_emulsifier',
      ),
    ).toBe(false);
  });

  it('stays quiet when a custom-named "Polysorbate 80" line is present (the other common spelling)', () => {
    expect(
      has(
        { ...pcsf, additiveEntries: [{ catalogId: '', name: 'Polysorbate 80' }] },
        'ls_pcsf_emulsifier',
      ),
    ).toBe(false);
  });

  it('stays quiet when a custom-named "Tween 80" line is present (the common trade name)', () => {
    expect(
      has(
        { ...pcsf, additiveEntries: [{ catalogId: '', name: 'Tween 80' }] },
        'ls_pcsf_emulsifier',
      ),
    ).toBe(false);
  });

  it('stays quiet for the no-word-boundary spellings "Tween80" and "Poly-80"', () => {
    // 'Tween80' and 'Poly-80' have no word boundary before the digits, so the existing
    // \btween\b / \bpoly 80\b keywords miss them without an explicit no-space check.
    expect(
      has({ ...pcsf, additiveEntries: [{ catalogId: '', name: 'Tween80' }] }, 'ls_pcsf_emulsifier'),
    ).toBe(false);
    expect(
      has({ ...pcsf, additiveEntries: [{ catalogId: '', name: 'Poly-80' }] }, 'ls_pcsf_emulsifier'),
    ).toBe(false);
  });

  it('does not fire outside LS', () => {
    expect(has({ ...base, process: 'hp', postCookSuperfatPercent: 2 }, 'ls_pcsf_emulsifier')).toBe(
      false,
    );
  });
});

describe('LS quality remap + dual-lye recommender', () => {
  const ls: FormulationAnalysisInput = {
    ...base,
    process: 'ls',
    fattyAcidCoveragePercent: 100,
  };

  it('gates high_short_chain_low_long_chain out for liquid soap', () => {
    // Coconut-heavy: lauric+myristic > 35, palmitic+stearic < 15 — fires for CP but must
    // be suppressed for LS, mirroring eutectic_lather_sources' LS gate (C5), since the
    // "wears quickly" bar-soap framing contradicts LS's own lather coaching.
    const coconutHeavy = { lauric: 40, myristic: 10, palmitic: 5, stearic: 5 };
    expect(
      analyzeFormulation({ ...ls, fattyAcids: coconutHeavy }).map((i) => i.code),
    ).not.toContain('high_short_chain_low_long_chain');
    expect(
      analyzeFormulation({ ...ls, process: 'cp', fattyAcids: coconutHeavy }).map(
        (i) => i.code,
      ),
    ).toContain('high_short_chain_low_long_chain');
  });

  it('gates eutectic_lather_sources out for liquid soap', () => {
    const codes = analyzeFormulation({ ...ls, fattyAcids: { lauric: 10, oleic: 40 } }).map(
      (i) => i.code,
    );
    expect(codes).not.toContain('eutectic_lather_sources');
    // still fires for CP:
    expect(
      analyzeFormulation({ ...ls, process: 'cp', fattyAcids: { lauric: 10, oleic: 40 } }).map(
        (i) => i.code,
      ),
    ).toContain('eutectic_lather_sources');
  });

  describe('ls_castor_no_lather', () => {
    it('notes castor gives little lather in LS (ricinoleic proxy)', () => {
      expect(
        analyzeFormulation({ ...ls, fattyAcids: { ricinoleic: 6, oleic: 50 } }).map((i) => i.code),
      ).toContain('ls_castor_no_lather');
    });

    it('does not fire below the ricinoleic threshold', () => {
      expect(
        analyzeFormulation({ ...ls, fattyAcids: { ricinoleic: 3, oleic: 50 } }).map((i) => i.code),
      ).not.toContain('ls_castor_no_lather');
    });

    it('does not fire the ricinoleic branch below the fatty-acid coverage gate', () => {
      expect(
        analyzeFormulation({
          ...ls,
          fattyAcidCoveragePercent: 50,
          fattyAcids: { ricinoleic: 6, oleic: 50 },
        }).map((i) => i.code),
      ).not.toContain('ls_castor_no_lather');
    });

    it('fires on castor-oil identity alone, with no fatty-acid data at all', () => {
      expect(
        analyzeFormulation({
          ...ls,
          fattyAcids: null,
          oilEntries: [{ oilId: 'castor-oil', name: 'Castor oil' }],
        }).map((i) => i.code),
      ).toContain('ls_castor_no_lather');
    });

    it('does not fire for CP even with castor present', () => {
      expect(
        analyzeFormulation({
          ...ls,
          process: 'cp',
          fattyAcids: { ricinoleic: 6, oleic: 50 },
        }).map((i) => i.code),
      ).not.toContain('ls_castor_no_lather');
    });
  });

  describe('ls_dual_lye_recommendation', () => {
    it('recommends ~30% NaOH for coconut-heavy LS (always, even pure KOH)', () => {
      const i = analyzeFormulation({
        ...ls,
        lyeType: 'koh',
        fattyAcids: { lauric: 45, myristic: 12 },
      }).find((x) => x.code === 'ls_dual_lye_recommendation');
      expect(i?.message).toMatch(/30%/);
    });

    it('recommends ~30% NaOH for coconut-heavy LS with dual lye too', () => {
      const i = analyzeFormulation({
        ...ls,
        lyeType: 'dual',
        fattyAcids: { lauric: 45, myristic: 12 },
      }).find((x) => x.code === 'ls_dual_lye_recommendation');
      expect(i?.message).toMatch(/30%/);
    });

    it('stays silent for pure-KOH low-P+S recipes (no nagging)', () => {
      const codes = analyzeFormulation({
        ...ls,
        lyeType: 'koh',
        fattyAcids: { oleic: 70, palmitic: 5, stearic: 3 },
      }).map((i) => i.code);
      expect(codes).not.toContain('ls_dual_lye_recommendation');
    });

    it('recommends 0–20% NaOH only once already dual-lye and low P+S', () => {
      const dual = analyzeFormulation({
        ...ls,
        lyeType: 'dual',
        fattyAcids: { oleic: 70, palmitic: 5, stearic: 3 },
      }).find((x) => x.code === 'ls_dual_lye_recommendation');
      expect(dual?.message).toMatch(/0.?20%|20%/);
    });

    it('stays silent when P+S is above 15% and lye is not coconut-heavy, regardless of lye type', () => {
      const codes = analyzeFormulation({
        ...ls,
        lyeType: 'dual',
        fattyAcids: { oleic: 40, palmitic: 20, stearic: 10 },
      }).map((i) => i.code);
      expect(codes).not.toContain('ls_dual_lye_recommendation');
    });

    it('does not fire for CP even with a coconut-heavy profile', () => {
      const codes = analyzeFormulation({
        ...ls,
        process: 'cp',
        fattyAcids: { lauric: 45, myristic: 12 },
      }).map((i) => i.code);
      expect(codes).not.toContain('ls_dual_lye_recommendation');
    });

    it('does not fire below the fatty-acid coverage gate', () => {
      const codes = analyzeFormulation({
        ...ls,
        fattyAcidCoveragePercent: 50,
        fattyAcids: { lauric: 45, myristic: 12 },
      }).map((i) => i.code);
      expect(codes).not.toContain('ls_dual_lye_recommendation');
    });
  });
});

describe('soaping_temp_high overflow warning (2026-07-27)', () => {
  it('fires above 160 °F under CP; exactly 160 is fine', () => {
    expect(has({ ...base, process: 'cp', soapingTempF: 165 }, 'soaping_temp_high')).toBe(true);
    expect(has({ ...base, process: 'cp', soapingTempF: 160 }, 'soaping_temp_high')).toBe(false);
  });

  it('never fires for the hot processes — 215 °F is correct HP/LS practice', () => {
    for (const process of ['hp', 'ls'] as const) {
      expect(has({ ...base, process, soapingTempF: 215 }, 'soaping_temp_high')).toBe(false);
    }
  });

  it('silent when no temperature was provided', () => {
    expect(has({ ...base, process: 'cp' }, 'soaping_temp_high')).toBe(false);
  });
});

describe('magnesium-salt caution (salt review 2026-07-27)', () => {
  const withAdditive = (name: string, catalogId = '') =>
    analyzeFormulation({ ...base, additiveEntries: [{ catalogId, name }] }).map((i) => i.code);

  it('warns on magnesium-bearing salts typed as custom lines', () => {
    for (const name of ['Epsom salt', 'Dead Sea salt', 'Magnesium sulfate', 'epsom salts']) {
      expect(withAdditive(name)).toContain('magnesium_salt_scum');
    }
  });

  it('stays silent for the salts that behave (table, sea, Himalayan, black lava)', () => {
    for (const [name, id] of [
      ['Table salt (NaCl)', 'salt'],
      ['Sea salt', ''],
      ['Pink Himalayan salt', ''],
      ['Black lava salt', ''],
      ['Sodium lactate', 'sodium-lactate'],
    ] as const) {
      expect(withAdditive(name, id)).not.toContain('magnesium_salt_scum');
    }
  });

  it('does not fire on a fragrance that merely mentions the words', () => {
    expect(withAdditive('Dead Sea Breeze fragrance oil')).not.toContain('magnesium_salt_scum');
  });

  it('fires in every process — magnesium wrecks lather in bar and liquid soap alike', () => {
    for (const process of ['cp', 'hp', 'ls'] as const) {
      const codes = analyzeFormulation({
        ...base,
        process,
        additiveEntries: [{ catalogId: '', name: 'Epsom salt' }],
      }).map((i) => i.code);
      expect(codes).toContain('magnesium_salt_scum');
    }
  });
});


describe('LS split-liquid advisories (LS audit 2026-07-27)', () => {
  const ls = {
    ...base,
    superfatPercent: 2,
    process: 'ls' as const,
    splitLiquidEnabled: true,
    splitLiquidGrams: 200,
  };

  describe('ls_split_liquid_fat_superfat', () => {
    it('warns that the liquid fat rides on top of the stated superfat', () => {
      // 200 g canned coconut milk = 42 g fat on 1,000 g oils = 4.2 points over the stated 2%.
      const insight = analyzeFormulation({ ...ls, lsSplitLiquidFatShiftPercent: 4.2 }).find(
        (i) => i.code === 'ls_split_liquid_fat_superfat',
      );
      expect(insight?.level).toBe('warning');
      // Both figures must appear: what was added, and where superfat actually lands.
      expect(insight?.message).toContain('4.2');
      expect(insight?.message).toContain('6.2');
    });

    it('stays quiet below half a point — lean liquids are not worth a warning', () => {
      expect(has({ ...ls, lsSplitLiquidFatShiftPercent: 0.3 }, 'ls_split_liquid_fat_superfat')).toBe(
        false,
      );
      expect(has({ ...ls, lsSplitLiquidFatShiftPercent: 0 }, 'ls_split_liquid_fat_superfat')).toBe(
        false,
      );
      expect(has(ls, 'ls_split_liquid_fat_superfat')).toBe(false);
    });

    it('stays quiet while the combined total is still inside the ~3% ceiling', () => {
      // 1.5 points of milk fat on a 0% recipe is 1.5% effective — under the very ceiling
      // the warning cites. "Lower the superfat" there contradicts the number in the same
      // sentence (code-review 2026-08-01); the rule now gates on the combined total.
      expect(
        has(
          { ...ls, superfatPercent: 0, lsSplitLiquidFatShiftPercent: 1.5 },
          'ls_split_liquid_fat_superfat',
        ),
      ).toBe(false);
      // A deliberate lye excess absorbs the fat — nothing to warn about either.
      expect(
        has(
          { ...ls, superfatPercent: -5, lsSplitLiquidFatShiftPercent: 2 },
          'ls_split_liquid_fat_superfat',
        ),
      ).toBe(false);
    });

    it('warns once the fat pushes the combined total past ~3%', () => {
      // 2% main + 1.5 points of fat = 3.5% — over the ceiling, warn.
      expect(
        has({ ...ls, lsSplitLiquidFatShiftPercent: 1.5 }, 'ls_split_liquid_fat_superfat'),
      ).toBe(true);
    });

    it('is LS-only: a bar shrugs off the same fat', () => {
      for (const process of ['cp', 'hp'] as const) {
        expect(
          has(
            { ...ls, process, lsSplitLiquidFatShiftPercent: 4.2 },
            'ls_split_liquid_fat_superfat',
          ),
        ).toBe(false);
      }
    });
  });

  describe('ls_no_superfat_buffer', () => {
    // The LS default seeds main superfat 0% + post-cook 2%; deleting the optional
    // post-cook row leaves lye computed to exactly saponify 100% of the oils — a state
    // no LS rule covered (no_superfat_margin is CP/HP-gated, ls_lye_excess needs < 0,
    // ls_superfat_high needs > 3).
    //
    // INFO, not warning, and only at exact lye. Exact-lye liquid soap is a documented
    // configuration, and the no-paste high-temp method publishes a 0–3% superfat range, so
    // flagging 0% as a fault would contradict the practice the app is modelling. What is
    // worth saying is the trade-off: nothing absorbs SAP variation. A partial buffer (0.5%)
    // is inside that published range and gets no note at all.
    it('notes exact lye at info level, naming the trade-off and both remedies', () => {
      const insight = analyzeFormulation({ ...base, process: 'ls', superfatPercent: 0 }).find(
        (i) => i.code === 'ls_no_superfat_buffer',
      );
      expect(insight?.level).toBe('info');
      expect(insight?.message).toMatch(/lye excess/i);
      expect(insight?.message).toMatch(/1–3%/);
      expect(insight?.message).toMatch(/SAP/i);
    });

    it('stays quiet once any buffer exists, including a partial one inside the 0–3% band', () => {
      expect(
        has({ ...base, process: 'ls', superfatPercent: 0, postCookSuperfatPercent: 2 }, 'ls_no_superfat_buffer'),
      ).toBe(false);
      expect(has({ ...base, process: 'ls', superfatPercent: 1 }, 'ls_no_superfat_buffer')).toBe(false);
      expect(has({ ...base, process: 'ls', superfatPercent: 0.5 }, 'ls_no_superfat_buffer')).toBe(false);
      expect(
        has({ ...base, process: 'ls', superfatPercent: 0, postCookSuperfatPercent: 0.5 }, 'ls_no_superfat_buffer'),
      ).toBe(false);
    });

    it('yields to the deliberate lye-excess workflow (negative superfat)', () => {
      expect(has({ ...base, process: 'ls', superfatPercent: -2 }, 'ls_no_superfat_buffer')).toBe(false);
    });

    it('is LS-only — bar soap already has no_superfat_margin', () => {
      expect(has({ ...base, process: 'cp', superfatPercent: 0 }, 'ls_no_superfat_buffer')).toBe(false);
      expect(has({ ...base, process: 'hp', superfatPercent: 0 }, 'ls_no_superfat_buffer')).toBe(false);
    });
  });

  describe('ls_split_liquid_not_dilution', () => {
    it('tells an LS recipe with a split liquid to dilute with plain water', () => {
      const insight = analyzeFormulation(ls).find(
        (i) => i.code === 'ls_split_liquid_not_dilution',
      );
      expect(insight?.level).toBe('info');
      expect(insight?.message).toMatch(/distilled water/i);
      expect(insight?.message).toMatch(/preservative/i);
    });

    it('does not fire without a split liquid, or outside LS', () => {
      expect(has({ ...ls, splitLiquidEnabled: false, splitLiquidGrams: null }, 'ls_split_liquid_not_dilution')).toBe(false);
      expect(
        has({ ...ls, process: 'cp' }, 'ls_split_liquid_not_dilution'),
      ).toBe(false);
    });

    it('does not fire for glycerin alone — it is welcome in the dilution water', () => {
      // The solvent preset brings no water and carries no microbial load; the caller
      // reports zero paste water and zero non-solvent liquid for a glycerin-only recipe.
      expect(
        has({ ...ls, lsSplitLiquidIsSolventOnly: true }, 'ls_split_liquid_not_dilution'),
      ).toBe(false);
    });
  });
});

describe('rule registry consistency', () => {
  // Carried finding from Task 4's review: InsightRule.code is never read at runtime — the
  // emitted code comes from whatever check() returns — so a copy-paste that updates one and
  // not the other would ship a mislabeled insight past the golden. This suite guards that.

  it('declares 39 unique codes', () => {
    const declared = INSIGHT_RULES.map((r) => r.code);
    expect(declared).toHaveLength(39);
    expect(new Set(declared).size).toBe(39);
  });

  const cleansingProps = (over: Partial<Record<string, number>> = {}) => ({
    bubbly: 10,
    cleansing: 0,
    condition: 65,
    hardness: 30,
    longevity: 30,
    creamy: 30,
    ...over,
  });

  /** One known-firing probe input per declared code (36 total), reused from this file's and
   * insights.golden.test.ts's own fixtures. Routed through analyzeFormulation (not a direct
   * rule.check() call) so the probe also exercises the `processes:` gate — a rule whose gate
   * excludes its own probe's process fails here, the exact blind spot a direct check() call
   * would miss. */
  const PROBES: Record<string, Partial<FormulationAnalysisInput>> = {
    large_test_batch: { totalOilGrams: 600 },
    water_below_lye: { waterGrams: 100, lyeGrams: 140 },
    no_superfat_margin: { superfatPercent: 0, lyeGrams: 140, process: 'cp' },
    water_band_rivers: {
      waterBand: { lowTier: [20, 28], highTier: [32, 40], riversAbove: 38 },
      waterGrams: 420,
      totalOilGrams: 1000,
    },
    water_band_between_tiers: {
      waterBand: { lowTier: [20, 28], highTier: [32, 40], riversAbove: 38 },
      waterGrams: 300,
      totalOilGrams: 1000,
    },
    water_band_below_low: {
      waterBand: { lowTier: [25, 30], highTier: [32, 40], riversAbove: 40 },
      waterGrams: 200,
      totalOilGrams: 1000,
    },
    high_short_chain_low_long_chain: {
      fattyAcids: { lauric: 40, myristic: 10, palmitic: 5, stearic: 5 },
      fattyAcidCoveragePercent: 100,
    },
    high_poly_high_superfat: {
      fattyAcids: { linoleic: 30, linolenic: 5 },
      fattyAcidCoveragePercent: 100,
      superfatPercent: 10,
    },
    eutectic_lather_sources: {
      fattyAcids: { lauric: 10, oleic: 40 },
      fattyAcidCoveragePercent: 100,
    },
    high_cleansing_low_superfat: {
      properties: cleansingProps({ cleansing: 30 }),
      superfatPercent: 2,
      propertyCoveragePercent: 100,
    },
    low_cleansing_expected: {
      properties: cleansingProps({ cleansing: 2 }),
      fattyAcids: { oleic: 72 },
      superfatPercent: 5,
      propertyCoveragePercent: 100,
      fattyAcidCoveragePercent: 100,
    },
    split_liquid_water_not_adjusted: {
      splitLiquidEnabled: true,
      splitLiquidAddAt: 'trace',
      splitLiquidGrams: 200,
      suggestedLyeWaterGrams: 235,
      waterGrams: 435,
    },
    split_liquid_high_trace_liquid: {
      splitLiquidEnabled: true,
      splitLiquidAddAt: 'trace',
      splitLiquidGrams: 200,
      splitLiquidWaterReductionGrams: 0,
      totalOilGrams: 1000,
    },
    high_total_additives: { totalAdditivePercent: 12 },
    sugar_total_high: { sugarTotalPercent: 5.5, process: 'cp' },
    soaping_temp_high: { soapingTempF: 165, process: 'cp' },
    glycerin_solvent_dilution: { lsGlycerinSolvent: true, process: 'ls' },
    dual_lye_advanced: { lyeType: 'dual', kohBlendPercent: 10 },
    magnesium_salt_scum: { additiveEntries: [{ catalogId: '', name: 'Epsom salt' }] },
    oatmeal_false_trace: { additiveEntries: [{ catalogId: '', name: 'Colloidal oatmeal' }] },
    jojoba_superfat_note: { additiveEntries: [{ catalogId: 'jojoba', name: 'Wax ester' }] },
    high_pufa_post_cook_superfat: { postCookSuperfatPufaPercent: 40 },
    superfat_out_of_band: { superfatPercent: 40, process: 'cp' },
    pufa_cap_superfat: {
      fattyAcids: { linoleic: 30, linolenic: 5 },
      fattyAcidCoveragePercent: 100,
      superfatPercent: 10,
      process: 'cp',
    },
    trace_speed: {
      traceSpeedLabel: 'fast',
      traceSpeedDrivers: ['high saturated fats'],
      process: 'cp',
    },
    ls_split_liquid_fat_superfat: {
      lsSplitLiquidFatShiftPercent: 4.2,
      superfatPercent: 2,
      process: 'ls',
    },
    ls_split_liquid_not_dilution: {
      splitLiquidEnabled: true,
      splitLiquidGrams: 200,
      process: 'ls',
    },
    ls_superfat_high: { superfatPercent: 5, process: 'ls' },
    ls_no_superfat_buffer: { superfatPercent: 0, process: 'ls' },
    ls_pcsf_emulsifier: { postCookSuperfatPercent: 2, process: 'ls' },
    ls_castor_no_lather: {
      fattyAcids: { ricinoleic: 6 },
      fattyAcidCoveragePercent: 100,
      process: 'ls',
    },
    ls_coconut_hot_cook: {
      fattyAcids: { lauric: 45, myristic: 12 },
      fattyAcidCoveragePercent: 100,
      soapingTempF: 215,
      process: 'ls',
    },
    ls_dual_lye_recommendation: {
      lyeType: 'koh',
      fattyAcids: { lauric: 45, myristic: 12 },
      fattyAcidCoveragePercent: 100,
      process: 'ls',
    },
    ls_salt_thickening: {
      additiveEntries: [{ catalogId: 'salt', name: 'Table salt (NaCl)' }],
      process: 'ls',
    },
    hp_thick_phase_suppressant: {
      additiveEntries: [{ catalogId: 'salt', name: 'Table salt (NaCl)' }],
      process: 'hp',
    },
    hp_yogurt_water: { hpYogurtPercent: 8, process: 'hp' },
    hp_relaxed_caps: {
      fattyAcids: { ricinoleic: 12 },
      fattyAcidCoveragePercent: 90,
      process: 'hp',
    },
    hp_vessel_too_small: { hpVesselMultiple: 1.2, process: 'hp' },
    ls_lye_excess: { superfatPercent: -2 },
  };

  it('every declared rule has a probe, and each rule emits its own code on its probe', () => {
    const missingProbes = INSIGHT_RULES.map((r) => r.code).filter((code) => !(code in PROBES));
    expect(missingProbes).toEqual([]);

    for (const rule of INSIGHT_RULES) {
      const probe = PROBES[rule.code];
      const input: FormulationAnalysisInput = { ...base, ...probe, process: probe.process ?? 'cp' };
      expect(
        analyzeFormulation(input).some((i) => i.code === rule.code),
        `rule "${rule.code}" did not fire on its probe`,
      ).toBe(true);
    }
  });
});
