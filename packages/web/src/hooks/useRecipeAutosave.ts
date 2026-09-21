import { useEffect, useRef } from 'react';
import type { AdditiveLine, RecipeLine, RecipeSettings } from '../lib/recipe';
import type { ProcessId } from '../lib/process';
import type { ScentColor } from '../lib/scentColor';
import type { SyncedRecipe } from '../lib/lineWeightSync';
import { saveDraft, hasDraft } from '../lib/recipeStorage';

const AUTOSAVE_MS = 500;

export function useRecipeAutosave(
  process: ProcessId,
  recipeName: string,
  lines: RecipeLine[],
  settings: RecipeSettings,
  additives: AdditiveLine[],
  scentColor: ScentColor,
  onSaveError?: () => void,
  flushDrafts?: () => SyncedRecipe,
) {
  // Keep the latest callback in a ref so autosave binds to the timer without the
  // effect re-running (and re-scheduling the debounce) on every render.
  const onSaveErrorRef = useRef(onSaveError);
  onSaveErrorRef.current = onSaveError;

  // The inputs hook's draft flush (commitDrafts over the live refs). Held in a ref for the
  // same reason as onSaveError: the hide listener is registered once.
  const flushDraftsRef = useRef(flushDrafts);
  flushDraftsRef.current = flushDrafts;

  // Mirror every save input in a ref (same pattern as useRecipeEditor's linesRef/batchRef)
  // so the pagehide/visibilitychange listener below — registered once, not re-bound per
  // render — always reads the freshest values instead of a stale closure.
  const processRef = useRef(process);
  const recipeNameRef = useRef(recipeName);
  const linesRef = useRef(lines);
  const settingsRef = useRef(settings);
  const additivesRef = useRef(additives);
  const scentColorRef = useRef(scentColor);
  processRef.current = process;
  recipeNameRef.current = recipeName;
  linesRef.current = lines;
  settingsRef.current = settings;
  additivesRef.current = additives;
  scentColorRef.current = scentColor;

  // Tracks the pending debounce timer so the hide-flush can both run the same save the
  // timer would have run and cancel the timer itself (no double-save once flushed).
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Identity snapshot of the last state this hook saved (or mounted with). Two jobs:
  // (1) skip the mount-time writeback of what was just loaded — a second tab must not
  // overwrite a newer draft with older data 500ms after opening; (2) let flush() detect
  // a committed edit whose debounce effect hasn't run yet (refs update during render,
  // the timer only in the passive effect — pagehide can land in that gap).
  const lastSavedRef = useRef<{
    process: typeof process; recipeName: string; lines: typeof lines;
    settings: typeof settings; additives: typeof additives; scentColor: typeof scentColor;
  } | null>(null);
  if (lastSavedRef.current === null) {
    lastSavedRef.current = { process, recipeName, lines, settings, additives, scentColor };
  }

  function isDirty(): boolean {
    const last = lastSavedRef.current;
    return (
      !last ||
      last.process !== processRef.current ||
      last.recipeName !== recipeNameRef.current ||
      last.lines !== linesRef.current ||
      last.settings !== settingsRef.current ||
      last.additives !== additivesRef.current ||
      last.scentColor !== scentColorRef.current
    );
  }

  useEffect(() => {
    if (!isDirty()) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const saved = saveDraft(process, recipeName, lines, settings, additives, scentColor);
      // Only a SUCCESSFUL save marks the workspace clean — a quota failure must
      // leave it dirty so the pagehide flush retries once storage recovers.
      if (saved) {
        lastSavedRef.current = { process, recipeName, lines, settings, additives, scentColor };
      } else {
        onSaveErrorRef.current?.();
      }
    }, AUTOSAVE_MS);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [process, recipeName, lines, settings, additives, scentColor]);

  // Flush-on-hide: a plain tab close/refresh/navigation never lets the 500ms debounce
  // above fire, silently dropping the last edit. `pagehide` (backed up by
  // `visibilitychange` → hidden, which also covers mobile app-switch/backgrounding) fires
  // reliably before the page is torn down and — unlike `beforeunload` — doesn't block
  // bfcache or misbehave on mobile browsers, so both listeners run the same synchronous
  // save the timer would have run, using the refs above for the latest values.
  useEffect(() => {
    function flush() {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // A field still focused holds its edit as a DRAFT (committed on blur/Enter), and a
      // tab close or mobile background-kill does not reliably blur first. RESOLVE the
      // drafts now and save what they resolve to — resolve, not commit: this also runs on
      // visibilitychange → hidden, a mobile app-switch, so committing here would rescale
      // the recipe behind the maker's back (useRecipeInputs.peekCommittedDrafts).
      const synced = flushDraftsRef.current?.();
      const draftsChanged =
        synced !== undefined &&
        (synced.lines !== linesRef.current ||
          synced.batchOilGrams !== settingsRef.current.batchOilGrams ||
          // Provenance too: a re-typed identical total only flips batchSetByUser, and that
          // flip is still an edit this flush is the last chance to persist.
          synced.batchSetByUser !== settingsRef.current.batchSetByUser);
      // Fall back to the REFS, not to `synced`, when nothing changed: lastSavedRef below
      // stores what we saved and isDirty() compares it by identity, so a freshly spread
      // settings object for a no-op flush would leave the workspace permanently dirty and
      // re-save byte-identical state on every later hide.
      const lines = synced && draftsChanged ? synced.lines : linesRef.current;
      const settings =
        synced && draftsChanged
          ? { ...settingsRef.current, batchOilGrams: synced.batchOilGrams, batchSetByUser: synced.batchSetByUser }
          : settingsRef.current;
      // Dirty check instead of timer-presence: a committed edit whose debounce effect
      // hasn't run yet has no timer but still needs saving. Also re-persist when the
      // slot is EMPTY (external deletion/eviction): this tab may hold the only copy,
      // and writing into an empty slot cannot clobber another tab's newer draft.
      if (!draftsChanged && !isDirty() && hasDraft(processRef.current)) return;
      const saved = saveDraft(
        processRef.current,
        recipeNameRef.current,
        lines,
        settings,
        additivesRef.current,
        scentColorRef.current,
      );
      if (saved) {
        lastSavedRef.current = {
          process: processRef.current,
          recipeName: recipeNameRef.current,
          lines,
          settings,
          additives: additivesRef.current,
          scentColor: scentColorRef.current,
        };
      } else {
        onSaveErrorRef.current?.();
      }
    }
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') flush();
    }
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
