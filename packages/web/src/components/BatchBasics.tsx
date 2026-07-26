import type { KeyboardEvent } from 'react';
import type { RecipeInputs } from '../hooks/useRecipeInputs';
import type { RecipeViewModel } from '../hooks/useRecipeViewModel';
import { gramsStringToInputDisplay, WEIGHT_UNIT_OPTIONS, WEIGHT_UNITS, type WeightUnit } from '../lib/weightUnits';

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
};

/** The batch's basic figures — weight unit, total oil, live total batch — shown first in
 * Settings: they set the frame every other number is read in. */
export function BatchBasics({
  weightUnit,
  previewState,
  getDraft,
  inputs,
  batchWeightWithExtras,
  recipeOilWeightGrams,
}: BatchBasicsProps) {
  const weightUnitConfig = WEIGHT_UNITS[weightUnit];
  return (
    <div className="settings-grid settings-grid--batch-basics">
      <label className="field">
        <span>Weight unit</span>
        <select
          className="input"
          aria-label="Weight unit"
          value={weightUnit}
          onChange={(e) => inputs.setWeightUnit(e.target.value as WeightUnit)}
        >
          {WEIGHT_UNIT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label} ({option.short})
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Total oil ({weightUnitConfig.short})</span>
        <input
          type="number"
          className="input input--number"
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
      </label>

      <label className="field">
        <span>Total batch ({weightUnitConfig.short})</span>
        <input
          type="number"
          className="input input--number"
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
            })
          }
          onKeyDown={commitOnEnter}
        />
      </label>
    </div>
  );
}
