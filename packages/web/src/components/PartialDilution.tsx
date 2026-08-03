import { useState } from 'react';
import { lsPartialDilution, type DilutionResult } from '@soap-calc/core';
import { formatWeight, formatWeightWithAlternates } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';

type PartialDilutionProps = {
  dilution: DilutionResult | null;
  weightUnit: WeightUnit;
};

/**
 * Dilute only part of the batch. Paste keeps far better than diluted soap — it stores
 * sealed, refrigerates and freezes — so the common workflow is to cook one batch of paste
 * and draw it down over time. The batch figures above answer "dilute it all"; this answers
 * "make just this much now", scaling the paste and water to the share taken.
 *
 * Kept collapsed beside the bottle count: both are optional steps a maker reaches for when
 * wanted, not part of the batch calculation itself.
 */
export function PartialDilution({ dilution, weightUnit }: PartialDilutionProps) {
  const [targetMl, setTargetMl] = useState('');
  if (dilution === null) return null;
  // When the target is thicker than the paste already is, calculateDilution clamps the
  // dilution water to 0 — which erases the real cook water, and with it the batch's true
  // mass and volume. Scaling anything from that would report a portion of a batch smaller
  // than the one in the pot (measured: 39% claimed where the truth was 18.4%, and a
  // "more than the batch holds" refusal at well under half of it). Refuse instead.
  const pasteAlreadyThinner = dilution.targetExceedsPaste;
  const portion = pasteAlreadyThinner ? null : lsPartialDilution(dilution, Number(targetMl));

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
            <span>Amount to make (ml)</span>
            <input
              type="number"
              className="input input--number"
              min={1}
              step={10}
              value={targetMl}
              onChange={(e) => setTargetMl(e.target.value)}
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
              </dl>
              {portion.clamped && (
                <p className="results-hint">
                  That is more than the batch holds — the figures above are the whole batch.
                </p>
              )}
            </>
          )}
        </>
      )}
    </details>
  );
}
