import {
  createStarterLines,
  normalizeSettings,
  newAdditiveKey,
  newLineKey,
  type AdditiveLine,
  type RecipeLine,
  type RecipeSettings,
} from './recipe';

export const RECIPE_FILE_VERSION = 2 as const;
export const RECIPE_FILE_VERSION_LEGACY = 1 as const;

export type RecipeFileAdditive = Omit<AdditiveLine, 'key'>;

export type RecipeFilePayload = {
  version: typeof RECIPE_FILE_VERSION;
  name: string;
  lines: Array<{
    oilId: string;
    weightGrams: string;
    weightPercent?: string;
    tarLyeTreatment?: RecipeLine['tarLyeTreatment'];
  }>;
  additives: RecipeFileAdditive[];
  settings: RecipeSettings;
  exportedAt: string;
};

export type ParsedRecipeFile =
  | { ok: true; data: RecipeFilePayload }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseAdditiveLine(value: unknown): RecipeFileAdditive | null {
  if (!isRecord(value)) return null;
  const addAt = value.addAt;
  if (
    addAt !== 'lye' &&
    addAt !== 'oils' &&
    addAt !== 'trace' &&
    addAt !== 'top'
  ) {
    return null;
  }
  return {
    catalogId: typeof value.catalogId === 'string' ? value.catalogId : '',
    name: typeof value.name === 'string' ? value.name : '',
    percentOfOil: typeof value.percentOfOil === 'string' ? value.percentOfOil : '',
    addAt,
  };
}

export function serializeRecipeFile(
  name: string,
  lines: RecipeLine[],
  settings: RecipeSettings,
  additives: AdditiveLine[] = [],
): RecipeFilePayload {
  return {
    version: RECIPE_FILE_VERSION,
    name: name.trim() || 'Untitled recipe',
    lines: lines.map(({ oilId, weightGrams, weightPercent, tarLyeTreatment }) => ({
      oilId,
      weightGrams,
      ...(weightPercent !== undefined ? { weightPercent } : {}),
      ...(tarLyeTreatment ? { tarLyeTreatment } : {}),
    })),
    additives: additives.map(({ catalogId, name: additiveName, percentOfOil, addAt }) => ({
      catalogId,
      name: additiveName,
      percentOfOil,
      addAt,
    })),
    settings: normalizeSettings(settings),
    exportedAt: new Date().toISOString(),
  };
}

export function parseRecipeFile(raw: string): ParsedRecipeFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Invalid JSON file' };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: 'Unsupported or missing recipe file version' };
  }

  const version = parsed.version;
  if (version !== RECIPE_FILE_VERSION && version !== RECIPE_FILE_VERSION_LEGACY) {
    return { ok: false, error: 'Unsupported or missing recipe file version' };
  }

  if (typeof parsed.name !== 'string' || !Array.isArray(parsed.lines)) {
    return { ok: false, error: 'Recipe file is missing name or oils' };
  }

  const lines: RecipeFilePayload['lines'] = [];
  for (const line of parsed.lines) {
    if (!isRecord(line) || typeof line.oilId !== 'string') {
      return { ok: false, error: 'Invalid oil line in recipe file' };
    }
    lines.push({
      oilId: line.oilId,
      weightGrams: typeof line.weightGrams === 'string' ? line.weightGrams : '',
      ...(typeof line.weightPercent === 'string' ? { weightPercent: line.weightPercent } : {}),
      ...(line.tarLyeTreatment === 'include' || line.tarLyeTreatment === 'additive'
        ? { tarLyeTreatment: line.tarLyeTreatment }
        : {}),
    });
  }

  const additives: RecipeFileAdditive[] = [];
  if (Array.isArray(parsed.additives)) {
    for (const item of parsed.additives) {
      const additive = parseAdditiveLine(item);
      if (!additive) {
        return { ok: false, error: 'Invalid additive line in recipe file' };
      }
      additives.push(additive);
    }
  }

  return {
    ok: true,
    data: {
      version: RECIPE_FILE_VERSION,
      name: parsed.name,
      lines,
      additives,
      settings: normalizeSettings(parsed.settings as Partial<RecipeSettings>),
      exportedAt:
        typeof parsed.exportedAt === 'string'
          ? parsed.exportedAt
          : new Date().toISOString(),
    },
  };
}

export function recipeLinesFromFile(
  lines: RecipeFilePayload['lines'],
): RecipeLine[] {
  if (lines.length === 0) return createStarterLines();
  return lines.map((line) => ({
    key: newLineKey(),
    oilId: line.oilId,
    weightGrams: line.weightGrams,
    ...(line.weightPercent !== undefined ? { weightPercent: line.weightPercent } : {}),
    ...(line.tarLyeTreatment ? { tarLyeTreatment: line.tarLyeTreatment } : {}),
  }));
}

export function recipeAdditivesFromFile(
  additives: RecipeFilePayload['additives'],
): AdditiveLine[] {
  return additives.map((line) => ({
    key: newAdditiveKey(),
    catalogId: line.catalogId,
    name: line.name,
    percentOfOil: line.percentOfOil,
    addAt: line.addAt,
  }));
}

export function recipeFileDownloadName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'recipe'}.soap-recipe.json`;
}

export function downloadRecipeFile(payload: RecipeFilePayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = recipeFileDownloadName(payload.name);
  anchor.click();
  URL.revokeObjectURL(url);
}
