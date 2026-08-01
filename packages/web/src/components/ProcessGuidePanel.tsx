import { HP_COOK_STAGES, LS_METHOD_STAGES, type LsMethodInfo } from '@soap-calc/core';
import {
  isProcessVariantId,
  processProfileById,
  type ProcessId,
  type ProcessVariantId,
  type TempTarget,
} from '../lib/process';

type ProcessGuidePanelProps = {
  process: ProcessId;
  processVariant: ProcessVariantId;
  lsMethod?: LsMethodInfo | null;
  ls30Min?: boolean;
};

// Only LTHP and HTHP cook temps are verified against the roadmap source (item 21, HP row 326).
// Fluid-HP's temp is a Wave A `// unverified` interpolation and must render hedged
// ("≈ ... (estimated)"), never presented as authoritative. LS zones are now source-verified
// (see core's ls-method.ts) and rendered via the derived method, not this hedge path.
const VERIFIED_TEMP_VARIANTS = new Set<ProcessVariantId>(['hp-lthp', 'hp-hthp']);

function formatTempRange(temp: TempTarget): string {
  const range = temp.lowF === temp.highF ? `${temp.lowF} °F` : `${temp.lowF}–${temp.highF} °F`;
  const ceiling = temp.ceilingF !== undefined ? `, ceiling ${temp.ceilingF} °F` : '';
  return `${range}${ceiling}`;
}

export function ProcessGuidePanel({
  process,
  processVariant,
  lsMethod,
  ls30Min,
}: ProcessGuidePanelProps) {
  // Guard against a carried-forward-but-stale processVariant (same defensive pattern as
  // useFormulationInsights.ts and useRecipeViewModel.ts) before resolving the profile —
  // processProfileById is a bare Record index with no fallback for an unknown id.
  const profile = isProcessVariantId(processVariant) ? processProfileById(processVariant) : null;
  if (!profile) return null;
  const verified = VERIFIED_TEMP_VARIANTS.has(processVariant);
  const isLs = process === 'ls' && !!lsMethod;

  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Process guide</h2>
          <p className="panel__subtitle">
            {isLs
              ? `Temperature and method notes for ${lsMethod.label}`
              : `Temperature and cook-stage notes for ${profile.label}`}
          </p>
        </div>
      </div>
      {isLs ? null : profile.temp === null ? (
        <p className="results-hint">soap at a comfortable working temperature; no cook.</p>
      ) : (
        <p className="results-hint">
          {verified
            ? formatTempRange(profile.temp)
            : `≈${formatTempRange(profile.temp)} (estimated)`}
        </p>
      )}
      {isLs && (
        <>
          <ol className="process-guide__stages">
            {LS_METHOD_STAGES[lsMethod.method].map((stage) => (
              <li key={stage}>{stage}</li>
            ))}
          </ol>
          {lsMethod.inGap && <p className="results-hint">{lsMethod.note}</p>}
          {ls30Min && (
            <p className="results-hint">
              30-minute no-paste package detected (glycerin + salt/sodium lactate) — dilute
              immediately after the cook; no paste stage.
            </p>
          )}
        </>
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
