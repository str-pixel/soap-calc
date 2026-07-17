import {
  DEFAULT_LYE_CONCENTRATION_PERCENT,
  DEFAULT_LYE_WATER_RATIO,
  DEFAULT_WATER_PERCENT,
  type DilutionResult,
  type FormulationInsight,
  type LyeCalculationResult,
  type NeutralizationResult,
  type RecipeFattyAcidResult,
  type RecipePropertiesResult,
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
  pcsfIsExtra: boolean;
  extrasGrams: number;
  dilution: DilutionResult | null;
  neutralization: NeutralizationResult | null;
  properties: RecipePropertiesResult | null;
  indexes: RecipeIndexResult;
  batchWeightWithExtras: number;
  waterModeLabel: string;
  fattyAcids: RecipeFattyAcidResult;
  /** Recipe oils whose fatty-acid profile is a modeled reconstruction (sourceType 'derived').
   *  Optional so existing fixtures stay valid; the view model always supplies it. */
  modeledOilIds?: string[];
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

export function buildBatchSheetData(input: BatchSheetData): BatchSheetData {
  return { ...input };
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

// Blank water fields are valid input (parseRecipeSettings maps them to undefined and
// the core applies its defaults), so label the value the math actually used.
export function waterModeLabel(settings: RecipeSettings): string {
  switch (settings.waterMode) {
    case 'lye_concentration':
      return `${settings.lyeConcentrationPercent || DEFAULT_LYE_CONCENTRATION_PERCENT}% lye concentration`;
    case 'lye_water_ratio':
      return `${settings.lyeWaterRatio || DEFAULT_LYE_WATER_RATIO}:1 water:lye`;
    default:
      return `${settings.waterPercentOfOils || DEFAULT_WATER_PERCENT}% of oils`;
  }
}
