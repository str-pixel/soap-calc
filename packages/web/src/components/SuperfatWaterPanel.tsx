import type { Dispatch, SetStateAction } from 'react';
import type { LyeSolutionWaterStatus, SplitLiquidWaterSuggestion, WaterMode } from '@soap-calc/core';
import type { ResolvedSplitLiquidRow } from '../lib/splitLiquidSizing';
import { postCookSuperfatAllocated, type RecipeSettings, type WeightUnit } from '../lib/recipe';
import { processOffers, type ProcessId } from '../lib/process';
import { NEG_SUPERFAT_FLOOR } from '../lib/parseRecipeSettings';
import { WATER_FIELDS, WATER_MODE_LABELS, waterModeChoicesFor } from '../lib/settingsFields';
import { InfoTip } from './InfoTip';
import { OilPicker } from './OilPicker';
import { SplitLiquidPanel } from './SplitLiquidPanel';

// Upper bound for each water mode's drag slider — the typical working range, not the hard
// input cap. The editable value readout keeps the field's real min/max, so out-of-range
// values (and their validation) are still reachable by typing.
const WATER_SLIDER_MAX: Record<WaterMode, number> = {
  percent_of_oils: 100,
  lye_concentration: 50,
  lye_water_ratio: 5,
};

// Whole numbers show bare (5, not 5.0); fractions keep one decimal.
const formatTotal = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));
// Round a percent to 0.1 to keep clamped/scaled values tidy.
const roundPct = (n: number): number => Math.round(n * 10) / 10;
// Floor a percent to 0.1 — used when trimming so the rounded rows can only ever sum to
// LESS than the target (never over it), keeping the sum ≤ total invariant exact.
const floorPct = (n: number): number => Math.floor(n * 10) / 10;
// A row percent as a non-negative number (blank/invalid/negative → 0).
const posNum = (s: string): number => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
// A typed post-cook superfat percent (row or total), clamped into [0, 100]. The <input
// max={...}> on these fields is an HTML hint only — it does not stop a value from being
// typed or pasted — so this is the actual enforcement. Matters beyond cosmetics: core's
// parsePercentOfOil REJECTS (returns null) anything over 100 rather than clamping it, so an
// unclamped out-of-range row (e.g. a mistyped '200' for '20') would silently contribute 0 to
// the subtract-mode lye reserve while the panel still showed it as allocated. Blank/invalid
// text passes through unclamped — it's mid-edit, not an out-of-range number.
const clampPct = (value: string): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (n > 100) return '100';
  if (n < 0) return '0';
  return value;
};

// Plain-language descriptions of the two post-cook superfat methods (original wording).
const PCSF_METHOD_HELP: Record<'append' | 'subtract', string> = {
  subtract:
    'Holds the superfat oils back from the recipe and trims the lye to match, so the batch still totals your target oil weight and the superfat comes out at exactly the number you set.',
  append:
    'Stirs the superfat oils in on top after the cook, leaving the base recipe untouched. Simplest to weigh, but the real superfat lands a little below the number you set because the base wasn’t reduced.',
};

/**
 * A Signal-styled range slider with an editable value readout on the right. The readout is
 * the source of truth for precise/out-of-range entry (and carries the field's aria-label so
 * existing tests and validation keep working); the slider is the quick-adjust affordance and
 * is bound to the same value. The filled portion of the track is painted via an inline
 * gradient so the accent "fill-to-thumb" look works cross-browser without JS.
 */
