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
import { splitLiquidWaterFraction } from '../lib/calculateAdditives';
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
  /** Resolved liquid grams for the current sizing mode (view-model owned). */
  splitLiquidGrams: number | null;
  /** Budget allocation (budget sizing modes only): the calc's lye water + the target. */
  allocation: { lyeWaterGrams: number; targetLiquidGrams: number } | null;
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
  splitLiquidGrams,
  allocation,
  onChange,
  onApplySuggestedWater,
}: SplitLiquidPanelProps) {
  const grams = splitLiquid.enabled ? splitLiquidGrams : null;

  const preset = alternativeLiquidPreset(splitLiquid.presetKey);
  const budgetModesAvailable = waterMode === 'percent_of_oils';
  const waterFraction = splitLiquidWaterFraction(splitLiquid);
  // A thick liquid displaces real water from the budget; past ~5% of the total liquid the
  // batter will move noticeably faster and thicker than the water figure suggests.
  const displacedWaterGrams =
    grams !== null && allocation !== null ? grams * (1 - waterFraction) : 0;
  const showFluidityNote =
    allocation !== null && displacedWaterGrams > allocation.targetLiquidGrams * 0.05;
  const recommendTrace =
    splitLiquid.addAt === 'lye' &&
    (preset?.flags.includes('sugars') || preset?.flags.includes('alcohol'));
  // The view model supplies a status only when the lye solution is actually at stake:
  // an in-lye liquid, or a budget allocation that reduced the lye water.
  const showShortfall = lyeWaterStatus !== null && lyeWaterStatus.shortfallGrams > 0;

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
            <span>Sized by</span>
            <select
              className="input"
              value={splitLiquid.sizeMode}
              onChange={(e) =>
                onChange({
                  ...splitLiquid,
                  sizeMode: e.target.value as SplitLiquidSettings['sizeMode'],
                })
              }
            >
              <option value="percent_of_oils">% of oil weight</option>
              <option value="grams">Weight</option>
              <option value="percent_of_liquid" disabled={!budgetModesAvailable}>
                % of total liquid{budgetModesAvailable ? '' : ' (needs % of oils water)'}
              </option>
              <option value="rest" disabled={!budgetModesAvailable}>
                All liquid above the lye minimum{budgetModesAvailable ? '' : ' (needs % of oils water)'}
              </option>
            </select>
          </label>
          {splitLiquid.sizeMode !== 'rest' && (
            <label className="field">
              <span>Amount</span>
              <input
                type="number"
                className="input"
                min={0}
                step={0.1}
                value={splitLiquid.amount}
                onChange={(e) => onChange({ ...splitLiquid, amount: e.target.value })}
              />
            </label>
          )}
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
          {allocation && grams !== null && (
            <p className="split-liquid-preview">
              {formatWeight(allocation.lyeWaterGrams, weightUnit)} lye water (1 : 1) +{' '}
              {formatWeight(grams, weightUnit)}{' '}
              {splitLiquid.name.trim() || 'alternative liquid'} ={' '}
              {formatWeight(allocation.targetLiquidGrams, weightUnit)} total liquid
            </p>
          )}
          {recommendTrace && (
            <p className="split-liquid-note">
              Recommended: at trace — sugars scorch in hot lye. If it must go in the lye,
              freeze the liquid and add the lye slowly.
            </p>
          )}
          {showFluidityNote && (
            <p className="split-liquid-note">
              Thick liquid — about {Math.round((1 - waterFraction) * 100)}% of it isn&apos;t
              water, so expect a thicker, faster trace than the water figure suggests.
            </p>
          )}
          {preset?.note && <p className="split-liquid-note">{preset.note}</p>}
          {showShortfall && (
            <p className="split-liquid-warning" role="alert">
              Not enough water to dissolve the lye:{' '}
              {preset && preset.waterFraction < 1 && splitLiquid.addAt === 'lye'
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
