import type { KeyboardEvent } from 'react';
import type { RecipeInputs } from '../hooks/useRecipeInputs';
import type { RecipeViewModel } from '../hooks/useRecipeViewModel';
import { isTarOil, oilById } from '../lib/oils';
import type { RecipeLine, WeightUnit } from '../lib/recipe';
import { formatRecipePercentTotal, previewPercentDisplay, previewWeightDisplay } from '../lib/recipePreview';
import {
  formatWeight,
  WEIGHT_UNITS,
} from '../lib/weightUnits';
import { OilPicker } from './OilPicker';

/** Commit a numeric field on Enter, matching blur. Every field here commits on blur only;
 * without this, a typed value applies only when you click/tab away. Enter → blur() fires the
 * field's existing onBlur commit — no new commit path, just an extra, expected trigger. */
const commitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur();
};

type RecipeOilsPanelProps = {
  lines: RecipeLine[];
  weightUnit: WeightUnit;
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
          <span className="panel__num" aria-hidden="true">03</span>Recipe oils
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
              <button
                type="button"
                className="btn btn--icon recipe-table__remove"
                onClick={() => inputs.removeLine(line.key)}
                aria-label={`Remove ${oilName}`}
                disabled={lines.length <= 1}
              >
                ×
              </button>
              {/* Both figures stay editable and bidirectional — typing a percent still
                  recomputes grams and vice versa. The visible label is the bare word
                  "Weight", and the accessible name CONTAINS it (Label-in-Name, WCAG 2.5.3),
                  which is why it reads "Weight in g for Olive Oil" rather than naming the
                  oil first. The unit rides INSIDE the field's slab (.ledger__figure, the
                  same dial the ledger rows use), so figure and unit read as one. */}
              <div className="recipe-table__figures">
                <label className="recipe-table__figure">
                  Weight
                  <span className="ledger__figure">
                    <input
                      type="number"
                      className="input figure-field"
                      min={0}
                      step={weightUnitConfig.inputStep}
                      value={getDraft(
                        inputs.weightInputId(line.key),
                        previewWeightDisplay(line, previewLine, weightUnit),
                      )}
                      onChange={(e) => inputs.handleWeightChange(line.key, e.target.value)}
                      onBlur={(e) => inputs.commitWeightInput(line.key, e.target.value)}
                      onKeyDown={commitOnEnter}
                      aria-label={`Weight in ${weightUnitConfig.short} for ${oilName}`}
                    />
                    <span className="ledger__unit">{weightUnitConfig.short}</span>
                  </span>
                </label>
                <label className="recipe-table__figure">
                  Percent
                  <span className="ledger__figure">
                    <input
                      type="number"
                      className="input figure-field"
                      min={0}
                      max={100}
                      step={0.1}
                      value={getDraft(
                        inputs.percentInputId(line.key),
                        previewPercentDisplay(line, previewLine),
                      )}
                      onChange={(e) => setDraft(inputs.percentInputId(line.key), e.target.value)}
                      onBlur={(e) => inputs.commitPercentInput(line.key, e.target.value)}
                      onKeyDown={commitOnEnter}
                      aria-label={`Percent for ${oilName}`}
                    />
                    <span className="ledger__unit">%</span>
                  </span>
                </label>
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
          <div className="recipe-table__reconcile">
            {/* Only the status text is a live region — the button must not be part of the
                announcement, or it re-announces the control on every total change. */}
            <p className="inline-note inline-note--warn" role="status">
              Oils total {formatRecipePercentTotal(lineTotals.totalPercent)} — aim for 100%.
            </p>
            {/* One-tap reconcile for gram-first entry: adopt the current oil weights as the
                recipe (Total oil = their sum, percentages re-derived to 100). */}
            {lineTotals.totalWeightGrams > 0 && (
              <button
                type="button"
                className="btn btn--ghost recipe-table__match-total"
                onClick={inputs.matchTotalToWeights}
              >
                Set total to {formatWeight(lineTotals.totalWeightGrams, weightUnit)}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
