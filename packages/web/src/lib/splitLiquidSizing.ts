import { DEFAULT_LYE_WATER_RATIO, DEFAULT_WATER_PERCENT, type WaterMode } from '@soap-calc/core';
import type { RecipeSettings, SplitLiquidRow } from './recipe';

/**
 * Whether the recipe's water setting reads as a TOTAL-LIQUID budget that a liquid can be
 * carved out of. Only percent-of-oils (target = % x oils) and lye_water_ratio (target =
 * N x lye) do; lye_concentration fixes the lye SOLUTION's strength and implies no total.
 *
 * Single source of truth for the picker, the calc override, and row resolution — when only
 * the picker knew, budget rows stayed selectable-by-history and kept sizing against a
 * fallback target, stacking a carved-out liquid on top of the full water instead of out of it.
 */
/** Smallest ratio parseRecipeSettings still accepts once rounded to 3 dp. Below this the
 * override would emit '0' and kill the calculation outright. */
const MIN_LYE_WATER_RATIO = 0.001;

export function budgetSizingAvailable(waterMode: WaterMode): boolean {
  return waterMode === 'percent_of_oils' || waterMode === 'lye_water_ratio';
}

type SizingContext = {
  totalOilGrams: number;
  /** The recipe's total-liquid target (the waterMode output before any allocation), or
   * null when the water mode implies no total-liquid budget at all. */
  targetLiquidGrams: number | null;
  lyeGrams: number;
  /** Required, not optional-defaulting-to-true: an implicit default here is the very shape
   * (a fallback that is right for one caller and wrong for the next) this fixes. */
  budgetSizingAvailable: boolean;
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
  // A budget row with no budget resolves to null (inert), never to a remainder against
  // some other figure — sizing a carve-out against the full lye water double-counts it.
  const hasBudget = ctx.budgetSizingAvailable && ctx.targetLiquidGrams !== null;
  const target = ctx.targetLiquidGrams ?? 0;

  const budgetDrawGrams = rows.reduce((sum, row) => {
    if (row.sizeMode !== 'percent_of_liquid' || !hasBudget) return sum;
    const amount = amountOf(row);
    return amount === null ? sum : sum + (target * amount) / 100;
  }, 0);

  const resolved = rows.map((row): ResolvedSplitLiquidRow => {
    if (row.sizeMode === 'rest') {
      if (!hasBudget) return { row, grams: null };
      return {
        row,
        grams: Math.max(0, target - ctx.lyeGrams - budgetDrawGrams),
      };
    }
    const amount = amountOf(row);
    if (amount === null) return { row, grams: null };
    switch (row.sizeMode) {
      case 'grams':
        return { row, grams: amount };
      case 'percent_of_liquid':
        if (!hasBudget) return { row, grams: null };
        return { row, grams: (target * amount) / 100 };
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
  /** The pre-allocation total-liquid target the budget was computed from — null for
   * ratio-mode overrides, where the target is only known post-calc (see targetRatio). */
  targetLiquidGrams: number | null;
  /** Ratio-mode overrides only: total liquid = targetRatio × the calc's lye grams. The
   * caller resolves rows against that figure once the result exists (pure ratio
   * arithmetic pre-calc, exact grams post-calc). */
  targetRatio?: number;
};

/**
 * Budget allocation across the rows, under the two water modes where the setting reads
 * naturally as a total-liquid target: percent-of-oils (target = % × oils, known pre-calc)
 * and lye_water_ratio (target = N × lye grams, known only post-calc — the override
 * carries `targetRatio` and adjusts the ratio itself, which is pure arithmetic). Any
 * 'rest' row pins the lye water at the 1:1 floor; otherwise percent_of_liquid rows reduce
 * the water by their combined share. Additive rows and lye_concentration mode are left
 * untouched.
 */
export function splitLiquidCalcOverride(
  settings: RecipeSettings,
  totalOilGrams: number,
): SplitLiquidCalcOverride | null {
  const rows = settings.splitLiquids;
  if (
    rows.length === 0 ||
    !budgetSizingAvailable(settings.waterMode) ||
    totalOilGrams <= 0
  ) {
    return null;
  }
  const hasRest = rows.some((row) => row.sizeMode === 'rest');
  const percentOfLiquidShare = rows.reduce((sum, row) => {
    if (row.sizeMode !== 'percent_of_liquid') return sum;
    const amount = amountOf(row);
    return amount === null ? sum : sum + amount;
  }, 0);
  if (!hasRest && percentOfLiquidShare <= 0) return null;

  if (settings.waterMode === 'lye_water_ratio') {
    // Blank means the default (as lye.ts and batchSheet.ts already treat it), NOT "no
    // budget" — bailing here silently flipped a carve-out row into an additive one.
    const ratio = Number(settings.lyeWaterRatio || DEFAULT_LYE_WATER_RATIO);
    if (!Number.isFinite(ratio) || ratio <= 0) return null;
    if (hasRest) {
      return {
        settingsForCalc: { ...settings, lyeWaterRatio: '1' },
        targetLiquidGrams: null,
        targetRatio: ratio,
      };
    }
    // Pure ratio arithmetic — no lye grams needed pre-calc: water' = N(1−p)·lye keeps the
    // total liquid constant at N·lye (split, not discount). A share past the 1:1 floor
    // (ratio' < 1) is allowed through — the lyeWaterStatus shortfall warning covers it,
    // matching percent_of_oils behavior.
    //
    // Floored at MIN_RATIO because a ~100% share rounds to '0', which parseRecipeSettings
    // rejects — collapsing the whole page to "Water : lye ratio must be greater than 0",
    // an error naming a field the user never touched, with nothing pointing at the row that
    // caused it. percent_of_oils survives the same input (it emits '0', which parses) and
    // lets the shortfall warning explain the missing water; ratio mode must not be the one
    // budget mode that turns a legal input into a dead page. MIN_RATIO leaves water
    // effectively zero (0.001 × lye), so the shortfall warning still fires.
    const reduced = Math.max(
      MIN_LYE_WATER_RATIO,
      ratio * (1 - Math.min(percentOfLiquidShare, 100) / 100),
    );
    return {
      settingsForCalc: { ...settings, lyeWaterRatio: String(Math.round(reduced * 1000) / 1000) },
      targetLiquidGrams: null,
      targetRatio: ratio,
    };
  }

  const percent = Number(settings.waterPercentOfOils || DEFAULT_WATER_PERCENT);
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
