import {
  ADDITIVE_STAGE_LABELS,
  ALTERNATIVE_LIQUID_GUIDE,
  alternativeLiquidPreset,
  type LyeSolutionWaterStatus,
  type SplitLiquidWaterSuggestion,
  type WaterMode,
} from '@soap-calc/core';
import { InfoTip } from './InfoTip';
import type { SplitLiquidSettings } from '../lib/recipe';
import { computeSplitLiquidGrams } from '../lib/calculateAdditives';
import { formatInputNumber } from '../lib/format';
import { splitLiquidManualWaterHint } from '../lib/splitLiquidHint';
import { formatWeight } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';

type SplitLiquidPanelProps = {
  splitLiquid: SplitLiquidSettings;
  totalOilGrams: number;
  lyeGrams: number;
  weightUnit: WeightUnit;
  waterMode: WaterMode;
  waterSuggestion: SplitLiquidWaterSuggestion | null;
  /** Effective-water check for the lye solution; only meaningful when addAt is 'lye'. */
  lyeWaterStatus: LyeSolutionWaterStatus | null;
  onChange: (splitLiquid: SplitLiquidSettings) => void;
  onApplySuggestedWater?: (waterPercentOfOils: string) => void;
};

export function SplitLiquidPanel({
  splitLiquid,
  totalOilGrams,
  lyeGrams,
  weightUnit,
  waterMode,
  waterSuggestion,
  lyeWaterStatus,
  onChange,
  onApplySuggestedWater,
}: SplitLiquidPanelProps) {
  const grams = splitLiquid.enabled
    ? computeSplitLiquidGrams(splitLiquid.percentOfOil, totalOilGrams)
    : null;

  const preset = alternativeLiquidPreset(splitLiquid.presetKey);
  const showShortfall =
    splitLiquid.addAt === 'lye' && lyeWaterStatus !== null && lyeWaterStatus.shortfallGrams > 0;

  const canApplyWater =
    waterMode === 'percent_of_oils' &&
    waterSuggestion?.suggestedWaterPercentOfOils !== null &&
    onApplySuggestedWater;

  const manualHint =
    waterSuggestion && waterMode !== 'percent_of_oils'
      ? splitLiquidManualWaterHint({
          waterMode,
          waterSuggestion,
          lyeGrams,
          totalOilGrams,
          weightUnit,
        })
      : null;

  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <span className="panel__title-row">
            <h2 className="panel__title">Split liquid</h2>
            <InfoTip term="split liquid">
              Dissolve the lye in a minimum of plain water, and add the rest of the
              recipe&apos;s liquid — milk, puree, beer — separately. Keeping sugary liquids
              out of hot lye helps prevent scorching and darkening.
            </InfoTip>
          </span>
          <p className="panel__subtitle">
            Minimum water in lye; alternative liquid added separately
          </p>
        </div>
        <label className="field field--inline field--checkbox">
          <input
            type="checkbox"
            checked={splitLiquid.enabled}
            onChange={(e) => onChange({ ...splitLiquid, enabled: e.target.checked })}
          />
          <span>Enable</span>
        </label>
      </div>

      {splitLiquid.enabled && (
        <div className="settings-grid">
          <label className="field">
            <span>Liquid preset</span>
            <select
              className="input"
              value={splitLiquid.presetKey}
              onChange={(e) => {
                const nextKey = e.target.value;
                const nextPreset = alternativeLiquidPreset(nextKey);
                onChange({
                  ...splitLiquid,
                  presetKey: nextPreset ? nextKey : '',
                  // A preset names the liquid; back to custom keeps whatever was typed.
                  name: nextPreset ? nextPreset.label : splitLiquid.name,
                });
              }}
            >
              <option value="">Custom…</option>
              {ALTERNATIVE_LIQUID_GUIDE.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Liquid name</span>
            <input
              type="text"
              className="input"
              placeholder="e.g. goat milk, pumpkin puree"
              value={splitLiquid.name}
              onChange={(e) => onChange({ ...splitLiquid, name: e.target.value })}
            />
          </label>
          {preset === null && (
            <label className="field">
              <span>% water (optional)</span>
              <input
                type="number"
                className="input"
                min={1}
                max={100}
                step={1}
                placeholder="100"
                value={splitLiquid.customWaterPercent}
                onChange={(e) => onChange({ ...splitLiquid, customWaterPercent: e.target.value })}
              />
            </label>
          )}
          <label className="field">
            <span>% of oil weight</span>
            <input
              type="number"
              className="input"
              min={0}
              max={100}
              step={0.1}
              value={splitLiquid.percentOfOil}
              onChange={(e) => onChange({ ...splitLiquid, percentOfOil: e.target.value })}
            />
          </label>
          <label className="field">
            <span>
              Add at
              <InfoTip term="add at">
                Where the alternative liquid joins the batch. At trace (after the oils and
                lye are blended) is the safest default for milks and other sugary liquids;
                in the lye water exposes them to the hottest step.
              </InfoTip>
            </span>
            <select
              className="input"
              value={splitLiquid.addAt}
              onChange={(e) =>
                onChange({
                  ...splitLiquid,
                  addAt: e.target.value as SplitLiquidSettings['addAt'],
                })
              }
            >
              <option value="lye">In lye water</option>
              <option value="oils">With oils</option>
              <option value="trace">At trace</option>
            </select>
          </label>
          {preset?.note && <p className="split-liquid-note">{preset.note}</p>}
          {showShortfall && (
            <p className="split-liquid-warning" role="alert">
              Not enough water to dissolve the lye:{' '}
              {preset && preset.waterFraction < 1
                ? `this liquid is only ${Math.round(preset.waterFraction * 100)}% water, leaving `
                : 'the lye solution has less water than lye, with '}
              {formatWeight(lyeWaterStatus!.effectiveWaterGrams, weightUnit)} of real water against
              the {formatWeight(lyeWaterStatus!.floorGrams, weightUnit)} minimum — equal parts water
              and lye — needed to dissolve it. Add at least{' '}
              {formatWeight(lyeWaterStatus!.shortfallGrams, weightUnit)} more water, or add the
              liquid at trace instead.
            </p>
          )}
          {grams !== null && (
            <p className="split-liquid-preview">
              {splitLiquid.name.trim() || 'Alternative liquid'}:{' '}
              {formatWeight(grams, weightUnit)} ({ADDITIVE_STAGE_LABELS[splitLiquid.addAt]})
            </p>
          )}
          {waterSuggestion && waterSuggestion.reductionGrams > 0 && (
            <div className="split-liquid-suggestion">
              <p>
                Suggested lye water:{' '}
                <strong>{formatWeight(waterSuggestion.suggestedWaterGrams, weightUnit)}</strong>
                <span className="results-excluded">
                  {' '}
                  (reduce by {formatWeight(waterSuggestion.reductionGrams, weightUnit)})
                </span>
              </p>
              {canApplyWater && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() =>
                    onApplySuggestedWater!(
                      formatInputNumber(waterSuggestion.suggestedWaterPercentOfOils!, 1),
                    )
                  }
                >
                  Apply {formatInputNumber(waterSuggestion.suggestedWaterPercentOfOils!, 1)}% water
                  of oils
                </button>
              )}
              {manualHint && (
                <p className="split-liquid-suggestion__hint">{manualHint}</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
