import { PROCESS_DEFINITIONS, PROCESS_IDS, type ProcessId } from '../lib/process';
import { processProfilesFor, type ProcessVariantId } from '../lib/processProfile';
import { makeTabsKeyDownHandler } from '../lib/tabsKeyboard';

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
  // A stale/foreign variant (transient render between process and settings updates, or a
  // corrupted draft) yields -1: keep the tablist reachable by giving the roving tabindex
  // a home on the first tab, and keep arrow-key math anchored there too.
  const variantHomeIndex = variantActiveIndex === -1 ? 0 : variantActiveIndex;
  const handleVariantKeyDown = makeTabsKeyDownHandler(variantIds, variantHomeIndex, onVariantChange);

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
            const index = variantIds.indexOf(profile.variant);
            return (
              <button
                key={profile.variant}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={index === variantHomeIndex ? 0 : -1}
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
