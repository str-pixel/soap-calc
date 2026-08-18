import { useEffect, useRef, useState } from 'react';
import {
  createEmptyAdditives,
  createStarterLines,
  DEFAULT_SETTINGS,
  migrateRecipeLines,
  normalizeSettings,
  type AdditiveLine,
  type RecipeLine,
  type RecipeSettings,
} from '../lib/recipe';
import {
  loadActiveProcess,
  loadDraftSlot,
  migrateLegacyDraft,
  saveActiveProcess,
  saveDraft,
} from '../lib/recipeStorage';
import {
  normalizeSettingsWithinProcess,
  defaultsForProcess,
  importRoutingSuffix,
  type ProcessId,
} from '../lib/process';
import {
  downloadRecipeFile,
  parseRecipeFile,
  recipeAdditivesFromFile,
  recipeLinesFromFile,
  serializeRecipeFile,
} from '../lib/recipeFile';

type ExportOverride = {
  lines: RecipeLine[];
  settings: RecipeSettings;
  additives?: AdditiveLine[];
};

function seededSettings(process: ProcessId): RecipeSettings {
  return normalizeSettings({ ...DEFAULT_SETTINGS, ...defaultsForProcess(process) });
}

/**
 * Settings for a fresh starter workspace. The starter ships an intentional 1000 g batch
 * (its oil weights sum to the total), so lock it: editing a starter oil rebalances within
 * 1000 rather than growing the total. Every path that seeds a fresh starter workspace must
 * use this — the same visible recipe has to behave the same way however the user reached
 * it. (An imported file is not one of these: it carries its own settings and provenance,
 * even when `recipeLinesFromFile` falls back to starter lines for an empty line list.)
 */
function starterSettings(process: ProcessId): RecipeSettings {
  return { ...seededSettings(process), batchSetByUser: true };
}

function loadWorkspace(process: ProcessId) {
  const { draft, unreadable, kept } = loadDraftSlot(process);
  const settings = draft
    ? // Saved drafts carry their own provenance (see normalizeSettings for how a legacy
      // draft with no provenance field is resolved).
      normalizeSettingsWithinProcess(normalizeSettings(draft.settings), process)
    : starterSettings(process);
  return {
    name: draft?.name ?? 'Starter recipe',
    lines: migrateRecipeLines(draft?.lines ?? createStarterLines(), settings),
    additives: draft?.additives ?? createEmptyAdditives(),
    settings,
    // Carried out rather than announced here: the initial seeding below runs during the
    // first render, where flashSaveMessage does not exist yet. Both call sites decide
    // for themselves when to say it.
    unreadable,
    kept,
  };
}

/** Said when a draft failed the version gate or was corrupt AND the backup slot at
 * `<draftKey>:unreadable` (see recipeStorage) really holds it. The sentence has to
 * carry the rescue, not just the failure — a maker who reads only "could not read your
 * saved recipe" concludes the work is gone and stops looking. "Kept" is all it promises:
 * nothing in the app reads that backup slot back (a restore affordance is an open item),
 * so once the maker's first edit lands on the live key, not even a build that could read
 * the payload will show it again — recovery means digging it out by hand. */
const UNREADABLE_DRAFT_KEPT_MESSAGE =
  'Your saved recipe could not be read — it has been kept unchanged in this browser, and a starter recipe loaded in its place.';

/** Said when the backup did NOT take today's payload (loadDraftSlot's `kept` false):
 * claiming "kept unchanged" then would name a rescue that never happened. The sentence
 * names the first-writer-wins cause — an earlier unreadable draft occupying the slot —
 * because that is the reachable one; a failed backup write (the only other way `kept`
 * comes back false, effectively unreachable at these sizes) shares this sentence rather
 * than growing a third variant for a cause it cannot name. */
const UNREADABLE_DRAFT_NOT_KEPT_MESSAGE =
  'Your saved recipe could not be read, and this browser was already holding an earlier unreadable one — so it could not be set aside. A starter recipe loaded in its place.';

function unreadableDraftMessage(kept: boolean): string {
  return kept ? UNREADABLE_DRAFT_KEPT_MESSAGE : UNREADABLE_DRAFT_NOT_KEPT_MESSAGE;
}

/** The import-path variants: same failure, same kept/not-kept semantics as the two
 * sentences above — ONLY the closing clause differs, because on this path it is the
 * imported recipe (not a starter) that loaded in the slot's place. Reusing the load-path
 * sentences here closed on a falsehood, and by displacing the "Imported …" confirmation
 * it read as the import having failed. */
