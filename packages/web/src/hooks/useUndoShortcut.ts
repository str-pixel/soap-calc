import { useEffect, useRef } from 'react';

const TEXT_INPUT_TYPES = new Set([
  'text', 'search', 'number', 'email', 'url', 'password', 'tel',
  // Segmented editable inputs own their per-segment editing state too.
  'date', 'time', 'datetime-local', 'month', 'week',
]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  // Only text-like inputs own native text undo; a focused checkbox/radio/range/file
  // input has nothing to undo, so the recipe shortcut should still fire there.
  if (tag === 'INPUT') return TEXT_INPUT_TYPES.has((target as HTMLInputElement).type);
  return tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Binds Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z (redo) for the recipe-oils history.
 *
 * The shortcut YIELDS to focused inputs: while a text/number field, textarea, select, or
 * contenteditable is focused, the event is left to the browser so native text undo keeps
 * working mid-edit. Recipe undo via keyboard therefore only fires when focus is outside
 * the editing fields — where there is also no pending draft to worry about.
 */
export function useUndoShortcut(undo: () => void, redo: () => void) {
  // Latest handlers held in a ref so the listener binds ONCE, not on every render.
  // (undo/redo get fresh identities each render; without this the effect would
  // remove and re-add the window listener on every keystroke elsewhere in the app.)
  const handlers = useRef({ undo, redo });
  handlers.current = { undo, redo };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== 'z') return;
      if (isEditableTarget(e.target)) return; // let the browser handle native text undo
      e.preventDefault();
      if (e.shiftKey) handlers.current.redo();
      else handlers.current.undo();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
