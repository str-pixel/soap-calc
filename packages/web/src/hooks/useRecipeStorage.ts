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
    // silently lost.
    saveDraft(process, recipeName, lines, settings, additives);
    saveActiveProcess(next);
    const ws = loadWorkspace(next);
    setProcessState(next);
    setRecipeName(ws.name);
    setLines(ws.lines);
    setAdditives(ws.additives);
    setSettings(ws.settings);
  }

  function handleNew() {
    setRecipeName('New recipe');
    setLines(createStarterLines());
    setAdditives(createEmptyAdditives());
    setSettings(starterSettings(process));
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
    file
      .text()
      .then((raw) => {
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
        saveDraft(process, recipeName, lines, settings, additives);
        saveActiveProcess(nextProcess);
        setProcessState(nextProcess);
        setRecipeName(parsed.data.name);
        setLines(importedLines);
        setAdditives(importedAdditives);
        setSettings(importedSettings);
        saveDraft(nextProcess, parsed.data.name, importedLines, importedSettings, importedAdditives);
        flashSaveMessage(`Imported “${parsed.data.name}”`);
      })
      .catch(() => flashSaveMessage('Could not read recipe file'));
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
  };
}
