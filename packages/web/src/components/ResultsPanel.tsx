import type { LyeCalculationResult, WaterMode } from '@soap-calc/core';
import { additiveStageLabel } from '../lib/additiveStageLabel';
import type { ProcessId } from '../lib/process';
import { formatGrams } from '../lib/format';
import { formatDose } from '../lib/formatDose';
import { oilById } from '../lib/oils';
import type { ComputedAdditive, ComputedPostCookSuperfat } from '../lib/calculateAdditives';
import type { RecipeDisplayTotals } from '../lib/calculateRecipe';
import type { SplitLiquidSettings, WeightUnit } from '../lib/recipe';
import { formatWeight } from '../lib/weightUnits';
import { InfoTip } from './InfoTip';

type ResultsPanelProps = {
  result: LyeCalculationResult | null;
  inputErrors: string[];
  lyeLabel: string;
  process: ProcessId;
  lyeType: 'naoh' | 'koh' | 'dual';
  kohBlendPercent?: string;
  displayTotals: RecipeDisplayTotals | null;
  weightUnit: WeightUnit;
  waterMode?: WaterMode;
  splitLiquid?: SplitLiquidSettings;
  splitLiquidGrams?: number | null;
  additives?: ComputedAdditive[];
  superfatPercent?: string;
  postCookSuperfat?: ComputedPostCookSuperfat | null;
  postCookSuperfatMethod?: 'append' | 'subtract';
  batchWeightWithExtras?: number;
};

function waterFootnote(
  waterMode: WaterMode | undefined,
  excludedOilWeightGrams: number,
): string | null {
  if (excludedOilWeightGrams <= 0) return null;
  if (waterMode === 'percent_of_oils') {
    return ' (from total oil weight, including oils excluded from lye)';
  }
  return ' (from saponifiable oils)';
}

