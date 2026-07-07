import type { RecipeLine } from './recipe';
import {
  resyncFromWeights,
  syncBatchTotalEdit,
  syncPercentEdit,
  syncWeightEdit,
  type SyncedRecipe,
} from './lineWeightSync';
import { parseInputDisplayToGrams, parsePercentInput, type WeightUnit } from './weightUnits';

export function commitDrafts(
  lines: RecipeLine[],
  batchOilGrams: string,
  drafts: Record<string, string>,
  weightUnit: WeightUnit,
): SyncedRecipe {
  let currentLines = lines;
  let currentBatch = batchOilGrams;

  const batchDraft = drafts['batch-total'];
  if (batchDraft !== undefined) {
    const parsedBatch = parseInputDisplayToGrams(batchDraft, weightUnit);
    if (parsedBatch !== null) {
      if (parsedBatch === '') {
        const resynced = resyncFromWeights(currentLines);
        currentLines = resynced.lines;
        currentBatch = resynced.batchOilGrams;
      } else {
        currentBatch = parsedBatch;
        currentLines = syncBatchTotalEdit(currentLines, currentBatch);
      }
    }
  }

  for (const line of currentLines) {
    const weightDraft = drafts[`weight-${line.key}`];
    if (weightDraft === undefined) continue;
    const weightGrams = parseInputDisplayToGrams(weightDraft, weightUnit);
    if (weightGrams === null) continue;
    const synced = syncWeightEdit(currentLines, line.key, weightGrams, currentBatch);
    currentLines = synced.lines;
    currentBatch = synced.batchOilGrams;
  }

  for (const line of currentLines) {
    const percentDraft = drafts[`percent-${line.key}`];
    if (percentDraft === undefined) continue;
    const weightPercent = parsePercentInput(percentDraft);
    if (weightPercent === null) continue;
    const synced = syncPercentEdit(currentLines, line.key, weightPercent, currentBatch);
    currentLines = synced.lines;
    currentBatch = synced.batchOilGrams;
  }

  return { lines: currentLines, batchOilGrams: currentBatch };
}

export function previewRecipeState(
  lines: RecipeLine[],
  batchOilGrams: string,
  drafts: Record<string, string>,
  weightUnit: WeightUnit,
): SyncedRecipe {
  if (Object.keys(drafts).length === 0) {
    return { lines, batchOilGrams };
  }
  return commitDrafts(lines, batchOilGrams, drafts, weightUnit);
}