function SliderField({
  label,
  valueLabel,
  unit,
  min,
  max,
  step,
  sliderMax,
  value,
  onChange,
  help,
  term,
}: {
  label: string;
  valueLabel: string;
  unit: string;
  min: number;
  max?: number;
  step: number;
  sliderMax: number;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  term?: string;
}) {
  const num = Number(value);
  const finite = value.trim() !== '' && Number.isFinite(num);
  const lo = finite ? Math.min(min, num) : min;
  const hi = finite ? Math.max(sliderMax, num) : sliderMax;
  const pos = finite ? num : min;
  const fillPct = hi > lo ? Math.max(0, Math.min(100, ((pos - lo) / (hi - lo)) * 100)) : 0;
  return (
    <div className="slider-field">
      <div className="slider-field__head">
        <span className="slider-field__label">
          {label}
          {help && <InfoTip term={term ?? label}>{help}</InfoTip>}
        </span>
        <span className="slider-field__value-wrap">
          <input
            className="slider-field__value"
            type="number"
            aria-label={valueLabel}
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {unit && <span className="slider-field__unit">{unit}</span>}
        </span>
      </div>
      <input
        className="slider-field__range"
        type="range"
        aria-hidden="true"
        tabIndex={-1}
        min={lo}
        max={hi}
        step={step}
        value={pos}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: `linear-gradient(to right, var(--accent) ${fillPct}%, var(--hairline) ${fillPct}%)`,
        }}
      />
    </div>
  );
}

type SuperfatWaterPanelProps = {
  settings: RecipeSettings;
  setSettings: Dispatch<SetStateAction<RecipeSettings>>;
  process: ProcessId;
  /** Split-liquid figures — the split option lives with the water controls (it's a slice of
   * the water amount). See SplitLiquidPanel. */
  totalOilGrams: number;
  lyeGrams: number;
  weightUnit: WeightUnit;
  waterSuggestion: SplitLiquidWaterSuggestion | null;
  lyeWaterStatus: LyeSolutionWaterStatus | null;
  lyeWaterUnverifiable?: boolean;
  lyeWaterShortfallCertain?: boolean;
  splitLiquidRows: ResolvedSplitLiquidRow[];
  splitAllocation: { lyeWaterGrams: number; targetLiquidGrams: number } | null;
  acidExtraLye: { naohGrams: number; kohGrams: number } | null;
};

/**
 * The two knobs makers touch most — Superfat and the water ratio — as their own left-column
 * panel (moved here from The Numbers to match the comp's arrangement). Split liquid lives here
 * too: it's a portion of the water, so it belongs with the water controls, not in Settings.
 */
