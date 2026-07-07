import { useMemo } from 'react';
import type { RecipeLine, RecipeSettings } from './recipe';
import { previewRecipeState } from './commitDrafts';
import { gramsStringToInputDisplay, type WeightUnit } from './weightUnits';

export function usePreviewRecipeState(
  lines: RecipeLine[],
  batchOilGrams: string,
  drafts: Record<string, string>,
  weightUnit: WeightUnit,
): { lines: RecipeLine[]; batchOilGrams: string } {
  return useMemo(
    () => previewRecipeState(lines, batchOilGrams, drafts, weightUnit),
    [lines, batchOilGrams, drafts, weightUnit],
  );
}

export function usePreviewSettings(
  settings: RecipeSettings,
  previewBatchOilGrams: string,
): RecipeSettings {
  return useMemo(
    () => ({ ...settings, batchOilGrams: previewBatchOilGrams }),
    [settings, previewBatchOilGrams],
  );
}

export function previewWeightDisplay(
  line: RecipeLine,
  previewLine: RecipeLine | undefined,
  weightUnit: WeightUnit,
): string {
  return gramsStringToInputDisplay(previewLine?.weightGrams ?? line.weightGrams, weightUnit);
}

export function previewPercentDisplay(
  line: RecipeLine,
  previewLine: RecipeLine | undefined,
): string {
  return previewLine?.weightPercent ?? line.weightPercent ?? '';
}
