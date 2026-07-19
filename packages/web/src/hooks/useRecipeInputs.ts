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
    applyEdit: (synced: SyncedRecipe) => void;
    applySyncedUpdate: (
      u: (lines: RecipeLine[], batch: string, batchSetByUser: boolean) => SyncedRecipe,
    ) => void;
    linesRef: React.MutableRefObject<RecipeLine[]>;
    batchRef: React.MutableRefObject<string>;
    batchSetByUserRef: React.MutableRefObject<boolean>;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
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
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export function useRecipeInputs(deps: UseRecipeInputsDeps): RecipeInputs {
  const { weightInputId, percentInputId, batchInputId } = makeInputIds();
  const { settings, additives, weightUnit, drafts } = deps;
  const { setDraft, clearDraft, clearAllDrafts } = deps;
  const { applyEdit, applySyncedUpdate, linesRef, batchRef, batchSetByUserRef } = deps.editor;
  const { undo: editorUndo, redo: editorRedo, canUndo, canRedo } = deps.editor;
  const { setSettings, handleExport, handleNew } = deps;

  // Route through the funnel (carrying batch + provenance unchanged) so oil-swap and
  // tar-treatment edits are captured in history like every other oils edit.
  function updateLine(key: string, patch: Partial<RecipeLine>) {
    applySyncedUpdate((prevLines, currentBatch, currentBatchSetByUser) => ({
      lines: prevLines.map((line) => {
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
      batchOilGrams: currentBatch,
      batchSetByUser: currentBatchSetByUser,
    }));
  }

  // Undo/redo throw away any in-flight draft (a draft was never committed, so it isn't
  // history) and then step the committed oils state. discardDrafts also lets a still-
  // focused field fall back to the restored canonical value.
  function undo() {
    discardDrafts();
    editorUndo();
  }
  function redo() {
    discardDrafts();
    editorRedo();
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
      applyEdit(synced);
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
    // Read the live ref, not the render-scope `lines` prop: every other write path in this
    // module goes through applySyncedUpdate/linesRef as the source of truth, and a same-tick
    // multi-fire could pass a stale `lines.length` check here and drop below the enforced
    // 1-line minimum.
    if (linesRef.current.length <= 1) return;
    applySyncedUpdate((prev) => resyncFromWeights(prev.filter((line) => line.key !== key)));
    clearDraft(weightInputId(key));
    clearDraft(percentInputId(key));
  }

  return { weightInputId, percentInputId, batchInputId, updateLine, flushCommittedDrafts,
    discardDrafts, handleExportCommitted, handleNewRecipe, handleApplySuggestedOilGrams,
    commitWeightInput, commitPercentInput, commitBatchInput, handleWeightChange,
    handleBatchChange, setWeightUnit, addLine, removeLine, undo, redo, canUndo, canRedo };
}
