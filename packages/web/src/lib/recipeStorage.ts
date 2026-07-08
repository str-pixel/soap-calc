import type { AdditiveLine, RecipeLine, RecipeSettings } from './recipe';
import {
  additivesFromSaved,
  createEmptyAdditives,
  newLineKey,
  normalizeSettings,
} from './recipe';

const DRAFT_KEY = 'soap-calc:draft';
const STORAGE_VERSION = 2;

export type SavedAdditiveLine = Omit<AdditiveLine, 'key'>;

export type SavedLine = {
  oilId: string;
  weightGrams: string;
  weightPercent?: string;
  tarLyeTreatment?: RecipeLine['tarLyeTreatment'];
};

type DraftPayload = {
  version: number;
  name: string;
  lines: SavedLine[];
  additives?: SavedAdditiveLine[];
  settings: RecipeSettings;
  updatedAt: string;
};

function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function cloneLines(lines: RecipeLine[]): SavedLine[] {
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

export function linesFromSaved(saved: SavedLine[]): RecipeLine[] {
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
