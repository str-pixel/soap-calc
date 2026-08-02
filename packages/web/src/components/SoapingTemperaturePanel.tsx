import { memo, type Dispatch, type SetStateAction } from 'react';
import {
  cToF,
  estimateGelPhase,
  fToC,
  LS_ZONES,
  soapingTempBand,
  type GelMode,
  type LsMethodInfo,
} from '@soap-calc/core';
import {
  effectiveSoapingTempF,
  defaultVariantFor,
  isProcessVariantId,
  processProfileById,
  soapingTempRangeFor,
  VERIFIED_TEMP_VARIANTS,
  type ProcessId,
  type TempTarget,
} from '../lib/process';
import type { RecipeSettings } from '../lib/recipe';

type SoapingTemperaturePanelProps = {
  settings: RecipeSettings;
  setSettings: Dispatch<SetStateAction<RecipeSettings>>;
  process: ProcessId;
  /** The calculated lye-solution water:lye ratio — the gel readout's second axis. Null
   * before a result exists, which hides the readout rather than guessing. */
  waterLyeRatio: number | null;
  /** LS's temperature-derived method (see core's lsMethodForTemp), passed by the caller —
   * the vm is the single derivation site. Null for CP/HP. */
  lsMethod: LsMethodInfo | null;
};

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
  lsMethod,
}: SoapingTemperaturePanelProps) {
  const variant = isProcessVariantId(settings.processVariant)
    ? settings.processVariant
    : defaultVariantFor(process);
  const range = soapingTempRangeFor(variant);
  // Display and guidance run on the EFFECTIVE (clamped) figure; the stored setting is
  // untouched until the user moves the control (clamp-at-read — process.ts).
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

  // The setting stores °F (core's bands and the 160 °F overflow constant are °F, and it
  // keeps saved recipes migration-free); the control edits in °C and converts at that
  // boundary. The displayed °C is derived STRAIGHT FROM STORAGE, never from the clamped
  // effective value — cToF/fToC round-trip exactly at 1 °C steps, so what you type is what
  // you see. (An earlier draft-plus-effect version clamped mid-keystroke and rewrote the
  // field: typing "5" became "16". Clamping belongs to the calculation, not the input.)
  const effectiveC = fToC(effectiveF);
  const storedF = Number(settings.soapingTempF);
  const storedIsNumeric = settings.soapingTempF.trim() !== '' && Number.isFinite(storedF);
  const displayC = storedIsNumeric ? String(fToC(storedF)) : '';
  const showClampHint = storedIsNumeric && storedF !== effectiveF;

  const onCelsius = (value: string) => {
    const c = Number(value);
    const next = value.trim() === '' || !Number.isFinite(c) ? '' : String(cToF(c));
    setSettings((s) => ({ ...s, soapingTempF: next }));
  };

  // Liquid soap only: the method (and its gap honesty) is derived purely from the hold
  // temperature by the vm — one function owns the zones, labels and gap notes (core's
  // ls-method.ts), and the vm is its single derivation site; this panel just renders it.
  // Zone strip geometry: percentages of the in-scope slider range, so the strip can never
  // misalign with the slider track (range = 60–220 °F for LS today, same figures LS_ZONES
  // itself uses — geometry is unchanged, just sourced from the range in scope).
  const lsSpanF = range.maxF - range.minF;
  const lsPct = (f: number) => ((f - range.minF) / lsSpanF) * 100;

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          {/* No panel__num: the 01–04 sequence is hardcoded across the numbered panels
              (renumbering all of them for an insert is churn); the Superfat & water panel
              set the unnumbered precedent. */}
          <h2 className="panel__title">Soaping temperature</h2>
          <p className="panel__subtitle">One starting temperature for oils and lye</p>
          {process === 'ls' && (
            // CPLS's melt step happens off this slider entirely; this line says so before
            // anyone assumes the slider is a melt temperature.
            <p className="panel__subtitle">
              CPLS melts oils at 49–54 °C (120–130 °F) first; heated methods melt on the way up. This
              slider is the hold temperature.
            </p>
          )}
        </div>
        <p className="panel__subtitle">
          {fToC(effectiveF)} °C ({effectiveF} °F)
          {process === 'ls' && lsMethod && <> — {lsMethod.label}</>}
        </p>
      </div>
      {showClampHint && (
          // The typed value stays in the input untouched (clamp-at-read never rewrites);
          // this line says which figure the calc actually uses and why.
          <p className="results-hint">
            Outside this process&apos;s range ({fToC(range.minF)}–{fToC(range.maxF)} °C) — using{' '}
            {effectiveC} °C.
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
              min={fToC(range.minF)}
              max={fToC(range.maxF)}
              step={1}
              value={displayC}
              onChange={(e) => onCelsius(e.target.value)}
            />
            <span className="slider-field__unit">°C</span>
          </span>
        </div>
        <input
          className="slider-field__range"
          type="range"
          aria-hidden="true"
          tabIndex={-1}
          min={fToC(range.minF)}
          max={fToC(range.maxF)}
          step={1}
          value={effectiveC}
          onChange={(e) => onCelsius(e.target.value)}
          style={{
            background: `linear-gradient(to right, var(--accent) ${fillPct}%, var(--hairline) ${fillPct}%)`,
          }}
        />
      </div>
      {process === 'ls' && lsMethod && (
        // The strip is positioned straight off °F (LS_ZONES via the in-scope range), never
        // off the °C display value — the slider's real span is 60–220 °F and °C rounding
        // would drift the edges off their sourced figures.
        <div className="temp-zones">
          <div className="temp-zones__track" aria-hidden="true">
            <span
              className={`temp-zones__zone${
                lsMethod.method === 'cold' ? ' temp-zones__zone--active' : ''
              }`}
              style={{ left: '0%', width: `${lsPct(LS_ZONES.coldMaxF)}%` }}
            />
            <span
              className={`temp-zones__zone${
                lsMethod.method === 'lowtemp' ? ' temp-zones__zone--active' : ''
              }`}
              style={{
                left: `${lsPct(LS_ZONES.lowMinF)}%`,
                width: `${lsPct(LS_ZONES.lowMaxF) - lsPct(LS_ZONES.lowMinF)}%`,
              }}
            />
            {/* Recommended sub-band overlays the top of the low-temp zone in a stronger
                shade — it doesn't get its own --active state; the low-temp zone above it
                already carries that. */}
            <span
              className="temp-zones__zone temp-zones__zone--recommended"
              style={{
                left: `${lsPct(LS_ZONES.lowRecommendedMinF)}%`,
                width: `${lsPct(LS_ZONES.lowMaxF) - lsPct(LS_ZONES.lowRecommendedMinF)}%`,
              }}
            />
            <span
              className={`temp-zones__zone${
                lsMethod.method === 'hightemp' ? ' temp-zones__zone--active' : ''
              }`}
              style={{
                left: `${lsPct(LS_ZONES.highMinF)}%`,
                width: `${100 - lsPct(LS_ZONES.highMinF)}%`,
              }}
            />
          </div>
          <div className="temp-zones__labels">
            <span>cold process</span>
            <span>low temp</span>
            <span>high temp</span>
          </div>
        </div>
      )}
      {process === 'ls' && lsMethod?.note && <p className="results-hint">{lsMethod.note}</p>}
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
              {/* The PLAN sits with the PREDICTION: the readout above says what these
                  settings tend toward, this says what you intend to do about it (and it
                  drives the unmold/cut timeline). Moved here from CP extras, where it sat
                  far from the two inputs that decide gel. */}
              <label className="field">
                <span>Gel phase plan</span>
                <select
                  className="input"
                  value={settings.gelMode}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, gelMode: e.target.value as GelMode }))
                  }
                  aria-label="Gel phase"
                >
                  <option value="none">None (prevented — e.g. refrigerated)</option>
                  <option value="natural">Natural (uninsulated loaf)</option>
                  <option value="forced">Forced (insulated / CPOP)</option>
                </select>
              </label>
              <p className="results-hint">
                Gel doesn&rsquo;t change safety, but it changes how fast the bar firms and
                unmolds — forcing it reaches the fast, same-day end; preventing it runs slower.
              </p>
            </>
          )}
        </>
      ) : profile.temp === null ? (
        // LS — the only variant with no fixed cook temp: the CP bar bands (gel phase,
        // molds) don't apply, and which sentence renders comes from the derived method,
        // not from the raw temperature. The hold hint (below) renders ONLY outside the
        // gap — the gap note above already said we're not at the sourced hold, so a
        // 215-hold instruction alongside it would contradict what was just said. Cold has
        // no hold (hold === null) and keeps its existing ambient sentence, unconditionally.
        lsMethod?.hold === null ? (
          <p className="results-hint">
            Cold-process liquid soap uses no external heat — combine at a comfortable working
            temperature and let the paste saponify on its own schedule.
          </p>
        ) : lsMethod && !lsMethod.inGap ? (
          // Dual-unit per the panel's convention; figures and clauses per the redesign spec.
          lsMethod.hold.recommendedLowF !== undefined ? (
            <p className="results-hint">
              Hold {fToC(lsMethod.hold.lowF)}–{fToC(lsMethod.hold.highF)} °C (
              {lsMethod.hold.lowF}–{lsMethod.hold.highF} °F) — {fToC(lsMethod.hold.recommendedLowF)}
              –{fToC(lsMethod.hold.highF)} °C ({lsMethod.hold.recommendedLowF}–
              {lsMethod.hold.highF} °F) recommended — through cook and dilution.
            </p>
          ) : (
            // The 215 °F hold is the COOK figure; dilution runs on hot water at the
            // sourced 160–200 °F with the heat maintained — asserting 215 through
            // dilution would overstate the source and sit against its do-not-boil line.
            <p className="results-hint">
              Hold {fToC(lsMethod.hold.lowF)} °C ({lsMethod.hold.lowF} °F) for the cook, then
              dilute with hot water at {fToC(160)}–{fToC(200)} °C (160–200 °F) with the heat
              on — do not exceed {fToC(lsMethod.hold.ceilingF!)} °C ({lsMethod.hold.ceilingF} °F).
            </p>
          )
        ) : null
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
