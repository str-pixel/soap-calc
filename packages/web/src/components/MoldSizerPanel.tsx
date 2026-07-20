import { useMemo } from 'react';
import { DEFAULT_OIL_BATCH_FRACTION } from '@soap-calc/core';
import {
  DEFAULT_MOLD_SIZER_INPUT,
  type MoldSizerInput,
  suggestOilGramsFromMoldSizer,
} from '../lib/moldSizer';
import { formatWeight } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';

type MoldSizerPanelProps = {
  input: MoldSizerInput;
  weightUnit: WeightUnit;
  oilBatchFraction: number | null;
  onChange: (input: MoldSizerInput) => void;
  onApply: (oilGrams: number) => void;
};

export function MoldSizerPanel({
  input,
  weightUnit,
  oilBatchFraction,
  onChange,
  onApply,
}: MoldSizerPanelProps) {
  const suggestedGrams = useMemo(
    () => suggestOilGramsFromMoldSizer(input, oilBatchFraction, weightUnit),
    [input, oilBatchFraction, weightUnit],
  );
  const applicableOilGrams =
    suggestedGrams !== null ? Math.round(suggestedGrams) : null;

  const dimensionUnit = input.useInches ? 'in' : 'cm';

  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Batch sizer</h2>
          <p className="panel__subtitle">Suggest oil weight from a mold or bar count</p>
        </div>
      </div>

      <div className="mold-sizer__modes">
        <label className="field field--inline">
          <input
            type="radio"
            name="mold-sizer-mode"
            checked={input.mode === 'mold'}
            onChange={() => onChange({ ...input, mode: 'mold' })}
          />
          <span>Mold volume</span>
        </label>
        <label className="field field--inline">
          <input
            type="radio"
            name="mold-sizer-mode"
            checked={input.mode === 'bars'}
            onChange={() => onChange({ ...input, mode: 'bars' })}
          />
          <span>Bar count</span>
        </label>
      </div>

      {input.mode === 'mold' ? (
        <div className="settings-grid mold-sizer__grid">
          <div className="mold-sizer__modes mold-sizer__hint--full">
            <label className="field field--inline">
              <input
                type="radio"
                name="mold-sizer-shape"
                checked={input.moldShape === 'rectangular'}
                onChange={() => onChange({ ...input, moldShape: 'rectangular' })}
              />
              <span>Rectangular</span>
            </label>
            <label className="field field--inline">
              <input
                type="radio"
                name="mold-sizer-shape"
                checked={input.moldShape === 'cylinder'}
                onChange={() => onChange({ ...input, moldShape: 'cylinder' })}
              />
              <span>Cylinder</span>
            </label>
          </div>
          <p className="mold-sizer__hint mold-sizer__hint--full">
            For irregular molds, fill with water and measure volume, or weigh a test pour.
          </p>
          {input.moldShape === 'cylinder' ? (
            <>
              <label className="field">
                <span>Radius ({dimensionUnit})</span>
                <input
                  type="number"
                  className="input"
                  min={0}
                  step={0.1}
                  value={input.radius}
                  onChange={(e) => onChange({ ...input, radius: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Height ({dimensionUnit})</span>
                <input
                  type="number"
                  className="input"
                  min={0}
                  step={0.1}
                  value={input.height}
                  onChange={(e) => onChange({ ...input, height: e.target.value })}
                />
              </label>
            </>
          ) : (
            <>
              <label className="field">
                <span>Length ({dimensionUnit})</span>
                <input
                  type="number"
                  className="input"
                  min={0}
                  step={0.1}
                  value={input.length}
                  onChange={(e) => onChange({ ...input, length: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Width ({dimensionUnit})</span>
                <input
                  type="number"
                  className="input"
                  min={0}
                  step={0.1}
                  value={input.width}
                  onChange={(e) => onChange({ ...input, width: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Height ({dimensionUnit})</span>
                <input
                  type="number"
                  className="input"
                  min={0}
                  step={0.1}
                  value={input.height}
                  onChange={(e) => onChange({ ...input, height: e.target.value })}
                />
              </label>
            </>
          )}
          <label className="field field--inline field--checkbox">
            <input
              type="checkbox"
              checked={input.useInches}
              onChange={(e) => onChange({ ...input, useInches: e.target.checked })}
            />
            <span>Use inches</span>
          </label>
          <label className="field">
            <span>Shrinkage / waste %</span>
            <input
              type="number"
              className="input"
              min={0}
              max={50}
              step={1}
              value={input.wasteFactorPercent}
              onChange={(e) => onChange({ ...input, wasteFactorPercent: e.target.value })}
            />
          </label>
          <p className="mold-sizer__hint mold-sizer__hint--full">
            Typical shrinkage or trimming allowance is 5–10%. Leave at 0 if the mold size already
            accounts for it.
          </p>
        </div>
      ) : (
        <div className="settings-grid mold-sizer__grid">
          <label className="field">
            <span>Number of bars</span>
            <input
              type="number"
              className="input"
              min={1}
              step={1}
              value={input.barCount}
              onChange={(e) => onChange({ ...input, barCount: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Finished bar weight ({weightUnit})</span>
            <input
              type="number"
              className="input"
              min={0}
              step={1}
              value={input.barWeight}
              onChange={(e) => onChange({ ...input, barWeight: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Shrinkage / waste %</span>
            <input
              type="number"
              className="input"
              min={0}
              max={50}
              step={1}
              value={input.wasteFactorPercent}
              onChange={(e) => onChange({ ...input, wasteFactorPercent: e.target.value })}
            />
          </label>
          <p className="mold-sizer__hint mold-sizer__hint--full">
            Typical shrinkage or trimming allowance is 5–10%. Leave at 0 if the mold size already
            accounts for it.
          </p>
        </div>
      )}

      {Number(input.wasteFactorPercent) > 50 && (
        <p className="mold-sizer__hint" role="alert">
          Shrinkage / waste % above 50 isn&apos;t supported — lower it to see a suggestion.
        </p>
      )}
      {applicableOilGrams !== null && (
        <div className="mold-sizer__result">
          <p>
            Suggested oil weight: <strong>{formatWeight(suggestedGrams!, weightUnit)}</strong>
            <span className="results-excluded">
              {' '}
              (using{' '}
              {oilBatchFraction !== null
                ? `${Math.round(oilBatchFraction * 100)}%`
                : `${Math.round(DEFAULT_OIL_BATCH_FRACTION * 100)}%`}{' '}
              oil share)
            </span>
          </p>
          {applicableOilGrams <= 0 ? (
            <p className="mold-sizer__hint">Suggested oil weight is too small to apply.</p>
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
