import {
  FATTY_ACID_GROUP_KEYS,
  sumFattyAcids,
  type FattyAcidProfile,
} from './fatty-acids.js';
import { DEFAULT_KOH_BLEND_PERCENT, effectiveSuperfatPercent, type LyeType, type WaterMode } from './lye.js';
import { CP_OVERFLOW_RISK_F } from './soaping-temperature.js';
import { LOW_COVERAGE_PERCENT, type SoapProperties } from './properties.js';
import {
  additiveMatches,
  additiveNameMatches,
  recipeOilMatches,
  type NamedCatalogEntry,
  type NamedOilEntry,
} from './keyword-match.js';
import { LS_ZONES } from './ls-method.js';

// Coconut-heavy proxy: lauric+myristic ≥ 55% stands in for ">75% coconut oil" — a
// documented estimate, not a cited source constant. Process-invariant (isCoconutHeavy):
// shared by the dual-lye recommender, the salt-thickening advisory, and hp_vessel_too_small
// below, so the proxy (and this doc) lives in one place.
const COCONUT_HEAVY_LAURIC_MYRISTIC = 55;

export type FormulationInsightLevel = 'info' | 'warning';

export type FormulationInsight = {
  level: FormulationInsightLevel;
  code: string;
  message: string;
};

export type FormulationAnalysisInput = {
  properties: SoapProperties | null;
  fattyAcids: FattyAcidProfile | null;
  /** Coverage of the fatty-acid profile (0–100); threshold insights are gated below LOW_COVERAGE_PERCENT. */
  fattyAcidCoveragePercent?: number;
  /** Coverage of the bar-property estimate (0–100); the cleansing insight is gated below LOW_COVERAGE_PERCENT. */
  propertyCoveragePercent?: number;
  totalOilGrams: number;
  superfatPercent: number;
  lyeConcentrationPercent: number;
  waterLyeRatio: number;
  waterGrams: number;
  lyeGrams: number;
  waterMode?: WaterMode;
  splitLiquidEnabled?: boolean;
  splitLiquidGrams?: number | null;
  splitLiquidAddAt?: 'lye' | 'oils' | 'trace';
  suggestedLyeWaterGrams?: number | null;
  /** Grams of water replaceable by trace split liquid; 0 when water is already at 1:1 minimum. */
  splitLiquidWaterReductionGrams?: number | null;
  totalAdditivePercent?: number;
  additiveEntries?: NamedCatalogEntry[];
  oilEntries?: NamedOilEntry[];
  lyeType?: LyeType;
  kohBlendPercent?: number;
  /** PUFA (linoleic + linolenic) % of the chosen post-cook superfat oil, when PCSF is active. */
  postCookSuperfatPufaPercent?: number;
  /** The recipe's process — the ONLY discriminator. Gates LS-specific insights and exempts
   * LS from the bar-soap water-band warnings (% of oils) via `process === 'ls'` /
   * `process !== 'ls'`; HP-only insights must gate on `process === 'hp'` specifically. */
  process: 'cp' | 'hp' | 'ls';
  /** Yogurt additive line's percent of oil weight (grams / totalOilGrams × 100); HP only —
   * its water content deducts from the recipe's lye water when stirred in after cook. */
  hpYogurtPercent?: number;
  /** Combined percent of oil weight across sugar-family additives (sugar/sorbitol, honey,
   * yogurt outside HP) — computed by the caller since {@link additiveEntries} carries no
   * percentages. The ceiling is process-aware: 4% under CP, 5% under HP and LS (an open
   * cook or high-temp paste tolerates the 1–5% sugar range; an insulated CP mold does
   * not). Under HP the caller already excludes yogurt from this sum (hp_yogurt_water
   * covers it).
   *
   * The figure is always oil-relative regardless of dosing basis: computeRecipeAdditives
   * resolves oil/batch/solution bases to actual grams upstream, before
   * sugarTotalPercentForInsights divides by total oil weight — so LS isn't penalized for
   * its different dosing basis. */
  sugarTotalPercent?: number;
  /** True when the recipe delivers glycerin as a lye-solution solvent (split-liquid row
   * or the LS glycerin additive). Advisory only: the source material gives no numeric
   * model for how much less dilution water a glycerin recipe needs. */
  lsGlycerinSolvent?: boolean;
  /** Percentage points of superfat the split liquids' own fat adds on top of the stated
   * superfat (superfatShiftFromLiquidFat). LS only: no lye is calculated against a milk's
   * or cream's fat, and liquid soap separates past ~3% superfat where a bar would not
   * care. Advisory, never a lye adjustment — the caller has fat fractions, not SAP values. */
  lsSplitLiquidFatShiftPercent?: number;
  /** Post-cook superfat total (% of oils) the recipe delivers after the cook
   * (ComputedPostCookSuperfat.percentOfOil). Counted into the LS cloud-threshold
   * insights via lsEffectiveSuperfatPercent — without it a 2% + 2% recipe sits at ~4%
   * effective superfat while both guards read only the main 2%. */
  postCookSuperfatPercent?: number;
  /** True when every split liquid is a solvent (glycerin). Suppresses the
   * dilute-with-plain-water advisory: glycerin carries no microbial load and is the one
   * alternative liquid that IS welcome in the dilution water. */
  lsSplitLiquidIsSolventOnly?: boolean;
  /** Two-tier water band (% of oils) for the recipe's process; CP/HP only. Absent for LS. */
  waterBand?: { lowTier: [number, number]; highTier: [number, number]; riversAbove: number };
  /** Single acceptable water range (% of oils) for liquid soap — LS:1505's "25-60% water
   * concentration". LS only; CP/HP publish the two-tier waterBand instead. */
  waterEnvelope?: [number, number];
  /** Predicted trace speed from {@link estimateTraceSpeed}; CP/HP soaping concern only —
   * callers pass undefined for liquid soap. */
  traceSpeedLabel?: 'slow' | 'moderate' | 'fast';
  /** The specific factors {@link estimateTraceSpeed} weighed to reach traceSpeedLabel
   * (e.g. "high saturated fats", "castor / ricinoleic"). Gated the same as the label —
   * callers should only pass this when traceSpeedLabel is also emitted. */
  traceSpeedDrivers?: string[];
  /** Cook vessel volume ÷ batch volume, computed by the caller (HP only). Gates
   * hp_vessel_too_small; undefined omits the check entirely (the guard input is optional). */
  hpVesselMultiple?: number;
  /** EFFECTIVE (clamped) soaping temperature in °F. Only the CP overflow guard reads it —
   * HP/LS callers may pass their cook temperature, the gate ignores them by process. */
  soapingTempF?: number;
};

