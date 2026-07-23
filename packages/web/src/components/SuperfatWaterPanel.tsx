import type { Dispatch, SetStateAction } from 'react';
import type { WaterMode } from '@soap-calc/core';
import type { RecipeSettings } from '../lib/recipe';
import type { ProcessId } from '../lib/process';
import { NEG_SUPERFAT_FLOOR } from '../lib/parseRecipeSettings';
import { WATER_FIELDS, WATER_MODE_LABELS, waterModeChoicesFor } from '../lib/settingsFields';
import { InfoTip } from './InfoTip';

// Upper bound for each water mode's drag slider — the typical working range, not the hard
// input cap. The editable value readout keeps the field's real min/max, so out-of-range
// values (and their validation) are still reachable by typing.
const WATER_SLIDER_MAX: Record<WaterMode, number> = {
  percent_of_oils: 100,
  lye_concentration: 50,
  lye_water_ratio: 5,
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
};

/**
 * The two knobs makers touch most — Superfat and the water ratio — as their own left-column
 * panel (moved here from The Numbers to match the comp's arrangement).
 */
export function SuperfatWaterPanel({ settings, setSettings, process }: SuperfatWaterPanelProps) {
  const waterField = WATER_FIELDS[settings.waterMode];
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
          min={process === 'ls' ? NEG_SUPERFAT_FLOOR : 0}
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
      </div>
    </section>
  );
}
