import type { KeyboardEvent } from 'react';

/**
 * Roving-tabindex ArrowLeft/ArrowRight/Home/End handler shared by every tablist in the app.
 * WAI-ARIA tabs pattern: arrow keys move selection AND focus among the tabs; Home/End jump to
 * the first/last. Tablists differ only in their item list and the callback invoked on a new
 * selection, so the traversal logic lives here once rather than being duplicated per tablist.
 */
export function makeTabsKeyDownHandler<T>(
  items: T[],
  activeIndex: number,
  onSelect: (item: T) => void,
) {
  return (event: KeyboardEvent<HTMLButtonElement>) => {
    let nextIndex: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (activeIndex + 1) % items.length;
        break;
      case 'ArrowLeft':
        nextIndex = (activeIndex - 1 + items.length) % items.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    onSelect(items[nextIndex]);
    // WAI-ARIA tabs move focus together with selection. The React rerender that flips
    // tabIndex on the newly active button hasn't happened yet at this point in the event
    // handler, but the button elements themselves are stable across that rerender, so
    // focusing the sibling directly (found via the shared tablist ancestor) works without
    // waiting for it.
    const tablist = event.currentTarget.closest('[role="tablist"]');
    const tabs = tablist ? Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')) : [];
    tabs[nextIndex]?.focus();
  };
}
