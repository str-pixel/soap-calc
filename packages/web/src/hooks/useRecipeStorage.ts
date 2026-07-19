import { useEffect, useRef, useState } from 'react';
import {
  createEmptyAdditives,
  createStarterLines,
  DEFAULT_SETTINGS,
  migrateRecipeLines,
  normalizeSettings,
  type AdditiveLine,
  type RecipeLine,
  type RecipeSettings,
} from '../lib/recipe';
import {
  loadActiveProcess,
  loadDraft,
  migrateLegacyDraft,
  saveActiveProcess,
  saveDraft,
} from '../lib/recipeStorage';
import {
  coerceSettingsForProcess,
  defaultsForProcess,
  type ProcessId,
} from '../lib/process';
import {
  downloadRecipeFile,
  parseRecipeFile,
  recipeAdditivesFromFile,
  recipeLinesFromFile,
  serializeRecipeFile,
} from '../lib/recipeFile';

type ExportOverride = {
  lines: RecipeLine[];
  settings: RecipeSettings;
  additives?: AdditiveLine[];
};

function seededSettings(process: ProcessId): RecipeSettings {
  return normalizeSettings({ ...DEFAULT_SETTINGS, ...defaultsForProcess(process) });
}

/**
 * Settings for a fresh starter workspace. The starter ships an intentional 1000 g batch
 * (its oil weights sum to the total), so lock it: editing a starter oil rebalances within
 * 1000 rather than growing the total. Every path that seeds a fresh starter workspace must
 * use this — the same visible recipe has to behave the same way however the user reached
 * it. (An imported file is not one of these: it carries its own settings and provenance,
 * even when `recipeLinesFromFile` falls back to starter lines for an empty line list.)
 */
function starterSettings(process: ProcessId): RecipeSettings {
  return { ...seededSettings(process), batchSetByUser: true };
}

function loadWorkspace(process: ProcessId) {
  const draft = loadDraft(process);
  const settings = draft
    ? // Saved drafts carry their own provenance (see normalizeSettings for how a legacy
      // draft with no provenance field is resolved).
      coerceSettingsForProcess(normalizeSettings(draft.settings), process)
    : starterSettings(process);
  return {
    name: draft?.name ?? 'Starter recipe',
    lines: migrateRecipeLines(draft?.lines ?? createStarterLines(), settings),
    additives: draft?.additives ?? createEmptyAdditives(),
    settings,
  };
}

