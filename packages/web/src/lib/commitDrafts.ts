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
  batchSetByUser: boolean,
): SyncedRecipe {
  let currentLines = lines;
  let currentBatch = batchOilGrams;
  let currentBatchSetByUser = batchSetByUser;

  const batchDraft = drafts['batch-total'];
  if (batchDraft !== undefined) {
    const parsedBatch = parseInputDisplayToGrams(batchDraft, weightUnit);
    if (parsedBatch !== null) {
      if (parsedBatch === '') {
        const resynced = resyncFromWeights(currentLines);
        currentLines = resynced.lines;
        currentBatch = resynced.batchOilGrams;
        currentBatchSetByUser = false;
      } else {
        currentBatch = parsedBatch;
        currentLines = syncBatchTotalEdit(currentLines, currentBatch);
        currentBatchSetByUser = true;
      }
    }
  }

  for (const line of currentLines) {
    const weightDraft = drafts[`weight-${line.key}`];
    if (weightDraft === undefined) continue;
    const weightGrams = parseInputDisplayToGrams(weightDraft, weightUnit);
    if (weightGrams === null) continue;
    const synced = syncWeightEdit(
      currentLines,
      line.key,
      weightGrams,
      currentBatch,
      currentBatchSetByUser,
    );
    currentLines = synced.lines;
    currentBatch = synced.batchOilGrams;
    currentBatchSetByUser = synced.batchSetByUser;
  }

  for (const line of currentLines) {
    const percentDraft = drafts[`percent-${line.key}`];
    if (percentDraft === undefined) continue;
    const weightPercent = parsePercentInput(percentDraft);
    if (weightPercent === null) continue;
    const synced = syncPercentEdit(
      currentLines,
      line.key,
      weightPercent,
      currentBatch,
      currentBatchSetByUser,
    );
    currentLines = synced.lines;
    currentBatch = synced.batchOilGrams;
    currentBatchSetByUser = synced.batchSetByUser;
  }

  return {
    lines: currentLines,
    batchOilGrams: currentBatch,
    batchSetByUser: currentBatchSetByUser,
  };
}

export function previewRecipeState(
  lines: RecipeLine[],
  batchOilGrams: string,
  drafts: Record<string, string>,
  weightUnit: WeightUnit,
  batchSetByUser: boolean,
): SyncedRecipe {
  if (Object.keys(drafts).length === 0) {
    return { lines, batchOilGrams, batchSetByUser };
  }
  return commitDrafts(lines, batchOilGrams, drafts, weightUnit, batchSetByUser);
}
