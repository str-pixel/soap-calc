import { useEffect } from 'react';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
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
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== 'z') return;
      if (isEditableTarget(e.target)) return; // let the browser handle native text undo
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);
}