export type InsightRuleParams = Record<string, number | string>;

export type InsightRule = {
  code: string;
  /** Processes this insight applies to; absent = all. Mirrors AdditiveCatalogEntry. */
  processes?: readonly ('cp' | 'hp' | 'ls')[];
  /** Base parameters; per-process overrides REPLACE individual keys (additive-catalog
   * semantics). Rules without process-varying values omit both. */
  params?: InsightRuleParams;
  processOverrides?: Partial<Record<'cp' | 'hp' | 'ls', InsightRuleParams>>;
  /** The insight's own condition + message, unchanged from the inline block. Returns
   * null when the insight does not fire. Reads PROCESS-INVARIANT logic from input;
   * everything the process changes must come from params. */
  check: (input: FormulationAnalysisInput, params: InsightRuleParams) => FormulationInsight | null;
};

export function resolveInsightParams(rule: InsightRule, process: 'cp' | 'hp' | 'ls'): InsightRuleParams {
  return { ...(rule.params ?? {}), ...(rule.processOverrides?.[process] ?? {}) };
}

// Shared by the three water_band_* rules below: they are mutually exclusive readings of
// the same water-percent-of-oils figure, so the branch decision lives in one place rather
// than three duplicated copies of the same threshold chain.
//
// CP's band has highTier[1]=40 extending past riversAbove=38 by design — both are verified
// source constants (see processProfile.ts). This rivers check runs first, so 38–40%
// (nominally the top of the high tier) always resolves to 'rivers', never
// 'between_tiers'/'below_low' — the rivers warning correctly wins the overlap.
function waterBandBranch(
  input: FormulationAnalysisInput,
): 'rivers' | 'between_tiers' | 'below_low' | null {
  if (input.waterBand && input.totalOilGrams > 0 && input.waterGrams > 0) {
    const waterPercentOfOils = (input.waterGrams / input.totalOilGrams) * 100;
    const { lowTier, highTier, riversAbove } = input.waterBand;
  // Band boundaries are author-facing integers, but waterGrams/totalOilGrams*100 lands a
  // half-ulp off for non-representable fractions (290/1000*100 = 28.999999999999996), so a
  // user at exactly 29% would be mis-coached by strict comparison. EPS absorbs float error
  // only — far below the 0.1 resolution any band figure carries.
  const EPS = 1e-9;
    if (waterPercentOfOils > riversAbove + EPS) {
      return 'rivers';
    } else if (waterPercentOfOils > lowTier[1] + EPS && waterPercentOfOils < highTier[0] - EPS) {
      return 'between_tiers';
    } else if (waterPercentOfOils < lowTier[0] - EPS) {
      return 'below_low';
    }
  }
  return null;
}

// The superfat the finished liquid soap actually carries: main superfat compounded with
// the post-cook superfat share — thin input adapter over the shared core definition
// (effectiveSuperfatPercent in lye.ts, beside the scaleLyeResult math it describes).
function lsEffectiveSuperfatPercent(input: FormulationAnalysisInput): number {
  return effectiveSuperfatPercent(input.superfatPercent, input.postCookSuperfatPercent);
}

// Coconut-heavy proxy shared by the dual-lye recommender, the salt-thickening advisory, and
// the HP vessel-size guard below.
// Process-invariant: callers gate by their own processes: declaration.
function isCoconutHeavy(input: FormulationAnalysisInput): boolean {
  if (!input.fattyAcids || (input.fattyAcidCoveragePercent ?? 100) < LOW_COVERAGE_PERCENT) {
    return false;
  }
  return (
    sumFattyAcids(input.fattyAcids, FATTY_ACID_GROUP_KEYS.lauricMyristic) >=
    COCONUT_HEAVY_LAURIC_MYRISTIC
  );
}

/** Exported FOR THE CONSISTENCY TEST ONLY (insights.test.ts's rule-registry-consistency
 * suite), not as public API for callers outside this module: `InsightRule.code` is never
 * read at runtime — analyzeFormulation's loop only pushes whatever `check()` returns — so a
 * copy-paste that updates one and not the other would ship a mislabeled insight past the
 * golden. The test cross-checks the two. */
