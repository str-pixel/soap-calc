import type { RecipeInputs } from '../hooks/useRecipeInputs';
import type { RecipeViewModel } from '../hooks/useRecipeViewModel';
import { isTarOil, oilById } from '../lib/oils';
import type { RecipeLine, WeightUnit } from '../lib/recipe';
import { formatRecipePercentTotal, previewPercentDisplay, previewWeightDisplay } from '../lib/recipePreview';
import {
  formatWeight,
  gramsStringToInputDisplay,
  WEIGHT_UNITS,
  WEIGHT_UNIT_OPTIONS,
} from '../lib/weightUnits';
import { OilPicker } from './OilPicker';

type RecipeOilsPanelProps = {
  lines: RecipeLine[];
  weightUnit: WeightUnit;
  previewState: RecipeViewModel['previewState'];
  previewLineByKey: RecipeViewModel['previewLineByKey'];
  lineTotals: RecipeViewModel['lineTotals'];
  showRecipeTotals: boolean;
  percentTotalOff: boolean;
  weightTotalOff: boolean;
  getDraft: (id: string, canonicalDisplay: string) => string;
  setDraft: (id: string, value: string) => void;
  inputs: RecipeInputs;
};

export function RecipeOilsPanel({
  lines,
  weightUnit,
  previewState,
  previewLineByKey,
  lineTotals,
  showRecipeTotals,
  percentTotalOff,
  weightTotalOff,
  getDraft,
  setDraft,
  inputs,
}: RecipeOilsPanelProps) {
  const weightUnitConfig = WEIGHT_UNITS[weightUnit];

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">Recipe oils</h2>
        <button type="button" className="btn btn--ghost" onClick={inputs.addLine}>
          + Add oil
        </button>
      </div>

      <div className="recipe-entry-bar">
        <label className="field field--inline">
          <span>Weight unit</span>
          <select
            className="input"
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

        <label className="field field--inline">
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
          />
        </label>
      </div>

      <div className="recipe-table">
        <div className="recipe-table__head">
          <span>Oil</span>
          <span>Weight ({weightUnitConfig.short})</span>
          <span>%</span>
          <span className="sr-only">Actions</span>
        </div>

        {lines.map((line) => {
          const oil = oilById(line.oilId);
          const showTar = isTarOil(oil);
          const previewLine = previewLineByKey[line.key];

          return (
            <div key={line.key} className="recipe-table__row">
              <div className="recipe-table__oil">
                <OilPicker
                  value={line.oilId}
                  onChange={(oilId) => inputs.updateLine(line.key, { oilId })}
                />
                {showTar && (
                  <label className="tar-treatment">
                    <span>Tar lye</span>
                    <select
                      value={line.tarLyeTreatment ?? 'include'}
                      onChange={(e) =>
                        inputs.updateLine(line.key, {
                          tarLyeTreatment: e.target.value as 'include' | 'additive',
                        })
                      }
                    >
                      <option value="include">Include in lye</option>
                      <option value="additive">Add at trace</option>
                    </select>
                  </label>
                )}
              </div>
              <div>
                <input
                  type="number"
                  className="input input--number"
                  min={0}
                  step={weightUnitConfig.inputStep}
                  value={getDraft(
                    inputs.weightInputId(line.key),
                    previewWeightDisplay(line, previewLine, weightUnit),
                  )}
                  onChange={(e) => inputs.handleWeightChange(line.key, e.target.value)}
                  onBlur={(e) => inputs.commitWeightInput(line.key, e.target.value)}
                  aria-label={`Weight in ${weightUnitConfig.short}`}
                />
              </div>
              <div className="recipe-table__pct">
                <input
                  type="number"
                  className="input input--number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={getDraft(
                    inputs.percentInputId(line.key),
                    previewPercentDisplay(line, previewLine),
                  )}
                  onChange={(e) => setDraft(inputs.percentInputId(line.key), e.target.value)}
                  onBlur={(e) => inputs.commitPercentInput(line.key, e.target.value)}
                  aria-label="Oil percent"
                />
              </div>
              <div>
                <button
                  type="button"
                  className="btn btn--icon"
                  onClick={() => inputs.removeLine(line.key)}
                  aria-label="Remove oil"
                  disabled={lines.length <= 1}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
        <div
          className={`recipe-table__foot${percentTotalOff || weightTotalOff ? ' recipe-table__foot--warn' : ''}`}
          aria-live="polite"
        >
          <span>Total</span>
          <span className="recipe-table__total-weight">
            {showRecipeTotals && lineTotals.totalWeightGrams > 0
              ? formatWeight(lineTotals.totalWeightGrams, weightUnit)
              : '—'}
          </span>
          <span className="recipe-table__total-pct">
            {showRecipeTotals ? formatRecipePercentTotal(lineTotals.totalPercent) : '—'}
          </span>
          <span className="sr-only">Actions</span>
        </div>
      </div>
    </section>
  );
}
