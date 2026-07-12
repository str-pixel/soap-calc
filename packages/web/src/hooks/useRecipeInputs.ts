import { commitDrafts } from '../lib/commitDrafts';
import {
  addRecipeLine,
  resyncFromWeights,
  syncBatchTotalEdit,
  syncPercentEdit,
  syncWeightEdit,
  type SyncedRecipe,
} from '../lib/lineWeightSync';
import { isTarOil, oilById } from '../lib/oils';
import { newLineKey, type RecipeLine, type RecipeSettings, type AdditiveLine, type WeightUnit } from '../lib/recipe';
import { parseInputDisplayToGrams, parsePercentInput } from '../lib/weightUnits';

export function makeInputIds() {
  return {
    weightInputId: (key: string) => `weight-${key}`,
    percentInputId: (key: string) => `percent-${key}`,
    batchInputId: 'batch-total' as const,
  };
}

export function shouldCommitDraft(drafts: Record<string, string>, id: string): boolean {
  return id in drafts;
}

export type UseRecipeInputsDeps = {
  lines: RecipeLine[];
  settings: RecipeSettings;
  additives: AdditiveLine[];
  weightUnit: WeightUnit;
  drafts: Record<string, string>;
  setDraft: (id: string, value: string) => void;
  clearDraft: (id: string) => void;
  clearAllDrafts: () => void;
  editor: {
    applySynced: (synced: SyncedRecipe) => void;
    applySyncedUpdate: (
      u: (lines: RecipeLine[], batch: string, batchSetByUser: boolean) => SyncedRecipe,
    ) => void;
    linesRef: React.MutableRefObject<RecipeLine[]>;
    batchRef: React.MutableRefObject<string>;
    batchSetByUserRef: React.MutableRefObject<boolean>;
  };
  setLines: React.Dispatch<React.SetStateAction<RecipeLine[]>>;
  setSettings: React.Dispatch<React.SetStateAction<RecipeSettings>>;
  handleExport: (payload: { lines: RecipeLine[]; settings: RecipeSettings; additives: AdditiveLine[] }) => void;
  handleNew: () => void;
};

export type RecipeInputs = {
  weightInputId: (key: string) => string;
  percentInputId: (key: string) => string;
  batchInputId: string;
  updateLine: (key: string, patch: Partial<RecipeLine>) => void;
  flushCommittedDrafts: () => SyncedRecipe;
  discardDrafts: () => void;
  handleExportCommitted: () => void;
  handleNewRecipe: () => void;
  handleApplySuggestedOilGrams: (oilGrams: number) => void;
  commitWeightInput: (key: string, displayValue: string) => void;
  commitPercentInput: (key: string, displayValue: string) => void;
  commitBatchInput: (displayValue: string) => void;
  handleWeightChange: (key: string, displayValue: string) => void;
  handleBatchChange: (displayValue: string) => void;
  setWeightUnit: (nextUnit: WeightUnit) => void;
  addLine: () => void;
  removeLine: (key: string) => void;
};

