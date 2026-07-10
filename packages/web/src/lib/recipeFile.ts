import {
  MAX_ADDITIVE_NAME_LENGTH,
  MAX_RECIPE_ADDITIVES,
  parsePercentOfOil,
} from '@soap-calc/core';
import {
  createStarterLines,
  normalizeSettings,
  newAdditiveKey,
  newLineKey,
  type AdditiveLine,
  type RecipeLine,
  type RecipeSettings,
} from './recipe';
import { isProcessId, processForLyeType, type ProcessId } from './process';

export const RECIPE_FILE_VERSION = 2 as const;
export const RECIPE_FILE_VERSION_LEGACY = 1 as const;

export type RecipeFileAdditive = Omit<AdditiveLine, 'key'>;

export type RecipeFilePayload = {
  version: typeof RECIPE_FILE_VERSION;
  process: ProcessId;
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

/** SoapCalc-style ounces of additive per pound of oils → % of oil weight. */
const OZ_PER_LB_OILS = 16;

function roundPercentString(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

function ppoOzToPercentOfOil(ppoOz: number): string {
  return roundPercentString((ppoOz / OZ_PER_LB_OILS) * 100);
}

function parseAdditivePercentOfOil(value: Record<string, unknown>): string {
  const doseUnit = value.doseUnit ?? value.percentUnit;
  if (typeof value.percentOfOil === 'number' && Number.isFinite(value.percentOfOil)) {
    if (value.percentOfOil < 0) return '';
    if (doseUnit === 'ppo' || doseUnit === 'ppoOz') {
      return ppoOzToPercentOfOil(value.percentOfOil);
    }
    return roundPercentString(value.percentOfOil);
  }
  if (typeof value.percentOfOil === 'string' && value.percentOfOil !== '') {
    if (doseUnit === 'ppo' || doseUnit === 'ppoOz') {
      const ppo = Number(value.percentOfOil);
      if (!Number.isFinite(ppo) || ppo < 0) return '';
      return ppoOzToPercentOfOil(ppo);
    }
    return value.percentOfOil;
  }

  for (const key of ['ppo', 'ppoOz', 'ppo_oz'] as const) {
    if (key in value) {
      const ppo = Number(value[key]);
      if (Number.isFinite(ppo) && ppo >= 0) {
        return ppoOzToPercentOfOil(ppo);
      }
    }
  }

  return '';
}

function parseAdditiveLine(value: unknown): RecipeFileAdditive | null {
  if (!isRecord(value)) return null;
  const addAt = value.addAt;
  if (
    addAt !== 'lye' &&
    addAt !== 'oils' &&
    addAt !== 'trace' &&
    addAt !== 'top' &&
    addAt !== 'after_cook'
  ) {
    return null;
  }
  const percentOfOil = parseAdditivePercentOfOil(value);
  if (percentOfOil === '' || parsePercentOfOil(percentOfOil) === null) {
    return null;
  }
  const name =
    typeof value.name === 'string'
      ? value.name.slice(0, MAX_ADDITIVE_NAME_LENGTH)
      : '';
  return {
    catalogId: typeof value.catalogId === 'string' ? value.catalogId : '',
    name,
    percentOfOil,
    addAt,
  };
}

export function serializeRecipeFile(
  name: string,
  lines: RecipeLine[],
  settings: RecipeSettings,
  additives: AdditiveLine[] = [],
  process: ProcessId = 'cp',
): RecipeFilePayload {
  return {
    version: RECIPE_FILE_VERSION,
    process,
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
    if (parsed.additives.length > MAX_RECIPE_ADDITIVES) {
      return { ok: false, error: 'Too many additives in recipe file' };
    }
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
      // A file with no/invalid `process` predates this feature and may contain a KOH
      // (liquid soap) recipe. Route it by alkali so coerceSettingsForProcess doesn't
      // silently flip lyeType koh→naoh on import — an explicit valid process still wins.
      process: isProcessId(parsed.process)
        ? parsed.process
        : processForLyeType((parsed.settings as { lyeType?: unknown } | undefined)?.lyeType),
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
