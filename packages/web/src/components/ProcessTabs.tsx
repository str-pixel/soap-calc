import type { KeyboardEvent } from 'react';
import { PROCESS_DEFINITIONS, PROCESS_IDS, type ProcessId } from '../lib/process';
import { processProfilesFor, type ProcessVariantId } from '../lib/processProfile';

/**
 * Roving-tabindex ArrowLeft/ArrowRight/Home/End handler shared by both tablists in this
 * component (process and variant). WAI-ARIA tabs pattern: arrow keys move selection AND
 * focus among the tabs; Home/End jump to the first/last. Both tablists differ only in their
 * item list and the callback invoked on a new selection, so the traversal logic lives here
 * once rather than being duplicated per tablist.
 */
function makeTabsKeyDownHandler<T>(items: T[], activeIndex: number, onSelect: (item: T) => void) {
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

export function ProcessTabs({
  process,
  onChange,
  processVariant,
  onVariantChange,
}: {
  process: ProcessId;
  onChange: (next: ProcessId) => void;
  processVariant: ProcessVariantId;
  onVariantChange: (next: ProcessVariantId) => void;
}) {
  const variants = processProfilesFor(process);
  const processActiveIndex = PROCESS_IDS.indexOf(process);
  const handleProcessKeyDown = makeTabsKeyDownHandler(
    PROCESS_IDS as ProcessId[],
    processActiveIndex,
    onChange,
  );
  const variantIds = variants.map((profile) => profile.variant);
  const variantActiveIndex = variantIds.indexOf(processVariant);
  const handleVariantKeyDown = makeTabsKeyDownHandler(variantIds, variantActiveIndex, onVariantChange);

  return (
    <div className="process-tabs-group">
      <div className="process-tabs" role="tablist" aria-label="Soap process">
        {PROCESS_IDS.map((id) => {
          const active = id === process;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={`process-tabs__tab${active ? ' process-tabs__tab--active' : ''}`}
              onClick={() => onChange(id)}
              onKeyDown={handleProcessKeyDown}
            >
              {PROCESS_DEFINITIONS[id].label}
            </button>
          );
        })}
      </div>

      {variants.length > 1 && (
        <div className="process-tabs__variants" role="tablist" aria-label="Process variant">
          {variants.map((profile) => {
            const active = profile.variant === processVariant;
            return (
              <button
                key={profile.variant}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                className={`process-tabs__variant${active ? ' process-tabs__variant--active' : ''}`}
                onClick={() => onVariantChange(profile.variant)}
                onKeyDown={handleVariantKeyDown}
              >
                {profile.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
