import { memo } from 'react';
import { batchWeightBreakdown } from '@soap-calc/core';
import type { LyeCalculationResult, WaterMode } from '@soap-calc/core';
import { additiveStageLabel } from '../lib/additiveStageLabel';
import type { CureEstimate } from '../lib/cureEstimate';
import { PROCESS_DEFINITIONS, type ProcessId } from '../lib/process';
import { formatGrams } from '../lib/format';
import { formatDose } from '../lib/formatDose';
import { oilById } from '../lib/oils';
import type { ComputedAdditive, ComputedPostCookSuperfat } from '../lib/calculateAdditives';
import type { RecipeDisplayTotals } from '../lib/calculateRecipe';
import type { SplitLiquidSettings, WeightUnit } from '../lib/recipe';
import { buildAddOrderSteps, buildFullRecipe } from '../lib/recipeSummary';
import { formatWeight } from '../lib/weightUnits';
import { formatWorkabilityRange } from '../lib/workabilityFormat';
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
  /** Whether the post-cook superfat is an added extra (append mode, or subtract under a
   * lye excess where the reserve was never actually applied) rather than reserved from
   * the recipe oils. Single source of truth from the view model — see useRecipeViewModel. */
  pcsfIsExtra?: boolean;
  /** The vm's total off-recipe grams (additives + split liquid + PCSF-if-extra) — passed
   * down so this panel never recomputes it and drifts from the printed sheet. */
  extrasGrams?: number;
  /** The vm's batch weight (method-aware base + extras) — required so the panel never
   * recomputes its own base and drifts from the printed sheet. */
  batchWeightWithExtras: number;
  /** The process's cure/sequester window and whether it's usable straight from the mold
   * (hot process). Null when the recipe carries no resolvable process variant. */
  cureEstimate?: CureEstimate | null;
  /** The vm's cured/label weight (batch weight after the process's water loss). Null when
   * there's no resolvable process variant; equals batchWeightWithExtras when loss is 0 (LS). */
  labelWeight?: number | null;
  /** The vm's total oil weight in grams — used for the batch-weight breakdown readout. */
  totalOilGrams?: number;
};

// The cure/sequester window is behavior-only guidance built from several unverified
// per-variant durations (see processProfile.ts) — hedge it as an estimate rather than
// let it read as a guaranteed figure.
function cureWindowLabel(estimate: CureEstimate): string {
  const window = estimate.maxWeeks
    ? `${estimate.minWeeks}–${estimate.maxWeeks} weeks`
    : `${estimate.minWeeks}+ weeks`;
  return `≈ ${window}`;
}

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

