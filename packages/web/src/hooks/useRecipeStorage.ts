import { useEffect, useRef, useState } from 'react';
import {
  createStarterLines,
  DEFAULT_SETTINGS,
  migrateRecipeLines,
  normalizeSettings,
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
  recipeLinesFromFile,
  serializeRecipeFile,
} from '../lib/recipeFile';

const AUTOSAVE_MS = 500;

export function useRecipeStorage() {
  const draft = loadDraft();
  const initialSettings = normalizeSettings(draft?.settings);
  const [recipeName, setRecipeName] = useState(draft?.name ?? 'Starter recipe');
  const [lines, setLines] = useState<RecipeLine[]>(
    migrateRecipeLines(draft?.lines ?? createStarterLines(), initialSettings),
  );
  const [settings, setSettings] = useState<RecipeSettings>(initialSettings);
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>(listSavedRecipes);
  const [selectedSavedId, setSelectedSavedId] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft(recipeName, lines, settings);
    }, AUTOSAVE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [recipeName, lines, settings]);

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

  function handleSave(override?: { lines: RecipeLine[]; settings: RecipeSettings }) {
    const linesToSave = override?.lines ?? lines;
    const settingsToSave = override?.settings ?? settings;
    const saved = saveNamedRecipe(recipeName, linesToSave, settingsToSave);
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
    setRecipeName(recipe.name);
    setLines(loadedLines);
    setSettings(loadedSettings);
    setSelectedSavedId(recipe.id);
    saveDraft(recipe.name, loadedLines, loadedSettings);
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
    setSettings({ ...DEFAULT_SETTINGS });
  }

  function handleExport(override?: { lines: RecipeLine[]; settings: RecipeSettings }) {
    const linesToExport = override?.lines ?? lines;
    const settingsToExport = override?.settings ?? settings;
    downloadRecipeFile(serializeRecipeFile(recipeName, linesToExport, settingsToExport));
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
        setRecipeName(parsed.data.name);
        setLines(importedLines);
        setSettings(importedSettings);
        setSelectedSavedId('');
        saveDraft(parsed.data.name, importedLines, importedSettings);
        flashSaveMessage(`Imported “${parsed.data.name}”`);
      })
      .catch(() => flashSaveMessage('Could not read recipe file'));
  }

  return {
    recipeName,
    setRecipeName,
    lines,
    setLines,
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