const UNREADABLE_DRAFT_KEPT_IMPORT_MESSAGE =
  'Your saved recipe could not be read — it has been kept unchanged in this browser, and the imported recipe loaded in its place.';

const UNREADABLE_DRAFT_NOT_KEPT_IMPORT_MESSAGE =
  'Your saved recipe could not be read, and this browser was already holding an earlier unreadable one — so it could not be set aside. The imported recipe loaded in its place.';

function unreadableDraftImportMessage(kept: boolean): string {
  return kept ? UNREADABLE_DRAFT_KEPT_IMPORT_MESSAGE : UNREADABLE_DRAFT_NOT_KEPT_IMPORT_MESSAGE;
}

/** Flash display time scaled to reading length. The old flat 2000 ms erased the 25-word
 * import-refusal copy before anyone could read it; ~50 ms/char tracks reading speed with
 * the old floor kept for short confirmations. Exported for tests. */
export function flashDurationMs(message: string): number {
  return Math.max(2000, Math.min(6000, message.length * 50));
}

export function useRecipeStorage() {
  const initial = useRef<{ process: ProcessId; ws: ReturnType<typeof loadWorkspace> } | null>(
    null,
  );
  if (initial.current === null) {
    migrateLegacyDraft();
    const process = loadActiveProcess();
    initial.current = { process, ws: loadWorkspace(process) };
  }

  const [process, setProcessState] = useState<ProcessId>(initial.current.process);
  const [recipeName, setRecipeName] = useState(initial.current.ws.name);
  const [lines, setLines] = useState<RecipeLine[]>(initial.current.ws.lines);
  const [additives, setAdditives] = useState<AdditiveLine[]>(initial.current.ws.additives);
  const [settings, setSettings] = useState<RecipeSettings>(initial.current.ws.settings);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Identity of the loaded workspace. Bumped by every full-workspace swap below;
  // undo history is stamped with this and gated on it, so a swap makes stale
  // history unreachable without a separate reset call. See useRecipeEditor.
  const [workspaceGeneration, setWorkspaceGeneration] = useState(0);
  // Guards overlapping imports: if a second file is chosen before the first's file.text()
  // resolves, each call bumps this token and stamps its own async continuation with it. A
  // continuation whose token has been superseded by a later import bails out instead of
  // flushing/swapping state, so a slow first read can never land after (and clobber) a
  // faster second one — the latest-fired import always wins, deterministically.
  const importTokenRef = useRef(0);
  // Latest workspace, updated every render: the import continuation below runs after an
  // async gap and must flush what the workspace IS at resolve time, not the stale render
  // closure it was created in (same refs pattern as useRecipeAutosave).
  const workspaceRef = useRef({ process, recipeName, lines, settings, additives });
  workspaceRef.current = { process, recipeName, lines, settings, additives };

  useEffect(() => {
    return () => {
      if (messageTimer.current) clearTimeout(messageTimer.current);
    };
  }, []);

  // The workspace this hook opened on was seeded during the first render, before
  // flashSaveMessage or any state existed — so an unreadable draft found there is
  // reported from here, on mount, rather than from loadWorkspace itself.
  useEffect(() => {
    const ws = initial.current?.ws;
    if (ws?.unreadable) flashSaveMessage(unreadableDraftMessage(ws.kept));
  }, []);

  function flashSaveMessage(message: string) {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    setSaveMessage(message);
    messageTimer.current = setTimeout(() => setSaveMessage(null), flashDurationMs(message));
  }

  function setProcess(next: ProcessId) {
    if (next === process) return;
    // Flush the outgoing process's workspace synchronously: the 500ms autosave
    // debounce (useRecipeAutosave) gets cancelled by effect-cleanup when state
    // swaps below, so without this an edit made <500ms before a tab switch is
    // silently lost. Warn if the flush fails (quota/blocked) so the loss isn't silent.
    const flushed = saveDraft(process, recipeName, lines, settings, additives);
    saveActiveProcess(next);
    const ws = loadWorkspace(next);
    setProcessState(next);
    setRecipeName(ws.name);
    setLines(ws.lines);
    setAdditives(ws.additives);
    setSettings(ws.settings);
    setWorkspaceGeneration((g) => g + 1);
    // Both can be true at once (storage full AND the incoming slot unreadable) and
    // flashSaveMessage is a single slot, so choose rather than let call order decide:
    // the failed flush is about work that exists only in memory and is about to be
    // lost, while the unreadable draft still sits in its live slot — which the same
    // failing writes cannot overwrite.
    if (!flushed) {
      flashSaveMessage('Could not save the current recipe before switching — export it to avoid losing changes.');
    } else if (ws.unreadable) {
      flashSaveMessage(unreadableDraftMessage(ws.kept));
    }
  }

  function handleNew() {
    setRecipeName('New recipe');
    setLines(createStarterLines());
    setAdditives(createEmptyAdditives());
    setSettings(starterSettings(process));
    setWorkspaceGeneration((g) => g + 1);
  }

  function handleExport(override?: ExportOverride) {
    const linesToExport = override?.lines ?? lines;
    const settingsToExport = override?.settings ?? settings;
    const additivesToExport = override?.additives ?? additives;
    downloadRecipeFile(
      serializeRecipeFile(recipeName, linesToExport, settingsToExport, additivesToExport, process),
    );
    flashSaveMessage('Recipe exported');
  }

  /** onAccepted fires only after the file PARSES — a refused import must not cost the
   * user their uncommitted field drafts (the caller discards them in this callback). */
  function handleImportFile(file: File, onAccepted?: () => void) {
    const token = ++importTokenRef.current;
    file
      .text()
      .then((raw) => {
        // A newer import started (and thus owns the token) while this one's file.text()
        // was in flight — bail out so this stale continuation can't flush/swap state over
        // whatever the newer import already landed.
        if (importTokenRef.current !== token) return;
        const parsed = parseRecipeFile(raw);
        if (!parsed.ok) {
          flashSaveMessage(parsed.error);
          return;
        }
        onAccepted?.();
        const nextProcess = parsed.data.process;
        const importedSettings = normalizeSettingsWithinProcess(
          normalizeSettings(parsed.data.settings),
          nextProcess,
        );
        const importedLines = migrateRecipeLines(
          recipeLinesFromFile(parsed.data.lines),
          importedSettings,
        );
        const importedAdditives = recipeAdditivesFromFile(parsed.data.additives);
        // Read the target slot BEFORE any of the import's writes can land on it (the
        // flush below hits the same slot on a same-process import; the imported save
        // always does): an unreadable draft sitting there is the one copy of that
        // work, and loadDraftSlot is what hands back the kept/not-kept verdict — the
        // same discipline the load paths run. The BYTES no longer depend on this
        // ordering (saveDraft itself parks an unreadable occupant before overwriting),
        // but the sentence does: read after the writes and the slot holds the import's
        // own bytes, the verdict is gone, and the rescue happens without a word.
        const targetSlot = loadDraftSlot(nextProcess);
        // Flush the outgoing process's in-memory workspace first, mirroring setProcess:
        // without this, edits made just before an import (still pending the autosave
        // debounce) would be silently discarded when the state below swaps process.
        const ws = workspaceRef.current;
        const flushedOutgoing = saveDraft(ws.process, ws.recipeName, ws.lines, ws.settings, ws.additives);
        saveActiveProcess(nextProcess);
        setProcessState(nextProcess);
        setRecipeName(parsed.data.name);
        setLines(importedLines);
        setAdditives(importedAdditives);
        setSettings(importedSettings);
        setWorkspaceGeneration((g) => g + 1);
        const savedImported = saveDraft(
          nextProcess,
          parsed.data.name,
          importedLines,
          importedSettings,
          importedAdditives,
        );
        const routing = importRoutingSuffix(parsed.data.processSource, nextProcess);
        // Three candidate messages, one flash slot — choose rather than let call order
        // decide, same as setProcess's collision above. The storage-full warning wins
        // outright: the flushed and imported work exists only in memory, export is the
        // action that saves it, and the same failing writes could not overwrite the
        // unreadable draft's live slot either. Next, the kept/not-kept verdict outranks
        // the routine confirmation: the import's success is already visible in the
        // swapped-in workspace, while the displaced draft has no other voice — dropping
        // its sentence is how it vanishes silently.
        if (!flushedOutgoing || !savedImported) {
          flashSaveMessage(
            `Imported “${parsed.data.name}”${routing} — but storage is full, so changes may not persist. Export to keep a copy.`,
          );
        } else if (targetSlot.unreadable) {
          flashSaveMessage(unreadableDraftImportMessage(targetSlot.kept));
        } else {
          flashSaveMessage(`Imported “${parsed.data.name}”${routing}`);
        }
      })
      .catch(() => {
        if (importTokenRef.current !== token) return;
        flashSaveMessage('Could not read recipe file');
      });
  }

  return {
    process,
    setProcess,
    recipeName,
    setRecipeName,
    lines,
    setLines,
    additives,
    setAdditives,
    settings,
    setSettings,
    saveMessage,
    handleNew,
    handleExport,
    handleImportFile,
    workspaceGeneration,
    flashSaveMessage,
  };
}
