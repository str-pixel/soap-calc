import type { RecipeSettings, SplitLiquidSettings } from './recipe';

type SizingContext = {
  totalOilGrams: number;
  /** The recipe's total-liquid target (the waterMode output before any allocation). */
  targetLiquidGrams: number;
  lyeGrams: number;
};

/** Resolve the alternative liquid's grams for the chosen sizing mode, or null when the
 * amount is blank/invalid. 'rest' needs no amount: it is everything the liquid budget
 * holds above the 1:1 lye-water minimum. */
export function resolveSplitLiquidGrams(
  splitLiquid: SplitLiquidSettings,
  ctx: SizingContext,
): number | null {
  if (splitLiquid.sizeMode === 'rest') {
    return Math.max(0, ctx.targetLiquidGrams - ctx.lyeGrams);
  }
  const amount = Number(splitLiquid.amount);
  if (splitLiquid.amount.trim() === '' || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  switch (splitLiquid.sizeMode) {
    case 'grams':
      return amount;
    case 'percent_of_liquid':
      return (ctx.targetLiquidGrams * amount) / 100;
    default:
      return (ctx.totalOilGrams * amount) / 100;
  }
}

export type SplitLiquidCalcOverride = {
  /** Settings to feed the lye calc so the lye water reflects the allocation. */
  settingsForCalc: RecipeSettings;
  /** The pre-allocation total-liquid target the budget was computed from. */
  targetLiquidGrams: number;
};

/**
 * Budget allocation for the two budget sizing modes, under percent-of-oils water only —
 * there the water setting reads naturally as a total-liquid target. 'rest' pins the lye
 * water at the 1:1 floor; 'percent_of_liquid' gives the lye water the remainder of the
 * budget (never below 1:1 — the calc's own floor semantics still apply downstream).
 * Legacy sizing modes and explicit-strength water modes (lye concentration / ratio) are
 * left untouched: additive semantics with the existing suggestion flow.
 */
export function splitLiquidCalcOverride(
  settings: RecipeSettings,
  totalOilGrams: number,
): SplitLiquidCalcOverride | null {
  const { splitLiquid, waterMode } = settings;
  if (!splitLiquid.enabled || waterMode !== 'percent_of_oils' || totalOilGrams <= 0) return null;
  if (splitLiquid.sizeMode !== 'rest' && splitLiquid.sizeMode !== 'percent_of_liquid') return null;

  const percent = Number(settings.waterPercentOfOils);
  if (!Number.isFinite(percent) || percent <= 0) return null;
  const targetLiquidGrams = (totalOilGrams * percent) / 100;

  if (splitLiquid.sizeMode === 'rest') {
    return {
      settingsForCalc: { ...settings, waterMode: 'lye_water_ratio', lyeWaterRatio: '1' },
      targetLiquidGrams,
    };
  }

  const amount = Number(splitLiquid.amount);
  if (splitLiquid.amount.trim() === '' || !Number.isFinite(amount) || amount <= 0) return null;
  const altGrams = (targetLiquidGrams * amount) / 100;
  const waterGrams = Math.max(0, targetLiquidGrams - altGrams);
  const waterPercentOfOils = (waterGrams / totalOilGrams) * 100;
  return {
    settingsForCalc: {
      ...settings,
      waterPercentOfOils: String(Math.round(waterPercentOfOils * 10) / 10),
    },
    targetLiquidGrams,
  };
}
