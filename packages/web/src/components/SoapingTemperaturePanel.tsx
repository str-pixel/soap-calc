import { memo, type Dispatch, type SetStateAction } from 'react';
import { estimateGelPhase, fToC, soapingTempBand } from '@soap-calc/core';
import {
  effectiveSoapingTempF,
  defaultVariantFor,
  isProcessVariantId,
  processProfileById,
  soapingTempRangeFor,
  type ProcessVariantId,
  type TempTarget,
} from '../lib/processProfile';
import type { ProcessId } from '../lib/process';
import type { RecipeSettings } from '../lib/recipe';

type SoapingTemperaturePanelProps = {
  settings: RecipeSettings;
  setSettings: Dispatch<SetStateAction<RecipeSettings>>;
  process: ProcessId;
  /** The calculated lye-solution water:lye ratio — the gel readout's second axis. Null
   * before a result exists, which hides the readout rather than guessing. */
  waterLyeRatio: number | null;
};

// Same verified set as ProcessGuidePanel: only the LTHP/HTHP cook temps are source-verified;
// fluid HP and the heated LS variants are estimates and must keep the ≈ hedge.
const VERIFIED_TEMP_VARIANTS = new Set<ProcessVariantId>(['hp-lthp', 'hp-hthp']);

function targetLabel(temp: TempTarget): string {
  const range =
    temp.lowF === temp.highF
      ? `${fToC(temp.lowF)} °C (${temp.lowF} °F)`
      : `${fToC(temp.lowF)}–${fToC(temp.highF)} °C (${temp.lowF}–${temp.highF} °F)`;
  const ceiling =
    temp.ceilingF !== undefined ? `, ceiling ${fToC(temp.ceilingF)} °C (${temp.ceilingF} °F)` : '';
  return `${range}${ceiling}`;
}

// memo: settings-driven leaf panel; unrelated keystrokes skip it (same rationale as the
// sibling panels).
export const SoapingTemperaturePanel = memo(function SoapingTemperaturePanel({
  settings,
  setSettings,
  process,
  waterLyeRatio,
}: SoapingTemperaturePanelProps) {
  const variant = isProcessVariantId(settings.processVariant)
    ? settings.processVariant
    : defaultVariantFor(process);
  const range = soapingTempRangeFor(variant);
  // Display and guidance run on the EFFECTIVE (clamped) figure; the stored setting is
  // untouched until the user moves the control (clamp-at-read — processProfile.ts).
  const effectiveF = effectiveSoapingTempF(settings, variant);
  const profile = processProfileById(variant);
  const band = process === 'cp' ? soapingTempBand(effectiveF) : null;
  const gel =
    band && waterLyeRatio !== null
      ? estimateGelPhase({ soapingTempF: effectiveF, waterLyeRatio })
      : null;
  const fillPct =
    range.maxF > range.minF
      ? Math.max(0, Math.min(100, ((effectiveF - range.minF) / (range.maxF - range.minF)) * 100))
      : 0;

  const onValue = (value: string) => setSettings((s) => ({ ...s, soapingTempF: value }));

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          {/* No panel__num: the 01–04 sequence is hardcoded across the numbered panels
              (renumbering all of them for an insert is churn); the Superfat & water panel
              set the unnumbered precedent. */}
          <h2 className="panel__title">Soaping temperature</h2>
          <p className="panel__subtitle">One starting temperature for oils and lye</p>
        </div>
        <p className="panel__subtitle">
          {fToC(effectiveF)} °C ({effectiveF} °F)
        </p>
      </div>
      {Number.isFinite(Number(settings.soapingTempF)) &&
        settings.soapingTempF.trim() !== '' &&
        Number(settings.soapingTempF) !== effectiveF && (
          // The typed value stays in the input untouched (clamp-at-read never rewrites);
          // this line says which figure the calc actually uses and why.
          <p className="results-hint">
            Outside this process&apos;s range ({range.minF}–{range.maxF} °F) — using {effectiveF} °F.
          </p>
        )}
      <div className="slider-field">
        <div className="slider-field__head">
          <span className="slider-field__label">Starting temperature</span>
          <span className="slider-field__value-wrap">
            <input
              className="slider-field__value"
              type="number"
              aria-label="Soaping temperature"
              min={range.minF}
              max={range.maxF}
              step={1}
              value={settings.soapingTempF}
              onChange={(e) => onValue(e.target.value)}
            />
            <span className="slider-field__unit">°F</span>
          </span>
        </div>
        <input
          className="slider-field__range"
          type="range"
          aria-hidden="true"
          tabIndex={-1}
          min={range.minF}
          max={range.maxF}
          step={1}
          value={effectiveF}
          onChange={(e) => onValue(e.target.value)}
          style={{
            background: `linear-gradient(to right, var(--accent) ${fillPct}%, var(--hairline) ${fillPct}%)`,
          }}
        />
      </div>
      {band ? (
        <>
          <p className="results-hint">{band.note}</p>
          {waterLyeRatio !== null && (
            // Gel needs heat AND water, so the readout lives with the temperature control
            // but reads the calculated solution ratio too. CP-only by placement: an HP
            // cook drives through gel deliberately and liquid soap has no gel stage.
            <>
              <p className="results-hint">
                Gel phase: {gel!.likelihood.replace('_', ' ')} — {gel!.note}
              </p>
              <p className="results-hint">
                Cooler or less water avoids gel; warmer or more water encourages it — both are
                valid choices, but a half-gelled batch shows a ring.
              </p>
            </>
          )}
        </>
      ) : profile.temp === null ? (
        // CPLS — the only non-CP ambient variant: no external heat, so the CP bar bands
        // (gel phase, molds) don't apply.
        <p className="results-hint">
          Cold-process liquid soap uses no external heat — combine at a comfortable working
          temperature and let the paste saponify on its own schedule.
        </p>
      ) : (
        <p className="results-hint">
          Cook target:{' '}
          {VERIFIED_TEMP_VARIANTS.has(variant)
            ? targetLabel(profile.temp)
            : `≈${targetLabel(profile.temp)} (estimated)`}
        </p>
      )}
    </section>
  );
});
