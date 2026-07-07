import {
  createStarterLines,
  normalizeSettings,
  newLineKey,
  type RecipeLine,
  type RecipeSettings,
} from './recipe';

export const RECIPE_FILE_VERSION = 1 as const;

export type RecipeFilePayload = {
  version: typeof RECIPE_FILE_VERSION;
  name: string;
  lines: Array<{
    oilId: string;
    weightGrams: string;
    weightPercent?: string;
    tarLyeTreatment?: RecipeLine['tarLyeTreatment'];
  }>;
  settings: RecipeSettings;
  exportedAt: string;
};

export type ParsedRecipeFile =
  | { ok: true; data: RecipeFilePayload }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function serializeRecipeFile(
  name: string,
  lines: RecipeLine[],
  settings: RecipeSettings,
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

  if (!isRecord(parsed) || parsed.version !== RECIPE_FILE_VERSION) {
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

  return {
    ok: true,
    data: {
      version: RECIPE_FILE_VERSION,
      name: parsed.name,
      lines,
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
