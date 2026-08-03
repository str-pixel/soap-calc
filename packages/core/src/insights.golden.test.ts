import { describe, expect, it } from 'vitest';
import { analyzeFormulation, type FormulationAnalysisInput } from './insights.js';
import GOLDEN from './__fixtures__/insights-golden.json';

const base: FormulationAnalysisInput = {
  properties: null, fattyAcids: null, totalOilGrams: 1000, superfatPercent: 5,
  lyeConcentrationPercent: 33, waterLyeRatio: 2, waterGrams: 300, lyeGrams: 140,
  process: 'cp',
};

const cleansingProps = (over: Partial<Record<string, number>> = {}) => ({
  bubbly: 10, cleansing: 0, condition: 65, hardness: 30, longevity: 30, creamy: 30, ...over,
});

/** The 40 insight codes analyzeFormulation can emit today, transcribed from insights.ts.
 * Slice 3's rule-catalog conversion must keep every one of these reachable. */
const ALL_CODES = [
  'dos_risk_no_antioxidant',
  'dual_lye_advanced',
  'eutectic_lather_sources',
  'glycerin_solvent_dilution',
  'high_cleansing_low_superfat',
  'high_poly_high_superfat',
  'high_pufa_post_cook_superfat',
  'high_short_chain_low_long_chain',
  'high_total_additives',
  'hp_relaxed_caps',
  'hp_thick_phase_suppressant',
  'hp_vessel_too_small',
  'hp_yogurt_water',
  'jojoba_superfat_note',
  'large_test_batch',
  'low_cleansing_expected',
  'ls_castor_no_lather',
  'ls_coconut_hot_cook',
  'ls_dual_lye_recommendation',
  'ls_lye_excess',
  'ls_no_superfat_buffer',
  'ls_pcsf_emulsifier',
  'ls_salt_thickening',
  'ls_split_liquid_fat_superfat',
  'ls_split_liquid_not_dilution',
  'ls_superfat_high',
  'magnesium_salt_scum',
  'no_superfat_margin',
  'oatmeal_false_trace',
  'pufa_cap_superfat',
  'soaping_temp_high',
  'split_liquid_high_trace_liquid',
  'split_liquid_water_not_adjusted',
  'sugar_total_high',
  'superfat_out_of_band',
  'trace_speed',
  'water_band_below_low',
  'water_band_between_tiers',
  'water_band_rivers',
  'water_below_lye',
];

/** ~45 inputs, each a Partial over base, EVERY entry run for all three processes.
 * Adapted from insights.test.ts / formulation.test.ts fixtures so the triggers are
 * known-good. Add cases here only BEFORE the slice-3 conversion lands; afterwards this
 * file is frozen with the fixture. */
