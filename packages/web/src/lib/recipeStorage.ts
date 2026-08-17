import type { AdditiveLine, RecipeLine, RecipeSettings } from './recipe';
import {
  additivesFromSaved,
  createEmptyAdditives,
  createStarterLines,
  DEFAULT_SETTINGS,
  newLineKey,
  normalizeSettings,
} from './recipe';
import { isProcessId, processForLyeType, type ProcessId } from './process';

const LEGACY_DRAFT_KEY = 'soap-calc:draft';
const ACTIVE_PROCESS_KEY = 'soap-calc:active-process';
// v3: NaOH purity '100' in older drafts is migrated to the current default (see
// migrateSettings). Version list accepted by loadDraftSlot must include every older version.
const STORAGE_VERSION = 3;
const READABLE_VERSIONS = [1, 2, STORAGE_VERSION];

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

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

/** Guards each stored line the same way the recipe-file import path does (see
 * `recipeFile.ts`'s `parseRecipeFile`): a corrupted/garbage draft must degrade
 * gracefully rather than inject `undefined`-field rows or throw when `.map` hits a
 * non-object entry. Bad entries are dropped; if none survive, fall back to the
 * starter lines so the workspace never renders with zero oils.
 */
export function linesFromSaved(saved: unknown[]): RecipeLine[] {
  const lines: RecipeLine[] = [];
  for (const line of saved) {
    if (!isRecord(line) || typeof line.oilId !== 'string') continue;
    lines.push({
      key: newLineKey(),
      oilId: line.oilId,
      weightGrams: typeof line.weightGrams === 'string' ? line.weightGrams : '',
      ...(typeof line.weightPercent === 'string' ? { weightPercent: line.weightPercent } : {}),
      ...(line.tarLyeTreatment === 'include' || line.tarLyeTreatment === 'additive'
        ? { tarLyeTreatment: line.tarLyeTreatment }
        : {}),
    });
  }
  return lines.length > 0 ? lines : createStarterLines();
}

/** Parks the payload at `<draftKey>:unreadable` and reports whether that slot now holds
 * it. First writer wins: an occupied slot is never overwritten, so a SECOND unreadable
 * draft (rollback → backup written → roll forward → save → rollback again) is
 * deliberately NOT preserved — and the caller's message says "kept", so the verdict has
 * to come back out or that sentence overpromises. Compare content, not presence: an
 * identical payload already in the slot is the same bytes, the same rescue, an honest
 * "kept". False also covers the backup write itself failing (quota/blocked) — same
 * honest answer, though at a few KB against a ~5 MB quota it is effectively unreachable. */
function backupUnreadableDraft(process: ProcessId, raw: string): boolean {
  const backupKey = `${draftKey(process)}:unreadable`;
  try {
    const existing = localStorage.getItem(backupKey);
    return existing === null ? safeSetItem(backupKey, raw) : existing === raw;
  } catch {
    // Storage we cannot even read preserved nothing — do not claim it did.
    return false;
  }
}

/** True when a draft (readable or not) occupies the slot. Used by the autosave
 * flush: writing into an EMPTY slot can never clobber newer data, so a clean tab
 * may safely re-persist its workspace after external deletion/eviction. */
export function hasDraft(process: ProcessId): boolean {
  try {
    return localStorage.getItem(draftKey(process)) !== null;
  } catch {
    return true; // unreadable storage: don't trigger extra writes
  }
}

/** Pre-v3 drafts predate the NaOH-purity default change (100 → 99, #86), so a stored
 * '100' there is the old default carried forward, not a user choice — move it to the
 * current default once. A v3+ draft keeps '100' verbatim: after this migration ships,
 * that value can only exist because the user typed it. */
function migrateSettings(settings: RecipeSettings, version: number): RecipeSettings {
  if (version < 3 && settings.naohPurityPercent === '100') {
    return { ...settings, naohPurityPercent: DEFAULT_SETTINGS.naohPurityPercent };
  }
  return settings;
}

export type LoadedDraft = {
  name: string;
  lines: RecipeLine[];
  additives: AdditiveLine[];
  settings: RecipeSettings;
};

