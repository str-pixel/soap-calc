import { lsPartialDilution, type DilutionResult } from '@soap-calc/core';
import { formatWeight, formatWeightWithAlternates } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';

type PartialDilutionProps = {
  dilution: DilutionResult | null;
  weightUnit: WeightUnit;
  /** Lifted to App beside the bottle size, so both snippets survive a collapse or a
   * process switch the same way. Neither belongs in the recipe: they are "what am I
   * making right now" decisions, not properties of the formula. */
  targetMl: string;
  onTargetMlChange: (value: string) => void;
  /** The maker's scale reading for the whole batch's paste, in grams. */
  measuredPasteGrams: string;
  onMeasuredPasteGramsChange: (value: string) => void;
};

/**
 * Dilute only part of the batch. Paste keeps far better than diluted soap — it stores
 * sealed, refrigerates and freezes — so the common workflow is to cook one batch of paste
 * and draw it down over time. The batch figures above answer "dilute it all"; this answers
 * "make just this much now".
 *
 * The paste weight can be measured rather than computed, and should be: the reference
 * weighs it, noting its own tables are estimates "due to possible water evaporation during
 * the process". A computed paste is wrong in two directions at once — the cook boils off
 * water the recipe still counts, and an alternative liquid's non-water solids are mass the
 * recipe never counted. Given a measurement, the water figure absorbs the whole difference
 * and every portion below is exact arithmetic.
 */
export function PartialDilution({
  dilution,
  weightUnit,
  targetMl,
  onTargetMlChange,
  measuredPasteGrams,
  onMeasuredPasteGramsChange,
}: PartialDilutionProps) {
  if (dilution === null) return null;
  // See the DilutionPanel note: targetExceedsPaste clamps the dilution water to 0, which
  // erases the real cook water and makes the batch's own mass unrecoverable.
  const pasteAlreadyThinner = dilution.targetExceedsPaste;
  const measured = Number(measuredPasteGrams);
  const portion = pasteAlreadyThinner
    ? null
    : lsPartialDilution(
        { ...dilution, measuredPasteGrams: measuredPasteGrams.trim() === '' ? undefined : measured },
        Number(targetMl),
      );
  // What the recipe predicted, for the drift readout: anhydrous + the water already in it.
  const predictedPasteGrams =
    dilution.anhydrousGrams + Math.max(0, dilution.totalWaterGrams - dilution.dilutionWaterGrams);
  const driftGrams = portion?.pasteMeasured ? measured - predictedPasteGrams : 0;

  return (
    <details className="panel panel--nested">
      <summary className="panel__title">Dilute part of the batch</summary>
      <p className="panel__subtitle">
        Paste stores better than diluted soap — weigh out a portion and dilute just that.
      </p>
      {pasteAlreadyThinner ? (
        <p className="results-hint">
          The paste is already more dilute than the target above, so there is no dilution
          water to divide up. Set a target the paste can actually reach to size a portion.
        </p>
      ) : (
        <>
          <label className="field">
            {/* Grams regardless of the display unit: this is a scale reading the maker
                takes at the pot, and the core figures it feeds are all gram-based. */}
            <span>Measured paste weight (g, optional)</span>
            <input
              type="number"
              className="input input--number"
              min={1}
              step={10}
              value={measuredPasteGrams}
              onChange={(e) => onMeasuredPasteGramsChange(e.target.value)}
              aria-label="Measured paste weight (g)"
            />
          </label>
          <label className="field">
            <span>Amount to make (ml)</span>
            <input
              type="number"
              className="input input--number"
              min={1}
              step={10}
              value={targetMl}
              onChange={(e) => onTargetMlChange(e.target.value)}
              aria-label="Amount to make (ml)"
            />
          </label>
          {portion && (
            <>
              <dl className="results-grid">
                <div className="results-grid__item results-grid__item--primary">
                  <dt>Water to add</dt>
                  <dd>{formatWeightWithAlternates(portion.waterGrams, weightUnit)}</dd>
                </div>
                <div className="results-grid__item">
                  <dt>Paste to weigh out</dt>
                  <dd>{formatWeight(portion.pasteGrams, weightUnit)}</dd>
                </div>
                <div className="results-grid__item">
                  <dt>Makes</dt>
                  <dd>{Math.round(portion.volumeMl).toLocaleString('en-US')} ml</dd>
                </div>
                <div className="results-grid__item">
                  <dt>Portion</dt>
                  <dd>{Math.round(portion.fraction * 100)}% of the batch</dd>
                </div>
                <div className="results-grid__item">
                  <dt>Water : paste</dt>
                  <dd>{portion.waterPasteRatio.toFixed(1)} : 1</dd>
                </div>
              </dl>
              {portion.clamped && (
                <p className="results-hint">
                  That is more than the batch holds — the figures above are the whole batch.
                </p>
              )}
              {portion.pasteMeasured ? (
                Math.abs(driftGrams) >= 1 && (
                  <p className="results-hint">
                    Your paste is {formatWeight(Math.abs(driftGrams), weightUnit)}{' '}
                    {driftGrams < 0 ? 'lighter' : 'heavier'} than predicted
                    {driftGrams < 0 ? ' — water lost to the cook' : ''}. These figures use
                    your measurement; the batch rows above still use the predicted weight.
                  </p>
                )
              ) : (
                <p className="results-hint">
                  Paste weight here is computed from the recipe, so treat it as an estimate:
                  the cook evaporates water the recipe still counts, and an alternative
                  liquid&apos;s solids are mass it never counted. Weigh your paste and enter
                  it above for exact figures.
                </p>
              )}
            </>
          )}
        </>
      )}
    </details>
  );
}
