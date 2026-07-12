import type { NeutralizationResult } from '@soap-calc/core';
import { formatGrams } from '../lib/format';
import { formatWeight } from '../lib/weightUnits';
import type { WeightUnit } from '../lib/recipe';

type NeutralizePanelProps = {
  neutralization: NeutralizationResult;
  weightUnit: WeightUnit;
};

export function NeutralizePanel({ neutralization, weightUnit }: NeutralizePanelProps) {
  const {
    lyeExcessPercent,
    excessKohGrams,
    excessNaohGrams,
    citricAcidGrams,
    dilutionWaterGrams,
    targetPhLow,
    targetPhHigh,
  } = neutralization;
  return (
    <section className="panel panel--nested">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Neutralize</h2>
          <p className="panel__subtitle">
            Citric acid to bring a lye-excess batch to pH {targetPhLow}–{targetPhHigh}
          </p>
        </div>
      </div>
      <dl className="results-grid">
        <div className="results-grid__item results-grid__item--primary">
          <dt>Citric acid (estimate)</dt>
          <dd>{formatWeight(citricAcidGrams, weightUnit)}</dd>
        </div>
        <div className="results-grid__item">
          <dt>Dissolve in hot water (1:4)</dt>
          <dd>{formatWeight(dilutionWaterGrams, weightUnit)}</dd>
        </div>
        <div className="results-grid__item">
          <dt>Lye excess</dt>
          <dd>{formatGrams(lyeExcessPercent, 1)}%</dd>
        </div>
        <div className="results-grid__item">
          <dt>Excess KOH</dt>
          <dd>{formatWeight(excessKohGrams, weightUnit)}</dd>
        </div>
        {excessNaohGrams > 0 && (
          <div className="results-grid__item">
            <dt>Excess NaOH</dt>
            <dd>{formatWeight(excessNaohGrams, weightUnit)}</dd>
          </div>
        )}
      </dl>
      <p className="results-hint" role="alert">
        Add the citric solution gradually and confirm pH {targetPhLow}–{targetPhHigh} with a test —
        never acidify a soap that is already on target.
      </p>
    </section>
  );
}
