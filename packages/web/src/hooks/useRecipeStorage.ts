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
import { loadDraft, saveDraft } from '../lib/recipeStorage';
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

export function useRecipeStorage() {
  const draft = loadDraft();
  const initialSettings = normalizeSettings(draft?.settings);
  const [recipeName, setRecipeName] = useState(draft?.name ?? 'Starter recipe');
  const [lines, setLines] = useState<RecipeLine[]>(
    migrateRecipeLines(draft?.lines ?? createStarterLines(), initialSettings),
  );
  const [additives, setAdditives] = useState<AdditiveLine[]>(
    draft?.additives ?? createEmptyAdditives(),
  );
  const [settings, setSettings] = useState<RecipeSettings>(initialSettings);
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

  function handleNew() {
    setRecipeName('New recipe');
    setLines(createStarterLines());
    setAdditives(createEmptyAdditives());
    setSettings({ ...DEFAULT_SETTINGS });
  }

  function handleExport(override?: ExportOverride) {
    const linesToExport = override?.lines ?? lines;
    const settingsToExport = override?.settings ?? settings;
    const additivesToExport = override?.additives ?? additives;
    downloadRecipeFile(
      serializeRecipeFile(recipeName, linesToExport, settingsToExport, additivesToExport),
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
        const importedSettings = normalizeSettings(parsed.data.settings);
        const importedLines = migrateRecipeLines(
          recipeLinesFromFile(parsed.data.lines),
          importedSettings,
        );
        const importedAdditives = recipeAdditivesFromFile(parsed.data.additives);
        setRecipeName(parsed.data.name);
        setLines(importedLines);
        setAdditives(importedAdditives);
        setSettings(importedSettings);
        saveDraft(parsed.data.name, importedLines, importedSettings, importedAdditives);
        flashSaveMessage(`Imported “${parsed.data.name}”`);
      })
      .catch(() => flashSaveMessage('Could not read recipe file'));
  }

  return {
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
