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
};

export function DilutionPanel({
  dilution,
  soapConcentrationPercent,
  onSoapConcentrationChange,
  weightUnit,
  bottleSizeMl,
  onBottleSizeMlChange,
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
                <dt>Bottles filled ({bottleSizeMl} ml)</dt>
                <dd>{bottleCount}</dd>
              </div>
            )}
          </dl>
          {dilution.targetExceedsPaste && (
            <p className="results-hint" role="alert">
              The paste is already more dilute than {dilution.soapConcentrationPercent}% — adding water
              only lowers the concentration further.
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
