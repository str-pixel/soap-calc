import { PROCESS_DEFINITIONS, PROCESS_IDS, type ProcessId } from '../lib/process';
import { processProfilesFor, type ProcessVariantId } from '../lib/processProfile';

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
              className={`process-tabs__tab${active ? ' process-tabs__tab--active' : ''}`}
              onClick={() => onChange(id)}
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
                className={`process-tabs__variant${active ? ' process-tabs__variant--active' : ''}`}
                onClick={() => onVariantChange(profile.variant)}
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