/** What the slot held. `unreadable` separates "nothing was saved here" from "something
 * was saved here that we had to set aside": both yield a null draft and a starter
 * workspace, but only the second is a thing the maker has to be told, or their work
 * simply appears to have vanished. `kept` qualifies the telling: true only when the
 * backup slot actually holds this payload (just written, or already holding the same
 * bytes). The backup is first-writer-wins, so an older occupant leaves today's draft
 * unpreserved — and the message must not say "kept" then. Always false when
 * `unreadable` is false: nothing needed keeping. See useRecipeStorage for who says it. */
export type DraftSlot = { draft: LoadedDraft | null; unreadable: boolean; kept: boolean };

export function loadDraftSlot(process: ProcessId): DraftSlot {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(draftKey(process));
    if (!raw) return { draft: null, unreadable: false, kept: false };
    const data = JSON.parse(raw) as DraftPayload;
    if (!READABLE_VERSIONS.includes(data.version) || !Array.isArray(data.lines)) {
      // Preserve what we can't read: returning null seeds a starter workspace, and the
      // maker's first EDIT overwrites this slot — the autosave debounce is dirty-gated
      // on a mount-time snapshot (useRecipeAutosave), so loading alone rewrites
      // nothing, but the first edit's save lands over this payload whenever it comes.
      // A future-version draft (app rollback) or corrupted payload is parked in a
      // backup slot instead of being left to that. First writer wins — don't churn the
      // backup on every load — so `kept` carries out whether the slot really took (or
      // already held) THIS payload, and the message downstream picks its sentence by it.
      return { draft: null, unreadable: true, kept: backupUnreadableDraft(process, raw) };
    }
    return {
      draft: {
        name: typeof data.name === 'string' && data.name ? data.name : 'Untitled recipe',
        lines: linesFromSaved(data.lines),
        additives: additivesFromSaved(data.additives),
        settings: migrateSettings(normalizeSettings(data.settings), data.version),
      },
      unreadable: false,
      kept: false,
    };
  } catch {
    // JSON.parse-throwing corruption (truncated write) must be preserved the same
    // way as a parseable-but-invalid payload — this catch is the common corruption
    // path, and returning bare null here lets the seeding autosave destroy it.
    // Throwing with no raw in hand is storage itself being unavailable (private mode),
    // not a draft we set aside — there is no rescued recipe to announce.
    return {
      draft: null,
      unreadable: raw !== null,
      kept: raw !== null && backupUnreadableDraft(process, raw),
    };
  }
}

/** The draft alone, without the slot's unreadable flag. TEST-ONLY: the app's one caller
 * (useRecipeStorage's loadWorkspace) reads loadDraftSlot directly now, and production code
 * must keep doing so — dropping the flag drops the one thing that separates "nothing was
 * saved here" from "something was saved here that we had to set aside", which is exactly
 * what the maker has to be told. Kept anyway because ~40 test references load a slot through
 * it, and one wrapper is a better seam than teaching each of them to destructure. */
export function loadDraft(process: ProcessId): LoadedDraft | null {
  return loadDraftSlot(process).draft;
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
    // everything else on CP. Otherwise normalizeSettingsWithinProcess would silently flip a
    // KOH recipe to NaOH when it loads under CP (different SAP → wrong lye weight).
    let parsed: { lines?: unknown; settings?: { lyeType?: unknown } } | undefined;
    try {
      parsed = JSON.parse(legacy) as { lines?: unknown; settings?: { lyeType?: unknown } };
    } catch {
      // fall through to the validity gate below
    }
    // Migrate only what loadDraftSlot could actually read back. An unparseable or
    // structurally alien legacy payload stays under its own key — copying it into a
    // per-process slot would get it rejected by the version gate and then destroyed
    // by the first autosave, instead of merely ignored.
    if (parsed === undefined || typeof parsed !== 'object' || !Array.isArray(parsed.lines)) {
      return;
    }
    const target = processForLyeType(
      parsed?.settings?.lyeType,
      (parsed?.settings as { kohBlendPercent?: unknown } | undefined)?.kohBlendPercent,
    );
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
