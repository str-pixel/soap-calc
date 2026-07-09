import type { RecipeViewModel } from '../hooks/useRecipeViewModel';
import type { MoldSizerInput } from '../lib/moldSizer';
import type { RecipeSettings, WeightUnit } from '../lib/recipe';
import { MoldSizerPanel } from './MoldSizerPanel';
import { SplitLiquidPanel } from './SplitLiquidPanel';

type SettingsPanelProps = {
  settings: RecipeSettings;
  setSettings: React.Dispatch<React.SetStateAction<RecipeSettings>>;
  weightUnit: WeightUnit;
  totalOilGrams: number;
  lyeGrams: number; // vm.result?.lyeWeightGrams ?? 0
  waterSuggestion: RecipeViewModel['waterSuggestion'];
  moldSizerInput: MoldSizerInput;
  onMoldSizerChange: (next: MoldSizerInput) => void;
  liveOilBatchFraction: number | null;
  onApplySuggestedOilGrams: (oilGrams: number) => void;
};

export function SettingsPanel({
  settings,
  setSettings,
  weightUnit,
  totalOilGrams,
  lyeGrams,
  waterSuggestion,
  moldSizerInput,
  onMoldSizerChange,
  liveOilBatchFraction,
  onApplySuggestedOilGrams,
}: SettingsPanelProps) {
  return (
    <section className="panel">
      <h2 className="panel__title">Settings</h2>
      <div className="settings-grid">
        <label className="field">
          <span>Superfat %</span>
          <input
            type="number"
            className="input"
            min={0}
            max={50}
            step={0.5}
            value={settings.superfatPercent}
            onChange={(e) =>
              setSettings((s) => ({ ...s, superfatPercent: e.target.value }))
            }
          />
        </label>

        <label className="field">
          <span>Lye type</span>
          <select
            className="input"
            value={settings.lyeType}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                lyeType: e.target.value as 'naoh' | 'koh' | 'dual',
              }))
            }
          >
            <option value="naoh">NaOH (bar soap)</option>
            <option value="koh">KOH (liquid soap)</option>
            <option value="dual">NaOH + KOH blend</option>
          </select>
        </label>

        {settings.lyeType === 'dual' && (
          <label className="field">
            <span>KOH % of alkali (by weight)</span>
            <input
              type="number"
              className="input"
              min={0}
              max={50}
              step={0.5}
              value={settings.kohBlendPercent}
              onChange={(e) =>
                setSettings((s) => ({ ...s, kohBlendPercent: e.target.value }))
              }
            />
          </label>
        )}

        <label className="field">
          <span>Water method</span>
          <select
            className="input"
            value={settings.waterMode}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                waterMode: e.target.value as typeof settings.waterMode,
              }))
            }
          >
            <option value="percent_of_oils">% of oils</option>
            <option value="lye_concentration">Lye concentration %</option>
            <option value="lye_water_ratio">Water : lye ratio</option>
          </select>
        </label>

        {settings.waterMode === 'percent_of_oils' && (
          <label className="field">
            <span>Water % of oils</span>
            <input
              type="number"
              className="input"
              min={0}
              step={1}
              value={settings.waterPercentOfOils}
              onChange={(e) =>
                setSettings((s) => ({ ...s, waterPercentOfOils: e.target.value }))
              }
            />
          </label>
        )}

        {settings.waterMode === 'lye_concentration' && (
          <label className="field">
            <span>Lye concentration %</span>
            <input
              type="number"
              className="input"
              min={0.1}
              max={99.9}
              step={0.1}
              value={settings.lyeConcentrationPercent}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  lyeConcentrationPercent: e.target.value,
                }))
              }
            />
          </label>
        )}

        {settings.waterMode === 'lye_water_ratio' && (
          <label className="field">
            <span>Water : lye ratio</span>
            <input
              type="number"
              className="input"
              min={0.1}
              step={0.1}
              value={settings.lyeWaterRatio}
              onChange={(e) =>
                setSettings((s) => ({ ...s, lyeWaterRatio: e.target.value }))
              }
            />
          </label>
        )}

        {settings.lyeType === 'naoh' ? (
          <label className="field">
            <span>NaOH purity %</span>
            <input
              type="number"
              className="input"
              min={1}
              max={100}
              step={0.1}
              value={settings.naohPurityPercent}
              onChange={(e) =>
                setSettings((s) => ({ ...s, naohPurityPercent: e.target.value }))
              }
            />
          </label>
        ) : settings.lyeType === 'koh' ? (
          <label className="field">
            <span>KOH purity %</span>
            <input
              type="number"
              className="input"
              min={1}
              max={100}
              step={0.1}
              value={settings.kohPurityPercent}
              onChange={(e) =>
                setSettings((s) => ({ ...s, kohPurityPercent: e.target.value }))
              }
            />
          </label>
        ) : (
          <>
            <label className="field">
              <span>NaOH purity %</span>
              <input
                type="number"
                className="input"
                min={1}
                max={100}
                step={0.1}
                value={settings.naohPurityPercent}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, naohPurityPercent: e.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>KOH purity %</span>
              <input
                type="number"
                className="input"
                min={1}
                max={100}
                step={0.1}
                value={settings.kohPurityPercent}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, kohPurityPercent: e.target.value }))
                }
              />
            </label>
          </>
        )}
      </div>

      <SplitLiquidPanel
        splitLiquid={settings.splitLiquid}
        totalOilGrams={totalOilGrams}
        lyeGrams={lyeGrams}
        weightUnit={weightUnit}
        waterMode={settings.waterMode}
        waterSuggestion={waterSuggestion}
        onChange={(splitLiquid) => setSettings((s) => ({ ...s, splitLiquid }))}
        onApplySuggestedWater={(waterPercentOfOils) =>
          setSettings((s) => ({
            ...s,
            waterMode: 'percent_of_oils',
            waterPercentOfOils,
          }))
        }
      />

      <MoldSizerPanel
        input={moldSizerInput}
        weightUnit={weightUnit}
        oilBatchFraction={liveOilBatchFraction}
        onChange={onMoldSizerChange}
        onApply={onApplySuggestedOilGrams}
      />

      <label className="field">
        <span>Process notes</span>
        <textarea
          className="input input--textarea"
          rows={3}
          placeholder="Trace notes, fragrance plan, cure reminders…"
          value={settings.batchNotes}
          onChange={(e) => setSettings((s) => ({ ...s, batchNotes: e.target.value }))}
        />
      </label>
    </section>
  );
}
