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
import type { LyeType } from '@soap-calc/core';
import { kohBlendRangeFor, processOffers } from '../lib/process';
import type { ProcessId } from '../lib/process';
import { BatchBasics } from './BatchBasics';
import { InfoTip } from './InfoTip';
import { LedgerRow } from './LedgerRow';
import { MoldSizerPanel } from './MoldSizerPanel';
import { SegRadioGroup } from './SegRadioGroup';

type FieldSpec = ReturnType<typeof purityFieldsFor>[number];

/* Cell text for the lye segmented group. The full LYE_TYPE_LABELS strings stay the
 * accessible names; each cell is a leading substring of its name ('NaOH + KOH' ⊂
 * 'NaOH + KOH blend'), so what a voice-control user reads off the screen matches what
 * the control answers to (Label-in-Name). */
const LYE_SEG_CELLS: Record<LyeType, string> = {
  naoh: 'NaOH',
  koh: 'KOH',
  dual: 'NaOH + KOH',
};

/** A ledger row holding one numeric setting from a settingsFields spec. The trailing
 * "%" of a spec label becomes the unit suffix; the full label stays the input's
 * accessible name. */
function LedgerNumericField({
  spec,
  value,
  onValueChange,
}: {
  spec: FieldSpec;
  value: string;
  onValueChange: (value: string) => void;
}) {
  // One derivation for both the row text and the InfoTip's glossary key — a second
  // regex here is how the two silently stop agreeing.
  const baseLabel = spec.label.replace(/\s*%$/, '');
  const suffix = baseLabel === spec.label ? undefined : '%';
  return (
    <LedgerRow
      label={
        <>
          {baseLabel}
          {spec.help && <InfoTip term={baseLabel}>{spec.help}</InfoTip>}
        </>
      }
      unit={suffix}
      input={{
        'aria-label': spec.label,
        min: spec.min,
        max: spec.max,
        step: spec.step,
        value,
        onChange: (e) => onValueChange(e.target.value),
      }}
    />
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
  // Destructured once (same shape as SoapingTemperaturePanel's range) — positional [0]/[1]
  // at two call sites is how a min/max swap slips through review.
  const [blendMin, blendMax] = kohBlendRangeFor(process);
  return (
    <section className="panel">
      <h2 className="panel__title"><span className="panel__num" aria-hidden="true">01</span>Settings</h2>
      <p className="panel__subtitle">
        Superfat and the water ratio sit in the Superfat&nbsp;&amp;&nbsp;water panel below.
      </p>

      <div className="ledger">
        <BatchBasics
          weightUnit={weightUnit}
          previewState={previewState}
          getDraft={getDraft}
          inputs={inputs}
          batchWeightWithExtras={batchWeightWithExtras}
          recipeOilWeightGrams={recipeOilWeightGrams}
          fixedBatchExtrasGrams={fixedBatchExtrasGrams}
        />

        <div className="ledger__row">
          <span className="ledger__label">Lye type</span>
          <SegRadioGroup
            label="Lye type"
            name="lye-type"
            preserveCase
            options={lyeChoicesFor(process).map((lye) => ({
              value: lye,
              cell: LYE_SEG_CELLS[lye],
              name: LYE_TYPE_LABELS[lye],
            }))}
            value={settings.lyeType}
            onChange={(lye) => setSettings((s) => ({ ...s, lyeType: lye }))}
          />
        </div>

        {settings.lyeType === 'dual' && (
          <LedgerRow
            label="KOH % of alkali"
            unit="%"
            input={{
              'aria-label': 'KOH % of alkali (by weight)',
              min: blendMin,
              max: blendMax,
              step: 0.5,
              value: settings.kohBlendPercent,
              onChange: (e) =>
                setSettings((s) => ({ ...s, kohBlendPercent: e.target.value })),
            }}
          />
        )}

        {purityFieldsFor(settings.lyeType).map((spec) => (
          <LedgerNumericField
            key={spec.key}
            spec={spec}
            value={settings[spec.key]}
            onValueChange={(v) => updateField(spec.key, v)}
          />
        ))}

        {processOffers(process, 'hpVessel') && (
          <LedgerRow
            label={
              <>
                Cook vessel volume
                <InfoTip term="Cook vessel volume">
                  The hot-process cook expands (a thick, translucent "mashed potato" phase)
                  before settling — a vessel at least ~2× the batch volume (~3× for
                  coconut-heavy recipes) gives it room to expand without overflowing.
                </InfoTip>
              </>
            }
            unit="L"
            note={
              hpVesselMultiple !== undefined &&
              `≈${hpVesselMultiple.toFixed(1)}× batch volume`
            }
            input={{
              'aria-label': 'Cook vessel volume (L)',
              min: 0,
              step: 0.5,
              value: vesselVolumeLiters,
              onChange: (e) => onVesselVolumeLitersChange(e.target.value),
            }}
          />
        )}
      </div>

      <details className="settings-advanced">
        <summary className="disclosure__summary settings-advanced__summary">Advanced</summary>

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
