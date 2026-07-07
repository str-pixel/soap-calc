import { useEffect, useRef, useState } from 'react';
import {
  createStarterLines,
  DEFAULT_SETTINGS,
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

const AUTOSAVE_MS = 500;

export function useRecipeStorage() {
  const draft = loadDraft();
  const [recipeName, setRecipeName] = useState(draft?.name ?? 'Starter recipe');
  const [lines, setLines] = useState<RecipeLine[]>(draft?.lines ?? createStarterLines());
  const [settings, setSettings] = useState<RecipeSettings>(
    normalizeSettings(draft?.settings),
  );
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

  function handleSave() {
    const saved = saveNamedRecipe(recipeName, lines, settings);
    setRecipeName(saved.name);
    setSelectedSavedId(saved.id);
    setSavedRecipes(listSavedRecipes());
    flashSaveMessage(`Saved “${saved.name}”`);
  }

  function handleLoad(id: string) {
    if (!id) return;
    const recipe = loadSavedRecipe(id);
    if (!recipe) return;
    const loadedLines = linesFromSaved(recipe.lines);
    const loadedSettings = normalizeSettings(recipe.settings);
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
  };
}
