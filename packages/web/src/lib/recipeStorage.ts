import type { AdditiveLine, RecipeLine, RecipeSettings } from './recipe';
import {
  additivesFromSaved,
  createEmptyAdditives,
  newLineKey,
  normalizeSettings,
} from './recipe';

const DRAFT_KEY = 'soap-calc:draft';
const RECIPES_KEY = 'soap-calc:recipes';
const STORAGE_VERSION = 2;

export type SavedAdditiveLine = Omit<AdditiveLine, 'key'>;

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
  additives: SavedAdditiveLine[];
  settings: RecipeSettings;
};

type DraftPayload = {
  version: number;
  name: string;
  lines: SavedRecipe['lines'];
  additives?: SavedAdditiveLine[];
  settings: RecipeSettings;
  updatedAt: string;
};

type RecipesPayload = {
  version: number;
  recipes: SavedRecipe[];
};

function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function cloneLines(lines: RecipeLine[]): SavedRecipe['lines'] {
  return lines.map(({ oilId, weightGrams, weightPercent, tarLyeTreatment }) => ({
    oilId,
    weightGrams,
    ...(weightPercent !== undefined ? { weightPercent } : {}),
    ...(tarLyeTreatment ? { tarLyeTreatment } : {}),
  }));
}

function cloneAdditives(additives: AdditiveLine[]): SavedAdditiveLine[] {
  return additives.map(({ catalogId, name, percentOfOil, addAt }) => ({
    catalogId,
    name,
    percentOfOil,
    addAt,
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
  additives: AdditiveLine[];
  settings: RecipeSettings;
} | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as DraftPayload;
    if (
      (data.version !== STORAGE_VERSION && data.version !== 1) ||
      !Array.isArray(data.lines)
    ) {
      return null;
    }
    return {
      name: data.name || 'Untitled recipe',
      lines: linesFromSaved(data.lines),
      additives: additivesFromSaved(data.additives),
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
  additives: AdditiveLine[] = createEmptyAdditives(),
): void {
  const payload: DraftPayload = {
    version: STORAGE_VERSION,
    name,
    lines: cloneLines(lines),
    additives: cloneAdditives(additives),
    settings,
    updatedAt: new Date().toISOString(),
  };
  safeSetItem(DRAFT_KEY, JSON.stringify(payload));
}

export function listSavedRecipes(): SavedRecipe[] {
  try {
    const raw = localStorage.getItem(RECIPES_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as RecipesPayload;
    if (
      (data.version !== STORAGE_VERSION && data.version !== 1) ||
      !Array.isArray(data.recipes)
    ) {
      return [];
    }
    return [...data.recipes]
      .map((recipe) => ({
        ...recipe,
        additives: recipe.additives ?? [],
        settings: normalizeSettings(recipe.settings),
      }))
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  } catch {
    return [];
  }
}

function writeRecipes(recipes: SavedRecipe[]): void {
  const payload: RecipesPayload = { version: STORAGE_VERSION, recipes };
  safeSetItem(RECIPES_KEY, JSON.stringify(payload));
}

export function saveNamedRecipe(
  name: string,
  lines: RecipeLine[],
  settings: RecipeSettings,
  additives?: AdditiveLine[],
): SavedRecipe {
  const trimmed = name.trim() || 'Untitled recipe';
  const recipes = listSavedRecipes();
  const existing = recipes.find((r) => r.name === trimmed);
  const resolvedAdditives =
    additives !== undefined
      ? additives
      : existing
        ? additivesFromSaved(existing.additives)
        : createEmptyAdditives();
  const entry: SavedRecipe = {
    id: existing?.id ?? crypto.randomUUID(),
    name: trimmed,
    savedAt: new Date().toISOString(),
    lines: cloneLines(lines),
    additives: cloneAdditives(resolvedAdditives),
    settings,
  };

  const next = existing
    ? recipes.map((r) => (r.id === existing.id ? entry : r))
    : [entry, ...recipes];

  writeRecipes(next);
  saveDraft(trimmed, lines, settings, resolvedAdditives);
  return entry;
}

export function deleteSavedRecipe(id: string): void {
  writeRecipes(listSavedRecipes().filter((r) => r.id !== id));
}

export function loadSavedRecipe(id: string): SavedRecipe | null {
  return listSavedRecipes().find((r) => r.id === id) ?? null;
}
