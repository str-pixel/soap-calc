import { MAX_WASTE_FACTOR_PERCENT } from '@soap-calc/core';
import { useMemo } from 'react';
import { DEFAULT_OIL_BATCH_FRACTION } from '@soap-calc/core';
import {
  DEFAULT_MOLD_SIZER_INPUT,
  type MoldSizerInput,
  suggestOilGramsFromMoldSizer,
  wasteFactorExceedsMax } from '../lib/moldSizer';
import { formatWeight, WEIGHT_UNITS } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';
import { LedgerRow } from './LedgerRow';
import { SegRadioGroup } from './SegRadioGroup';

type MoldSizerPanelProps = {
  input: MoldSizerInput;
  weightUnit: WeightUnit;
  oilBatchFraction: number | null;
  /** Cure water loss for the active process — bars mode sizes the wet batch that cures to
   * the requested bar weight. */
  waterLossPercent?: number;
  onChange: (input: MoldSizerInput) => void;
  onApply: (oilGrams: number) => void;
};

/** One compact dimension cell: a single-letter visible label over the wire, the full name
 * as the accessible one — "L" reads fine beside "×" separators, but "Length (cm)" is what
 * a screen reader (and every locator) needs. */
function DimField({
  letter,
  name,
  value,
  onValueChange,
}: {
  letter: string;
  name: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <label className="dim-row__field">
      {letter}
      <input
        type="number"
        className="input figure-field"
        aria-label={name}
        min={0}
        step={0.1}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      />
    </label>
  );
}

/* No aria-label: the row's content — "Shrinkage / waste" plus the "%" unit — IS the
 * accessible name, so a rename can't strand screen readers on a stale string. */
function ShrinkageRow({
  input,
  onChange,
}: {
  input: MoldSizerInput;
  onChange: (input: MoldSizerInput) => void;
}) {
  return (
    <LedgerRow
      label="Shrinkage / waste"
      unit="%"
      input={{
        min: 0,
        max: MAX_WASTE_FACTOR_PERCENT,
        step: 1,
        value: input.wasteFactorPercent,
        onChange: (e) => onChange({ ...input, wasteFactorPercent: e.target.value }),
      }}
    />
  );
}

const SHRINKAGE_HINT =
  'Typical shrinkage or trimming allowance is 5–10%. Leave at 0 if the mold size already accounts for it.';

