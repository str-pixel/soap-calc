import type { RecipeViewModel } from '../hooks/useRecipeViewModel';
import type { MoldSizerInput } from '../lib/moldSizer';
import type { RecipeSettings, WeightUnit } from '../lib/recipe';
import { purityFieldsFor, WATER_FIELDS } from '../lib/settingsFields';
import { MoldSizerPanel } from './MoldSizerPanel';
import { SplitLiquidPanel } from './SplitLiquidPanel';

type FieldSpec = ReturnType<typeof purityFieldsFor>[number];

function NumericSettingField({
  spec,
  value,
  onValueChange,
}: {
  spec: FieldSpec;
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{spec.label}</span>
      <input
        type="number"
        className="input"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      />
    </label>
  );
}

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
  const updateField = (key: FieldSpec['key'], value: string) =>
    setSettings((s) => ({ ...s, [key]: value }));
  const waterField = WATER_FIELDS[settings.waterMode];
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

        <NumericSettingField
          spec={waterField}
          value={settings[waterField.key]}
          onValueChange={(v) => updateField(waterField.key, v)}
        />

        {purityFieldsFor(settings.lyeType).map((spec) => (
          <NumericSettingField
            key={spec.key}
            spec={spec}
            value={settings[spec.key]}
            onValueChange={(v) => updateField(spec.key, v)}
          />
        ))}
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
