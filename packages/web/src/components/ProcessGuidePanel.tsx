import { HP_COOK_STAGES } from '@soap-calc/core';
import type { ProcessId } from '../lib/process';
import { processProfileById, type ProcessVariantId, type TempTarget } from '../lib/processProfile';

type ProcessGuidePanelProps = {
  process: ProcessId;
  processVariant: ProcessVariantId;
};

// Only LTHP and HTHP cook temps are verified against the roadmap source (item 21, HP row 326).
// Fluid-HP and every LS variant's temp is a Wave A `// unverified` interpolation — those must
// render hedged ("≈ ... (estimated)"), never presented as authoritative.
const VERIFIED_TEMP_VARIANTS = new Set<ProcessVariantId>(['hp-lthp', 'hp-hthp']);

function formatTempRange(temp: TempTarget): string {
  const range = temp.lowF === temp.highF ? `${temp.lowF} °F` : `${temp.lowF}–${temp.highF} °F`;
  const ceiling = temp.ceilingF !== undefined ? `, ceiling ${temp.ceilingF} °F` : '';
  return `${range}${ceiling}`;
}

export function ProcessGuidePanel({ process, processVariant }: ProcessGuidePanelProps) {
  const profile = processProfileById(processVariant);
  const verified = VERIFIED_TEMP_VARIANTS.has(processVariant);

  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Process guide</h2>
          <p className="panel__subtitle">Temperature and cook-stage notes for {profile.label}</p>
        </div>
      </div>
      {profile.temp === null ? (
        <p className="results-hint">soap at a comfortable working temperature; no cook.</p>
      ) : (
        <p className="results-hint">
          {verified
            ? formatTempRange(profile.temp)
            : `≈${formatTempRange(profile.temp)} (estimated)`}
        </p>
      )}
      {process === 'hp' && (
        <>
          <ol className="process-guide__stages">
            {HP_COOK_STAGES.map((stage) => (
              <li key={stage}>{stage}</li>
            ))}
          </ol>
          <p className="results-hint" role="alert">
            stop mixing once the batter reaches neat — over-mixing past ~5 minutes can seize or
            dry the cook.
          </p>
        </>
      )}
    </section>
  );
}