export function MoldSizerPanel({
  input,
  weightUnit,
  oilBatchFraction,
  waterLossPercent = 0,
  onChange,
  onApply,
}: MoldSizerPanelProps) {
  const suggestedGrams = useMemo(
    () => suggestOilGramsFromMoldSizer(input, oilBatchFraction, weightUnit, waterLossPercent),
    [input, oilBatchFraction, weightUnit, waterLossPercent],
  );
  const applicableOilGrams =
    suggestedGrams !== null ? Math.round(suggestedGrams) : null;

  const unitShort = WEIGHT_UNITS[weightUnit].short;
  const dimensionUnit = input.useInches ? 'in' : 'cm';
  const dimName = (name: string) => `${name} (${dimensionUnit})`;

  return (
    <section className="panel panel--nested mold-sizer">
      <div className="panel__head">
        <h2 className="panel__title">Batch sizer</h2>
        <SegRadioGroup
          label="Batch sizer mode"
          name="mold-sizer-mode"
          options={[
            { value: 'mold', cell: 'Mold volume' },
            { value: 'bars', cell: 'Bar count' },
          ]}
          value={input.mode}
          onChange={(mode) => onChange({ ...input, mode })}
        />
      </div>
      <p className="panel__subtitle">Suggest oil weight from a mold or bar count</p>

      {input.mode === 'mold' && (
        <>
          {/* Both picks scope what the dimension fields mean, so they read together as a
              pair of micro-labelled segs above them — the mock's idiom for every
              mutually-exclusive choice. */}
          <div className="mold-sizer__picks">
            <div className="mold-sizer__pick">
              <span className="micro-label">Mold shape</span>
              <SegRadioGroup
                label="Mold shape"
                name="mold-sizer-shape"
                options={[
                  { value: 'rectangular', cell: 'Rectangular' },
                  { value: 'cylinder', cell: 'Cylinder' },
                ]}
                value={input.moldShape}
                onChange={(moldShape) => onChange({ ...input, moldShape })}
              />
            </div>
            {/* The old "Use inches" checkbox as a cm/in pick — same boolean state, stated
                as the unit the maker is choosing rather than a yes/no. The cells keep
                their own casing: "cm" and "in" are units, not labels. */}
            <div className="mold-sizer__pick">
              <span className="micro-label">Units</span>
              <SegRadioGroup
                label="Dimension unit"
                name="mold-sizer-units"
                preserveCase
                options={[
                  { value: 'cm', cell: 'cm' },
                  { value: 'in', cell: 'in' },
                ]}
                value={input.useInches ? 'in' : 'cm'}
                onChange={(unit) => onChange({ ...input, useInches: unit === 'in' })}
              />
            </div>
          </div>
          <p className="inline-note">
            For irregular molds, fill with water and measure volume, or weigh a test pour.
          </p>
          <div className="mold-sizer__dims">
            <span className="micro-label">Mold dimensions</span>
            <div className="dim-row">
              {input.moldShape === 'cylinder' ? (
                <>
                  <DimField
                    letter="R"
                    name={dimName('Radius')}
                    value={input.radius}
                    onValueChange={(v) => onChange({ ...input, radius: v })}
                  />
                  <span className="dim-row__sep" aria-hidden="true">×</span>
                  <DimField
                    letter="H"
                    name={dimName('Height')}
                    value={input.height}
                    onValueChange={(v) => onChange({ ...input, height: v })}
                  />
                </>
              ) : (
                <>
                  <DimField
                    letter="L"
                    name={dimName('Length')}
                    value={input.length}
                    onValueChange={(v) => onChange({ ...input, length: v })}
                  />
                  <span className="dim-row__sep" aria-hidden="true">×</span>
                  <DimField
                    letter="W"
                    name={dimName('Width')}
                    value={input.width}
                    onValueChange={(v) => onChange({ ...input, width: v })}
                  />
                  <span className="dim-row__sep" aria-hidden="true">×</span>
                  <DimField
                    letter="H"
                    name={dimName('Height')}
                    value={input.height}
                    onValueChange={(v) => onChange({ ...input, height: v })}
                  />
                </>
              )}
              <span className="dim-row__unit">{dimensionUnit}</span>
            </div>
          </div>
        </>
      )}

      {/* Both modes end in the same ledger tail; only bars mode adds its own rows. */}
      <div className="ledger mold-sizer__ledger">
        {input.mode === 'bars' && (
          <>
            <LedgerRow
              label="Number of bars"
              input={{
                min: 1,
                step: 1,
                value: input.barCount,
                onChange: (e) => onChange({ ...input, barCount: e.target.value }),
              }}
            />
            <LedgerRow
              label="Bar weight after cure"
              unit={unitShort}
              input={{
                'aria-label': `Bar weight after cure (${unitShort})`,
                min: 0,
                step: 1,
                value: input.barWeight,
                onChange: (e) => onChange({ ...input, barWeight: e.target.value }),
              }}
            />
          </>
        )}
        <ShrinkageRow input={input} onChange={onChange} />
      </div>
      <p className="inline-note">{SHRINKAGE_HINT}</p>

      {wasteFactorExceedsMax(input.wasteFactorPercent) && (
        <p className="inline-note inline-note--warn" role="alert">
          Shrinkage / waste % above {MAX_WASTE_FACTOR_PERCENT} isn&apos;t supported — lower it
          to see a suggestion.
        </p>
      )}
      {applicableOilGrams !== null && (
        <div className="mold-sizer__result">
          <div>
            <span className="micro-label">Suggested oil weight</span>
            <div className="mold-sizer__figure">
              <span className="mold-sizer__figure-value">
                {formatWeight(suggestedGrams!, weightUnit)}
              </span>
              <span className="mold-sizer__figure-caption">
                (using{' '}
                {oilBatchFraction !== null
                  ? `${Math.round(oilBatchFraction * 100)}%`
                  : `${Math.round(DEFAULT_OIL_BATCH_FRACTION * 100)}%`}{' '}
                oil share)
              </span>
            </div>
          </div>
          {applicableOilGrams <= 0 ? (
            <p className="inline-note inline-note--warn">Suggested oil weight is too small to apply.</p>
          ) : (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => onApply(applicableOilGrams)}
            >
              Apply to batch
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export { DEFAULT_MOLD_SIZER_INPUT };
