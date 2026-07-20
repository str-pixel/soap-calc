import { useEffect, useRef } from 'react';
import type { AdditiveLine, RecipeLine, RecipeSettings } from '../lib/recipe';
import type { ProcessId } from '../lib/process';
import { saveDraft } from '../lib/recipeStorage';

const AUTOSAVE_MS = 500;

export function useRecipeAutosave(
  process: ProcessId,
  recipeName: string,
  lines: RecipeLine[],
  settings: RecipeSettings,
  additives: AdditiveLine[],
  onSaveError?: () => void,
) {
  // Keep the latest callback in a ref so autosave binds to the timer without the
  // effect re-running (and re-scheduling the debounce) on every render.
  const onSaveErrorRef = useRef(onSaveError);
  onSaveErrorRef.current = onSaveError;

  // Mirror every save input in a ref (same pattern as useRecipeEditor's linesRef/batchRef)
  // so the pagehide/visibilitychange listener below — registered once, not re-bound per
  // render — always reads the freshest values instead of a stale closure.
  const processRef = useRef(process);
  const recipeNameRef = useRef(recipeName);
  const linesRef = useRef(lines);
  const settingsRef = useRef(settings);
  const additivesRef = useRef(additives);
  processRef.current = process;
  recipeNameRef.current = recipeName;
  linesRef.current = lines;
  settingsRef.current = settings;
  additivesRef.current = additives;

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
    settings: typeof settings; additives: typeof additives;
  } | null>(null);
  if (lastSavedRef.current === null) {
    lastSavedRef.current = { process, recipeName, lines, settings, additives };
  }

  function isDirty(): boolean {
    const last = lastSavedRef.current;
    return (
      !last ||
      last.process !== processRef.current ||
      last.recipeName !== recipeNameRef.current ||
      last.lines !== linesRef.current ||
      last.settings !== settingsRef.current ||
      last.additives !== additivesRef.current
    );
  }

  useEffect(() => {
    if (!isDirty()) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const saved = saveDraft(process, recipeName, lines, settings, additives);
      lastSavedRef.current = { process, recipeName, lines, settings, additives };
      if (!saved) onSaveErrorRef.current?.();
    }, AUTOSAVE_MS);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [process, recipeName, lines, settings, additives]);

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
      // Dirty check instead of timer-presence: a committed edit whose debounce effect
      // hasn't run yet has no timer but still needs saving.
      if (!isDirty()) return;
      const saved = saveDraft(
        processRef.current,
        recipeNameRef.current,
        linesRef.current,
        settingsRef.current,
        additivesRef.current,
      );
      lastSavedRef.current = {
        process: processRef.current,
        recipeName: recipeNameRef.current,
        lines: linesRef.current,
        settings: settingsRef.current,
        additives: additivesRef.current,
      };
      if (!saved) onSaveErrorRef.current?.();
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
