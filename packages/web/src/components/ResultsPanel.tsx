import { memo, type Dispatch, type SetStateAction } from 'react';
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
import type { RecipeSettings, SplitLiquidSettings, WeightUnit } from '../lib/recipe';
import { NEG_SUPERFAT_FLOOR } from '../lib/parseRecipeSettings';
import { WATER_FIELDS, WATER_MODE_LABELS, waterModeChoicesFor } from '../lib/settingsFields';
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
  /** Raw recipe settings + setter, so the two most-adjusted knobs (superfat and the water
   *  ratio) are editable inline in The Numbers column. Optional: when omitted (e.g. in unit
   *  tests that render the panel in isolation) the editable block simply doesn't render. */
  settings?: RecipeSettings;
  setSettings?: Dispatch<SetStateAction<RecipeSettings>>;
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
  settings,
  setSettings,
}: ResultsPanelProps) {
  // The editable Superfat + Water controls live here (in The Numbers), not in Settings —
  // they're the two knobs makers touch most, so they sit beside the figures they drive.
  // Rendered whenever settings + setSettings are supplied, so they stay reachable even when
  // the recipe is empty (result null) or has input errors.
  const waterField = settings ? WATER_FIELDS[settings.waterMode] : null;
  const editableNumbers =
    settings && setSettings ? (
      <div className="numbers-inputs">
        <label className="field field--compact">
          <span>
            Superfat %
            <InfoTip term="Superfat">
              The share of oils left unsaponified for a gentler, more moisturizing bar. Around 5%
              is common.
            </InfoTip>
          </span>
          <input
            type="number"
            className="input input--number"
            aria-label="Superfat %"
            min={process === 'ls' ? NEG_SUPERFAT_FLOOR : 0}
            max={50}
            step={0.5}
            value={settings.superfatPercent}
            onChange={(e) => setSettings((s) => ({ ...s, superfatPercent: e.target.value }))}
          />
        </label>
        <label className="field field--compact">
          <span>Water method</span>
          <select
            className="input"
            aria-label="Water method"
            value={settings.waterMode}
            onChange={(e) =>
              setSettings((s) => ({ ...s, waterMode: e.target.value as RecipeSettings['waterMode'] }))
            }
          >
            {waterModeChoicesFor(process).map((mode) => (
              <option key={mode} value={mode}>
                {WATER_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        {waterField && (
          <label className="field field--compact">
            <span>
              {waterField.label}
              {waterField.help && (
                <InfoTip term={waterField.label.replace(/\s*%$/, '')}>{waterField.help}</InfoTip>
              )}
            </span>
            <input
              type="number"
              className="input input--number"
              aria-label={waterField.label}
              min={waterField.min}
              max={'max' in waterField ? waterField.max : undefined}
              step={waterField.step}
              value={settings[waterField.key]}
              onChange={(e) => {
                const key = waterField.key;
                setSettings((s) => ({ ...s, [key]: e.target.value }));
              }}
            />
          </label>
        )}
      </div>
    ) : null;

  if (inputErrors.length) {
    return (
      <section className="panel panel--results" aria-live="polite">
        <h2 className="panel__title">
          <span className="panel__num" aria-hidden="true">03</span>Results
        </h2>
        {editableNumbers}
        <ul className="message-list message-list--error">
          {inputErrors.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      </section>
    );
  }

  if (!result) {
    if (!editableNumbers) return null;
    return (
      <section className="panel panel--results" aria-live="polite">
        <h2 className="panel__title">
          <span className="panel__num" aria-hidden="true">03</span>Results
        </h2>
        {editableNumbers}
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

  return (
    <section className="panel panel--results" aria-live="polite">
      <h2 className="panel__title">
        <span className="panel__num" aria-hidden="true">03</span>Results
      </h2>

      {editableNumbers}

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
