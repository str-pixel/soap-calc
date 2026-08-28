import type { KeyboardEvent } from 'react';
import type { RecipeInputs } from '../hooks/useRecipeInputs';
import type { RecipeViewModel } from '../hooks/useRecipeViewModel';
import { gramsStringToInputDisplay, WEIGHT_UNIT_OPTIONS, WEIGHT_UNITS, type WeightUnit } from '../lib/weightUnits';
import { SegRadioGroup } from './SegRadioGroup';

const commitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur();
};

type BatchBasicsProps = {
  weightUnit: WeightUnit;
  previewState: RecipeViewModel['previewState'];
  getDraft: (id: string, canonicalDisplay: string) => string;
  inputs: RecipeInputs;
  batchWeightWithExtras: number;
  recipeOilWeightGrams: number;
  /** Non-oil-scaling grams in the batch, for the affine batch-target solve. */
  fixedBatchExtrasGrams: number;
};

/** The batch's basic figures — weight unit, total oil, live total batch — shown first in
 * Settings: they set the frame every other number is read in. Rendered as ledger rows
 * inside SettingsPanel's `.ledger`, so this returns rows, not a container. */
export function BatchBasics({
  weightUnit,
  previewState,
  getDraft,
  inputs,
  batchWeightWithExtras,
  recipeOilWeightGrams,
  fixedBatchExtrasGrams,
}: BatchBasicsProps) {
  const weightUnitConfig = WEIGHT_UNITS[weightUnit];
  return (
    <>
      <div className="ledger__row">
        <span className="ledger__label">Weight unit</span>
        {/* The cells show the short unit; each radio's accessible name is the full
            "Grams (g)" form the old <select>'s options carried, so unit lookups read
            the same in tests and screen readers. */}
        <SegRadioGroup
          label="Weight unit"
          name="weight-unit"
          options={WEIGHT_UNIT_OPTIONS.map((option) => ({
            value: option.id,
            cell: option.short,
            name: `${option.label} (${option.short})`,
          }))}
          value={weightUnit}
          onChange={inputs.setWeightUnit}
        />
      </div>

      {/* The panel's key figure: the number the whole recipe scales from, so it gets the
          one louder rule (.figure-field--key). */}
      <label className="ledger__row">
        <span className="ledger__label">Total oil</span>
        <span className="ledger__figure">
          <input
            type="number"
            className="input figure-field figure-field--key"
            aria-label={`Total oil (${weightUnitConfig.short})`}
            min={0}
            step={weightUnitConfig.inputStep}
            value={getDraft(
              inputs.batchInputId,
              gramsStringToInputDisplay(previewState.batchOilGrams, weightUnit),
            )}
            onChange={(e) => inputs.handleBatchChange(e.target.value)}
            onBlur={(e) => inputs.commitBatchInput(e.target.value)}
            onKeyDown={commitOnEnter}
          />
          <span className="ledger__unit">{weightUnitConfig.short}</span>
        </span>
      </label>

      <label className="ledger__row">
        <span className="ledger__label">Total batch</span>
        <span className="ledger__figure">
          <input
            type="number"
            className="input figure-field"
            aria-label={`Total batch in ${weightUnitConfig.short}`}
            min={0}
            step={weightUnitConfig.inputStep}
            value={getDraft(
              inputs.batchWeightInputId,
              batchWeightWithExtras > 0
                ? gramsStringToInputDisplay(String(batchWeightWithExtras), weightUnit)
                : '',
            )}
            onChange={(e) => inputs.handleBatchWeightChange(e.target.value)}
            onBlur={(e) =>
              inputs.commitBatchWeightInput(e.target.value, {
                currentBatchGrams: batchWeightWithExtras,
                currentOilTotalGrams: recipeOilWeightGrams,
                fixedExtrasGrams: fixedBatchExtrasGrams,
              })
            }
            onKeyDown={commitOnEnter}
          />
          <span className="ledger__unit">{weightUnitConfig.short}</span>
        </span>
      </label>
    </>
  );
}
