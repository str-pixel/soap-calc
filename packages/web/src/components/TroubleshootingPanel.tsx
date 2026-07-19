import { troubleshootingFor } from '@soap-calc/core';
import type { ProcessId } from '../lib/process';

type TroubleshootingPanelProps = {
  process: ProcessId;
};

export function TroubleshootingPanel({ process }: TroubleshootingPanelProps) {
  const entries = troubleshootingFor(process);

  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Troubleshooting</h2>
          <p className="panel__subtitle">Common issues for this process, and what to do about them</p>
        </div>
      </div>
      <div className="troubleshooting-list">
        {entries.map((entry) => (
          <details className="troubleshooting-entry" key={entry.symptom}>
            <summary className="troubleshooting-entry__summary">{entry.symptom}</summary>
            <p className="results-hint">
              <strong>Cause:</strong> {entry.cause}
            </p>
            <p className="results-hint">
              <strong>Fix:</strong> {entry.fix}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
