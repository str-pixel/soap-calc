import type { RecipeLine, RecipeSettings } from './recipe';
import { newLineKey, normalizeSettings } from './recipe';

const DRAFT_KEY = 'soap-calc:draft';
const RECIPES_KEY = 'soap-calc:recipes';
const STORAGE_VERSION = 1;

export type SavedRecipe = {
  id: string;
  name: string;
  savedAt: string;
  lines: Array<{
    oilId: string;
    weightGrams: string;
    weightPercent?: string;
    tarLyeTreatment?: RecipeLine['tarLyeTreatment'];
  }>;
  settings: RecipeSettings;
};

type DraftPayload = {
  version: number;
  name: string;
  lines: SavedRecipe['lines'];
  settings: RecipeSettings;
  updatedAt: string;
};

type RecipesPayload = {
  version: number;
  recipes: SavedRecipe[];
};

function cloneLines(lines: RecipeLine[]): SavedRecipe['lines'] {
  return lines.map(({ oilId, weightGrams, weightPercent, tarLyeTreatment }) => ({
    oilId,
    weightGrams,
    ...(weightPercent !== undefined ? { weightPercent } : {}),
    ...(tarLyeTreatment ? { tarLyeTreatment } : {}),
  }));
}

export function linesFromSaved(saved: SavedRecipe['lines']): RecipeLine[] {
  return saved.map((line) => ({
    key: newLineKey(),
    oilId: line.oilId,
    weightGrams: line.weightGrams,
    ...(line.weightPercent !== undefined ? { weightPercent: line.weightPercent } : {}),
    ...(line.tarLyeTreatment ? { tarLyeTreatment: line.tarLyeTreatment } : {}),
  }));
}

export function loadDraft(): {
  name: string;
  lines: RecipeLine[];
  settings: RecipeSettings;
} | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as DraftPayload;
    if (data.version !== STORAGE_VERSION || !Array.isArray(data.lines)) return null;
    return {
      name: data.name || 'Untitled recipe',
      lines: linesFromSaved(data.lines),
      settings: normalizeSettings(data.settings),
    };
  } catch {
    return null;
  }
}

export function saveDraft(
  name: string,
  lines: RecipeLine[],
  settings: RecipeSettings,
): void {
  const payload: DraftPayload = {
    version: STORAGE_VERSION,
    name,
    lines: cloneLines(lines),
    settings,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
}

export function listSavedRecipes(): SavedRecipe[] {
  try {
    const raw = localStorage.getItem(RECIPES_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as RecipesPayload;
    if (data.version !== STORAGE_VERSION || !Array.isArray(data.recipes)) return [];
    return [...data.recipes].sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    );
  } catch {
    return [];
  }
}

function writeRecipes(recipes: SavedRecipe[]): void {
  const payload: RecipesPayload = { version: STORAGE_VERSION, recipes };
  localStorage.setItem(RECIPES_KEY, JSON.stringify(payload));
}

export function saveNamedRecipe(
  name: string,
  lines: RecipeLine[],
  settings: RecipeSettings,
): SavedRecipe {
  const trimmed = name.trim() || 'Untitled recipe';
  const recipes = listSavedRecipes();
  const existing = recipes.find((r) => r.name === trimmed);
  const entry: SavedRecipe = {
    id: existing?.id ?? crypto.randomUUID(),
    name: trimmed,
    savedAt: new Date().toISOString(),
    lines: cloneLines(lines),
    settings,
  };

  const next = existing
    ? recipes.map((r) => (r.id === existing.id ? entry : r))
    : [entry, ...recipes];

  writeRecipes(next);
  saveDraft(trimmed, lines, settings);
  return entry;
}

export function deleteSavedRecipe(id: string): void {
  writeRecipes(listSavedRecipes().filter((r) => r.id !== id));
}

export function loadSavedRecipe(id: string): SavedRecipe | null {
  return listSavedRecipes().find((r) => r.id === id) ?? null;
}
