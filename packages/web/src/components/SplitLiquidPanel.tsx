import { ADDITIVE_STAGE_LABELS } from '@soap-calc/core';
import type { SplitLiquidSettings } from '../lib/recipe';
import { computeSplitLiquidGrams } from '../lib/calculateAdditives';
import { formatWeight } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';

type SplitLiquidPanelProps = {
  splitLiquid: SplitLiquidSettings;
  totalOilGrams: number;
  weightUnit: WeightUnit;
  onChange: (splitLiquid: SplitLiquidSettings) => void;
};

export function SplitLiquidPanel({
  splitLiquid,
  totalOilGrams,
  weightUnit,
  onChange,
}: SplitLiquidPanelProps) {
  const grams = splitLiquid.enabled
    ? computeSplitLiquidGrams(splitLiquid.percentOfOil, totalOilGrams)
    : null;

  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Split liquid</h2>
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
            <span>Liquid name</span>
            <input
              type="text"
              className="input"
              placeholder="e.g. goat milk, pumpkin puree"
              value={splitLiquid.name}
              onChange={(e) => onChange({ ...splitLiquid, name: e.target.value })}
            />
          </label>
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
            <span>Add at</span>
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
          {grams !== null && (
            <p className="split-liquid-preview">
              {splitLiquid.name.trim() || 'Alternative liquid'}:{' '}
              {formatWeight(grams, weightUnit)} ({ADDITIVE_STAGE_LABELS[splitLiquid.addAt]})
            </p>
          )}
        </div>
      )}
    </section>
  );
}
