import type {
  FormulationInsight,
  LyeCalculationResult,
  RecipeFattyAcidResult,
  RecipePropertiesResult,
} from '@soap-calc/core';
import { additiveStageLabel } from './additiveStageLabel';
import type { ComputedAdditive, ComputedPostCookSuperfat } from './calculateAdditives';
import type { RecipeDisplayTotals } from './calculateRecipe';
import type { RecipeIndexResult } from './calculateRecipeIndexes';
import type { ProcessId } from './process';
import type { RecipeLine, RecipeSettings, SplitLiquidSettings, WeightUnit } from './recipe';
import { oilById } from './oils';
import { formatGrams } from './format';
import { formatWeight } from './weightUnits';

export { additiveStageLabel };

export type BatchSheetData = {
  recipeName: string;
  printedAt: string;
  batchNotes: string;
  weightUnit: WeightUnit;
  lyeLabel: string;
  settings: RecipeSettings;
  lines: RecipeLine[];
  linePercents: Map<string, number>;
  result: LyeCalculationResult;
  displayTotals: RecipeDisplayTotals;
  additives: ComputedAdditive[];
  splitLiquid: SplitLiquidSettings | undefined;
  splitLiquidGrams: number | null;
  postCookSuperfat: ComputedPostCookSuperfat | null;
  properties: RecipePropertiesResult | null;
  indexes: RecipeIndexResult;
  batchWeightWithExtras: number;
  waterModeLabel: string;
  fattyAcids: RecipeFattyAcidResult;
  insights: FormulationInsight[];
  process: ProcessId;
};

export function canPrintBatchSheet(
  result: LyeCalculationResult | null,
  displayTotals: RecipeDisplayTotals | null,
  inputErrors: string[],
): boolean {
  if (!result || !displayTotals || inputErrors.length > 0) return false;
  if (result.errors.length > 0) return false;
  if (displayTotals.recipeOilWeightGrams <= 0) return false;
  if (result.lyeWeightGrams <= 0) return false;
  return true;
}

export function buildBatchSheetData(input: {
  recipeName: string;
  batchNotes: string;
  weightUnit: WeightUnit;
  lyeLabel: string;
  settings: RecipeSettings;
  lines: RecipeLine[];
  linePercents: Map<string, number>;
  result: LyeCalculationResult;
  displayTotals: RecipeDisplayTotals;
  additives: ComputedAdditive[];
  splitLiquid: SplitLiquidSettings | undefined;
  splitLiquidGrams: number | null;
  postCookSuperfat: ComputedPostCookSuperfat | null;
  properties: RecipePropertiesResult | null;
  indexes: RecipeIndexResult;
  batchWeightWithExtras: number;
  waterModeLabel: string;
  fattyAcids: RecipeFattyAcidResult;
  insights: FormulationInsight[];
  process: ProcessId;
}): BatchSheetData {
  return {
    ...input,
    printedAt: new Date().toLocaleString(),
  };
}

export function formatBatchSheetProperty(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return formatGrams(value, 1);
}

export function batchSheetOilName(oilId: string): string {
  return oilById(oilId)?.displayName ?? oilId;
}

export function formatBatchWeight(grams: number, unit: WeightUnit): string {
  return formatWeight(grams, unit);
}

export function waterModeLabel(settings: RecipeSettings): string {
  switch (settings.waterMode) {
    case 'lye_concentration':
      return `${settings.lyeConcentrationPercent}% lye concentration`;
    case 'lye_water_ratio':
      return `${settings.lyeWaterRatio}:1 water:lye`;
    default:
      return `${settings.waterPercentOfOils}% of oils`;
  }
}
