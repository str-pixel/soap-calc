import {
  FATTY_ACID_GROUP_KEYS,
  sumFattyAcids,
  type FattyAcidProfile,
} from './fatty-acids.js';
import type { WaterMode } from './lye.js';
import type { SoapProperties } from './properties.js';

export type FormulationInsightLevel = 'info' | 'warning';

export type FormulationInsight = {
  level: FormulationInsightLevel;
  code: string;
  message: string;
};

export type FormulationAnalysisInput = {
  properties: SoapProperties | null;
  fattyAcids: FattyAcidProfile | null;
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
  additiveCatalogIds?: string[];
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

  if (input.fattyAcids) {
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

  if (input.properties) {
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

  const catalogIds = input.additiveCatalogIds ?? [];
  if (catalogIds.includes('oatmeal')) {
    insights.push({
      level: 'info',
      code: 'oatmeal_false_trace',
      message:
        'Oatmeal can cause false trace — do not rely on viscosity alone; confirm with a pH strip or zap test.',
    });
  }

  if (catalogIds.includes('jojoba')) {
    insights.push({
      level: 'info',
      code: 'jojoba_superfat_note',
      message:
        'Jojoba is mostly unsaponifiable — treat it as a superfatting oil and keep total jojoba near typical 5–10% of oils.',
    });
  }

  return insights;
}
