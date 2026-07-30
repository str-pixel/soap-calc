import type { MoldSizerInput } from '../lib/moldSizer';
import type { RecipeInputs } from '../hooks/useRecipeInputs';
import type { RecipeViewModel } from '../hooks/useRecipeViewModel';
import type { RecipeSettings, WeightUnit } from '../lib/recipe';
import { MAX_NOTES_LENGTH } from '../lib/recipe';
import {
  purityFieldsFor,
  lyeChoicesFor,
  LYE_TYPE_LABELS,
} from '../lib/settingsFields';
import type { ProcessId } from '../lib/process';
import { BatchBasics } from './BatchBasics';
import { InfoTip } from './InfoTip';
import { MoldSizerPanel } from './MoldSizerPanel';

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
  /** Batch basics (weight unit / total oil / total batch) — shown first. */
  previewState: RecipeViewModel['previewState'];
  getDraft: (id: string, canonicalDisplay: string) => string;
  inputs: RecipeInputs;
  batchWeightWithExtras: number;
  recipeOilWeightGrams: number;
  fixedBatchExtrasGrams: number;
  setSettings: React.Dispatch<React.SetStateAction<RecipeSettings>>;
  weightUnit: WeightUnit;
  moldSizerInput: MoldSizerInput;
  onMoldSizerChange: (next: MoldSizerInput) => void;
  liveOilBatchFraction: number | null;
  onApplySuggestedOilGrams: (oilGrams: number) => void;
  process?: ProcessId;
  /** Cure water loss for the active process variant — bars mode sizes the wet batch that
   * cures to the requested bar weight. */
  moldSizerWaterLossPercent?: number;
  /** Cook vessel volume in liters, for the HP vessel-size guard (hp_vessel_too_small).
   * Optional UI-only helper input — HP-only, not part of the saved recipe. */
  vesselVolumeLiters?: string;
  onVesselVolumeLitersChange?: (value: string) => void;
  /** The vessel-volume-to-batch-volume ratio computed from vesselVolumeLiters, for display
   * alongside the input; undefined when no vessel volume is set. */
  hpVesselMultiple?: number;
};

export function SettingsPanel({
  settings,
  previewState,
  getDraft,
  inputs,
  batchWeightWithExtras,
  recipeOilWeightGrams,
  fixedBatchExtrasGrams,
  setSettings,
  weightUnit,
  moldSizerInput,
  onMoldSizerChange,
  liveOilBatchFraction,
  onApplySuggestedOilGrams,
  process = 'cp',
  moldSizerWaterLossPercent = 0,
  vesselVolumeLiters = '',
  onVesselVolumeLitersChange = () => {},
  hpVesselMultiple,
}: SettingsPanelProps) {
  const updateField = (key: FieldSpec['key'], value: string) =>
    setSettings((s) => ({ ...s, [key]: value }));
  return (
    <section className="panel">
      <h2 className="panel__title">Settings</h2>
      <p className="panel__subtitle">
        Superfat and the water ratio sit in the Superfat&nbsp;&amp;&nbsp;water panel below.
      </p>

      <BatchBasics
        weightUnit={weightUnit}
        previewState={previewState}
        getDraft={getDraft}
        inputs={inputs}
        batchWeightWithExtras={batchWeightWithExtras}
        recipeOilWeightGrams={recipeOilWeightGrams}
        fixedBatchExtrasGrams={fixedBatchExtrasGrams}
      />
      <div className="settings-grid">
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

        {purityFieldsFor(settings.lyeType).map((spec) => (
          <NumericSettingField
            key={spec.key}
            spec={spec}
            value={settings[spec.key]}
            onValueChange={(v) => updateField(spec.key, v)}
          />
        ))}

        {process === 'hp' && (
          <label className="field">
            <span>
              Cook vessel volume (L)
              <InfoTip term="Cook vessel volume">
                The hot-process cook expands (a thick, translucent "mashed potato" phase) before
                settling — a vessel at least ~2× the batch volume (~3× for coconut-heavy
                recipes) gives it room to expand without overflowing.
              </InfoTip>
            </span>
            <input
              type="number"
              className="input input--number"
              aria-label="Cook vessel volume (L)"
              min={0}
              step={0.5}
              value={vesselVolumeLiters}
              onChange={(e) => onVesselVolumeLitersChange(e.target.value)}
            />
            {hpVesselMultiple !== undefined && (
              <span className="results-excluded">
                ≈{hpVesselMultiple.toFixed(1)}× batch volume
              </span>
            )}
          </label>
        )}
      </div>

      <details className="settings-advanced">
        <summary className="settings-advanced__summary">Advanced</summary>

        <MoldSizerPanel
          input={moldSizerInput}
          weightUnit={weightUnit}
          oilBatchFraction={liveOilBatchFraction}
          waterLossPercent={moldSizerWaterLossPercent}
          onChange={onMoldSizerChange}
          onApply={onApplySuggestedOilGrams}
        />

        <label className="field">
          <span>Process notes</span>
          <textarea
            className="input input--textarea"
            maxLength={MAX_NOTES_LENGTH}
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
