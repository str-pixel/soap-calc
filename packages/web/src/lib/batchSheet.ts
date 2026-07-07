import type { LyeCalculationResult, RecipePropertiesResult } from '@soap-calc/core';
import { ADDITIVE_STAGE_LABELS } from '@soap-calc/core';
import type { ComputedAdditive } from './calculateAdditives';
import type { RecipeDisplayTotals } from './calculateRecipe';
import type { RecipeIndexResult } from './calculateRecipeIndexes';
import type { RecipeLine, RecipeSettings, SplitLiquidSettings, WeightUnit } from './recipe';
import { oilById } from './oils';
import { formatGrams } from './format';
import { formatWeight } from './weightUnits';

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
  properties: RecipePropertiesResult | null;
  indexes: RecipeIndexResult;
  batchWeightWithExtras: number;
};

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
  properties: RecipePropertiesResult | null;
  indexes: RecipeIndexResult;
  batchWeightWithExtras: number;
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

export function additiveStageLabel(addAt: keyof typeof ADDITIVE_STAGE_LABELS): string {
  return ADDITIVE_STAGE_LABELS[addAt];
}

export function formatBatchWeight(grams: number, unit: WeightUnit): string {
  return formatWeight(grams, unit);
}