export function useRecipeInputs(deps: UseRecipeInputsDeps): RecipeInputs {
  const { weightInputId, percentInputId, batchInputId } = makeInputIds();
  const { lines, settings, additives, weightUnit, drafts } = deps;
  const { setDraft, clearDraft, clearAllDrafts } = deps;
  const { applySynced, applySyncedUpdate, linesRef, batchRef, batchSetByUserRef } = deps.editor;
  const { setLines, setSettings, handleExport, handleNew } = deps;

  function updateLine(key: string, patch: Partial<RecipeLine>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (patch.oilId) {
          const oil = oilById(patch.oilId);
          if (!isTarOil(oil)) {
            const { tarLyeTreatment: _, ...rest } = next;
            return rest;
          }
          if (!next.tarLyeTreatment) {
            return { ...next, tarLyeTreatment: 'include' };
          }
        }
        return next;
      }),
    );
  }

  function flushCommittedDrafts(): SyncedRecipe {
    const synced = commitDrafts(
      linesRef.current,
      batchRef.current,
      drafts,
      weightUnit,
      batchSetByUserRef.current,
    );
    if (Object.keys(drafts).length > 0) {
      clearAllDrafts();
      applySynced(synced);
    }
    return synced;
  }

  function discardDrafts() {
    clearAllDrafts();
  }

  function handleExportCommitted() {
    const synced = flushCommittedDrafts();
    handleExport({
      lines: synced.lines,
      // Take batch grams AND provenance from the just-committed result, not render-scope
      // settings, so a total typed-but-not-blurred at export time keeps its lock.
      settings: {
        ...settings,
        batchOilGrams: synced.batchOilGrams,
        batchSetByUser: synced.batchSetByUser,
      },
      additives,
    });
  }

  function handleNewRecipe() {
    discardDrafts();
    handleNew();
  }

  function handleApplySuggestedOilGrams(oilGrams: number) {
    const rounded = Math.round(oilGrams);
    if (rounded <= 0) return;
    const batchOilGrams = String(rounded);
    discardDrafts();
    applySyncedUpdate((prev) => ({
      lines: syncBatchTotalEdit(prev, batchOilGrams),
      batchOilGrams,
      batchSetByUser: true,
    }));
  }

  function commitWeightInput(key: string, displayValue: string) {
    const hadDraft = shouldCommitDraft(drafts, weightInputId(key));
    clearDraft(weightInputId(key));
    if (!hadDraft) return;
    const weightGrams = parseInputDisplayToGrams(displayValue, weightUnit);
    if (weightGrams === null) return;

    applySyncedUpdate((prev, batchOilGrams, batchSetByUser) =>
      syncWeightEdit(prev, key, weightGrams, batchOilGrams, batchSetByUser),
    );
  }

  function commitPercentInput(key: string, displayValue: string) {
    const hadDraft = shouldCommitDraft(drafts, percentInputId(key));
    clearDraft(percentInputId(key));
    if (!hadDraft) return;
    const weightPercent = parsePercentInput(displayValue);
    if (weightPercent === null) return;

    applySyncedUpdate((prev, batchOilGrams, batchSetByUser) =>
      syncPercentEdit(prev, key, weightPercent, batchOilGrams, batchSetByUser),
    );
  }

  function commitBatchInput(displayValue: string) {
    const hadDraft = shouldCommitDraft(drafts, batchInputId);
    clearDraft(batchInputId);
    if (!hadDraft) return;
    const batchOilGrams = parseInputDisplayToGrams(displayValue, weightUnit);
    if (batchOilGrams === null) return;

    if (batchOilGrams === '') {
      applySyncedUpdate((prev) => resyncFromWeights(prev));
      return;
    }

    applySyncedUpdate((prev) => ({
      lines: syncBatchTotalEdit(prev, batchOilGrams),
      batchOilGrams,
      batchSetByUser: true,
    }));
  }

  function handleWeightChange(key: string, displayValue: string) {
    setDraft(weightInputId(key), displayValue);
  }

  function handleBatchChange(displayValue: string) {
    setDraft(batchInputId, displayValue);
  }

  function setWeightUnit(nextUnit: WeightUnit) {
    clearAllDrafts();
    setSettings((s) => ({ ...s, weightUnit: nextUnit }));
  }

  function addLine() {
    const newLine = { key: newLineKey(), oilId: 'olive-oil', weightGrams: '', weightPercent: '' };
    applySyncedUpdate((prev, batchOilGrams, batchSetByUser) =>
      addRecipeLine(prev, batchOilGrams, newLine, batchSetByUser),
    );
  }

  function removeLine(key: string) {
    if (lines.length <= 1) return;
    applySyncedUpdate((prev) => resyncFromWeights(prev.filter((line) => line.key !== key)));
    clearDraft(weightInputId(key));
    clearDraft(percentInputId(key));
  }

  return { weightInputId, percentInputId, batchInputId, updateLine, flushCommittedDrafts,
    discardDrafts, handleExportCommitted, handleNewRecipe, handleApplySuggestedOilGrams,
    commitWeightInput, commitPercentInput, commitBatchInput, handleWeightChange,
    handleBatchChange, setWeightUnit, addLine, removeLine };
}