export function ResultsPanel({
  result,
  inputErrors,
  lyeLabel,
  process,
  lyeType,
  kohBlendPercent,
  displayTotals,
  weightUnit,
  waterMode,
  splitLiquid,
  splitLiquidGrams = null,
  additives = [],
  superfatPercent,
  postCookSuperfat = null,
  postCookSuperfatMethod = 'append',
  batchWeightWithExtras,
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
  const additiveGrams = additives.reduce((sum, item) => sum + item.grams, 0);
  const pcsfIsExtra = postCookSuperfatMethod !== 'subtract';
  const extrasGrams =
    additiveGrams + (splitLiquidGrams ?? 0) + (pcsfIsExtra ? postCookSuperfat?.grams ?? 0 : 0);
  const displayedBatchWeight = batchWeightWithExtras ?? batchWeightGrams + extrasGrams;
  const waterNote = waterFootnote(waterMode, excludedOilWeightGrams);
  const showTotalLiquid =
    splitLiquid?.enabled && splitLiquidGrams !== null && splitLiquidGrams > 0;
  const totalLiquidGrams = result.waterWeightGrams + (splitLiquidGrams ?? 0);
  const cookSuperfatPercent = Number(superfatPercent) || 0;
  const totalSuperfatPercent = cookSuperfatPercent + (postCookSuperfat?.percentOfOil ?? 0);
  const postCookSuperfatOilName = postCookSuperfat
    ? (oilById(postCookSuperfat.oilId)?.displayName ?? postCookSuperfat.oilId)
    : null;
  // List only the extras actually present — a post-cook-superfat-only batch (no additive
  // lines) must not claim "includes additives".
  const extrasNote = [
    additiveGrams > 0 ? 'additives' : null,
    splitLiquidGrams ? 'alternative liquid' : null,
    postCookSuperfat && pcsfIsExtra ? 'post-cook superfat' : null,
  ]
    .filter(Boolean)
    .join(' and ');

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
          {lyeType === 'dual' ? (
            <>
              <div className="results-grid__item results-grid__item--primary">
                <dt>NaOH</dt>
                <dd>
                  {formatWeight(result.naohWeightGrams, weightUnit)}
                  {hasLineErrors && <span className="results-partial"> (partial)</span>}
                </dd>
              </div>
              <div className="results-grid__item results-grid__item--primary">
                <dt>KOH ({kohBlendPercent ?? '5'}% by weight)</dt>
                <dd>
                  {formatWeight(result.kohWeightGrams, weightUnit)}
                  {hasLineErrors && <span className="results-partial"> (partial)</span>}
                </dd>
              </div>
              <div className="results-grid__item">
                <dt>Total alkali</dt>
                <dd>{formatWeight(result.lyeWeightGrams, weightUnit)}</dd>
              </div>
            </>
          ) : (
            <div className="results-grid__item results-grid__item--primary">
              <dt>{lyeLabel}</dt>
              <dd>
                {formatWeight(result.lyeWeightGrams, weightUnit)}
                {hasLineErrors && <span className="results-partial"> (partial)</span>}
              </dd>
            </div>
          )}
          <div className="results-grid__item">
            <dt>Water</dt>
            <dd>
              {formatWeight(result.waterWeightGrams, weightUnit)}
              {waterNote && <span className="results-excluded">{waterNote}</span>}
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
            <dd>
              {formatWeight(displayedBatchWeight, weightUnit)}
              {extrasGrams > 0 && extrasNote && (
                <span className="results-excluded"> (includes {extrasNote})</span>
              )}
            </dd>
          </div>
          <div className="results-grid__item">
            <dt>Lye concentration</dt>
            <dd>{formatGrams(result.lyeConcentrationPercent, 1)}%</dd>
          </div>
          <div className="results-grid__item">
            <dt>
              Water : lye
              <InfoTip term="Water-to-lye ratio">
                How much water dissolves the lye. A lower ratio means less water and a batter that
                traces faster.
              </InfoTip>
            </dt>
            <dd>{formatGrams(result.waterLyeRatio, 2)} : 1</dd>
          </div>
          {showTotalLiquid && (
            <div className="results-grid__item">
              <dt>Total liquid</dt>
              <dd>
                {formatWeight(totalLiquidGrams, weightUnit)}
                <span className="results-excluded"> (water + alternative liquid)</span>
              </dd>
            </div>
          )}
          {splitLiquid?.enabled && splitLiquidGrams !== null && (
            <div className="results-grid__item">
              <dt>{splitLiquid.name.trim() || 'Alternative liquid'}</dt>
              <dd>
                {formatWeight(splitLiquidGrams, weightUnit)}
                <span className="results-excluded">
                  {' '}
                  ({additiveStageLabel(splitLiquid.addAt, process)})
                </span>
              </dd>
            </div>
          )}
          {postCookSuperfat && (
            <div className="results-grid__item">
              <dt>
                Post-cook superfat ({postCookSuperfatOilName})
                {postCookSuperfatMethod === 'subtract' ? ' · reserved, lye reduced' : ''}
              </dt>
              <dd>
                {formatWeight(postCookSuperfat.grams, weightUnit)}
                <span className="results-excluded">
                  {' '}
                  ({formatGrams(postCookSuperfat.percentOfOil, 1)}% of oil)
                </span>
              </dd>
            </div>
          )}
          {postCookSuperfat && (
            <div className="results-grid__item">
              <dt>Total superfat</dt>
              <dd>{formatGrams(totalSuperfatPercent, 1)}%</dd>
            </div>
          )}
        </dl>
      )}

      {!isEmpty && additives.length > 0 && (
        <dl className="results-additives" aria-label="Additive amounts">
          {additives.map((item) => (
            <div key={item.key}>
              <dt>
                {item.name} ({formatDose(item.amount, item.basis, item.unit)})
              </dt>
              <dd>
                {formatWeight(item.grams, weightUnit)}
                <span className="results-excluded"> · {additiveStageLabel(item.addAt, process)}</span>
              </dd>
            </div>
          ))}
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