export const INSIGHT_RULES: InsightRule[] = [
  {
    code: 'large_test_batch',
    check: (input) => {
      if (input.totalOilGrams > 500) {
        return {
          level: 'info',
          code: 'large_test_batch',
          message:
            'Oil batch over 500 g — smaller test batches are easier to troubleshoot if something goes wrong.',
        };
      }
      return null;
    },
  },
  {
    code: 'water_below_lye',
    check: (input) => {
      if (
        input.lyeGrams > 0 &&
        input.waterGrams > 0 &&
        input.waterGrams < input.lyeGrams
      ) {
        return {
          level: 'warning',
          code: 'water_below_lye',
          message:
            'Water is less than lye by weight — use at least a 1:1 water:lye ratio so alkali can dissolve safely.',
        };
      }
      return null;
    },
  },
  {
    code: 'no_superfat_margin',
    processes: ['cp', 'hp'],
    // Caustic-bar guard (NaOH bar soap only). At 0% superfat the lye is set to exactly
    // match the oils, leaving no unsaponified-oil buffer, so real variation in an oil's
    // SAP value or a small scale error goes straight into free lye — a harsh/caustic bar.
    // Liquid soap (KOH) is exempt: it legitimately runs at/below 0% and is neutralized
    // after cook. Behavior-only copy; no fixed "minimum safe %" is asserted (only the
    // no-buffer case is a clear, grounded hazard).
    check: (input) => {
      if (input.lyeGrams > 0 && input.superfatPercent <= 0) {
        return {
          level: 'warning',
          code: 'no_superfat_margin',
          message:
            '0% superfat sets the lye to exactly match the oils, leaving no unsaponified-oil buffer — ' +
            'normal variation in oil SAP values or a small scale error then leaves free lye, which can ' +
            'make the bar harsh or caustic. Most bar recipes keep a few percent superfat.',
        };
      }
      return null;
    },
  },
  // The lye-concentration band warnings (below ~20%, above ~38%) are GONE. A four-source
  // review of the water literature found no support for either threshold, and the high one
  // misfired on published practice: it fires from ~21% water of oils downward, i.e. across
  // part of the very water-discount band the CP source recommends, and on the low-water
  // formulas a science source tested and explicitly cleared ("you can safely experiment with
  // low-water soaps up to and including lye concentrations of 50%").
  //
  // The only concentration boundary any source states is 50% — the 1:1 dissolution floor —
  // and water_below_lye above already covers it with the correct reason (the alkali cannot
  // dissolve), rather than the workability guesses these carried. Excess water is covered by
  // the per-process water band below, in % of oils, which is the unit the sources actually
  // publish. Do not reintroduce a concentration threshold without a source for the number.
  {
    code: 'water_band_rivers',
    processes: ['cp', 'hp'],
    check: (input) => {
      if (waterBandBranch(input) === 'rivers') {
        return {
          level: 'warning',
          code: 'water_band_rivers',
          message:
            'Water is above the typical range for this process — the batter may take a long time to firm up, and can glycerin-river if it also goes through gel. Consider a lower water amount.',
        };
      }
      return null;
    },
  },
  {
    code: 'water_band_between_tiers',
    processes: ['cp', 'hp'],
    check: (input) => {
      if (waterBandBranch(input) === 'between_tiers') {
        return {
          level: 'info',
          code: 'water_band_between_tiers',
          message:
            'Water sits between the low-water and full-water working ranges — fine, but nudging into either range gives more predictable trace and cure.',
        };
      }
      return null;
    },
  },
  {
    code: 'water_band_below_low',
    processes: ['cp', 'hp'],
    check: (input) => {
      if (waterBandBranch(input) === 'below_low') {
        return {
          level: 'info',
          code: 'water_band_below_low',
          message:
            'Very low water for this process — trace comes fast and the batter can be stiff; work quickly and keep temperatures modest.',
        };
      }
      return null;
    },
  },
  {
    code: 'ls_water_outside_envelope',
    processes: ['ls'],
    // The one water figure the LS reference publishes: 25–60% of oil weight (equivalently
    // about 1:1 to 5:1 water:lye). Outside it the recipe still works, so this is info —
    // low water makes a stiffer paste that takes longer to dilute, high water a softer one
    // that can weep. The 1:1 dissolution floor is a separate, harder rule (water_below_lye).
    check: (input) => {
      const [lo, hi] = (input.waterEnvelope ?? []) as [number, number];
      if (lo === undefined || input.totalOilGrams <= 0 || input.waterGrams <= 0) return null;
      const pct = (input.waterGrams / input.totalOilGrams) * 100;
      const EPS = 1e-9;
      if (pct >= lo - EPS && pct <= hi + EPS) return null;
      // One decimal, not zero: the comparison above runs on the unrounded percent, so a
      // value like 24.9% is genuinely outside the 25–60% envelope, but toFixed(0) rounded
      // it to the same "25%" the message claims to be below — the stated figure could equal
      // the boundary it was outside of. A decimal keeps the two numbers from ever colliding.
      const pctText = pct.toFixed(1);
      return {
        level: 'info',
        code: 'ls_water_outside_envelope',
        message:
          pct < lo
            ? `Water is ${pctText}% of oils, below the usual ${lo}–${hi}% for liquid soap — the paste will be stiffer and slower to dilute. Workable, but check it stays mixable.`
            : `Water is ${pctText}% of oils, above the usual ${lo}–${hi}% for liquid soap — a softer paste that can weep in storage. Fine if you are diluting straight away.`,
      };
    },
  },
  {
    code: 'high_short_chain_low_long_chain',
    processes: ['cp', 'hp'],
    // Bar-soap framing ("bar may feel... and wear quickly") — LS has its own lather/salt
    // coaching (ls_salt_thickening, ls_dual_lye_recommendation) for a coconut-heavy profile,
    // so this stays CP/HP-only, mirroring eutectic_lather_sources' LS gate above.
    check: (input) => {
      if (
        input.fattyAcids &&
        (input.fattyAcidCoveragePercent ?? 100) >= LOW_COVERAGE_PERCENT
      ) {
        const lauricMyristic = sumFattyAcids(
          input.fattyAcids,
          FATTY_ACID_GROUP_KEYS.lauricMyristic,
        );
        const palmiticStearic = sumFattyAcids(
          input.fattyAcids,
          FATTY_ACID_GROUP_KEYS.palmiticStearic,
        );
        if (lauricMyristic > 35 && palmiticStearic < 15) {
          return {
            level: 'info',
            code: 'high_short_chain_low_long_chain',
            message:
              'High lauric + myristic with low palmitic + stearic — bar may feel very cleansing and wear quickly unless superfat is generous.',
          };
        }
      }
      return null;
    },
  },
  {
    code: 'high_poly_high_superfat',
    check: (input) => {
      if (
        input.fattyAcids &&
        (input.fattyAcidCoveragePercent ?? 100) >= LOW_COVERAGE_PERCENT
      ) {
        const poly = sumFattyAcids(input.fattyAcids, FATTY_ACID_GROUP_KEYS.polyunsaturated);
        if (poly > 28 && input.superfatPercent >= 8) {
          return {
            level: 'warning',
            code: 'high_poly_high_superfat',
            message:
              'High linoleic + linolenic with elevated superfat — watch shelf life; store cool and use within a few months.',
          };
        }
      }
      return null;
    },
  },
  {
    code: 'eutectic_lather_sources',
    processes: ['cp', 'hp'],
    // Bar-lather claim — liquid soap's lather framing is different (see ls_castor_no_lather
    // and the LS salt/dual-lye advisories below), so this stays a CP/HP-only insight.
    check: (input) => {
      if (
        input.fattyAcids &&
        (input.fattyAcidCoveragePercent ?? 100) >= LOW_COVERAGE_PERCENT
      ) {
        const oleic = input.fattyAcids.oleic ?? 0;
        const lauric = input.fattyAcids.lauric ?? 0;
        if (lauric >= 5 && oleic >= 20) {
          return {
            level: 'info',
            code: 'eutectic_lather_sources',
            message:
              'Both lauric and oleic sources present — supports a balanced fluffy and stable lather.',
          };
        }
      }
      return null;
    },
  },
  {
    code: 'high_cleansing_low_superfat',
    processes: ['cp', 'hp'],
    check: (input) => {
      if (
        input.properties &&
        (input.propertyCoveragePercent ?? 100) >= LOW_COVERAGE_PERCENT
      ) {
        const cleansing = input.properties.cleansing;
        const superfat = input.superfatPercent;
        if (cleansing > 22 && superfat < 6) {
          return {
            level: 'info',
            code: 'high_cleansing_low_superfat',
            message:
              'Cleansing score above the usual range with modest superfat — bar may feel stripping; consider more superfat or softer oils.',
          };
        }
      }
      return null;
    },
  },
  {
    code: 'low_cleansing_expected',
    processes: ['cp', 'hp'],
    // Castile / olive-dominant bars read near-zero cleansing but cure into fine, mild bars.
    // Surface it as reassurance, not a defect: all soap cleans. oleic is a fatty-acid
    // reading, so it needs the fatty-acid coverage gate too, not just the property gate
    // this block is already inside.
    check: (input) => {
      if (
        input.properties &&
        (input.propertyCoveragePercent ?? 100) >= LOW_COVERAGE_PERCENT
      ) {
        const cleansing = input.properties.cleansing;
        const oleic = input.fattyAcids?.oleic ?? 0;
        if (
          cleansing < 12 &&
          oleic >= 50 &&
          (input.fattyAcidCoveragePercent ?? 100) >= LOW_COVERAGE_PERCENT
        ) {
          return {
            level: 'info',
            code: 'low_cleansing_expected',
            message:
              'A near-zero cleansing score is normal for olive/high-oleic bars — all soap cleans; this cures into a gentle, low-stripping bar.',
          };
        }
      }
      return null;
    },
  },
  {
    code: 'split_liquid_water_not_adjusted',
    check: (input) => {
      if (
        input.splitLiquidEnabled &&
        input.splitLiquidAddAt === 'trace' &&
        input.splitLiquidGrams !== null &&
        input.splitLiquidGrams !== undefined &&
        input.splitLiquidGrams > 0 &&
        input.suggestedLyeWaterGrams !== null &&
        input.suggestedLyeWaterGrams !== undefined &&
        input.waterGrams > input.suggestedLyeWaterGrams + 0.5
      ) {
        return {
          level: 'warning',
          code: 'split_liquid_water_not_adjusted',
          message:
            'Alternative liquid is listed separately — water is not reduced automatically. Use the suggested lye water in Split liquid or lower your water %.',
        };
      }
      return null;
    },
  },
  {
    code: 'split_liquid_high_trace_liquid',
    check: (input) => {
      if (
        input.splitLiquidEnabled &&
        input.splitLiquidAddAt === 'trace' &&
        input.splitLiquidGrams !== null &&
        input.splitLiquidGrams !== undefined &&
        input.splitLiquidGrams > 0 &&
        input.totalOilGrams > 0 &&
        input.splitLiquidWaterReductionGrams !== null &&
        input.splitLiquidWaterReductionGrams !== undefined &&
        input.splitLiquidWaterReductionGrams <= 0 &&
        (input.splitLiquidGrams / input.totalOilGrams) * 100 > 5
      ) {
        return {
          level: 'warning',
          code: 'split_liquid_high_trace_liquid',
          message:
            'Water is already at the 1:1 lye minimum — alternative liquid at trace adds extra total liquid. Expect faster trace, softer bars, or a wetter batter.',
        };
      }
      return null;
    },
  },
  {
    code: 'high_total_additives',
    check: (input) => {
      if (input.totalAdditivePercent !== undefined && input.totalAdditivePercent > 10) {
        return {
          level: 'warning',
          code: 'high_total_additives',
          message:
            'Total additives exceed ~10% of oil weight — may affect trace, texture, or shelf life; verify with a small test batch.',
        };
      }
      return null;
    },
  },
  {
    code: 'sugar_total_high',
    // Sugar-family additives all accelerate trace and heat retention similarly; a single
    // message on the combined total, not per-additive, since it's the total dose that
    // tunnels/overheats the batch. The MECHANISM (sugar mass relative to oil mass) is
    // process-independent, but the TOLERANCE is not: an insulated CP mold traps the heat
    // (ceiling 4), while an HP open cook and an LS high-temp paste both run sugars to ~5
    // (LS sources endorse 1–5% of oils). Under HP the sum upstream already excludes yogurt
    // (hp_yogurt_water covers it), so the HP copy names only the counted sources; CP/LS
    // keep yogurt in the sum and the copy. See sugarTotalPercent's doc above for how a
    // solution-dosed LS additive still resolves to its true %-of-oil here.
    params: { ceilingPercent: 4, family: 'sugar/sorbitol, honey, yogurt' },
    processOverrides: {
      hp: { ceilingPercent: 5, family: 'sugar/sorbitol, honey' },
      ls: { ceilingPercent: 5 },
    },
    // The ceiling and additive-family wording are parameterized above; the sentence SHAPE
    // still differs by process (HP's cook can "scorch or volcano", CP/LS's batch can
    // "tunnel or overheat, especially when insulated") — that is a genuine process-varying
    // message, not a leftover threshold, so this is one of the accepted `input.process`
    // reads left in the file (see the spec-fidelity gate note above INSIGHT_RULES's export).
    check: (input, params) => {
      const ceilingPercent = params.ceilingPercent as number;
      const family = params.family as string;
      if (input.sugarTotalPercent !== undefined && input.sugarTotalPercent > ceilingPercent) {
        return {
          level: 'warning',
          code: 'sugar_total_high',
          message:
            input.process === 'hp'
              ? `Combined sugar-family additives (${family}) exceed ~${ceilingPercent}% of oil weight — the cook can scorch or volcano. Consider reducing the total dose.`
              : `Combined sugar-family additives (${family}) exceed ~${ceilingPercent}% of oil weight — the batch can tunnel or overheat, especially when insulated. Consider reducing the total dose.`,
        };
      }
      return null;
    },
  },
  {
    code: 'soaping_temp_high',
    processes: ['cp'],
    // CP overflow guard: a starting temperature past 160 °F sharply raises volcano risk
    // (verified constant; see CP_OVERFLOW_RISK_F for the °F/°C typo note). CP-gated on
    // purpose — HP and LS run their cooks at 215 °F by design.
    check: (input) => {
      if (input.soapingTempF !== undefined && input.soapingTempF > CP_OVERFLOW_RISK_F) {
        return {
          level: 'warning',
          code: 'soaping_temp_high',
          message:
            'Starting temperature above 160 °F (71 °C) — the batch can overheat and overflow the mold. Let the oils and lye cool below 160 °F before combining.',
        };
      }
      return null;
    },
  },
  {
    code: 'glycerin_solvent_dilution',
    processes: ['ls'],
    // Glycerin-as-solvent advisory (LS): the paste dissolves faster and the finished soap
    // reaches its target feel with less dilution water than the water-only figure suggests.
    // No numeric model exists — advise increments, never adjust the dilution math.
    check: (input) => {
      if (input.lsGlycerinSolvent) {
        return {
          level: 'info',
          code: 'glycerin_solvent_dilution',
          message:
            'Glycerin acts as a solvent: the paste dissolves faster and needs less dilution water than the water-only figure — dilute in increments and stop at the target consistency.',
        };
      }
      return null;
    },
  },
  {
    code: 'dual_lye_advanced',
    check: (input) => {
      if (input.lyeType === 'dual' && (input.kohBlendPercent ?? DEFAULT_KOH_BLEND_PERCENT) > 0) {
        return {
          level: 'info',
          code: 'dual_lye_advanced',
          message:
            'Dual NaOH + KOH is an advanced technique — weigh each alkali separately and verify the batch with a small test pour before scaling up.',
        };
      }
      return null;
    },
  },
  {
    code: 'magnesium_salt_scum',
    // Magnesium-bearing salts (Epsom = magnesium sulfate, Dead Sea salt) are the one salt
    // family that damages soap rather than hardening it: magnesium displaces the alkali
    // cation to form insoluble magnesium soap — the same soap scum hard water makes, but
    // built into the bar. Not a lye-math concern (no salt consumes alkali), so this is a
    // warning, not a calculation. Deliberately keyword-only: there is no catalog entry to
    // match on, because these should not be offered in the first place. Fires in every
    // process — the reaction is with soap, not with a process step.
    check: (input) => {
      if (
        ['epsom', 'magnesium', 'dead sea'].some((keyword) =>
          additiveNameMatches(input.additiveEntries, keyword),
        )
      ) {
        return {
          level: 'warning',
          code: 'magnesium_salt_scum',
          message:
            'Magnesium-bearing salts (Epsom, Dead Sea) react with soap to form an insoluble magnesium soap — the same scum hard water leaves, but built into the bar: weaker lather, slimy residue, and a higher rancidity risk. For a harder bar use table, sea, Himalayan or black lava salt, which are all sodium chloride and behave identically.',
        };
      }
      return null;
    },
  },
  {
    code: 'oatmeal_false_trace',
    check: (input) => {
      if (additiveMatches(input.additiveEntries, 'oatmeal', 'oatmeal')) {
        return {
          level: 'info',
          code: 'oatmeal_false_trace',
          message:
            'Oatmeal can cause false trace — do not rely on viscosity alone; confirm with a pH strip or zap test.',
        };
      }
      return null;
    },
  },
  {
    code: 'jojoba_superfat_note',
    check: (input) => {
      if (
        additiveMatches(input.additiveEntries, 'jojoba', 'jojoba') ||
        recipeOilMatches(input.oilEntries, {
          oilIds: ['jojoba-oil', 'jojoba-oil-a-liquid-wax-ester'],
          nameKeyword: 'jojoba',
        })
      ) {
        return {
          level: 'info',
          code: 'jojoba_superfat_note',
          message:
            'Jojoba is mostly unsaponifiable — treat it as a superfatting oil and keep total jojoba near typical 5–10% of oils.',
        };
      }
      return null;
    },
  },
  {
    code: 'high_pufa_post_cook_superfat',
    check: (input) => {
      if (
        input.postCookSuperfatPufaPercent !== undefined &&
        input.postCookSuperfatPufaPercent > 30
      ) {
        return {
          level: 'warning',
          code: 'high_pufa_post_cook_superfat',
          message:
            // Dose follows the EXPERIMENT, not the craft books. The DOS study tested every
            // preservative at 1 ppt — "0.1 grams of each per 100.0 of oil" — and that series
            // produced the best result of all: BHT with sodium citrate held the soap at
            // fresh colour past its 300-hour limit (BHT alone was still effective at
            // 0.7 ppt). Three craft books print "1%", 10x that, which also sits above
            // typical cosmetic use (0.01–0.1%) and above the EU's 0.8% cap for BHT. The
            // books cite an unnamed study whose winning pair matches this one exactly, so
            // a ppt→% slip is the likely origin — either way, 0.1% is the tested figure.
            'Post-cook superfat oil is high in linoleic + linolenic — left unsaponified, it is prone to DOS/rancidity. Prefer a stable superfat oil (coconut, olive, almond, cocoa, shea) and/or an antioxidant (0.1% BHT + 0.1% sodium citrate is the best-performing tested pair); store cool.',
        };
      }
      return null;
    },
  },
  {
    code: 'dos_risk_no_antioxidant',
    // PUFA-heavy recipes are the ones that develop DOS: the experiment's induction period
    // shortened with soft oils and with catalytic metals. Two independent routes work —
    // an antioxidant against atmospheric oxygen (BHT, ROE) and a chelator against metal
    // ions (EDTA — citrate alone does not qualify, see below) — so this only fires when
    // NEITHER kind is present. Info, not warning: DOS is a shelf-life risk, not a safety
    // one, and plenty of makers accept it.
    check: (input) => {
      // Stand down when high_pufa_post_cook_superfat would also fire (same > 30 gate on
      // postCookSuperfatPufaPercent, checked here verbatim): that rule already names the
      // antioxidant remedy (0.1% BHT + 0.1% sodium citrate) for the identical underlying
      // risk — an unsaponified PUFA-heavy oil going rancid. Without this, a high-PUFA
      // recipe with elevated post-cook superfat fired both insights together, two
      // differently-worded antioxidant doses stacked on the same shelf-life panel.
      if (
        input.postCookSuperfatPufaPercent !== undefined &&
        input.postCookSuperfatPufaPercent > 30
      ) {
        return null;
      }
      if (!input.fattyAcids || (input.fattyAcidCoveragePercent ?? 100) < LOW_COVERAGE_PERCENT) {
        return null;
      }
      const pufa = sumFattyAcids(input.fattyAcids, FATTY_ACID_GROUP_KEYS.polyunsaturated);
      // 25% PUFA is an UNSOURCED proxy for "soft enough to spot" — the experiment gives
      // no threshold, only that soft oils shortened the induction period. Same posture as
      // COCONUT_HEAVY_LAURIC_MYRISTIC: a documented estimate, not a cited constant.
      if (pufa <= 25) return null;
      // Citrate does NOT silence this insight: the experiment found sodium citrate alone
      // "showed no prophylactic effect" (and roe + citrate performed WORSE than roe
      // alone) — its DOS value is only ever as a partner to an antioxidant. EDTA alone
      // WAS effective, so it counts. Same follow-the-experiment rule as the doses.
      const protected_ =
        additiveMatches(input.additiveEntries, 'bht', 'bht') ||
        additiveMatches(input.additiveEntries, 'roe', 'rosemary') ||
        additiveMatches(input.additiveEntries, 'edta', 'edta');
      if (protected_) return null;
      return {
        level: 'info',
        code: 'dos_risk_no_antioxidant',
        message:
          'High linoleic + linolenic with no antioxidant or chelator — this is the profile ' +
          'that develops rancid orange spots first. 0.1% BHT or 0.1–0.2% ROE into the oils ' +
          'protects against oxygen; a chelator binds the metal ions that catalyse it. ' +
          'Distilled water and cool, dark storage do the same job for free.',
      };
    },
  },
  {
    code: 'superfat_out_of_band',
    processes: ['cp', 'hp'],
    check: (input) => {
      if (input.superfatPercent < 3 || input.superfatPercent > 30) {
        return {
          level: 'info',
          code: 'superfat_out_of_band',
          message:
            'Superfat is outside the usual 3–30% working range (about 5% is common) — intentional for some bars, but double-check it is deliberate.',
        };
      }
      return null;
    },
  },
  {
    code: 'pufa_cap_superfat',
    processes: ['cp', 'hp'],
    check: (input) => {
      if (
        input.fattyAcids &&
        (input.fattyAcidCoveragePercent ?? 100) >= LOW_COVERAGE_PERCENT
      ) {
        const poly = sumFattyAcids(input.fattyAcids, FATTY_ACID_GROUP_KEYS.polyunsaturated);
        if (poly > 18 && input.superfatPercent > 5) {
          return {
            level: 'warning',
            code: 'pufa_cap_superfat',
            message:
              'High linoleic + linolenic oils with an elevated superfat — the unsaponified oil is prone to going rancid. For high-PUFA recipes keep superfat nearer 3–5%.',
          };
        }
      }
      return null;
    },
  },
  {
    code: 'trace_speed',
    processes: ['cp', 'hp'],
    check: (input) => {
      if (!input.traceSpeedLabel) return null;
      const tip =
        input.traceSpeedLabel === 'fast'
          ? 'Expect a quick trace — soap cool, blend in short bursts, and add fragrance last.'
          : input.traceSpeedLabel === 'slow'
            ? 'Expect a slow trace — this batter stays fluid, giving time for swirls and intricate pours.'
            : 'A moderate trace — comfortable working time for most techniques.';
      const driversClause =
        input.traceSpeedDrivers && input.traceSpeedDrivers.length > 0
          ? ` Driven by: ${input.traceSpeedDrivers.join(', ')}.`
          : '';
      return {
        level: 'info',
        code: 'trace_speed',
        message: `Predicted trace speed: ${input.traceSpeedLabel}. ${tip}${driversClause}`,
      };
    },
  },
  {
    code: 'ls_split_liquid_fat_superfat',
    processes: ['ls'],
    // Fat riding in on an alternative liquid (milk, cream, canned coconut milk). A bar
    // recipe ignores it — the classic advice is that milk fat is too small to matter.
    // Liquid soap cannot: it separates past ~3% superfat, and a fatty liquid can push a
    // compliant 2% recipe well past that on its own. Advisory, not a lye correction: fat
    // fractions are composition data, not SAP values, so the fix (lower the superfat, or
    // run a lye excess) stays the user's call.
    check: (input) => {
      const fatShift = input.lsSplitLiquidFatShiftPercent ?? 0;
      const recipeSuperfat = lsEffectiveSuperfatPercent(input);
      const effective = recipeSuperfat + fatShift;
      // Gate on the COMBINED total, not the fat alone: below the ~3% ceiling the fat is
      // absorbed and "lower the superfat" would contradict the number in the same
      // sentence; a deliberate lye excess (negative total) absorbs it too.
      if (Number.isFinite(fatShift) && fatShift >= 0.5 && effective > 3) {
        const hasPostCook = (input.postCookSuperfatPercent ?? 0) > 0;
        const recipeClause = hasPostCook
          ? `the ${recipeSuperfat.toFixed(1)}% the recipe already delivers (superfat + post-cook oil)`
          : `the ${input.superfatPercent.toFixed(1)}% you set`;
        return {
          level: 'warning',
          code: 'ls_split_liquid_fat_superfat',
          message:
            `The alternative liquid's own fat gets no lye, adding about ${fatShift.toFixed(1)} points of ` +
            `superfat on top of ${recipeClause} — an effective ` +
            `${effective.toFixed(1)}%. Liquid soap clouds and separates past ~3%: lower the superfat ` +
            `(or run a small lye excess) to absorb it.`,
        };
      }
      return null;
    },
  },
  {
    code: 'ls_split_liquid_not_dilution',
    processes: ['ls'],
    // Where the liquid may NOT go. The split-liquid stages are all pre-cook, so the app
    // never offers a dilution stage — this says why, since dilution is the step an LS
    // maker is most tempted to pour milk or beer into. Glycerin-only recipes are exempt
    // (see the flag).
    check: (input) => {
      if (
        input.splitLiquidEnabled &&
        input.splitLiquidGrams !== null &&
        input.splitLiquidGrams !== undefined &&
        input.splitLiquidGrams > 0 &&
        !input.lsSplitLiquidIsSolventOnly
      ) {
        return {
          level: 'info',
          code: 'ls_split_liquid_not_dilution',
          message:
            'Alternative liquids belong in the lye solution or at trace, where the cook sterilises them — never in the dilution water. Dilute with plain distilled water, add a preservative, and filter any sediment after the soap settles.',
        };
      }
      return null;
    },
  },
  {
    code: 'ls_superfat_high',
    processes: ['ls'],
    // Threshold reads the EFFECTIVE superfat (main compounded with post-cook), not just the
    // stated figure — a 2% + 2% recipe lands at ~4%, over the same ceiling.
    check: (input) => {
      const effective = lsEffectiveSuperfatPercent(input);
      if (effective > 3) {
        const hasPostCook = (input.postCookSuperfatPercent ?? 0) > 0;
        const breakdown = hasPostCook
          ? `Superfat ${input.superfatPercent.toFixed(1)}% plus the post-cook oil lands at ~${effective.toFixed(1)}% total. `
          : '';
        return {
          level: 'warning',
          code: 'ls_superfat_high',
          message:
            `${breakdown}Liquid soap above ~3% superfat can turn cloudy and separate — keep the combined LS superfat around 1–3%.`,
        };
      }
      return null;
    },
  },
  {
    code: 'ls_no_superfat_buffer',
    processes: ['ls'],
    // Exact lye: the combined superfat is 0, so the alkali is set to saponify every gram of
    // oil. Reachable from the defaults — LS seeds main superfat 0% + post-cook 2%, so
    // deleting the optional post-cook row lands here — and no other rule covers it
    // (no_superfat_margin is CP/HP-gated, ls_lye_excess needs superfat < 0,
    // ls_superfat_high needs > 3).
    //
    // INFO, and only at exactly 0. Exact-lye liquid soap is a documented configuration, and
    // the no-paste high-temp method publishes a 0–3% superfat range — so warning here would
    // call a published practice a defect. The trade-off is still worth stating once, because
    // absorbing SAP variation is the whole reason a superfat exists. Anything above 0 keeps
    // some buffer and is inside that range, so it says nothing.
    //
    // A NEGATIVE superfat is exempt: that is the deliberate lye-excess workflow, and
    // ls_lye_excess already carries its neutralization guidance.
    check: (input) => {
      const effective = lsEffectiveSuperfatPercent(input);
      if (input.superfatPercent >= 0 && effective <= 0) {
        return {
          level: 'info',
          code: 'ls_no_superfat_buffer',
          message:
            'Exact lye — no superfat buffer. That is a deliberate choice in some liquid-soap ' +
            'methods, but nothing is left to absorb normal SAP variation or a small scale error, ' +
            'so either can leave free alkali in the finished soap. Most liquid soap keeps a ' +
            'combined 1–3% superfat, or runs a small lye excess and neutralizes after the cook.',
        };
      }
      return null;
    },
  },
  {
    code: 'ls_castor_no_lather',
    processes: ['ls'],
    // The bar-soap eutectic-lather framing (lauric + oleic → fluffy/stable lather) doesn't
    // carry over to liquid soap; castor's role there is solubility/clarity, not lather.
    // Detect castor via the ricinoleic fatty-acid reading (a documented proxy — castor is
    // essentially the only common soaping oil with meaningful ricinoleic) gated by
    // fatty-acid coverage, OR via oil identity, which needs no coverage gate (same pattern
    // as the jojoba oil-identity check above).
    check: (input) => {
      const ricinoleicForCastor = input.fattyAcids?.ricinoleic ?? 0;
      const hasCastorByFattyAcid =
        ricinoleicForCastor >= 4 &&
        (input.fattyAcidCoveragePercent ?? 100) >= LOW_COVERAGE_PERCENT;
      const hasCastorByIdentity = recipeOilMatches(input.oilEntries, {
        oilIds: ['castor-oil'],
        nameKeyword: 'castor',
      });
      if (hasCastorByFattyAcid || hasCastorByIdentity) {
        return {
          level: 'info',
          code: 'ls_castor_no_lather',
          message:
            'Castor adds little lather in liquid soap — its main contribution here is solubility and clarity, not lather.',
        };
      }
      return null;
    },
  },
  {
    code: 'ls_dual_lye_recommendation',
    processes: ['ls'],
    // Dual-lye NaOH-share recommender (verified constants, roadmap LS 86): coconut-heavy
    // LS benefits from a ~30% NaOH share regardless of current lye type (worth switching to
    // dual lye for), while a low-palmitic+stearic blend that is already dual-lye benefits
    // from a smaller ~0–20% NaOH share. Deliberately silent for a pure-KOH, low-P+S recipe
    // with no coconut — nothing actionable to recommend without nagging the user into dual
    // lye.
    check: (input) => {
      if (
        !input.fattyAcids ||
        (input.fattyAcidCoveragePercent ?? 100) < LOW_COVERAGE_PERCENT
      ) {
        return null;
      }
      const palmiticStearicForDualLye = sumFattyAcids(
        input.fattyAcids,
        FATTY_ACID_GROUP_KEYS.palmiticStearic,
      );

      let dualLyeMessage: string | null = null;
      if (isCoconutHeavy(input)) {
        dualLyeMessage =
          'High-coconut liquid soap firms and thickens with a ~30% NaOH share in a dual-lye blend.';
      } else if (palmiticStearicForDualLye <= 15 && input.lyeType === 'dual') {
        dualLyeMessage =
          'Low in palmitic + stearic — a small NaOH share (~0–20%) in your blend gives a firmer, thicker soap.';
      }

      if (dualLyeMessage) {
        return {
          level: 'info',
          code: 'ls_dual_lye_recommendation',
          message: dualLyeMessage,
        };
      }
      return null;
    },
  },
  {
    code: 'ls_salt_thickening',
    processes: ['ls'],
    // Salt-thickening is a qualitative advisory, not a numeric viscosity model — no
    // calibrated curve exists for how much salt thickens diluted LS by process/oil mix, so
    // this ships behavior-only guidance (thickens then thins past a point) and never a
    // number.
    check: (input) => {
      if (additiveMatches(input.additiveEntries, 'salt', 'salt')) {
        let message =
          'Salt thickens diluted liquid soap up to a point, then thins it past that point — add a dilute brine gradually and test as you go.';

        if (isCoconutHeavy(input)) {
          message +=
            ' High-coconut liquid soap barely responds to salt — use guar or HEC instead if you need more body.';
        }

        return {
          level: 'info',
          code: 'ls_salt_thickening',
          message,
        };
      }
      return null;
    },
  },
  {
    code: 'ls_coconut_hot_cook',
    processes: ['ls'],
    // Coconut-heavy LS expands hard in a hot cook (sourced; see the redesign spec). Fires
    // across the high-temp-owned region (>=160, i.e. LS_ZONES.lowMaxF — the gap from 160
    // is owned by high temp, see ls-method.ts) REGARDLESS of zone: the compliant reduced
    // range 150–175 dips into the low-temp band on purpose, and an insight keyed only to
    // the high zone would vanish the moment the user follows it. 160 (not 150) is the
    // threshold because below it the user has already left the hot cook — the app's own
    // fresh-recipe default (150 °F) must not warn. isCoconutHeavy carries its own
    // FA-coverage gate; Number.isFinite also closes the NaN hole (NaN < anything is false,
    // which used to silently pass the old `< 150` guard).
    check: (input) => {
      if (!isCoconutHeavy(input)) return null;
      if (!Number.isFinite(input.soapingTempF) || input.soapingTempF! < LS_ZONES.lowMaxF) {
        return null;
      }
      return {
        level: 'warning',
        code: 'ls_coconut_hot_cook',
        message:
          'Coconut-heavy liquid soap expands hard in a hot cook. If running the high-temp method, ' +
          'reduce the hold to 66–79 °C (150–175 °F) (that range dips into the low-temp band on purpose) and ' +
          'use a vessel at least 3× the total recipe volume; pure-coconut no-paste recipes should ' +
          'not start above 82 °C (180 °F).',
      };
    },
  },
  {
    code: 'ls_pcsf_emulsifier',
    processes: ['ls'],
    // A post-cook superfat needs an emulsifier in liquid soap: the added oil is never
    // saponified, and without one it floats off instead of staying suspended. Fires only
    // while no polysorbate line is in the recipe; five keyword checks cover the common
    // custom-name spellings (polysorbate / poly 80 / tween / tween80 / poly-80) since
    // wordBoundaryMatch is a literal \b<keyword>\b match and no single keyword covers all
    // of them — 'Tween80' and 'Poly-80' in particular have no word boundary before the
    // digits, so the space-delimited keywords above miss them.
    check: (input) => {
      const pcsf = input.postCookSuperfatPercent ?? 0;
      if (!Number.isFinite(pcsf) || pcsf < 0.5) return null;
      if (
        additiveMatches(input.additiveEntries, 'polysorbate-80', 'polysorbate') ||
        additiveNameMatches(input.additiveEntries, 'poly 80') ||
        additiveNameMatches(input.additiveEntries, 'tween') ||
        additiveNameMatches(input.additiveEntries, 'tween80') ||
        additiveNameMatches(input.additiveEntries, 'poly-80')
      ) {
        return null;
      }
      return {
        level: 'info',
        code: 'ls_pcsf_emulsifier',
        message:
          'Post-cook superfat oil needs an emulsifier in liquid soap — warm polysorbate 80 ' +
          '1:1 with the oil and premix before adding, or the oil separates instead of staying ' +
          'suspended. An antioxidant alongside helps the unsaponified oil keep.',
      };
    },
  },
  {
    code: 'hp_thick_phase_suppressant',
    processes: ['hp'],
    check: (input) => {
      if (
        additiveMatches(input.additiveEntries, 'salt', 'salt') ||
        additiveMatches(input.additiveEntries, 'sodium-lactate', 'sodium lactate')
      ) {
        return {
          level: 'info',
          code: 'hp_thick_phase_suppressant',
          message:
            'Salt or sodium lactate suppresses the thick, translucent "mashed potato" middle phase of a hot-process cook — expect a smoother, faster transition through cook.',
        };
      }
      return null;
    },
  },
  {
    code: 'hp_yogurt_water',
    processes: ['hp'],
    check: (input) => {
      if (input.hpYogurtPercent !== undefined && input.hpYogurtPercent > 5) {
        return {
          level: 'warning',
          code: 'hp_yogurt_water',
          message:
            'Yogurt above ~5% of oil weight deducts meaningfully from the lye water — check the cooked soap stays fluid enough to fold in additives and pour.',
        };
      }
      return null;
    },
  },
  {
    code: 'hp_relaxed_caps',
    processes: ['hp'],
    // Ricinoleic is a fatty-acid reading, so it needs the same low-coverage gate the other
    // FA-derived insights use above. Shea is an oil-identity check (recipeOilMatches), not
    // an FA reading, so it fires independent of fatty-acid coverage — same pattern as the
    // jojoba oil-identity insight elsewhere in this file.
    check: (input) => {
      const ricinoleic = input.fattyAcids?.ricinoleic ?? 0;
      const hasElevatedCastor =
        ricinoleic >= 10 && (input.fattyAcidCoveragePercent ?? 100) >= LOW_COVERAGE_PERCENT;
      const hasShea = recipeOilMatches(input.oilEntries, {
        oilIds: ['shea-butter', 'shea-oil-fractionated'],
        nameKeyword: 'shea',
      });
      if (hasElevatedCastor || hasShea) {
        return {
          level: 'info',
          code: 'hp_relaxed_caps',
          message:
            'Fluid HP tolerates higher castor (about 10–15%) and shea (about 30–40%) than a typical CP bar — the hot cook and post-cook additions give more working room before trace or texture become unworkable.',
        };
      }
      return null;
    },
  },
  {
    code: 'hp_vessel_too_small',
    processes: ['hp'],
    // Vessel-size guard: the cooking batter expands (gel/mashed-potato phase) and can
    // overflow a too-small pot. Required multiple is the same coconut-heavy proxy used
    // above (lauric+myristic >= COCONUT_HEAVY_LAURIC_MYRISTIC), coverage-gated so a sparse
    // fatty-acid read doesn't wrongly demand the higher 3x minimum. hpVesselMultiple is
    // caller-computed and optional — undefined skips the check entirely.
    check: (input) => {
      if (input.hpVesselMultiple === undefined) return null;
      const isCoconutHeavyHP = isCoconutHeavy(input);
      const requiredVesselMultiple = isCoconutHeavyHP ? 3 : 2;
      if (input.hpVesselMultiple < requiredVesselMultiple) {
        return {
          level: 'warning',
          code: 'hp_vessel_too_small',
          message: isCoconutHeavyHP
            ? "Use a cook vessel at least ~3× the batch volume so the expanding cook doesn't overflow."
            : "Use a cook vessel at least ~2× the batch volume (~3× for coconut-heavy) so the expanding cook doesn't overflow.",
        };
      }
      return null;
    },
  },
  {
    code: 'ls_lye_excess',
    // Any negative superfat leaves free alkali in the finished soap, whatever the process
    // or lye type — warn on the actual excess, not just the LS flag, so a caustic recipe
    // from any caller (not only the LS UI path) still gets the neutralization guidance.
    check: (input) => {
      if (input.superfatPercent < 0) {
        return {
          level: 'info',
          code: 'ls_lye_excess',
          message:
            'Running a lye excess — neutralize the finished soap to pH 9–10.5 with citric acid dissolved 1:4 in hot water, added gradually and confirmed with a pH test. Never acidify a soap that is already on target.',
        };
      }
      return null;
    },
  },
];

export function analyzeFormulation(input: FormulationAnalysisInput): FormulationInsight[] {
  const insights: FormulationInsight[] = [];

  // The two generic paths that replaced 25 bespoke gates (spec slice 3): process
  // filtering and parameter resolution. Everything else an insight does lives in its
  // own check(). This loop is now the entire catalog — all 41 rules live in
  // INSIGHT_RULES; there is no inline region left below it.
  for (const rule of INSIGHT_RULES) {
    if (rule.processes && !rule.processes.includes(input.process)) continue;
    const insight = rule.check(input, resolveInsightParams(rule, input.process));
    if (insight) insights.push(insight);
  }

  return insights;
}