const MATRIX: Array<Partial<FormulationAnalysisInput>> = [
  {},
  { superfatPercent: -2 },
  { superfatPercent: 0 },
  { superfatPercent: 4 },
  { totalOilGrams: 600 },
  { waterGrams: 100, lyeGrams: 140 },
  { lyeConcentrationPercent: 45 },
  { waterBand: { lowTier: [20, 28], highTier: [32, 40], riversAbove: 38 }, waterGrams: 420 },
  { waterBand: { lowTier: [25, 30], highTier: [32, 40], riversAbove: 40 }, waterGrams: 200 },
  { sugarTotalPercent: 4.5 },
  { sugarTotalPercent: 5.5 },
  { soapingTempF: 165 },
  { lsGlycerinSolvent: true },
  { lsSplitLiquidFatShiftPercent: 4.2, superfatPercent: 2 },
  { splitLiquidEnabled: true, splitLiquidGrams: 200, splitLiquidAddAt: 'trace', suggestedLyeWaterGrams: 235, waterGrams: 435 },
  { splitLiquidEnabled: true, splitLiquidGrams: 200, splitLiquidAddAt: 'trace', splitLiquidWaterReductionGrams: 0 },
  { totalAdditivePercent: 12 },
  { lyeType: 'dual', kohBlendPercent: 10 },
  { hpVesselMultiple: 1.2 },
  { hpYogurtPercent: 8 },
  { traceSpeedLabel: 'fast', traceSpeedDrivers: ['high saturated fats'] },
  { postCookSuperfatPufaPercent: 40 },

  // --- ported below: fattyAcids-driven trigger families (eutectic / cleansing / castor /
  // short-chain), additiveEntries keyword cases, oilEntries identity cases, and the
  // ls_dual_lye_recommendation fixtures. Copied from insights.test.ts / formulation.test.ts. ---

  // high_short_chain_low_long_chain: coconut-heavy profile (insights.test.ts 'gates
  // high_short_chain_low_long_chain out for liquid soap' — fires CP/HP, suppressed LS).
  { fattyAcids: { lauric: 40, myristic: 10, palmitic: 5, stearic: 5 }, fattyAcidCoveragePercent: 100 },

  // eutectic_lather_sources: lauric + oleic sources (insights.test.ts 'gates
  // eutectic_lather_sources out for liquid soap' — fires CP/HP, suppressed LS).
  { fattyAcids: { lauric: 10, oleic: 40 }, fattyAcidCoveragePercent: 100 },

  // pufa_cap_superfat + high_poly_high_superfat co-fire (insights.test.ts 'allows both ...
  // to co-fire on an extreme recipe').
  { superfatPercent: 10, fattyAcids: { linoleic: 30, linolenic: 5, oleic: 20 }, fattyAcidCoveragePercent: 100 },

  // high_cleansing_low_superfat: cleansing above range, modest superfat.
  { properties: cleansingProps({ cleansing: 30 }), superfatPercent: 2, propertyCoveragePercent: 100 },

  // low_cleansing_expected: near-zero cleansing on an olive-dominant bar (insights.test.ts
  // 'notes that near-zero cleansing is expected for an olive-dominant bar').
  {
    properties: cleansingProps({ cleansing: 2 }),
    fattyAcids: { oleic: 72 },
    superfatPercent: 5,
    propertyCoveragePercent: 100,
    fattyAcidCoveragePercent: 100,
  },

  // ls_castor_no_lather via ricinoleic fatty-acid proxy (insights.test.ts 'notes castor
  // gives little lather in LS (ricinoleic proxy)').
  { fattyAcids: { ricinoleic: 6, oleic: 50 }, fattyAcidCoveragePercent: 100 },

  // ls_castor_no_lather via oil identity, no fatty-acid data at all (insights.test.ts
  // 'fires on castor-oil identity alone, with no fatty-acid data at all').
  { oilEntries: [{ oilId: 'castor-oil', name: 'Castor oil' }] },

  // hp_relaxed_caps via elevated castor / ricinoleic (insights.test.ts 'hp_relaxed_caps
  // fires for HP + elevated castor').
  { fattyAcids: { ricinoleic: 12 }, fattyAcidCoveragePercent: 90 },

  // hp_relaxed_caps via shea oil identity, even with low castor (insights.test.ts
  // 'hp_relaxed_caps fires for HP + shea present, even with low castor').
  {
    fattyAcids: { ricinoleic: 0 },
    fattyAcidCoveragePercent: 90,
    oilEntries: [{ oilId: 'shea-butter', name: 'Shea butter' }],
  },

  // jojoba_superfat_note via catalog id (formulation.test.ts 'detects jojoba additive by
  // catalog id').
  { additiveEntries: [{ catalogId: 'jojoba', name: 'Wax ester' }] },

  // jojoba_superfat_note via free-typed additive name (formulation.test.ts 'detects jojoba
  // additive by free-typed name').
  { additiveEntries: [{ catalogId: '', name: 'Golden jojoba oil' }] },

  // jojoba_superfat_note via recipe oil identity (formulation.test.ts 'detects jojoba in
  // the recipe oil list').
  { oilEntries: [{ oilId: 'jojoba-oil', name: 'Jojoba Oil' }] },

  // oatmeal_false_trace via free-typed additive name (formulation.test.ts 'detects oatmeal
  // additive by free-typed name').
  { additiveEntries: [{ catalogId: '', name: 'Colloidal oatmeal' }] },

  // magnesium_salt_scum (insights.test.ts 'warns on magnesium-bearing salts typed as
  // custom lines' — fires in every process).
  { additiveEntries: [{ catalogId: '', name: 'Epsom salt' }] },

  // ls_salt_thickening (LS) + hp_thick_phase_suppressant (HP) share one salt trigger,
  // exercised across all three processes by the matrix runner (insights.test.ts
  // 'ls_salt_thickening' and 'HP-gated insights' describe blocks).
  { additiveEntries: [{ catalogId: 'salt', name: 'Table salt (NaCl)' }], fattyAcidCoveragePercent: 100 },

  // hp_thick_phase_suppressant via sodium-lactate additive (insights.test.ts
  // 'hp_thick_phase_suppressant fires for HP + sodium-lactate additive').
  { additiveEntries: [{ catalogId: 'sodium-lactate', name: 'Sodium lactate' }] },

  // ls_dual_lye_recommendation: coconut-heavy LS recommends ~30% NaOH even on pure KOH
  // (insights.test.ts 'recommends ~30% NaOH for coconut-heavy LS (always, even pure KOH)').
  { lyeType: 'koh', fattyAcids: { lauric: 45, myristic: 12 }, fattyAcidCoveragePercent: 100 },

  // ls_dual_lye_recommendation: low P+S already-dual-lye LS recommends ~0-20% NaOH
  // (insights.test.ts 'recommends 0-20% NaOH only once already dual-lye and low P+S').
  {
    lyeType: 'dual',
    kohBlendPercent: 10,
    fattyAcids: { oleic: 70, palmitic: 5, stearic: 3 },
    fattyAcidCoveragePercent: 100,
  },

  // ls_salt_thickening coconut caveat (insights.test.ts 'appends a coconut caveat when
  // coconut-heavy').
  {
    additiveEntries: [{ catalogId: 'salt', name: 'Table salt (NaCl)' }],
    fattyAcids: { lauric: 45, myristic: 12 },
    fattyAcidCoveragePercent: 100,
  },

  // water_band_between_tiers: water sitting in the gap between the low and full-water
  // tiers (insights.test.ts 'flags water sitting in the gap between the low and
  // full-water tiers').
  {
    waterBand: { lowTier: [20, 28], highTier: [32, 40], riversAbove: 38 },
    waterGrams: 300,
  },

  // Plain small-batch filler for coverage diversity (no large_test_batch trigger).
  { totalOilGrams: 400, waterGrams: 150, lyeGrams: 100 },
];

describe('analyzeFormulation golden matrix (slice 3 conversion guard)', () => {
  it('every matrix cell matches the captured snapshot exactly', () => {
    const actual = MATRIX.flatMap((over, i) =>
      (['cp', 'hp', 'ls'] as const).map((process) => ({
        cell: `${i}:${process}`,
        insights: analyzeFormulation({ ...base, ...over, process }),
      })),
    );
    expect(actual).toEqual(GOLDEN);
  });

  it('the matrix exercises at least 30 of the 40 insight codes', () => {
    const seen = new Set(
      (GOLDEN as Array<{ insights: Array<{ code: string }> }>).flatMap((c) =>
        c.insights.map((x) => x.code),
      ),
    );
    // Completeness meter: print what is NOT covered so the gap is a visible choice.
    console.log('golden matrix does NOT cover:', [...ALL_CODES].filter((c) => !seen.has(c)));
    expect(seen.size).toBeGreaterThanOrEqual(30);
  });
});
