import type { LyeCalculationResult } from '@soap-calc/core';
import { formatGrams } from '../lib/format';
import type { RecipeDisplayTotals } from '../lib/calculateRecipe';
import type { WeightUnit } from '../lib/recipe';
import { formatWeight } from '../lib/weightUnits';

type ResultsPanelProps = {
  result: LyeCalculationResult | null;
  inputErrors: string[];
  lyeLabel: string;
  displayTotals: RecipeDisplayTotals | null;
  weightUnit: WeightUnit;
};

export function ResultsPanel({
  result,
  inputErrors,
  lyeLabel,
  displayTotals,
  weightUnit,
}: ResultsPanelProps) {
  if (inputErrors.length) {
    return (
      <section className="panel panel--results" aria-live="polite">
        <h2 className="panel__title">Results</h2>
        <ul className="message-list message-list--error">
          {inputErrors.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      </section>
    );
  }

  if (!result) return null;

  const hasLineErrors = result.errors.length > 0;
  const recipeOilWeightGrams =
    displayTotals?.recipeOilWeightGrams ?? result.totalOilWeightGrams;
  const batchWeightGrams =
    displayTotals?.batchWeightGrams ?? result.totalBatchWeightGrams;
  const excludedOilWeightGrams = displayTotals?.excludedFromLyeOilWeightGrams ?? 0;
  const isEmpty = recipeOilWeightGrams <= 0;

  return (
    <section className="panel panel--results" aria-live="polite">
      <h2 className="panel__title">Results</h2>

      {hasLineErrors && (
        <ul className="message-list message-list--error">
          {result.errors.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}

      {isEmpty && (
        <p className="results-hint">Enter oil weights to calculate lye and water.</p>
      )}

      {!isEmpty && (
        <dl className="results-grid">
          <div className="results-grid__item results-grid__item--primary">
            <dt>{lyeLabel}</dt>
            <dd>
              {formatWeight(result.lyeWeightGrams, weightUnit)}
              {hasLineErrors && (
                <span className="results-partial"> (partial)</span>
              )}
            </dd>
          </div>
          <div className="results-grid__item">
            <dt>Water</dt>
            <dd>
              {formatWeight(result.waterWeightGrams, weightUnit)}
              {excludedOilWeightGrams > 0 && (
                <span className="results-excluded"> (from saponifiable oils)</span>
              )}
            </dd>
          </div>
          <div className="results-grid__item">
            <dt>Oil weight</dt>
            <dd>
              {formatWeight(recipeOilWeightGrams, weightUnit)}
              {excludedOilWeightGrams > 0 && (
                <span className="results-excluded">
                  {' '}
                  ({formatWeight(excludedOilWeightGrams, weightUnit)} excluded from lye)
                </span>
              )}
            </dd>
          </div>
          <div className="results-grid__item">
            <dt>Batch weight</dt>
            <dd>{formatWeight(batchWeightGrams, weightUnit)}</dd>
          </div>
          <div className="results-grid__item">
            <dt>Lye concentration</dt>
            <dd>{formatGrams(result.lyeConcentrationPercent, 1)}%</dd>
          </div>
        </dl>
      )}

      {result.warnings.length > 0 && (
        <ul className="message-list message-list--warn">
          {result.warnings.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
