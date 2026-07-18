import {
  FATTY_ACID_GROUP_KEYS,
  sumFattyAcids,
  type FattyAcidProfile,
} from './fatty-acids.js';
import { DEFAULT_KOH_BLEND_PERCENT, type LyeType, type WaterMode } from './lye.js';
import { LOW_COVERAGE_PERCENT, type SoapProperties } from './properties.js';
import {
  additiveMatches,
  recipeOilMatches,
  type NamedCatalogEntry,
  type NamedOilEntry,
} from './keyword-match.js';

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
  excludedOilWeightGrams?: number;
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
  /** True for liquid-soap (KOH) recipes; gates LS-specific insights and exempts LS from the
   * bar-soap lye-concentration warnings. */
  isLiquidSoap?: boolean;
};

export function analyzeFormulation(input: FormulationAnalysisInput): FormulationInsight[] {
  const insights: FormulationInsight[] = [];

  if (input.totalOilGrams > 500) {
    insights.push({
      level: 'info',
      code: 'large_test_batch',
      message:
        'Oil batch over 500 g — smaller test batches are easier to troubleshoot if something goes wrong.',
    });
  }

  if (
    input.lyeGrams > 0 &&
    input.waterGrams > 0 &&
    input.waterGrams < input.lyeGrams
  ) {
    insights.push({
      level: 'warning',
      code: 'water_below_lye',
      message:
        'Water is less than lye by weight — use at least a 1:1 water:lye ratio so alkali can dissolve safely.',
    });
  }

  // Caustic-bar guard (NaOH bar soap only). At 0% superfat the lye is set to exactly
  // match the oils, leaving no unsaponified-oil buffer, so real variation in an oil's
  // SAP value or a small scale error goes straight into free lye — a harsh/caustic bar.
  // Liquid soap (KOH) is exempt: it legitimately runs at/below 0% and is neutralized
  // after cook. Behavior-only copy; no fixed "minimum safe %" is asserted (only the
  // no-buffer case is a clear, grounded hazard).
  if (input.lyeGrams > 0 && !input.isLiquidSoap && input.superfatPercent <= 0) {
    insights.push({
      level: 'warning',
      code: 'no_superfat_margin',
      message:
        '0% superfat sets the lye to exactly match the oils, leaving no unsaponified-oil buffer — ' +
        'normal variation in oil SAP values or a small scale error then leaves free lye, which can ' +
        'make the bar harsh or caustic. Most bar recipes keep a few percent superfat.',
    });
  }

  if (input.lyeConcentrationPercent > 0 && !input.isLiquidSoap) {
    if (input.lyeConcentrationPercent < 20) {
      insights.push({
        level: 'warning',
        code: 'lye_conc_low',
        message:
          'Lye concentration below ~20% — outside the typical bar-soap range; trace and cure may be very slow.',
      });
    } else if (input.lyeConcentrationPercent > 38) {
      insights.push({
        level: 'warning',
        code: 'lye_conc_high',
        message:
          'Lye concentration above ~38% — may trace quickly, resist gel, or warp in the mold.',
      });
    }
  }

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
    const poly = sumFattyAcids(input.fattyAcids, FATTY_ACID_GROUP_KEYS.polyunsaturated);

    if (lauricMyristic > 35 && palmiticStearic < 15) {
      insights.push({
        level: 'info',
        code: 'high_short_chain_low_long_chain',
        message:
          'High lauric + myristic with low palmitic + stearic — bar may feel very cleansing and wear quickly unless superfat is generous.',
      });
    }

    if (poly > 28 && input.superfatPercent >= 8) {
      insights.push({
        level: 'warning',
        code: 'high_poly_high_superfat',
        message:
          'High linoleic + linolenic with elevated superfat — watch shelf life; store cool and use within a few months.',
      });
    }

    const oleic = input.fattyAcids.oleic ?? 0;
    const lauric = input.fattyAcids.lauric ?? 0;
    if (lauric >= 5 && oleic >= 20) {
      insights.push({
        level: 'info',
        code: 'eutectic_lather_sources',
        message:
          'Both lauric and oleic sources present — supports a balanced fluffy and stable lather.',
      });
    }
  }

  if (
    input.properties &&
    (input.propertyCoveragePercent ?? 100) >= LOW_COVERAGE_PERCENT
  ) {
    const cleansing = input.properties.cleansing;
    const superfat = input.superfatPercent;
    if (cleansing > 22 && superfat < 6 && !input.isLiquidSoap) {
      insights.push({
        level: 'info',
        code: 'high_cleansing_low_superfat',
        message:
          'Cleansing score above the usual range with modest superfat — bar may feel stripping; consider more superfat or softer oils.',
      });
    }
  }

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
    insights.push({
      level: 'warning',
      code: 'split_liquid_water_not_adjusted',
      message:
        'Alternative liquid is listed separately — water is not reduced automatically. Use the suggested lye water in Split liquid or lower your water %.',
    });
  }

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
    insights.push({
      level: 'warning',
      code: 'split_liquid_high_trace_liquid',
      message:
        'Water is already at the 1:1 lye minimum — alternative liquid at trace adds extra total liquid. Expect faster trace, softer bars, or a wetter batter.',
    });
  }

  if (input.totalAdditivePercent !== undefined && input.totalAdditivePercent > 10) {
    insights.push({
      level: 'warning',
      code: 'high_total_additives',
      message:
        'Total additives exceed ~10% of oil weight — may affect trace, texture, or shelf life; verify with a small test batch.',
    });
  }

  if (input.lyeType === 'dual' && (input.kohBlendPercent ?? DEFAULT_KOH_BLEND_PERCENT) > 0) {
    insights.push({
      level: 'info',
      code: 'dual_lye_advanced',
      message:
        'Dual NaOH + KOH is an advanced technique — weigh each alkali separately and verify the batch with a small test pour before scaling up.',
    });
  }

  const additiveEntries = input.additiveEntries;
  if (additiveMatches(additiveEntries, 'oatmeal', 'oatmeal')) {
    insights.push({
      level: 'info',
      code: 'oatmeal_false_trace',
      message:
        'Oatmeal can cause false trace — do not rely on viscosity alone; confirm with a pH strip or zap test.',
    });
  }

  if (
    additiveMatches(additiveEntries, 'jojoba', 'jojoba') ||
    recipeOilMatches(input.oilEntries, {
      oilIds: ['jojoba-oil', 'jojoba-oil-a-liquid-wax-ester'],
      nameKeyword: 'jojoba',
    })
  ) {
    insights.push({
      level: 'info',
      code: 'jojoba_superfat_note',
      message:
        'Jojoba is mostly unsaponifiable — treat it as a superfatting oil and keep total jojoba near typical 5–10% of oils.',
    });
  }

  if (input.postCookSuperfatPufaPercent !== undefined && input.postCookSuperfatPufaPercent > 30) {
    insights.push({
      level: 'warning',
      code: 'high_pufa_post_cook_superfat',
      message:
        'Post-cook superfat oil is high in linoleic + linolenic — added unsaponified, it is prone to DOS/rancidity. Prefer a stable superfat oil (coconut, olive, almond, cocoa, shea) and/or an antioxidant (e.g. 1% BHT + 1% sodium citrate); store cool.',
    });
  }

  if (input.isLiquidSoap && input.superfatPercent > 3) {
    insights.push({
      level: 'warning',
      code: 'ls_superfat_high',
      message:
        'Liquid soap above ~3% superfat can turn cloudy and separate — keep LS superfat around 1–3%.',
    });
  }

  // Any negative superfat leaves free alkali in the finished soap, whatever the process or
  // lye type — warn on the actual excess, not just the LS flag, so a caustic recipe from any
  // caller (not only the LS UI path) still gets the neutralization guidance.
  if (input.superfatPercent < 0) {
    insights.push({
      level: 'info',
      code: 'ls_lye_excess',
      message:
        'Running a lye excess — neutralize the finished soap to pH 9–10.5 with citric acid dissolved 1:4 in hot water, added gradually and confirmed with a pH test. Never acidify a soap that is already on target.',
    });
  }

  return insights;
}
