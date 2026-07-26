import type { RecipeSettings, SplitLiquidRow } from './recipe';

type SizingContext = {
  totalOilGrams: number;
  /** The recipe's total-liquid target (the waterMode output before any allocation). */
  targetLiquidGrams: number;
  lyeGrams: number;
};

export type ResolvedSplitLiquidRow = { row: SplitLiquidRow; grams: number | null };

export type ResolvedSplitLiquids = {
  rows: ResolvedSplitLiquidRow[];
  /** Sum of the resolved rows (nulls excluded). */
  totalGrams: number;
};

function amountOf(row: SplitLiquidRow): number | null {
  const amount = Number(row.amount);
  if (row.amount.trim() === '' || !Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

/**
 * Resolve every alternative-liquid row to grams. Budget rows draw from the total-liquid
 * target: percent_of_liquid takes its share, and the single 'rest' row (normalize enforces
 * uniqueness) takes whatever the budget still holds above the 1:1 lye minimum after the
 * other budget rows. Additive rows (percent_of_oils, grams) stack on top as before.
 */
export function resolveSplitLiquidRows(
  rows: SplitLiquidRow[],
  ctx: SizingContext,
): ResolvedSplitLiquids {
  const budgetDrawGrams = rows.reduce((sum, row) => {
    if (row.sizeMode !== 'percent_of_liquid') return sum;
    const amount = amountOf(row);
    return amount === null ? sum : sum + (ctx.targetLiquidGrams * amount) / 100;
  }, 0);

  const resolved = rows.map((row): ResolvedSplitLiquidRow => {
    if (row.sizeMode === 'rest') {
      return {
        row,
        grams: Math.max(0, ctx.targetLiquidGrams - ctx.lyeGrams - budgetDrawGrams),
      };
    }
    const amount = amountOf(row);
    if (amount === null) return { row, grams: null };
    switch (row.sizeMode) {
      case 'grams':
        return { row, grams: amount };
      case 'percent_of_liquid':
        return { row, grams: (ctx.targetLiquidGrams * amount) / 100 };
      default:
        return { row, grams: (ctx.totalOilGrams * amount) / 100 };
    }
  });

  const totalGrams = resolved.reduce((sum, r) => sum + (r.grams ?? 0), 0);
  return { rows: resolved, totalGrams };
}

export type SplitLiquidCalcOverride = {
  /** Settings to feed the lye calc so the lye water reflects the allocation. */
  settingsForCalc: RecipeSettings;
  /** The pre-allocation total-liquid target the budget was computed from. */
  targetLiquidGrams: number;
};

/**
 * Budget allocation across the rows, under percent-of-oils water only — there the water
 * setting reads naturally as a total-liquid target. Any 'rest' row pins the lye water at
 * the 1:1 floor; otherwise percent_of_liquid rows reduce the water by their combined
 * share. Additive rows and explicit-strength water modes are left untouched.
 */
export function splitLiquidCalcOverride(
  settings: RecipeSettings,
  totalOilGrams: number,
): SplitLiquidCalcOverride | null {
  const rows = settings.splitLiquids;
  if (rows.length === 0 || settings.waterMode !== 'percent_of_oils' || totalOilGrams <= 0) {
    return null;
  }
  const hasRest = rows.some((row) => row.sizeMode === 'rest');
  const percentOfLiquidShare = rows.reduce((sum, row) => {
    if (row.sizeMode !== 'percent_of_liquid') return sum;
    const amount = amountOf(row);
    return amount === null ? sum : sum + amount;
  }, 0);
  if (!hasRest && percentOfLiquidShare <= 0) return null;

  const percent = Number(settings.waterPercentOfOils);
  if (!Number.isFinite(percent) || percent <= 0) return null;
  const targetLiquidGrams = (totalOilGrams * percent) / 100;

  if (hasRest) {
    return {
      settingsForCalc: { ...settings, waterMode: 'lye_water_ratio', lyeWaterRatio: '1' },
      targetLiquidGrams,
    };
  }

  const allocatedGrams = (targetLiquidGrams * percentOfLiquidShare) / 100;
  const waterGrams = Math.max(0, targetLiquidGrams - allocatedGrams);
  const waterPercentOfOils = (waterGrams / totalOilGrams) * 100;
  return {
    settingsForCalc: {
      ...settings,
      waterPercentOfOils: String(Math.round(waterPercentOfOils * 10) / 10),
    },
    targetLiquidGrams,
  };
}