export function SuperfatWaterPanel({
  settings,
  setSettings,
  process,
  totalOilGrams,
  lyeGrams,
  weightUnit,
  waterSuggestion,
  lyeWaterStatus,
  lyeWaterUnverifiable,
  lyeWaterShortfallCertain,
  splitLiquidRows,
  splitAllocation,
  acidExtraLye,
}: SuperfatWaterPanelProps) {
  const waterField = WATER_FIELDS[settings.waterMode];

  const pcsfOils = settings.postCookSuperfatOils;
  const pcsfTotal = Math.max(0, Number(settings.postCookSuperfatTotalPercent) || 0);
  const pcsfAllocated = postCookSuperfatAllocated(pcsfOils);
  const pcsfRemaining = Math.max(0, roundPct(pcsfTotal - pcsfAllocated));

  // Editing an oil's OWN percent: cap it at the budget minus the other rows' allocation, so
  // the running sum can never exceed the total. Siblings are never rescaled (independent).
  const updatePcsfOil = (index: number, patch: Partial<{ oilId: string; percent: string }>) =>
    setSettings((s) => {
      const oils = s.postCookSuperfatOils.map((row, i) => {
        if (i !== index) return row;
        if (!('percent' in patch)) return { ...row, ...patch };
        const others = s.postCookSuperfatOils.reduce(
          (sum, r, j) => (j === index ? sum : sum + posNum(r.percent)),
          0,
        );
        const budget = Math.max(0, Number(s.postCookSuperfatTotalPercent) || 0);
        // Capped at 100 in addition to the budget: the budget itself is clamped to 100 by
        // setPcsfTotal below, but a row's OWN percent still must not exceed 100 (parsePercentOfOil's
        // ceiling) regardless of what the budget carries — see clampPct.
        const headroom = Math.min(100, Math.max(0, roundPct(budget - others)));
        const typed = patch.percent ?? '';
        const n = Number(typed);
        // Empty/invalid stays as typed (mid-edit); a valid over-budget number clamps.
        const capped =
          typed.trim() !== '' && Number.isFinite(n) && n > headroom ? String(headroom) : typed;
        return { ...row, percent: capped };
      });
      return { ...s, postCookSuperfatOils: oils };
    });
  const addPcsfOil = () =>
    setSettings((s) => ({
      ...s,
      postCookSuperfatOils: [...s.postCookSuperfatOils, { oilId: 'olive-oil', percent: '' }],
    }));
  const removePcsfOil = (index: number) =>
    setSettings((s) => ({
      ...s,
      postCookSuperfatOils: s.postCookSuperfatOils.filter((_, i) => i !== index),
    }));
  // Editing the TOTAL budget: if it drops below what's already allocated, trim the oils to
  // fit by scaling them proportionally (the one action that moves the oil numbers — like the
  // recipe's Total-oil field). Raising it just opens headroom; the oils stay put.
  const setPcsfTotal = (rawValue: string) =>
    setSettings((s) => {
      // value is clamped for STORAGE (also keeps updatePcsfOil's headroom, which reads this
      // same field back, from inflating past 100). The trim-to-fit branch below is gated on
      // the RAW typed number instead, not this clamped one: a negative keystroke floors to
      // '0' for storage, but must not be read as "the maker set the budget to zero" and
      // wipe every row's percent — that's real data loss over a typo. A genuinely typed 0
      // (or any real number below what's allocated) still trims; only the floor-from-negative
      // case is excluded, via the rawNext >= 0 gate below.
      const value = clampPct(rawValue);
      const rawNext = Number(rawValue);
      const allocated = postCookSuperfatAllocated(s.postCookSuperfatOils);
      if (
        rawValue.trim() !== '' &&
        Number.isFinite(rawNext) &&
        rawNext >= 0 &&
        rawNext < allocated &&
        allocated > 0
      ) {
        const factor = Number(value) / allocated;
        return {
          ...s,
          postCookSuperfatTotalPercent: value,
          postCookSuperfatOils: s.postCookSuperfatOils.map((row) =>
            posNum(row.percent) > 0
              ? { ...row, percent: String(floorPct(posNum(row.percent) * factor)) }
              : row,
          ),
        };
      }
      return { ...s, postCookSuperfatTotalPercent: value };
    });

  return (
    <section className="panel">
      <h2 className="panel__title">Superfat &amp; water</h2>
      <div className="numbers-inputs">
        <SliderField
          label="Superfat"
          valueLabel="Superfat %"
          unit="%"
          term="Superfat"
          help="The share of oils left unsaponified for a gentler, more moisturizing bar. Around 5% is common."
          min={processOffers(process, 'negativeSuperfat') ? NEG_SUPERFAT_FLOOR : 0}
          max={50}
          step={0.5}
          sliderMax={20}
          value={settings.superfatPercent}
          onChange={(v) => setSettings((s) => ({ ...s, superfatPercent: v }))}
        />
        <label className="field field--compact numbers-inputs__method">
          <span>Water method</span>
          <select
            className="input"
            aria-label="Water method"
            value={settings.waterMode}
            onChange={(e) =>
              setSettings((s) => ({ ...s, waterMode: e.target.value as RecipeSettings['waterMode'] }))
            }
          >
            {waterModeChoicesFor(process).map((mode) => (
              <option key={mode} value={mode}>
                {WATER_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        <SliderField
          label={waterField.label}
          valueLabel={waterField.label}
          unit={waterField.label.trim().endsWith('%') ? '%' : ''}
          term={waterField.label.replace(/\s*%$/, '')}
          help={waterField.help}
          min={waterField.min}
          max={'max' in waterField ? waterField.max : undefined}
          step={waterField.step}
          sliderMax={WATER_SLIDER_MAX[settings.waterMode]}
          value={settings[waterField.key]}
          onChange={(v) => {
            const key = waterField.key;
            setSettings((s) => ({ ...s, [key]: v }));
          }}
        />

        {/* Split liquid — replaces part of the water with an alternative liquid (milk, beer,
            tea…), so it lives with the water controls. */}
        <SplitLiquidPanel
          rows={settings.splitLiquids}
          process={process}
          resolvedRows={splitLiquidRows}
          totalOilGrams={totalOilGrams}
          lyeGrams={lyeGrams}
          weightUnit={weightUnit}
          waterMode={settings.waterMode}
          waterSuggestion={waterSuggestion}
          lyeWaterStatus={lyeWaterStatus}
          lyeWaterUnverifiable={lyeWaterUnverifiable}
          lyeWaterShortfallCertain={lyeWaterShortfallCertain}
          allocation={splitAllocation}
          acidExtraLye={acidExtraLye}
          onChange={(splitLiquids) => setSettings((s) => ({ ...s, splitLiquids }))}
          onApplySuggestedWater={(waterPercentOfOils) =>
            setSettings((s) => ({ ...s, waterMode: 'percent_of_oils', waterPercentOfOils }))
          }
        />

        {/* Post-cook superfat — an HP/LS-only knob (oils held back from the cook and folded
            in after saponification). One TOTAL budget slider; the oil rows allocate within
            it (their percents sum to at most the total). Hidden for CP, no cook stage. */}
        {processOffers(process, 'postCook') && (
          <div className="pcsf">
            <SliderField
              label="Post-cook superfat"
              valueLabel="Post-cook superfat total %"
              unit="%"
              term="Post-cook superfat"
              help="The total oils held back from the cook and stirred in afterward, so they stay unsaponified for a gentler bar. Split the total across one or more oils below."
              min={0}
              max={50}
              step={0.5}
              sliderMax={20}
              value={settings.postCookSuperfatTotalPercent}
              onChange={setPcsfTotal}
            />

            <div className="pcsf__alloc">
              <span className="pcsf__alloc-label">Oils</span>
              <span className="pcsf__alloc-note">
                {pcsfAllocated > 0
                  ? `${formatTotal(pcsfAllocated)}% of ${formatTotal(pcsfTotal)}% allocated`
                  : `${formatTotal(pcsfTotal)}% unallocated`}
                {pcsfRemaining > 0 && pcsfAllocated > 0 ? ` · ${formatTotal(pcsfRemaining)}% left` : ''}
              </span>
            </div>

            {pcsfOils.map((row, i) => (
              <div className="pcsf__row" key={i}>
                <OilPicker
                  value={row.oilId}
                  onChange={(oilId) => updatePcsfOil(i, { oilId })}
                  ariaLabel={`Post-cook superfat oil ${i + 1}`}
                />
                <span className="pcsf__pct">
                  <input
                    type="number"
                    className="input input--number"
                    aria-label={`Post-cook superfat % ${i + 1}`}
                    min={0}
                    max={50}
                    step={0.5}
                    value={row.percent}
                    onChange={(e) => updatePcsfOil(i, { percent: e.target.value })}
                  />
                  <span className="slider-field__unit">%</span>
                </span>
                <button
                  type="button"
                  className="pcsf__remove"
                  aria-label={`Remove post-cook superfat row ${i + 1}`}
                  onClick={() => removePcsfOil(i)}
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              className="pcsf__add"
              aria-label="Add post-cook superfat oil"
              onClick={addPcsfOil}
            >
              + Add oil
            </button>

            <label className="field field--compact numbers-inputs__method pcsf__method">
              <span>Post-cook superfat method</span>
              <select
                className="input"
                aria-label="Post-cook superfat method"
                value={settings.postCookSuperfatMethod}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    postCookSuperfatMethod: e.target.value as 'append' | 'subtract',
                  }))
                }
              >
                <option value="subtract">Subtract (reserve)</option>
                <option value="append">Append (add oil)</option>
              </select>
            </label>
            <p className="pcsf__method-help results-hint">
              {PCSF_METHOD_HELP[settings.postCookSuperfatMethod]}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
