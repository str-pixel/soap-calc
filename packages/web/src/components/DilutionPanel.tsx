import { lsBottleCount, type DilutionResult } from '@soap-calc/core';
import { formatWeight } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';

type DilutionPanelProps = {
  dilution: DilutionResult | null;
  soapConcentrationPercent: string;
  onSoapConcentrationChange: (value: string) => void;
  weightUnit: WeightUnit;
  /** Bottle size in ml for the "bottles filled" readout below. */
  bottleSizeMl: string;
  onBottleSizeMlChange: (value: string) => void;
  /** Water the recipe's alternative liquids already put in the paste. Deducted from the
   * dilution figure upstream; passed here only so the readout can say so. */
  altLiquidWaterGrams?: number;
  /** Grams of that liquid whose water content was never declared. Non-zero makes every
   * figure here a lower bound rather than a measurement. */
  unknownLiquidGrams?: number;
  /** The over-dilution verdict holds whatever the undeclared liquid contains, so it is
   * stated as fact rather than hedged. */
  overDilutionCertain?: boolean;
};

export function DilutionPanel({
  dilution,
  soapConcentrationPercent,
  onSoapConcentrationChange,
  weightUnit,
  bottleSizeMl,
  onBottleSizeMlChange,
  altLiquidWaterGrams = 0,
  unknownLiquidGrams = 0,
  overDilutionCertain = false,
}: DilutionPanelProps) {
  const bottleMl = Number(bottleSizeMl);
  const bottleCount =
    dilution && Number.isFinite(bottleMl) && bottleMl > 0
      ? lsBottleCount(dilution.solutionGrams, bottleMl)
      : null;
  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Dilution</h2>
          <p className="panel__subtitle">Water to add to reach a target soap concentration</p>
        </div>
      </div>
      <label className="field">
        <span>Target soap concentration (%)</span>
        <input
          type="number"
          className="input input--number"
          min={1}
          max={99}
          step={1}
          value={soapConcentrationPercent}
          onChange={(e) => onSoapConcentrationChange(e.target.value)}
          aria-label="Target soap concentration percent"
        />
      </label>
      <label className="field">
        <span>Bottle size (ml)</span>
        <input
          type="number"
          className="input input--number"
          min={1}
          step={1}
          value={bottleSizeMl}
          onChange={(e) => onBottleSizeMlChange(e.target.value)}
          aria-label="Bottle size (ml)"
        />
      </label>
      {dilution ? (
        <>
          <dl className="results-grid">
            <div className="results-grid__item results-grid__item--primary">
              <dt>Dilution water to add</dt>
              <dd>{formatWeight(dilution.dilutionWaterGrams, weightUnit)}</dd>
            </div>
            <div className="results-grid__item">
              <dt>Paste (anhydrous)</dt>
              <dd>{formatWeight(dilution.anhydrousGrams, weightUnit)}</dd>
            </div>
            <div className="results-grid__item">
              <dt>Finished solution</dt>
              <dd>{formatWeight(dilution.solutionGrams, weightUnit)}</dd>
            </div>
            <div className="results-grid__item">
              <dt>Total water</dt>
              <dd>{formatWeight(dilution.totalWaterGrams, weightUnit)}</dd>
            </div>
            <div className="results-grid__item">
              <dt>Glycerin (retained)</dt>
              <dd>{formatWeight(dilution.glycerinGrams, weightUnit)}</dd>
            </div>
            {bottleCount !== null && (
              <div className="results-grid__item">
                <dt>≈ Bottles filled ({bottleSizeMl} ml)</dt>
                <dd>{bottleCount}</dd>
              </div>
            )}
          </dl>
          {dilution.targetExceedsPaste && (unknownLiquidGrams === 0 || overDilutionCertain) && (
            <p className="results-hint" role="alert">
              The paste is already more dilute than {dilution.soapConcentrationPercent}% — adding water
              only lowers the concentration further.
            </p>
          )}
          {dilution.targetExceedsPaste && unknownLiquidGrams > 0 && !overDilutionCertain && (
            // Suppressed, not reworded: targetExceedsPaste is a factual claim about the
            // paste, and it was derived from an ASSUMED water content. Asserting it can tell
            // the user a batch is finished when it still needs hundreds of grams of water.
            <p className="results-hint">
              Can&apos;t tell whether {dilution.soapConcentrationPercent}% is reachable —{' '}
              {formatWeight(unknownLiquidGrams, weightUnit)} of alternative liquid has no
              declared water content. Declare its % water in Split liquid.
            </p>
          )}
          {altLiquidWaterGrams > 0 && unknownLiquidGrams === 0 && (
            <p className="results-hint">
              Already {formatWeight(altLiquidWaterGrams, weightUnit)} lighter: that much
              water came in with the alternative liquid and is counted as part of the paste.
              Top up with plain distilled water only.
            </p>
          )}
          {altLiquidWaterGrams > 0 && unknownLiquidGrams > 0 && (
            <p className="results-hint">
              {formatWeight(unknownLiquidGrams, weightUnit)} of alternative liquid has no
              declared water content — it is counted as all water, so{' '}
              {formatWeight(dilution.dilutionWaterGrams, weightUnit)} is the LEAST you will
              need. Declare its % water, or dilute in increments and check by weight.
            </p>
          )}
          <p className="results-hint">Typical: coconut ≤40% · castile ~25% · blends 25–35%.</p>
        </>
      ) : (
        <p className="results-hint">Enter oils and a target concentration (1–99%) to compute dilution.</p>
      )}
    </section>
  );
}
