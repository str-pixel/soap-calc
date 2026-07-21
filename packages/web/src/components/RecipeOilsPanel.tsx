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
        <h2 className="panel__title">
          <span className="panel__num" aria-hidden="true">01</span>Recipe oils
        </h2>
        <div className="panel__head-actions">
          {/* onMouseDown preventDefault keeps focus in any active weight field, so clicking
              Undo can't blur-commit the pending draft and then undo that fresh commit. */}
          <div className="history-controls" role="group" aria-label="Edit history">
            <button
              type="button"
              className="history-controls__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={inputs.undo}
              disabled={!inputs.canUndo}
              aria-label="Undo"
              title="Undo last recipe-oils edit"
            >
              <svg
                className="history-controls__icon"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6.5h6.5a3.25 3.25 0 1 1 0 6.5H6" />
                <path d="M5.25 4 3 6.5l2.25 2.5" />
              </svg>
            </button>
            <button
              type="button"
              className="history-controls__btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={inputs.redo}
              disabled={!inputs.canRedo}
              aria-label="Redo"
              title="Redo recipe-oils edit"
            >
              <svg
                className="history-controls__icon"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M13 6.5H6.5a3.25 3.25 0 1 0 0 6.5H10" />
                <path d="M10.75 4 13 6.5l-2.25 2.5" />
              </svg>
            </button>
          </div>
          <button type="button" className="btn btn--ghost" onClick={inputs.addLine}>
            + Add oil
          </button>
        </div>
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
        {lines.map((line, index) => {
          const oil = oilById(line.oilId);
          const showTar = isTarOil(oil);
          const previewLine = previewLineByKey[line.key];
          // Disambiguates each row's controls for screen-reader users (the layout is flex
          // `<div>`s, not a real table, so there's no header-association fallback). Falls back
          // to a stable row position when the oil is unset so the accessible name is never empty.
          const oilName = oil?.displayName ?? `row ${index + 1}`;

          return (
            <div key={line.key} className="recipe-table__row">
              <div className="recipe-table__oil">
                <OilPicker
                  value={line.oilId}
                  onChange={(oilId) => inputs.updateLine(line.key, { oilId })}
                  ariaLabel={`Oil for ${oilName}`}
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
              <div className="recipe-table__controls">
                <label className="recipe-table__num">
                  <span className="recipe-table__num-label">
                    Weight ({weightUnitConfig.short})
                  </span>
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
                    aria-label={`Weight in ${weightUnitConfig.short} for ${oilName}`}
                  />
                </label>
                <label className="recipe-table__num recipe-table__pct">
                  <span className="recipe-table__num-label">%</span>
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
                    aria-label={`Percent for ${oilName}`}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn--icon recipe-table__remove"
                  onClick={() => inputs.removeLine(line.key)}
                  aria-label={`Remove ${oilName}`}
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
          <span className="recipe-table__foot-totals">
            <span className="recipe-table__total-weight">
              {showRecipeTotals && lineTotals.totalWeightGrams > 0
                ? formatWeight(lineTotals.totalWeightGrams, weightUnit)
                : '—'}
            </span>
            <span className="recipe-table__total-pct">
              {showRecipeTotals ? formatRecipePercentTotal(lineTotals.totalPercent) : '—'}
            </span>
          </span>
        </div>
        {/* Off-100% is now a normal, reconcilable state (entry is independent — the app no
            longer auto-balances), so name the gap the user needs to close rather than a
            generic "totals don't match". Also carries the status as text for colorblind /
            screen-reader users, since the --warn color alone isn't perceivable. */}
        {(percentTotalOff || weightTotalOff) && showRecipeTotals && (
          <p className="recipe-table__hint" role="status">
            Oils total {formatRecipePercentTotal(lineTotals.totalPercent)} — aim for 100%.
          </p>
        )}
      </div>
    </section>
  );
}
