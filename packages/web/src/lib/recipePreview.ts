import { useMemo } from 'react';
import type { RecipeLine, RecipeSettings } from './recipe';
import { previewRecipeState } from './commitDrafts';
import type { SyncedRecipe } from './lineWeightSync';
import { gramsStringToInputDisplay, type WeightUnit } from './weightUnits';

export function usePreviewRecipeState(
  lines: RecipeLine[],
  batchOilGrams: string,
  drafts: Record<string, string>,
  weightUnit: WeightUnit,
  batchSetByUser: boolean,
): SyncedRecipe {
  return useMemo(
    () => previewRecipeState(lines, batchOilGrams, drafts, weightUnit, batchSetByUser),
    [lines, batchOilGrams, drafts, weightUnit, batchSetByUser],
  );
}

export function usePreviewSettings(
  settings: RecipeSettings,
  previewBatchOilGrams: string,
  previewBatchSetByUser: boolean,
): RecipeSettings {
  return useMemo(
    // Carry the preview's provenance too, so the settings used for display/calc never
    // disagree with previewState about whether the batch is locked.
    () => ({
      ...settings,
      batchOilGrams: previewBatchOilGrams,
      batchSetByUser: previewBatchSetByUser,
    }),
    [settings, previewBatchOilGrams, previewBatchSetByUser],
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

export function computeRecipeLineTotals(lines: RecipeLine[]): {
  totalWeightGrams: number;
  totalPercent: number;
} {
  let totalWeightGrams = 0;
  let totalPercent = 0;

  for (const line of lines) {
    const grams = Number(line.weightGrams);
    if (Number.isFinite(grams) && grams > 0) {
      totalWeightGrams += grams;
    }
    const pct = Number(line.weightPercent);
    if (Number.isFinite(pct) && pct > 0) {
      totalPercent += pct;
    }
  }

  return { totalWeightGrams, totalPercent };
}

export function formatRecipePercentTotal(totalPercent: number): string {
  return `${String(Math.round(totalPercent * 10) / 10)}%`;
}

export function hasRecipeLineData(lines: RecipeLine[]): boolean {
  return lines.some(
    (line) =>
      Boolean(line.oilId) ||
      (Number.isFinite(Number(line.weightGrams)) && Number(line.weightGrams) > 0) ||
      (line.weightPercent !== '' && Number.isFinite(Number(line.weightPercent))),
  );
}