export function useRecipeStorage() {
  const initial = useRef<{ process: ProcessId; ws: ReturnType<typeof loadWorkspace> } | null>(
    null,
  );
  if (initial.current === null) {
    migrateLegacyDraft();
    const process = loadActiveProcess();
    initial.current = { process, ws: loadWorkspace(process) };
  }

  const [process, setProcessState] = useState<ProcessId>(initial.current.process);
  const [recipeName, setRecipeName] = useState(initial.current.ws.name);
  const [lines, setLines] = useState<RecipeLine[]>(initial.current.ws.lines);
  const [additives, setAdditives] = useState<AdditiveLine[]>(initial.current.ws.additives);
  const [settings, setSettings] = useState<RecipeSettings>(initial.current.ws.settings);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Identity of the loaded workspace. Bumped by every full-workspace swap below;
  // undo history is stamped with this and gated on it, so a swap makes stale
  // history unreachable without a separate reset call. See useRecipeEditor.
  const [workspaceGeneration, setWorkspaceGeneration] = useState(0);
  // Guards overlapping imports: if a second file is chosen before the first's file.text()
  // resolves, each call bumps this token and stamps its own async continuation with it. A
  // continuation whose token has been superseded by a later import bails out instead of
  // flushing/swapping state, so a slow first read can never land after (and clobber) a
  // faster second one — the latest-fired import always wins, deterministically.
  const importTokenRef = useRef(0);

  useEffect(() => {
    return () => {
      if (messageTimer.current) clearTimeout(messageTimer.current);
    };
  }, []);

  function flashSaveMessage(message: string) {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    setSaveMessage(message);
    messageTimer.current = setTimeout(() => setSaveMessage(null), 2000);
  }

  function setProcess(next: ProcessId) {
    if (next === process) return;
    // Flush the outgoing process's workspace synchronously: the 500ms autosave
    // debounce (useRecipeAutosave) gets cancelled by effect-cleanup when state
    // swaps below, so without this an edit made <500ms before a tab switch is
    // silently lost. Warn if the flush fails (quota/blocked) so the loss isn't silent.
    if (!saveDraft(process, recipeName, lines, settings, additives)) {
      flashSaveMessage('Could not save the current recipe before switching — export it to avoid losing changes.');
    }
    saveActiveProcess(next);
    const ws = loadWorkspace(next);
    setProcessState(next);
    setRecipeName(ws.name);
    setLines(ws.lines);
    setAdditives(ws.additives);
    setSettings(ws.settings);
    setWorkspaceGeneration((g) => g + 1);
  }

  function handleNew() {
    setRecipeName('New recipe');
    setLines(createStarterLines());
    setAdditives(createEmptyAdditives());
    setSettings(starterSettings(process));
    setWorkspaceGeneration((g) => g + 1);
  }

  function handleExport(override?: ExportOverride) {
    const linesToExport = override?.lines ?? lines;
    const settingsToExport = override?.settings ?? settings;
    const additivesToExport = override?.additives ?? additives;
    downloadRecipeFile(
      serializeRecipeFile(recipeName, linesToExport, settingsToExport, additivesToExport, process),
    );
    flashSaveMessage('Recipe exported');
  }

  function handleImportFile(file: File) {
    const token = ++importTokenRef.current;
    file
      .text()
      .then((raw) => {
        // A newer import started (and thus owns the token) while this one's file.text()
        // was in flight — bail out so this stale continuation can't flush/swap state over
        // whatever the newer import already landed.
        if (importTokenRef.current !== token) return;
        const parsed = parseRecipeFile(raw);
        if (!parsed.ok) {
          flashSaveMessage(parsed.error);
          return;
        }
        const nextProcess = parsed.data.process;
        const importedSettings = coerceSettingsForProcess(
          normalizeSettings(parsed.data.settings),
          nextProcess,
        );
        const importedLines = migrateRecipeLines(
          recipeLinesFromFile(parsed.data.lines),
          importedSettings,
        );
        const importedAdditives = recipeAdditivesFromFile(parsed.data.additives);
        // Flush the outgoing process's in-memory workspace first, mirroring setProcess:
        // without this, edits made just before an import (still pending the autosave
        // debounce) would be silently discarded when the state below swaps process.
        const flushedOutgoing = saveDraft(process, recipeName, lines, settings, additives);
        saveActiveProcess(nextProcess);
        setProcessState(nextProcess);
        setRecipeName(parsed.data.name);
        setLines(importedLines);
        setAdditives(importedAdditives);
        setSettings(importedSettings);
        setWorkspaceGeneration((g) => g + 1);
        const savedImported = saveDraft(
          nextProcess,
          parsed.data.name,
          importedLines,
          importedSettings,
          importedAdditives,
        );
        // Fold any write failure into the final message so it isn't overwritten by the
        // success flash — storage full means neither the previous nor imported recipe persisted.
        flashSaveMessage(
          flushedOutgoing && savedImported
            ? `Imported “${parsed.data.name}”`
            : `Imported “${parsed.data.name}” — but storage is full, so changes may not persist. Export to keep a copy.`,
        );
      })
      .catch(() => {
        if (importTokenRef.current !== token) return;
        flashSaveMessage('Could not read recipe file');
      });
  }

  return {
    process,
    setProcess,
    recipeName,
    setRecipeName,
    lines,
    setLines,
    additives,
    setAdditives,
    settings,
    setSettings,
    saveMessage,
    handleNew,
    handleExport,
    handleImportFile,
    workspaceGeneration,
    flashSaveMessage,
  };
}
