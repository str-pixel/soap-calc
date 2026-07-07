import { useEffect, useRef, useState } from 'react';
import {
  additivesFromSaved,
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
  deleteSavedRecipe,
  linesFromSaved,
  listSavedRecipes,
  loadDraft,
  loadSavedRecipe,
  saveDraft,
  saveNamedRecipe,
  type SavedRecipe,
} from '../lib/recipeStorage';
import {
  downloadRecipeFile,
  parseRecipeFile,
  recipeAdditivesFromFile,
  recipeLinesFromFile,
  serializeRecipeFile,
} from '../lib/recipeFile';

type SaveOverride = {
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
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>(listSavedRecipes);
  const [selectedSavedId, setSelectedSavedId] = useState('');
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

  function handleSave(override?: SaveOverride) {
    const linesToSave = override?.lines ?? lines;
    const settingsToSave = override?.settings ?? settings;
    const additivesToSave = override?.additives ?? additives;
    const saved = saveNamedRecipe(recipeName, linesToSave, settingsToSave, additivesToSave);
    setRecipeName(saved.name);
    setSelectedSavedId(saved.id);
    setSavedRecipes(listSavedRecipes());
    flashSaveMessage(`Saved “${saved.name}”`);
  }

  function handleLoad(id: string) {
    if (!id) return;
    const recipe = loadSavedRecipe(id);
    if (!recipe) return;
    const loadedSettings = normalizeSettings(recipe.settings);
    const loadedLines = migrateRecipeLines(linesFromSaved(recipe.lines), loadedSettings);
    const loadedAdditives = additivesFromSaved(recipe.additives);
    setRecipeName(recipe.name);
    setLines(loadedLines);
    setAdditives(loadedAdditives);
    setSettings(loadedSettings);
    setSelectedSavedId(recipe.id);
    saveDraft(recipe.name, loadedLines, loadedSettings, loadedAdditives);
    flashSaveMessage(`Loaded “${recipe.name}”`);
  }

  function handleDelete(id: string) {
    if (!id) return;
    const recipe = loadSavedRecipe(id);
    if (!recipe) return;
    if (!window.confirm(`Delete saved recipe “${recipe.name}”? This cannot be undone.`)) {
      return;
    }
    deleteSavedRecipe(id);
    setSavedRecipes(listSavedRecipes());
    if (selectedSavedId === id) {
      setSelectedSavedId('');
    }
    flashSaveMessage(`Deleted “${recipe.name}”`);
  }

  function handleNew() {
    setRecipeName('New recipe');
    setLines(createStarterLines());
    setAdditives(createEmptyAdditives());
    setSettings({ ...DEFAULT_SETTINGS });
  }

  function handleExport(override?: SaveOverride) {
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
        setSelectedSavedId('');
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
    savedRecipes,
    selectedSavedId,
    setSelectedSavedId,
    saveMessage,
    handleSave,
    handleLoad,
    handleDelete,
    handleNew,
    handleExport,
    handleImportFile,
  };
}
