import type { RecipeViewModel } from '../hooks/useRecipeViewModel';
import type { MoldSizerInput } from '../lib/moldSizer';
import type { RecipeSettings, WeightUnit } from '../lib/recipe';
import {
  purityFieldsFor,
  WATER_FIELDS,
  lyeChoicesFor,
  waterModeChoicesFor,
  LYE_TYPE_LABELS,
  WATER_MODE_LABELS,
} from '../lib/settingsFields';
import type { ProcessId } from '../lib/process';
import { InfoTip } from './InfoTip';
import { MoldSizerPanel } from './MoldSizerPanel';
import { OilPicker } from './OilPicker';
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
      <span>
        {spec.label}
        {spec.help && <InfoTip term={spec.label.replace(/\s*%$/, '')}>{spec.help}</InfoTip>}
      </span>
      <input
        type="number"
        className="input"
        aria-label={spec.label}
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
  process?: ProcessId;
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
  process = 'cp',
}: SettingsPanelProps) {
  const updateField = (key: FieldSpec['key'], value: string) =>
    setSettings((s) => ({ ...s, [key]: value }));
  const waterField = WATER_FIELDS[settings.waterMode];
  return (
    <section className="panel">
      <h2 className="panel__title">Settings</h2>
      <div className="settings-grid">
        <label className="field">
          <span>
            Superfat %
            <InfoTip term="Superfat">
              The share of oils left unsaponified for a gentler, more moisturizing bar. Around 5%
              is common.
            </InfoTip>
          </span>
          <input
            type="number"
            className="input"
            aria-label="Superfat %"
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
            aria-label="Lye type"
            value={settings.lyeType}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                lyeType: e.target.value as 'naoh' | 'koh' | 'dual',
              }))
            }
          >
            {lyeChoicesFor(process).map((lye) => (
              <option key={lye} value={lye}>{LYE_TYPE_LABELS[lye]}</option>
            ))}
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
            aria-label="Water method"
            value={settings.waterMode}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                waterMode: e.target.value as typeof settings.waterMode,
              }))
            }
          >
            {waterModeChoicesFor(process).map((mode) => (
              <option key={mode} value={mode}>{WATER_MODE_LABELS[mode]}</option>
            ))}
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

        {process !== 'cp' && (
          <>
            <label className="field">
              <span>Post-cook superfat %</span>
              <input
                type="number"
                className="input"
                min={0}
                max={50}
                step={0.5}
                value={settings.postCookSuperfatPercent}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, postCookSuperfatPercent: e.target.value }))
                }
              />
            </label>
            <div className="field">
              <span>Post-cook superfat oil</span>
              <OilPicker
                value={settings.postCookSuperfatOilId}
                onChange={(oilId) =>
                  setSettings((s) => ({ ...s, postCookSuperfatOilId: oilId }))
                }
              />
            </div>
            <label className="field">
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
                <option value="append">Append (add oil)</option>
                <option value="subtract">Subtract (reserve)</option>
              </select>
            </label>
          </>
        )}
      </div>

      <details className="settings-advanced">
        <summary className="settings-advanced__summary">Advanced</summary>

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
      </details>
    </section>
  );
}
