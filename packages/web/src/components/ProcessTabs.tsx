import { PROCESS_DEFINITIONS, PROCESS_IDS, type ProcessId } from '../lib/process';

export function ProcessTabs({
  process,
  onChange,
}: {
  process: ProcessId;
  onChange: (next: ProcessId) => void;
}) {
  return (
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
  );
}
