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

  if (input.lyeConcentrationPercent > 0) {
    if (input.lyeConcentrationPercent < 20) {
      insights.push({
        level: 'warning',
        code: 'lye_conc_low',
        message:
          'Lye concentration below ~20% — outside typical cold-process range; trace and cure may be very slow.',
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
    if (cleansing > 22 && superfat < 6) {
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

  return insights;
}