// memo: props are stable view-model memo outputs, so unrelated keystrokes
// skip re-rendering this panel.
export const ResultsPanel = memo(function ResultsPanel({
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
  pcsfIsExtra = true,
  extrasGrams = 0,
  batchWeightWithExtras,
  cureEstimate = null,
  labelWeight = null,
  totalOilGrams = 0,
}: ResultsPanelProps) {
  if (inputErrors.length) {
    return (
      <section className="panel panel--results" aria-live="polite">
        <h2 className="panel__title">
          <span className="panel__num" aria-hidden="true">04</span>Results
        </h2>
        <ul className="message-list message-list--error">
          {inputErrors.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="panel panel--results" aria-live="polite">
        <h2 className="panel__title">
          <span className="panel__num" aria-hidden="true">04</span>Results
        </h2>
        <p className="results-hint">Enter oil weights to calculate lye and water.</p>
      </section>
    );
  }

  const hasLineErrors = result.errors.length > 0;
  const recipeOilWeightGrams =
    displayTotals?.recipeOilWeightGrams ?? result.totalOilWeightGrams;
  const excludedOilWeightGrams = displayTotals?.excludedFromLyeOilWeightGrams ?? 0;
  const isEmpty = recipeOilWeightGrams <= 0;
  const additiveGrams = additives.reduce((sum, item) => sum + item.grams, 0);
  const displayedBatchWeight = batchWeightWithExtras;
  const waterNote = waterFootnote(waterMode, excludedOilWeightGrams);
  const showTotalLiquid =
    splitLiquid?.enabled && splitLiquidGrams !== null && splitLiquidGrams > 0;
  const totalLiquidGrams = result.waterWeightGrams + (splitLiquidGrams ?? 0);
  const cookSuperfatPercent = Number(superfatPercent) || 0;
  const totalSuperfatPercent = cookSuperfatPercent + (postCookSuperfat?.percentOfOil ?? 0);
  // Single-sourced from cureEstimate (itself derived from the view model's resolved
  // process-variant profile), not the `process` prop — the cure window / usableAtUnmold
  // already come from that profile, so under a transient variant/process mismatch the
  // finish label must agree with them rather than the prop (#2).
  const finishingLabel = cureEstimate?.finishingLabel ?? PROCESS_DEFINITIONS[process].terms.finishingLabel;
  // LS's waterLossPercent is 0 (dilution, not evaporation), so its labelWeight equals
  // batchWeightWithExtras — only show a separate label-weight line when cure/sequester
  // actually sheds water.
  const showLabelWeight = labelWeight !== null && labelWeight < batchWeightWithExtras;
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
  const batchWeight = batchWeightBreakdown({
    oilGrams: totalOilGrams,
    lyeGrams: result?.lyeWeightGrams ?? 0,
    waterGrams: result?.waterWeightGrams ?? 0,
    extrasGrams,
  });
  // The itemized recipe + build steps read straight off the figures above, so the on-screen
  // summary can never quote a weight the results grid doesn't.
  const fullRecipe = buildFullRecipe({
    lines: result.lines.map((line) => ({ oilId: line.oilId, weightGrams: line.weightGrams })),
    recipeOilWeightGrams,
    weightUnit,
    lyeType,
    naohGrams: result.naohWeightGrams,
    kohGrams: result.kohWeightGrams,
    lyeGrams: result.lyeWeightGrams,
    kohBlendPercent,
    waterGrams: result.waterWeightGrams,
    additives,
    splitLiquid,
    splitLiquidGrams,
    postCookSuperfat,
    postCookSuperfatName: postCookSuperfatOilName,
    process,
  });
  const addOrderSteps = buildAddOrderSteps({
    process,
    lyeType,
    totalOilGrams: recipeOilWeightGrams,
    lyeGrams: result.lyeWeightGrams,
    waterGrams: result.waterWeightGrams,
    weightUnit,
  });

  return (
    <section className="panel panel--results" aria-live="polite">
      <h2 className="panel__title">
        <span className="panel__num" aria-hidden="true">04</span>Results
      </h2>

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
                <dt>KOH ({kohBlendPercent || '0'}% by weight)</dt>
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
          {splitLiquid?.enabled && splitLiquidGrams !== null && splitLiquidGrams > 0 && (
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
                {!pcsfIsExtra ? ' · reserved, lye reduced' : ''}
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
          {postCookSuperfat && cookSuperfatPercent >= 0 && (
            <div className="results-grid__item">
              <dt>Total superfat</dt>
              <dd>{formatGrams(totalSuperfatPercent, 1)}%</dd>
            </div>
          )}
          {cureEstimate && (
            <div className="results-grid__item">
              <dt>{finishingLabel} (est.)</dt>
              <dd>
                {cureWindowLabel(cureEstimate)}
                {cureEstimate.usableAtUnmold && (
                  <span className="results-excluded"> · usable at unmold</span>
                )}
              </dd>
            </div>
          )}
          {showLabelWeight && labelWeight !== null && (
            <div className="results-grid__item">
              <dt>Est. label weight (after {finishingLabel.toLowerCase()})</dt>
              <dd>{formatWeight(labelWeight, weightUnit)}</dd>
            </div>
          )}
        </dl>
      )}

      {cureEstimate?.workability && (
        <section className="results-workability">
          <h3 className="results-workability__title">Workability</h3>
          <span className={`chip chip--${cureEstimate.workability.confidence}`}>
            {cureEstimate.workability.confidence} confidence
          </span>
          {/* All rows share one display unit, chosen from the earliest (unmold) row's max,
              so adjacent rows never render in mixed units. */}
          {(() => {
            const wk = cureEstimate.workability;
            const unitBasis = wk.unmold.maxHours;
            return (
              <dl className="results-workability__rows">
                <div>
                  <dt>Unmold</dt>
                  <dd>{formatWorkabilityRange(wk.unmold, unitBasis)}</dd>
                </div>
                <div>
                  <dt>Cut</dt>
                  <dd>{formatWorkabilityRange(wk.cut, unitBasis)}</dd>
                </div>
                {wk.stamp && (
                  <div>
                    <dt>Stamp from</dt>
                    <dd>
                      {formatWorkabilityRange(
                        { minHours: wk.stamp.opensMinHours, maxHours: wk.stamp.opensMaxHours },
                        unitBasis,
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            );
          })()}
          {cureEstimate.workability.factors.length > 0 && (
            <p className="results-hint">{cureEstimate.workability.factors.join(' · ')}</p>
          )}
          <ul className="message-list message-list--insights">
            {cureEstimate.workability.caveats.map((c) => (
              <li key={c} className="message-list__item--info">
                {c}
              </li>
            ))}
          </ul>
        </section>
      )}

      {batchWeightWithExtras > 0 && (
        <p className="results-batch-weight" data-testid="batch-weight">
          {/* Total single-sourced from batchWeightWithExtras (same figure as the dl row
              above); the slices below stay from the breakdown, so the two totals shown
              on this panel can never drift apart. */}
          <strong>Total batch:</strong> {formatWeight(batchWeightWithExtras, weightUnit)}
          {' · '}oils {formatWeight(batchWeight.oils, weightUnit)}
          {' · '}lye {formatWeight(batchWeight.lye, weightUnit)}
          {' · '}water {formatWeight(batchWeight.water, weightUnit)}
          {batchWeight.extras > 0 && <> · extras {formatWeight(batchWeight.extras, weightUnit)}</>}
        </p>
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

      {!isEmpty && fullRecipe.length > 0 && (
        <div className="results-recipe">
          <div className="results-recipe__label">Full recipe</div>
          <dl className="results-recipe__list">
            {fullRecipe.map((item, index) => (
              <div key={`${item.name}-${index}`} className="results-recipe__row">
                <dt>{item.name}</dt>
                <dd>{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {!isEmpty && (
        <div className="results-steps">
          <div className="results-steps__label">Add in this order</div>
          <ol className="results-steps__list">
            {addOrderSteps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </div>
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
});
