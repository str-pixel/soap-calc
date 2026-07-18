import type { AdditiveLine, RecipeLine, RecipeSettings } from './recipe';
import {
  additivesFromSaved,
  createEmptyAdditives,
  newLineKey,
  normalizeSettings,
} from './recipe';
import { isProcessId, processForLyeType, type ProcessId } from './process';

const LEGACY_DRAFT_KEY = 'soap-calc:draft';
const ACTIVE_PROCESS_KEY = 'soap-calc:active-process';
const STORAGE_VERSION = 2;

function draftKey(process: ProcessId): string {
  return `soap-calc:draft:${process}`;
}

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
  return additives.map(({ catalogId, name, amount, basis, unit, addAt }) => ({
    catalogId,
    name,
    amount,
    basis,
    unit,
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

export function loadDraft(process: ProcessId): {
  name: string;
  lines: RecipeLine[];
  additives: AdditiveLine[];
  settings: RecipeSettings;
} | null {
  try {
    const raw = localStorage.getItem(draftKey(process));
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

/** Returns false when the write failed (e.g. quota exceeded or storage blocked in
 * private mode) so callers can warn the user instead of silently losing work. */
export function saveDraft(
  process: ProcessId,
  name: string,
  lines: RecipeLine[],
  settings: RecipeSettings,
  additives: AdditiveLine[] = createEmptyAdditives(),
): boolean {
  const payload: DraftPayload = {
    version: STORAGE_VERSION,
    name,
    lines: cloneLines(lines),
    additives: cloneAdditives(additives),
    settings,
    updatedAt: new Date().toISOString(),
  };
  return safeSetItem(draftKey(process), JSON.stringify(payload));
}

export function loadActiveProcess(): ProcessId {
  try {
    const raw = localStorage.getItem(ACTIVE_PROCESS_KEY);
    return isProcessId(raw) ? raw : 'cp';
  } catch {
    return 'cp';
  }
}

export function saveActiveProcess(process: ProcessId): void {
  safeSetItem(ACTIVE_PROCESS_KEY, process);
}

export function migrateLegacyDraft(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_DRAFT_KEY);
    if (legacy === null) return;
    // Route by the legacy recipe's alkali: a KOH (liquid soap) recipe lands on LS,
    // everything else on CP. Otherwise coerceSettingsForProcess would silently flip a
    // KOH recipe to NaOH when it loads under CP (different SAP → wrong lye weight).
    let parsed: { settings?: { lyeType?: unknown } } | undefined;
    try {
      parsed = JSON.parse(legacy) as { settings?: { lyeType?: unknown } };
    } catch {
      // unparseable legacy payload → processForLyeType(undefined) below defaults to cp
    }
    const target = processForLyeType(parsed?.settings?.lyeType);
    // Only migrate — and only clear the legacy key — when the target slot is empty. A
    // concurrent old+new tab may have already written a per-process draft there; if so,
    // leave both the existing draft and the still-unmigrated legacy payload alone rather
    // than clobbering the former or destroying the latter.
    const targetEmpty = localStorage.getItem(draftKey(target)) === null;
    if (targetEmpty) {
      safeSetItem(draftKey(target), legacy);
    }
    // Seed the active process to match, so the user lands on the right tab — but only
    // if not already set (don't clobber a returning user's choice on a repeat call).
    if (localStorage.getItem(ACTIVE_PROCESS_KEY) === null) {
      safeSetItem(ACTIVE_PROCESS_KEY, target);
    }
    if (targetEmpty) {
      localStorage.removeItem(LEGACY_DRAFT_KEY);
    }
  } catch {
    // ignore
  }
}
